const express = require('express');
const notifier = require('node-notifier');
const path = require('path');
const { db, startSession, getActiveSession, addEvent, updateSessionSeconds, completeSession, getTodayTotal, getTodayAutomaticSession } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files from restricted folder

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const GOAL_MINUTES = process.env.GOAL_MINUTES || 250; // default 4h 10m
const GOAL_SECONDS = GOAL_MINUTES * 60;

// Centralized error handling wrapper
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Background loop to increment time if active
setInterval(() => {
    try {
        const types = ['manual', 'automatic'];
        types.forEach(type => {
            const activeSession = getActiveSession(type);
            if (activeSession && activeSession.status === 'active') {
                const now = Date.now();
                const lastTickStr = activeSession.last_tick;
                const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : now;
                const delta = Math.floor((now - lastUpdate) / 1000);

                if (delta > 0) {
                    updateSessionSeconds(activeSession.id, delta);
                }

                db.prepare("UPDATE sessions SET last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(activeSession.id);

                // Goal check only for manual session
                if (type === 'manual') {
                    const updated = getActiveSession('manual');
                    if (updated.total_seconds >= GOAL_SECONDS && !updated.notified) {
                        notifier.notify({
                            title: 'Goal Achieved!',
                            message: `You've completed ${GOAL_MINUTES} minutes in the office.`,
                            sound: true
                        }, (err) => {
                            if (err) console.error("Notification failed:", err);
                        });
                        db.prepare("UPDATE sessions SET notified = 1 WHERE id = ?").run(updated.id);
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error in background timer loop:", error);
    }
}, 5000);

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
        }
    }

    console.log(`Received event: ${event}. Auto-tracker: ${autoStatus}.`);
    res.json({ success: true });
}));

app.get('/status', (req, res) => {
    const now = Date.now();
    const manual = getActiveSession('manual') || { status: 'idle', total_seconds: 0 };
    const automatic = getTodayAutomaticSession();

    // Live interpolation for manual session
    if (manual.status === 'active') {
        const lastTickStr = manual.last_tick;
        const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : now;
        const delta = Math.floor((now - lastUpdate) / 1000);
        if (delta > 0) manual.total_seconds += delta;
    }

    // Live interpolation for automatic session
    if (automatic.status === 'active') {
        const lastTickStr = automatic.last_tick;
        const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : now;
        const delta = Math.floor((now - lastUpdate) / 1000);
        if (delta > 0) automatic.total_seconds += delta;
    }

    res.json({
        manual,
        automatic
    });
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
