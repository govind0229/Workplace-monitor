const express = require('express');
const notifier = require('node-notifier');
const path = require('path');
const { db, startSession, getActiveSession, addEvent, updateSessionSeconds, completeSession, getTodayTotal, getTodayAutomaticSession, recordAppUsage, getTodayAppUsage, getSetting, setSetting } = require('./db');

const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files from restricted folder

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

// Centralized error handling wrapper
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Background loop to increment time if active (recursive setTimeout prevents overlap)
function runBackgroundLoop() {
    try {
        const types = ['manual', 'automatic'];
        types.forEach(type => {
            const activeSession = getActiveSession(type);
            if (activeSession && activeSession.status === 'active') {
                const now = Date.now();
                const lastTickStr = activeSession.last_tick;
                const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : now;
                const rawDelta = Math.floor((now - lastUpdate) / 1000);

                // Cap delta to 10s — the loop runs every 5s, so anything larger
                // means the system was asleep and that time should NOT be counted
                const delta = Math.min(rawDelta, 10);

                if (delta > 0) {
                    updateSessionSeconds(activeSession.id, delta);
                }

                db.prepare("UPDATE sessions SET last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(activeSession.id);

                // Goal check only for manual session
                if (type === 'manual') {
                    const updated = getActiveSession('manual');
                    const goalH = parseInt(getSetting('goalHours', '4'));
                    const goalM = parseInt(getSetting('goalMinutes', '10'));
                    const goalSec = (goalH * 3600) + (goalM * 60);
                    if (updated.total_seconds >= goalSec && !updated.notified) {
                        notifier.notify({
                            title: 'Goal Achieved!',
                            message: `You've completed ${goalH}h ${goalM}m in the office.`,
                            sound: true
                        }, (err) => {
                            if (err) console.error("Notification failed:", err);
                        });
                        db.prepare("UPDATE sessions SET notified = 1 WHERE id = ?").run(updated.id);
                    }

                    // Break reminder: every breakInterval minutes of continuous work
                    const breakMin = parseInt(getSetting('breakInterval', '60'));
                    if (breakMin > 0) {
                        const breakSec = breakMin * 60;
                        const lastBreak = updated.last_break_notify || 0;
                        if (updated.total_seconds - lastBreak >= breakSec) {
                            notifier.notify({
                                title: 'Time for a Break!',
                                message: `You've been working for ${breakMin} minutes. Stand up, stretch, and rest your eyes.`,
                                sound: true
                            }, (err) => {
                                if (err) console.error("Break notification failed:", err);
                            });
                            db.prepare("UPDATE sessions SET last_break_notify = ? WHERE id = ?").run(updated.total_seconds, updated.id);
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error in background timer loop:", error);
    } finally {
        setTimeout(runBackgroundLoop, 5000);
    }
}
setTimeout(runBackgroundLoop, 5000);

app.post('/start', asyncHandler(async (req, res) => {
    let session = getActiveSession('manual');
    if (!session) {
        const id = startSession('manual');
        session = { id, status: 'active', total_seconds: 0, type: 'manual' };
    } else {
        db.prepare("UPDATE sessions SET status = 'active', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
    }
    res.json({ success: true, session });
}));

app.post('/pause', asyncHandler(async (req, res) => {
    const session = getActiveSession('manual');
    if (session && session.status === 'active') {
        db.prepare("UPDATE sessions SET status = 'paused', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'No active session to pause' });
    }
}));

app.post('/stop', asyncHandler(async (req, res) => {
    const session = getActiveSession('manual');
    if (session) {
        completeSession(session.id);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'No active session' });
    }
}));

app.post('/event', asyncHandler(async (req, res) => {
    const { event } = req.body;

    if (!event || !['lock', 'unlock'].includes(event)) {
        return res.status(400).json({ error: 'Invalid event. Must be "lock" or "unlock".' });
    }

    // 1. Handle Automatic Session (Always responds to lock/unlock)
    const autoSession = getTodayAutomaticSession();
    const autoStatus = event === 'lock' ? 'paused' : 'active';
    db.prepare("UPDATE sessions SET status = ?, last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(autoStatus, autoSession.id);
    addEvent(autoSession.id, event);

    // 2. Handle Manual Session (Only pauses if active, does NOT auto-resume)
    const manualSession = getActiveSession('manual');
    if (manualSession) {
        if (event === 'lock') {
            db.prepare("UPDATE sessions SET status = 'paused', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(manualSession.id);
            addEvent(manualSession.id, 'lock');
        } else if (event === 'unlock') {
            // Auto-resume on unlock
            db.prepare("UPDATE sessions SET status = 'active', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(manualSession.id);
            addEvent(manualSession.id, 'unlock');
        }
    }

    console.log(`Received event: ${event}. Auto-tracker: ${autoStatus}.`);
    res.json({ success: true });
}));

app.get('/status', (req, res) => {
    const now = Date.now();
    const manual = getActiveSession('manual') || { status: 'idle', total_seconds: 0 };
    const automatic = getTodayAutomaticSession();

    // Live interpolation for manual session (capped to 10s to exclude sleep time)
    if (manual.status === 'active') {
        const lastTickStr = manual.last_tick;
        const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : now;
        const delta = Math.min(Math.floor((now - lastUpdate) / 1000), 10);
        if (delta > 0) manual.total_seconds += delta;
    }

    // Live interpolation for automatic session (capped to 10s to exclude sleep time)
    if (automatic.status === 'active') {
        const lastTickStr = automatic.last_tick;
        const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : now;
        const delta = Math.min(Math.floor((now - lastUpdate) / 1000), 10);
        if (delta > 0) automatic.total_seconds += delta;
    }

    res.json({
        manual,
        automatic
    });
});

app.post('/app-heartbeat', asyncHandler(async (req, res) => {
    const { app_name, seconds } = req.body;
    if (!app_name || !seconds) {
        return res.status(400).json({ error: 'app_name and seconds required' });
    }
    recordAppUsage(app_name, seconds);
    res.json({ success: true });
}));

app.get('/app-usage', (req, res) => {
    const usage = getTodayAppUsage();
    res.json({ usage });
});

app.get('/app-usage-categories', (req, res) => {
    const usage = getTodayAppUsage();

    const categoryMap = {
        'Productivity': ['Xcode', 'Visual Studio Code', 'Code', 'Terminal', 'iTerm2', 'Sublime Text', 'IntelliJ IDEA', 'PyCharm', 'WebStorm', 'Android Studio', 'Cursor', 'Windsurf', 'Nova', 'BBEdit', 'TextMate'],
        'Communication': ['Slack', 'Microsoft Teams', 'Zoom', 'Discord', 'Telegram', 'WhatsApp', 'Messages', 'Mail', 'Outlook', 'Spark', 'FaceTime', 'Skype'],
        'Browsers': ['Safari', 'Google Chrome', 'Firefox', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Opera', 'Vivaldi'],
        'Design': ['Figma', 'Sketch', 'Adobe Photoshop', 'Adobe Illustrator', 'Adobe XD', 'Canva', 'Affinity Designer', 'Affinity Photo', 'Preview'],
        'Documents': ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Pages', 'Numbers', 'Keynote', 'Notion', 'Obsidian', 'Bear', 'Notes', 'TextEdit'],
        'Entertainment': ['Spotify', 'Music', 'YouTube', 'Netflix', 'VLC', 'IINA', 'TV', 'Podcasts', 'Books'],
        'Utilities': ['Finder', 'System Preferences', 'System Settings', 'Activity Monitor', 'Disk Utility', 'Calculator', 'Calendar', 'Reminders', 'Clock', 'Shortcuts']
    };

    const categories = {};
    usage.forEach(app => {
        let cat = 'Other';
        for (const [category, apps] of Object.entries(categoryMap)) {
            if (apps.some(a => app.app_name.toLowerCase().includes(a.toLowerCase()))) {
                cat = category;
                break;
            }
        }
        if (!categories[cat]) categories[cat] = 0;
        categories[cat] += app.total_seconds;
    });

    const result = Object.entries(categories)
        .map(([name, seconds]) => ({ name, seconds }))
        .sort((a, b) => b.seconds - a.seconds);

    res.json({ categories: result });
});

app.get('/settings', (req, res) => {
    const goalHours = getSetting('goalHours', '4');
    const goalMinutes = getSetting('goalMinutes', '10');
    const breakInterval = getSetting('breakInterval', '60');
    res.json({ goalHours: parseInt(goalHours), goalMinutes: parseInt(goalMinutes), breakInterval: parseInt(breakInterval) });
});

app.post('/settings', asyncHandler(async (req, res) => {
    const { goalHours, goalMinutes, breakInterval } = req.body;
    if (goalHours !== undefined) setSetting('goalHours', goalHours);
    if (goalMinutes !== undefined) setSetting('goalMinutes', goalMinutes);
    if (breakInterval !== undefined) setSetting('breakInterval', breakInterval);
    res.json({ success: true });
}));

app.get('/today-events', (req, res) => {
    const events = db.prepare(`
        SELECT le.event_type, le.timestamp, s.type as session_type
        FROM lock_events le
        JOIN sessions s ON le.session_id = s.id
        WHERE s.date = date('now')
        ORDER BY le.timestamp ASC
    `).all();
    res.json({ events });
});

app.get('/export-csv', (req, res) => {
    const { getDailyReport, getWeeklyReport, getMonthlyReport } = require('./db');
    const tab = req.query.tab || 'daily';
    let data, headers;

    if (tab === 'weekly') {
        data = getWeeklyReport();
        headers = 'Week,Workplace Duration (seconds),Workplace Duration,Day Total (seconds),Day Total';
        res.setHeader('Content-Disposition', 'attachment; filename=weekly_report.csv');
    } else if (tab === 'monthly') {
        data = getMonthlyReport();
        headers = 'Month,Workplace Duration (seconds),Workplace Duration,Day Total (seconds),Day Total';
        res.setHeader('Content-Disposition', 'attachment; filename=monthly_report.csv');
    } else {
        data = getDailyReport();
        headers = 'Date,Workplace Duration (seconds),Workplace Duration,Day Total (seconds),Day Total';
        res.setHeader('Content-Disposition', 'attachment; filename=daily_report.csv');
    }

    const fmtTime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h}h ${m}m ${sec}s`;
    };

    const rows = data.map(item => {
        const period = item.date || item.week || item.month;
        return `${period},${item.manual_total},${fmtTime(item.manual_total)},${item.auto_total},${fmtTime(item.auto_total)}`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.send(headers + '\n' + rows.join('\n'));
});

app.get('/reports', (req, res) => {
    const { getDailyReport, getWeeklyReport, getMonthlyReport } = require('./db');
    res.json({
        daily: getDailyReport(),
        weekly: getWeeklyReport(),
        monthly: getMonthlyReport()
    });
});

// Migrations handled in db.js

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${PORT} (Restricted to localhost)`);
});
