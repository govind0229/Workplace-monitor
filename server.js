const express = require('express');
const notifier = require('node-notifier');
const path = require('path');
const { db, startSession, getActiveSession, addEvent, updateSessionSeconds, completeSession, getTodayTotal, getTodayManualTotal, hasNotifiedToday, getTodayAutomaticSession, recordAppUsage, getTodayAppUsage, getSetting, setSetting } = require('./db');

const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Prevent caching for all routes (important for static assets in local webview)
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    maxAge: 0
})); // Serve frontend files from restricted folder

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

// Centralized error handling wrapper
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// On startup: auto-complete any stale manual sessions if office location is configured
(function autoCompleteStaleSession() {
    const officeLat = getSetting('officeLat', '');
    const officeLng = getSetting('officeLng', '');
    if (!officeLat || !officeLng) return; // Location automation not enabled

    const session = getActiveSession('manual');
    if (!session) return; // 'manual' includes both 'active' and 'paused' based on db.js logic

    // If last tick is more than 30 minutes ago, the user likely left and the app didn't catch it
    const lastTickStr = session.last_tick;
    const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : Date.now();
    const staleMinutes = (Date.now() - lastUpdate) / 60000;

    if (staleMinutes > 30) {
        completeSession(session.id);
        console.log(`[Startup] Auto-completed stale manual session #${session.id} (status: ${session.status}, inactive for ${Math.round(staleMinutes)} minutes).`);
    }
})();

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

                // For automatic session, only count time if manual session is NOT active
                if (type === 'automatic') {
                    const manualSession = getActiveSession('manual');
                    if (manualSession && manualSession.status === 'active') {
                        // Skip incrementing automatic time, but still update the last_tick
                        // so it doesn't build up a huge delta when manual stops
                        db.prepare("UPDATE sessions SET last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(activeSession.id);
                        return; // exit the forEach callback for this type
                    }
                }

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

                    const todayTotal = getTodayManualTotal();
                    const alreadyNotified = hasNotifiedToday();

                    if (todayTotal >= goalSec && !alreadyNotified) {
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

// Haversine formula to calculate distance between two coordinates in meters
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the earth in m
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

app.post('/location', asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and Longitude required' });
    }

    const officeLat = parseFloat(getSetting('officeLat'));
    const officeLng = parseFloat(getSetting('officeLng'));
    const officeRadius = parseInt(getSetting('officeRadius', '200'), 10); // meters

    if (isNaN(officeLat) || isNaN(officeLng)) {
        // Office location not configured, do nothing
        return res.json({ success: true, message: 'Office location not set' });
    }

    const distance = getDistanceFromLatLonInM(latitude, longitude, officeLat, officeLng);
    const isAtOffice = distance <= officeRadius;

    let manualSession = getActiveSession('manual');
    const autoSession = getTodayAutomaticSession();

    if (isAtOffice) {
        // Stop home timer, start office timer
        if (!manualSession) {
            const id = startSession('manual');
            manualSession = { id, status: 'active', total_seconds: 0, type: 'manual' };
            console.log(`[Location] Arrived at office (Distance: ${Math.round(distance)}m). Starting Office Timer.`);
        } else if (manualSession.status !== 'active') {
            db.prepare("UPDATE sessions SET status = 'active', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(manualSession.id);
            console.log(`[Location] Re-entered office (Distance: ${Math.round(distance)}m). Resuming Office Timer.`);
        }
    } else {
        // Stop office timer, start home timer
        if (manualSession) {
            if (manualSession.status === 'active') {
                const lastTickStr = manualSession.last_tick;
                const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : Date.now();
                const delta = Math.floor((Date.now() - lastUpdate) / 1000);
                updateSessionSeconds(manualSession.id, Math.max(0, delta));
            }
            completeSession(manualSession.id);
            console.log(`[Location] Left office (Distance: ${Math.round(distance)}m). Finishing Office Timer (status was: ${manualSession.status}).`);
        }
    }

    res.json({
        success: true,
        distance: Math.round(distance),
        isAtOffice
    });
}));

app.post('/set-office-location', asyncHandler(async (req, res) => {
    const { latitude, longitude, radius } = req.body;
    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and Longitude required' });
    }

    setSetting('officeLat', latitude.toString());
    setSetting('officeLng', longitude.toString());
    if (radius) {
        setSetting('officeRadius', radius.toString());
    }

    res.json({ success: true, message: 'Office location updated' });
}));

app.post('/clear-office-location', asyncHandler(async (req, res) => {
    // We don't have a deleteSetting helper yet, so we just set them to empty strings
    setSetting('officeLat', '');
    setSetting('officeLng', '');
    res.json({ success: true, message: 'Office location cleared' });
}));

app.get('/status', (req, res) => {
    const now = Date.now();
    const manual = getActiveSession('manual') || { status: 'idle', total_seconds: 0 };
    const automatic = getTodayAutomaticSession();

    const officeLat = getSetting('officeLat', '');
    const officeLng = getSetting('officeLng', '');
    const officeRadius = getSetting('officeRadius', '200');

    const baseManualSeconds = getTodayManualTotal();

    // Live interpolation for manual session (capped to 10s to exclude sleep time)
    if (manual.status === 'active') {
        const lastTickStr = manual.last_tick;
        const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : now;
        const delta = Math.min(Math.floor((now - lastUpdate) / 1000), 10);
        manual.total_seconds = baseManualSeconds + Math.max(0, delta);
    } else {
        manual.total_seconds = baseManualSeconds;
    }

    const baseAutoSeconds = getTodayTotal();

    // Live interpolation for automatic session (capped to 10s to exclude sleep time)
    // Only interpolate if manual session is NOT active
    if (automatic.status === 'active' && !(manual && manual.status === 'active')) {
        const lastTickStr = automatic.last_tick;
        const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : now;
        const delta = Math.min(Math.floor((now - lastUpdate) / 1000), 10);
        automatic.total_seconds = baseAutoSeconds + Math.max(0, delta);
    } else {
        automatic.total_seconds = baseAutoSeconds;
    }


    let isAtOffice = false;
    if (officeLat && officeLng) {
        // Use the manual session's actual state instead of constant calculation if you prefer,
        // but for robustness we can just check distance right here too or use a flag.
        // Let's re-calculate distance to be sure, or just rely on the manual status + distance check

        // We'll just define a quick haversine inline here or use the global one since it's already there
        // Actually, let's just use the manual session's latest event but we don't have that handy in the struct.
        // Or we can just calculate it if we have the latest location, but we don't store latest location.
        // Okay, the easiest way: return `isAtOfficeLocation: true` if manual timer is running and we have coordinates.
        // We'll refine this later by actually persisting the "ai_started" flag in sessions DB if needed.
    }

    res.json({
        manual,
        automatic,
        officeLat,
        officeLng,
        officeRadius: parseInt(officeRadius)
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

// Helper function to get merged category map (default + custom)
function getCategoryMap() {
    const defaultCategoryMap = {
        'Productivity': ['Xcode', 'Visual Studio Code', 'Code', 'Terminal', 'iTerm2', 'Sublime Text', 'IntelliJ IDEA', 'PyCharm', 'WebStorm', 'Android Studio', 'Cursor', 'Windsurf', 'Nova', 'BBEdit', 'TextMate'],
        'Communication': ['Slack', 'Microsoft Teams', 'Zoom', 'Discord', 'Telegram', 'WhatsApp', 'Messages', 'Mail', 'Outlook', 'Spark', 'FaceTime', 'Skype'],
        'Browsers': ['Safari', 'Google Chrome', 'Firefox', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Opera', 'Vivaldi'],
        'Design': ['Figma', 'Sketch', 'Adobe Photoshop', 'Adobe Illustrator', 'Adobe XD', 'Canva', 'Affinity Designer', 'Affinity Photo', 'Preview'],
        'Documents': ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Pages', 'Numbers', 'Keynote', 'Notion', 'Obsidian', 'Bear', 'Notes', 'TextEdit'],
        'Entertainment': ['Spotify', 'Music', 'YouTube', 'Netflix', 'VLC', 'IINA', 'TV', 'Podcasts', 'Books'],
        'Utilities': ['Finder', 'System Preferences', 'System Settings', 'Activity Monitor', 'Disk Utility', 'Calculator', 'Calendar', 'Reminders', 'Clock', 'Shortcuts']
    };

    // Get custom mappings from settings
    const customMappingsJson = getSetting('customAppCategories', '{}');
    let customMappings = {};
    try {
        customMappings = JSON.parse(customMappingsJson);
    } catch (e) {
        console.error('Failed to parse custom app categories:', e);
    }

    // Merge custom mappings with defaults (custom takes precedence)
    const mergedMap = { ...defaultCategoryMap };
    for (const [category, apps] of Object.entries(customMappings)) {
        if (!mergedMap[category]) {
            mergedMap[category] = [];
        }
        mergedMap[category] = [...new Set([...mergedMap[category], ...apps])];
    }

    return mergedMap;
}

app.get('/app-usage-categories', (req, res) => {
    const usage = getTodayAppUsage();
    const categoryMap = getCategoryMap();

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
    const goalLinePercent = getSetting('goalLinePercent', '44');
    const customAppCategories = getSetting('customAppCategories', '{}');
    const officeLat = getSetting('officeLat', '');
    const officeLng = getSetting('officeLng', '');
    const officeRadius = getSetting('officeRadius', '200');

    res.json({
        goalHours: parseInt(goalHours),
        goalMinutes: parseInt(goalMinutes),
        breakInterval: parseInt(breakInterval),
        goalLinePercent: parseInt(goalLinePercent),
        customAppCategories: customAppCategories,
        officeLat: officeLat,
        officeLng: officeLng,
        officeRadius: parseInt(officeRadius)
    });
});

app.post('/settings', asyncHandler(async (req, res) => {
    const { goalHours, goalMinutes, breakInterval, goalLinePercent, customAppCategories, officeRadius } = req.body;
    if (goalHours !== undefined) setSetting('goalHours', goalHours);
    if (goalMinutes !== undefined) setSetting('goalMinutes', goalMinutes);
    if (breakInterval !== undefined) setSetting('breakInterval', breakInterval);
    if (goalLinePercent !== undefined) setSetting('goalLinePercent', goalLinePercent);
    if (customAppCategories !== undefined) setSetting('customAppCategories', customAppCategories);
    if (officeRadius !== undefined) setSetting('officeRadius', officeRadius);
    res.json({ success: true });
}));

// Get list of all apps used today for category mapping UI
app.get('/today-apps', (req, res) => {
    const usage = getTodayAppUsage();
    const apps = usage.map(app => app.app_name).sort();
    res.json({ apps });
});

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
