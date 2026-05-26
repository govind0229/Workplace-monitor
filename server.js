const express = require('express');
const path = require('path');
const notificationQueue = [];

let pendingIdlePrompt = null;
let pendingBreakReminder = null;
let lastIdleStart = null;
const IDLE_PROMPT_THRESHOLD_SEC = 600; // 10 minutes

function clearSessionState(sessionId) {
    if (pendingBreakReminder && pendingBreakReminder.sessionId === sessionId) {
        pendingBreakReminder = null;
    }
    if (pendingIdlePrompt && pendingIdlePrompt.sessionId === sessionId) {
        pendingIdlePrompt = null;
    }
}

function sendNativeNotification(title, message) {
    notificationQueue.push({ title, message });
    console.log(`[Queueing Notification] ${title}: ${message} (Queue length: ${notificationQueue.length})`);
}

const { db, startSession, getActiveSession, addEvent, updateSessionSeconds, completeSession, getDailyReport, getWeeklyReport, getMonthlyReport, getOfficeVisitsReport, getTodayTotal, getTodayManualTotal, hasNotifiedToday, getTodayAutomaticSession, recordAppUsage, getTodayAppUsage, getSetting, setSetting, getRecentlySentMessages, markMessageSent, createProject, getProjects, deleteProject, getProjectReport, getLastSyncedId, updateSyncedId, getUnsyncedData } = require('./db');
const cors = require('cors');

// Self-healing: Reset break interval settings if they are set to 1 minute (from testing/demo mode)
const currentBreakInterval = getSetting('breakInterval');
if (currentBreakInterval === '1' || currentBreakInterval === 1 || Number(currentBreakInterval) === 1) {
    setSetting('breakInterval', '60');
    console.log('[Self-Healing] Reset breakInterval to production default of 60 minutes');
}
const currentWfhBreakInterval = getSetting('wfhBreakInterval');
if (currentWfhBreakInterval === '1' || currentWfhBreakInterval === 1 || Number(currentWfhBreakInterval) === 1) {
    setSetting('wfhBreakInterval', '60');
    console.log('[Self-Healing] Reset wfhBreakInterval to production default of 60 minutes');
}

// Pre-compiled prepared statements for hot paths (avoids SQLite re-planning on every tick)
const stmtUpdateLastTick = db.prepare("UPDATE sessions SET last_tick = CURRENT_TIMESTAMP WHERE id = ?");
const stmtSetStatus = db.prepare("UPDATE sessions SET status = ?, last_tick = CURRENT_TIMESTAMP WHERE id = ?");
const stmtSetNotified = db.prepare("UPDATE sessions SET notified = 1 WHERE id = ?");
const stmtSetBreakNotify = db.prepare("UPDATE sessions SET last_break_notify = ? WHERE id = ?");

// Settings cache — settings rarely change mid-session, so we cache them for 30 seconds
let _settingsCache = {};
let _settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30000; // 30 seconds
function getCachedSetting(key, defaultValue = null) {
    const now = Date.now();
    if (now - _settingsCacheTime > SETTINGS_CACHE_TTL) {
        _settingsCache = {}; // invalidate
        _settingsCacheTime = now;
    }
    if (!(key in _settingsCache)) {
        _settingsCache[key] = getSetting(key, defaultValue);
    }
    return _settingsCache[key];
}
function invalidateSettingsCache() { _settingsCache = {}; _settingsCacheTime = 0; }


// --- Tracery-Powered Dynamic Break Messages ---
const tracery = require('tracery-grammar');

// Shared grammar rules used across all time slots
const SHARED_RULES = {
    duration: ['2 minutes', '5 minutes', 'a few seconds', '60 seconds', 'a minute'],
    body_part: ['your back', 'your neck', 'your shoulders', 'your wrists', 'your eyes'],
    benefit: ['boosts focus', 'reduces tension', 'recharges energy', 'prevents strain', 'improves circulation', 'clears your mind'],
    water_size: ['a glass', 'a full glass', 'a mug'],
};

// Per-slot grammar rules layered on top of shared rules
const SLOT_RULES = {
    morning: {
        ...SHARED_RULES,
        verb: ['stretch', 'breathe deeply', 'hydrate', 'plan your day', 'step outside briefly'],
        context: ['before your first meeting', 'before you dive in', 'to start strong', 'as a morning ritual'],
        tip: [
            '#verb# for #duration# #context# — it #benefit#.',
            'Drink #water_size# now. Starting hydrated keeps #benefit# through to lunch.',
            'Take #duration# to check your posture and breathe. It #benefit#.',
            'Set your top 3 goals for today before checking messages.',
            'Look out a window for 30 seconds. Your eyes need a distance reset every hour.',
            'Roll your shoulders back — #body_part# needs a reset after the morning commute.',
        ],
        slot_title: ['🌅 Morning Boost', '💧 Morning Hydration', '🌤️ Wake Up Break', '✅ Morning Intention', '🚶 Morning Move'],
    },
    lunch: {
        ...SHARED_RULES,
        meal_tip: [
            'Step fully away from your desk — a proper lunch break #benefit#.',
            'Try a screen-free lunch. Your eyes will thank you this afternoon.',
            'Eat outside or near a window. Fresh air and daylight #benefit#.',
            'A 10-minute walk after lunch fights the afternoon energy dip.',
            'Drink #water_size# with your lunch to stay sharp for the afternoon.',
            'Chat with someone during lunch. Social breaks restore mental energy.',
        ],
        slot_title: ['🍽️ Lunch Break', '☀️ Midday Reset', '🚶 Post-Lunch Walk', '📵 Screen-Free Lunch', '💧 Midday Hydration'],
    },
    afternoon: {
        ...SHARED_RULES,
        slump_tip: [
            'Feeling the 3pm slump? Cold water and a quick walk beat coffee every time.',
            'Stand up and #verb# for #duration# — it #benefit# more than a snack.',
            'Look at something far away for 20 seconds. The 20-20-20 rule reduces eye strain.',
            'Roll your wrists 10 times each way — a small move that prevents big problems.',
            'Drink #water_size#. Afternoon dehydration is a major focus killer.',
            'Quick posture reset: feet flat, screen at eye level, shoulders relaxed.',
            'A healthy snack now — nuts, fruit, or yoghurt — keeps your brain fueled.',
        ],
        verb: ['stretch', 'walk around', 'breathe', 'reset your posture'],
        slot_title: ['😴 Afternoon Reset', '👁️ Eye Break', '🙆 Stretch Time', '💧 Hydration Check', '🧠 Focus Reset', '🍎 Snack Break'],
    },
    late_afternoon: {
        ...SHARED_RULES,
        wind_tip: [
            'Start finishing open tasks so you can close the day cleanly.',
            'Take #duration# to write down what you finished today and what carries to tomorrow.',
            'Drink #water_size# — your last hydration push before end of day.',
            'Close your eyes for 30 seconds and take 3 slow, deep breaths.',
            'One last #body_part# stretch before you wrap up for the evening.',
            'Review your task list and drag unfinished items to tomorrow deliberately.',
        ],
        slot_title: ['📋 Wind-Down Time', '👀 Eye Rest', '📝 Day Review', '💧 Final Hydration', '🙆 Last Stretch'],
    },
    evening: {
        ...SHARED_RULES,
        eve_tip: [
            'Set a firm stop time tonight and protect it. Rest is part of performance.',
            'Enable Night Shift or reduce screen brightness — warmer tones help your sleep.',
            "Working late? Don't skip dinner. Recovery starts tonight.",
            'Think of one thing that went well today. Small wins build momentum.',
            'Decide your top priority for tomorrow, then close your laptop guilt-free.',
            'Drink #water_size# before you log off. Evening hydration aids sleep quality.',
        ],
        slot_title: ['🌙 Evening Wind-Down', '💡 Eye Strain Alert', '🍽️ Dinner Reminder', '⏰ Stop-Time Check', '🌟 Evening Reflection'],
    },
};

function buildGrammar(slot) {
    const rules = SLOT_RULES[slot] || SLOT_RULES.afternoon;
    const bodyKey = { morning: 'tip', lunch: 'meal_tip', afternoon: 'slump_tip', late_afternoon: 'wind_tip', evening: 'eve_tip' }[slot];
    return tracery.createGrammar({
        ...rules,
        origin: [`#${bodyKey}#`],
    });
}

function getSmartBreakMessage(sessionType = 'manual', overrideSlot = null) {
    const now = new Date();
    const hour = now.getHours();
    const min = now.getMinutes();
    const t = hour + (min / 60);

    const slot = overrideSlot || (
        t < 11 ? 'morning'
            : t < 13.5 ? 'lunch'
                : t < 16 ? 'afternoon'
                    : t < 18.5 ? 'late_afternoon'
                        : 'evening');

    const grammar = buildGrammar(slot);
    grammar.addModifiers(tracery.baseEngModifiers);

    // Load the 7-day sent history upfront
    const recentKeys = new Set(getRecentlySentMessages(7));

    // Try up to 8 times to generate a message not seen in the past 7 days
    let body, title, key;
    let attempts = 0;
    const MAX_ATTEMPTS = 8;

    do {
        body = grammar.flatten('#origin#');
        // Use longer body string as key for reliable dedup
        key = `${slot}_${body.trim().toLowerCase().replace(/\W+/g, '_').substring(0, 100)}`;
        title = SLOT_RULES[slot].slot_title[Math.floor(Math.random() * SLOT_RULES[slot].slot_title.length)];
        attempts++;
    } while (recentKeys.has(key) && attempts < MAX_ATTEMPTS);

    markMessageSent(key);

    const prefix = sessionType === 'automatic' ? '(WFH) ' : '';
    console.log(`[Tracery Break] Slot: ${slot}, Attempts: ${attempts}, Key: ${key}`);

    return { title, body: `${prefix}${body}` };
}



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

// On startup: auto-complete any stale automatic (WFH) sessions from today
// This handles the case where the PC was shut down/restarted mid-session.
// Without this, the WFH timer would resume from where it left off before the reboot,
// showing stale time (e.g. 59 min) even on a fresh boot.
(function autoCompleteStaleAutomaticSession() {
    const autoSession = db.prepare(
        "SELECT * FROM sessions WHERE date = date('now', 'localtime') AND type = 'automatic' AND status != 'completed' LIMIT 1"
    ).get();
    if (!autoSession) return;

    const lastTickStr = autoSession.last_tick;
    const lastUpdate = lastTickStr ? new Date(lastTickStr.replace(' ', 'T') + 'Z').getTime() : Date.now();
    const staleMinutes = (Date.now() - lastUpdate) / 60000;

    // If last tick is more than 5 minutes ago, the session is stale (PC was shut down or crashed).
    // Complete it so the WFH timer starts fresh on this boot.
    if (staleMinutes > 5) {
        completeSession(autoSession.id);
        console.log(`[Startup] Completed stale automatic session #${autoSession.id} (inactive for ${Math.round(staleMinutes)} min). WFH timer will start fresh.`);
    }
})();

// On startup: complete any orphaned sessions from previous dates
// These can happen if the machine slept suddenly and missed the lock event
function cleanupPreviousDaySessions() {
    const orphaned = db.prepare(`
        SELECT id, date, type, status FROM sessions
        WHERE status IN ('active', 'paused')
          AND date < date('now', 'localtime')
    `).all();

    if (orphaned.length > 0) {
        db.prepare(`
            UPDATE sessions
            SET status = 'completed', end_time = CURRENT_TIMESTAMP
            WHERE status IN ('active', 'paused')
              AND date < date('now', 'localtime')
        `).run();
        orphaned.forEach(s => clearSessionState(s.id));
        console.log(`[Cleanup] Cleaned up ${orphaned.length} orphaned session(s) from previous days:`, orphaned.map(s => `#${s.id} (${s.date} ${s.type})`).join(', '));
    }
}

// On startup: complete any orphaned sessions from previous dates
cleanupPreviousDaySessions();

const TIME_SCHEDULE = [
    { hour: 9, id: 'breakfast', slot: 'morning' },
    { hour: 11, id: 'mid_morning', slot: 'morning' },
    { hour: 13, id: 'lunch', slot: 'lunch' },
    { hour: 16, id: 'afternoon', slot: 'afternoon' },
    { hour: 19, id: 'dinner', slot: 'evening' },
    { hour: 23, id: 'late_night', slot: 'evening' }
];

function checkTimeBasedNotifications() {
    const manualSession = getActiveSession('manual');
    const automaticSession = getTodayAutomaticSession();
    const isManualActive = manualSession && manualSession.status === 'active';
    const isAutoActive = automaticSession && automaticSession.status === 'active';

    // Only remind if they are currently working (in the office or WFH)
    if (!isManualActive && !isAutoActive) return;

    // Prevent immediate popups on fresh boot or when just starting work:
    // Require at least 30 minutes of active work in the current session before sending a scheduled break.
    const activeSession = isManualActive ? manualSession : automaticSession;
    if (!activeSession || activeSession.total_seconds < 1800) return;

    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`; // Local date string

    for (const meal of TIME_SCHEDULE) {
        if (currentHour === meal.hour) {
            const cacheKey = `last_meal_notify_${meal.id}`;
            const lastSent = getSetting(cacheKey, '');
            if (lastSent !== todayStr) {
                // Generate a smart, non-repeating message for the corresponding slot
                const sessionType = isManualActive ? 'manual' : 'automatic';
                const msg = getSmartBreakMessage(sessionType, meal.slot);
                sendNativeNotification(msg.title, msg.body);
                setSetting(cacheKey, todayStr);
                console.log(`[Time-Based] Sent ${meal.id} notification for ${todayStr}`);
            }
        }
    }
}

let lastRolloverDateStr = new Date().toLocaleDateString();

// Background loop to increment time if active (recursive setTimeout prevents overlap)
function runBackgroundLoop() {
    try {
        const todayStr = new Date().toLocaleDateString();
        if (todayStr !== lastRolloverDateStr) {
            console.log(`[Rollover] Midnight crossed. Cleaning up previous day sessions.`);
            cleanupPreviousDaySessions();
            lastIdleStart = null; // Prevent lock state leakage across midnight
            lastRolloverDateStr = todayStr;
        }

        checkTimeBasedNotifications();

        const types = ['manual', 'automatic'];
        // Fetch both sessions in one pass to avoid extra queries
        const manualSession = getActiveSession('manual');
        const automaticSession = getTodayAutomaticSession();

        // --- Robust Settings Self-Healing ---
        // If a test script or runaway process left breakInterval or wfhBreakInterval at 1,
        // and there is no active session of that type, self-heal back to 60 immediately.
        try {
            const dbBreakInterval = getSetting('breakInterval');
            if (dbBreakInterval === '1' || dbBreakInterval === 1 || Number(dbBreakInterval) === 1) {
                if (!manualSession || manualSession.status !== 'active') {
                    setSetting('breakInterval', '60');
                    invalidateSettingsCache();
                    console.log('[Self-Healing] Reset inactive breakInterval back to 60 minutes');
                }
            }
            const dbWfhBreakInterval = getSetting('wfhBreakInterval');
            if (dbWfhBreakInterval === '1' || dbWfhBreakInterval === 1 || Number(dbWfhBreakInterval) === 1) {
                if (!automaticSession || automaticSession.status !== 'active') {
                    setSetting('wfhBreakInterval', '60');
                    invalidateSettingsCache();
                    console.log('[Self-Healing] Reset inactive wfhBreakInterval back to 60 minutes');
                }
            }
        } catch (healError) {
            console.error("Error in timing self-healing block:", healError);
        }

        for (const [type, activeSession] of [['manual', manualSession], ['automatic', automaticSession]]) {
            if (!activeSession || activeSession.status !== 'active') continue;

            const now = Date.now();
            const lastUpdate = activeSession.last_tick
                ? new Date(activeSession.last_tick.replace(' ', 'T') + 'Z').getTime()
                : now;
            const rawDelta = Math.floor((now - lastUpdate) / 1000);

            // Cap delta to 30s — prevents time accumulation during sleep gaps
            const delta = Math.min(rawDelta, 30);

            // For automatic session, only count time if manual session is NOT active
            if (type === 'automatic') {
                if (manualSession && manualSession.status === 'active') {
                    // Skip incrementing time, but keep last_tick fresh
                    stmtUpdateLastTick.run(activeSession.id);
                    continue;
                }
            }

            if (delta > 0) updateSessionSeconds(activeSession.id, delta);
            stmtUpdateLastTick.run(activeSession.id);

            // Goal check only for manual session
            if (type === 'manual') {
                const goalH = parseInt(getCachedSetting('goalHours', '4'));
                const goalM = parseInt(getCachedSetting('goalMinutes', '10'));
                const goalSec = (goalH * 3600) + (goalM * 60);

                const todayTotal = getTodayManualTotal();
                const alreadyNotified = hasNotifiedToday();

                if (todayTotal >= goalSec && !alreadyNotified) {
                    console.log(`[Goal] Goal achieved: ${todayTotal} >= ${goalSec}. Sending notification.`);
                    sendNativeNotification('Goal Achieved! 🎉', `You've completed ${goalH}h ${goalM}m in the office. Great work!`);
                    stmtSetNotified.run(activeSession.id);
                }

                // Break reminder
                const breakMin = parseInt(getCachedSetting('breakInterval', '60'));
                if (breakMin > 0) {
                    const breakSec = breakMin * 60;
                    const lastBreak = activeSession.last_break_notify || 0;
                    if (activeSession.total_seconds - lastBreak >= breakSec) {
                        const msg = getSmartBreakMessage('manual');
                        sendNativeNotification(msg.title, msg.body);
                        stmtSetBreakNotify.run(activeSession.total_seconds, activeSession.id);
                        pendingBreakReminder = {
                            sessionId: activeSession.id,
                            type: 'manual',
                            minutes: breakMin,
                            message: msg.body
                        };
                        // Self-healing: If it was set to 1 (testing mode), restore to 60 immediately
                        // so it doesn't spam every minute!
                        if (breakMin === 1) {
                            setSetting('breakInterval', '60');
                            invalidateSettingsCache();
                            console.log('[Demo Safety] Reset breakInterval back to 60 minutes after triggering demo break');
                        }
                    }
                }
            } else if (type === 'automatic') {
                const wfhBreakMin = parseInt(getCachedSetting('wfhBreakInterval', '60'));
                if (wfhBreakMin > 0) {
                    const breakSec = wfhBreakMin * 60;
                    const lastBreak = activeSession.last_break_notify || 0;
                    if (activeSession.total_seconds - lastBreak >= breakSec) {
                        const msg = getSmartBreakMessage('automatic');
                        sendNativeNotification(msg.title, msg.body);
                        stmtSetBreakNotify.run(activeSession.total_seconds, activeSession.id);
                        pendingBreakReminder = {
                            sessionId: activeSession.id,
                            type: 'automatic',
                            minutes: wfhBreakMin,
                            message: msg.body
                        };
                        // Self-healing: If it was set to 1 (testing mode), restore to 60 immediately
                        if (wfhBreakMin === 1) {
                            setSetting('wfhBreakInterval', '60');
                            invalidateSettingsCache();
                            console.log('[Demo Safety] Reset wfhBreakInterval back to 60 minutes after triggering demo break');
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error in background timer loop:", error);
    } finally {
        // Adaptive scaling: Poll every 5s during active sessions, 15s when idle
        const manualSession = getActiveSession('manual');
        const autoSession = getTodayAutomaticSession();
        const isActive = (manualSession && manualSession.status === 'active') || 
                       (autoSession && autoSession.status === 'active');
        
        setTimeout(runBackgroundLoop, isActive ? 5000 : 15000);
    }
}
setTimeout(runBackgroundLoop, 5000);

// --- Cloud Sync Background Worker ---
let lastSyncAttempt = null;
let lastSyncResult = null;

async function runCloudSync() {
    const cloudUrl = getCachedSetting('cloudSyncUrl', '');
    const cloudApiKey = getCachedSetting('cloudApiKey', '');
    const syncEnabled = getCachedSetting('cloudSyncEnabled', 'false');

    if (syncEnabled !== 'true' || !cloudUrl) return;

    try {
        const unsyncedData = getUnsyncedData();
        if (unsyncedData.sessions.length === 0 && unsyncedData.appUsage.length === 0) {
            lastSyncResult = { status: 'ok', message: 'Nothing to sync', time: new Date().toISOString() };
            return;
        }

        const payload = {
            device_id: getCachedSetting('deviceId', require('os').hostname()),
            timestamp: new Date().toISOString(),
            sessions: unsyncedData.sessions,
            app_usage: unsyncedData.appUsage,
            projects: unsyncedData.projects
        };

        const headers = { 'Content-Type': 'application/json' };
        if (cloudApiKey) headers['Authorization'] = `Bearer ${cloudApiKey}`;

        const response = await fetch(cloudUrl, { method: 'POST', headers, body: JSON.stringify(payload) });

        if (response.ok) {
            if (unsyncedData.sessions.length > 0) {
                updateSyncedId('sessions', Math.max(...unsyncedData.sessions.map(s => s.id)));
            }
            if (unsyncedData.appUsage.length > 0) {
                updateSyncedId('app_usage', Math.max(...unsyncedData.appUsage.map(a => a.id)));
            }
            lastSyncResult = { status: 'ok', message: `Synced ${unsyncedData.sessions.length} sessions, ${unsyncedData.appUsage.length} app records`, time: new Date().toISOString() };
            console.log(`[CloudSync] ${lastSyncResult.message}`);
        } else {
            lastSyncResult = { status: 'error', message: `Server responded ${response.status}`, time: new Date().toISOString() };
            console.error(`[CloudSync] Failed: ${response.status}`);
        }
    } catch (error) {
        lastSyncResult = { status: 'error', message: error.message, time: new Date().toISOString() };
        console.error(`[CloudSync] Error: ${error.message}`);
    }
    lastSyncAttempt = new Date().toISOString();
}

setInterval(runCloudSync, 5 * 60 * 1000);
setTimeout(runCloudSync, 30000);

app.post('/start', asyncHandler(async (req, res) => {
    const { project_id, include_automatic } = req.body || {};
    let targetProjectId = project_id !== undefined ? (project_id || null) : null;

    // Fetch default project if none provided
    if (targetProjectId === null) {
        const defaultProjectId = getSetting('defaultProjectId');
        if (defaultProjectId) targetProjectId = parseInt(defaultProjectId);
    }

    let session = getActiveSession('manual');
    let sessionType = 'manual';

    if (!session && include_automatic) {
        session = getActiveSession('automatic');
        sessionType = 'automatic';
    }

    if (!session) {
        const id = startSession('manual', targetProjectId);
        session = { id, status: 'active', total_seconds: 0, type: 'manual', project_id: targetProjectId };
        console.log(`[Manual] Session started: ${id}${targetProjectId ? ` (project: ${targetProjectId})` : ''}`);
        sendNativeNotification('🏢 Workplace Session Started', 'Manual tracking is now active. Good luck!');
    } else {
        const providedProjectId = project_id !== undefined ? (project_id || null) : session.project_id;

        if (String(providedProjectId) !== String(session.project_id)) {
            console.log(`[${sessionType}] Project changed from ${session.project_id} to ${providedProjectId}. Splitting session.`);
            completeSession(session.id);
            const newId = startSession(sessionType, providedProjectId);
            session = { id: newId, status: 'active', total_seconds: 0, type: sessionType, project_id: providedProjectId };
            targetProjectId = providedProjectId;
        } else {
            db.prepare("UPDATE sessions SET status = 'active', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
            console.log(`[${sessionType}] Session resumed: ${session.id}`);
            if (sessionType === 'manual') {
                sendNativeNotification('🏢 Tracking Resumed', 'Manual session resumed. Welcome back!');
            }
            targetProjectId = providedProjectId;
        }
    }

    // Automatically remember the project as the default
    if (targetProjectId !== null) {
        const currentDefault = getSetting('defaultProjectId');
        if (String(targetProjectId) !== String(currentDefault)) {
            console.log(`[Settings] Updating default project ID to ${targetProjectId}`);
            setSetting('defaultProjectId', targetProjectId);
        }
    }

    res.json({ success: true, session });
}));

app.post('/pause', asyncHandler(async (req, res) => {
    const session = getActiveSession('manual');
    if (session && session.status === 'active') {
        db.prepare("UPDATE sessions SET status = 'paused', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
        sendNativeNotification('Workplace Monitor', 'Tracking paused.');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'No active session to pause' });
    }
}));

app.post('/stop', asyncHandler(async (req, res) => {
    const session = getActiveSession('manual');
    if (session) {
        completeSession(session.id);
        clearSessionState(session.id);
        console.log(`[Manual] Session stopped: ${session.id}`);
        sendNativeNotification('✅ Finish Day Session', 'Workplace session finished. Great work today!');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'No active session' });
    }
}));

app.post('/event', asyncHandler(async (req, res) => {
    const { event, metadata } = req.body;
    const reason = metadata?.reason || 'unknown';

    if (!event || !['lock', 'unlock'].includes(event)) {
        return res.status(400).json({ error: 'Invalid event. Must be "lock" or "unlock".' });
    }

    const finishReasons = ['user_initiated', 'session_resign', 'system_sleep'];

    if (event === 'lock') {
        if (finishReasons.includes(reason)) {
            lastIdleStart = null; // Do not calculate idle duration for sleep/finish
        } else {
            lastIdleStart = Date.now();
        }
    } else if (event === 'unlock') {
        let duration = 0;
        let isOvernight = false;
        
        if (metadata && metadata.duration) {
            duration = parseInt(metadata.duration);
            if (lastIdleStart) {
                const idleDateStr = new Date(lastIdleStart).toLocaleDateString();
                const todayStr = new Date().toLocaleDateString();
                if (idleDateStr !== todayStr) {
                    isOvernight = true;
                }
            }
        } else if (lastIdleStart) {
            duration = Math.floor((Date.now() - lastIdleStart) / 1000);
            const idleDateStr = new Date(lastIdleStart).toLocaleDateString();
            const todayStr = new Date().toLocaleDateString();
            if (idleDateStr !== todayStr) {
                isOvernight = true;
            }
        }
        lastIdleStart = null;

        // Discard overnight or extremely large idle durations to prevent timer leakage
        if (duration > 14400 && (isOvernight || duration > 28800)) {
            console.log(`[Idle] Discarding extremely large/overnight idle duration of ${duration}s (isOvernight: ${isOvernight})`);
            duration = 0;
        }

        if (duration >= IDLE_PROMPT_THRESHOLD_SEC) {
            const manualSession = getActiveSession('manual');
            const session = manualSession || getTodayAutomaticSession();
            if (session) {
                pendingIdlePrompt = {
                    sessionId: session.id,
                    sessionType: manualSession ? 'manual' : 'automatic',
                    duration: duration
                };
                console.log(`[Idle Prompt] Generated pending prompt for session #${session.id}, duration: ${duration}s`);
            }
        }
    }

    // 1. Handle Automatic Session (Completes on user action, pauses on idle)
    const autoSession = getTodayAutomaticSession();
    const wasAutoStatus = autoSession.status;
    
    if (event === 'lock' && finishReasons.includes(reason)) {
        completeSession(autoSession.id);
        clearSessionState(autoSession.id);
        addEvent(autoSession.id, `${event}_${reason}`);
        console.log(`[Auto] Session #${autoSession.id} COMPLETED due to user action (${reason}).`);
        sendNativeNotification('🏠 WFH Session Finished', 'Lid closed or manual sleep detected. WFH session finished.');
    } else {
        const autoStatus = event === 'lock' ? 'paused' : 'active';
        db.prepare("UPDATE sessions SET status = ?, last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(autoStatus, autoSession.id);
        addEvent(autoSession.id, `${event}_${reason}`);

        // Send notification for automatic session state changes
        if (event === 'unlock' && wasAutoStatus !== 'active') {
            if (!autoSession.notified) {
                console.log(`[Auto] Screen unlocked — automatic session started (Reason: ${reason}).`);
                sendNativeNotification('🏠 WFH Session Started', 'Automatic tracking is now active.');
                db.prepare("UPDATE sessions SET notified = 1 WHERE id = ?").run(autoSession.id);
            } else {
                console.log(`[Auto] Screen unlocked — automatic session resumed (Reason: ${reason}).`);
                sendNativeNotification('🏠 WFH Session Resumed', 'Screen unlocked. Timer resumed.');
            }
        } else if (event === 'lock' && wasAutoStatus === 'active') {
            console.log(`[Auto] Screen locked — automatic session paused (Reason: ${reason}).`);
            sendNativeNotification('🏠 WFH Session Paused', 'Screen locked. Timer paused.');
        }
    }

    // 2. Handle Manual Session (Completes on user-initiated sleep, pauses on idle)
    const manualSession = getActiveSession('manual');
    if (manualSession) {
        if (event === 'lock') {
            if (finishReasons.includes(reason)) {
                // Force complete manual session (assuming user is leaving or closing lid)
                completeSession(manualSession.id);
                clearSessionState(manualSession.id);
                console.log(`[Manual] Session #${manualSession.id} COMPLETED due to user action (${reason})`);
                sendNativeNotification('✅ Session Finished', 'Lid closed or manual sleep detected. Session finished.');
            } else {
                db.prepare("UPDATE sessions SET status = 'paused', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(manualSession.id);
                console.log(`[Manual] Session #${manualSession.id} PAUSED due to idle (${reason})`);
            }
            addEvent(manualSession.id, `lock_${reason}`);
        } else if (event === 'unlock') {
            // Auto-resume on unlock (unless it was completed)
            if (manualSession.status === 'paused') {
                db.prepare("UPDATE sessions SET status = 'active', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(manualSession.id);
                addEvent(manualSession.id, `unlock_${reason}`);
                console.log(`[Manual] Session #${manualSession.id} RESUMED after unlock.`);
            }
        }
    }

    console.log(`Received event: ${event} (Reason: ${reason}).`);
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
    const officeRadius = parseInt(getSetting('officeRadius', '300'), 10); // meters

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
            let targetProjectId = null;
            const defaultProjectId = getSetting('defaultProjectId');
            if (defaultProjectId) targetProjectId = parseInt(defaultProjectId);
            
            const id = startSession('manual', targetProjectId);
            manualSession = { id, status: 'active', total_seconds: 0, type: 'manual', project_id: targetProjectId };
            console.log(`[Location] Arrived at office (Distance: ${Math.round(distance)}m). Starting Office Timer.`);
            sendNativeNotification('Workplace Monitor', 'Arrived at the office. Workplace tracking started.');
        } else if (manualSession.status !== 'active') {
            db.prepare("UPDATE sessions SET status = 'active', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(manualSession.id);
            console.log(`[Location] Re-entered office (Distance: ${Math.round(distance)}m). Resuming Office Timer.`);
            sendNativeNotification('Workplace Monitor', 'Re-entered the office. Workplace tracking resumed.');
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
    const firstManual = db.prepare("SELECT MIN(datetime(start_time, 'localtime')) as first FROM sessions WHERE date = date('now', 'localtime') AND type = 'manual'").get();
    const arrivalTime = firstManual ? firstManual.first : null;

    const officeLat = getSetting('officeLat', '');
    const officeLng = getSetting('officeLng', '');
    const officeRadius = getSetting('officeRadius', '300');

    const baseManualSeconds = getTodayManualTotal();

    // Live interpolation for manual session (capped to 30s to exclude sleep time)
    if (manual.status === 'active') {
        const lastUpdate = manual.last_tick ? new Date(manual.last_tick.replace(' ', 'T') + 'Z').getTime() : now;
        const delta = Math.min(Math.floor((now - lastUpdate) / 1000), 30);
        manual.total_seconds = baseManualSeconds + Math.max(0, delta);
    } else {
        manual.total_seconds = baseManualSeconds;
    }

    const baseAutoSeconds = getTodayTotal();

    // Live interpolation for automatic session (capped to 30s to exclude sleep time)
    // Only interpolate if manual session is NOT active
    if (automatic.status === 'active' && !(manual && manual.status === 'active')) {
        const lastUpdate = automatic.last_tick ? new Date(automatic.last_tick.replace(' ', 'T') + 'Z').getTime() : now;
        const delta = Math.min(Math.floor((now - lastUpdate) / 1000), 30);
        automatic.total_seconds = baseAutoSeconds + Math.max(0, delta);
    } else {
        automatic.total_seconds = baseAutoSeconds;
    }

    // Take the first notification from the queue if any and if consumer is native app
    const consume = req.query.consume === 'true';
    const pendingNotification = (consume && notificationQueue.length > 0) ? notificationQueue.shift() : (notificationQueue[0] || null);

    if (consume && pendingNotification) {
        console.log(`[Notification] Shifted from queue: ${pendingNotification.title}`);
    }
    // Calculate suggested polling interval for the client (native app)
    // If a session is active, client should poll every 5s.
    // If idle/locked, client can back off to 20s to save energy.
    const isAnyActive = (manual && manual.status === 'active') || (automatic && automatic.status === 'active');
    const suggestedPollMs = isAnyActive ? 5000 : 20000;

    res.json({
        manual,
        automatic,
        arrivalTime,
        officeLat,
        officeLng,
        officeRadius: parseInt(officeRadius),
        pending_notification: pendingNotification,
        pending_idle_prompt: pendingIdlePrompt,
        pending_break_reminder: pendingBreakReminder,
        suggested_poll_ms: suggestedPollMs
    });
});

app.post('/respond-idle-prompt', asyncHandler(async (req, res) => {
    const { choice } = req.body;
    
    if (!pendingIdlePrompt) {
        return res.status(400).json({ error: 'No pending idle prompt' });
    }
    
    const { sessionId, duration } = pendingIdlePrompt;
    
    if (choice === 'meeting' || choice === 'designing') {
        updateSessionSeconds(sessionId, duration);
        addEvent(sessionId, `idle_respond_keep_${choice}`);
        console.log(`[Idle Prompt] Added ${duration}s back to session #${sessionId} (Choice: ${choice})`);
    } else {
        addEvent(sessionId, `idle_respond_discard_${choice}`);
        console.log(`[Idle Prompt] Discarded idle duration ${duration}s (Choice: ${choice})`);
    }
    
    pendingIdlePrompt = null;
    res.json({ success: true });
}));

app.post('/dismiss-break-reminder', asyncHandler(async (req, res) => {
    pendingBreakReminder = null;
    res.json({ success: true });
}));

app.post('/snooze-break-reminder', asyncHandler(async (req, res) => {
    let session = getActiveSession('manual');
    let type = 'manual';
    if (!session || session.status !== 'active') {
        session = getTodayAutomaticSession();
        type = 'automatic';
    }
    if (session && session.status === 'active') {
        const breakMin = parseInt(type === 'manual' ? getCachedSetting('breakInterval', '60') : getCachedSetting('wfhBreakInterval', '60'));
        const snoozeMin = parseInt(req.body.minutes || '10');
        const breakSec = breakMin * 60;
        const snoozeSec = snoozeMin * 60;
        const newBreakNotify = session.total_seconds - breakSec + snoozeSec;
        stmtSetBreakNotify.run(newBreakNotify, session.id);
        console.log(`[Break Reminder] Snoozed session #${session.id} (${type}) for ${snoozeMin} minutes. New last_break_notify = ${newBreakNotify}`);
    }
    pendingBreakReminder = null;
    res.json({ success: true });
}));

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
        'Productivity': ['Xcode', 'Visual Studio Code', 'Code', 'Terminal', 'iTerm2', 'Sublime Text', 'IntelliJ IDEA', 'PyCharm', 'WebStorm', 'Android Studio', 'Cursor', 'Windsurf', 'Nova', 'BBEdit', 'TextMate',
            'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'jira.atlassian.com', 'linear.app', 'notion.so', 'trello.com', 'asana.com', 'clickup.com'],
        'Communication': ['Slack', 'Microsoft Teams', 'Zoom', 'Discord', 'Telegram', 'WhatsApp', 'Messages', 'Mail', 'Outlook', 'Spark', 'FaceTime', 'Skype',
            'mail.google.com', 'outlook.live.com', 'slack.com', 'teams.microsoft.com', 'discord.com', 'web.whatsapp.com', 'web.telegram.org'],
        'Browsers': ['Safari', 'Google Chrome', 'Firefox', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Opera', 'Vivaldi'],
        'Design': ['Figma', 'Sketch', 'Adobe Photoshop', 'Adobe Illustrator', 'Adobe XD', 'Canva', 'Affinity Designer', 'Affinity Photo', 'Preview',
            'figma.com', 'canva.com', 'dribbble.com', 'behance.net'],
        'Documents': ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Pages', 'Numbers', 'Keynote', 'Notion', 'Obsidian', 'Bear', 'Notes', 'TextEdit',
            'docs.google.com', 'sheets.google.com', 'slides.google.com', 'medium.com'],
        'Entertainment': ['Spotify', 'Music', 'YouTube', 'Netflix', 'VLC', 'IINA', 'TV', 'Podcasts', 'Books',
            'youtube.com', 'netflix.com', 'twitch.tv', 'reddit.com', 'twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'tiktok.com', 'spotify.com'],
        'Utilities': ['Finder', 'System Preferences', 'System Settings', 'Activity Monitor', 'Disk Utility', 'Calculator', 'Calendar', 'Reminders', 'Clock', 'Shortcuts',
            'calendar.google.com', 'drive.google.com']
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
    const wfhBreakInterval = getSetting('wfhBreakInterval', '60');
    const goalLinePercent = getSetting('goalLinePercent', '44');
    const customAppCategories = getSetting('customAppCategories', '{}');
    const officeLat = getSetting('officeLat', '');
    const officeLng = getSetting('officeLng', '');
    const officeRadius = getSetting('officeRadius', '300');
    const defaultProjectId = getSetting('defaultProjectId', null);

    res.json({
        goalHours: parseInt(goalHours),
        goalMinutes: parseInt(goalMinutes),
        breakInterval: parseInt(breakInterval),
        wfhBreakInterval: parseInt(wfhBreakInterval),
        goalLinePercent: parseInt(goalLinePercent),
        customAppCategories: customAppCategories,
        officeLat: officeLat,
        officeLng: officeLng,
        officeRadius: parseInt(officeRadius),
        defaultProjectId: defaultProjectId ? parseInt(defaultProjectId) : null
    });
});

app.post('/settings', asyncHandler(async (req, res) => {
    const { goalHours, goalMinutes, breakInterval, wfhBreakInterval, goalLinePercent, customAppCategories, officeRadius, defaultProjectId } = req.body;
    if (goalHours !== undefined) setSetting('goalHours', goalHours);
    if (goalMinutes !== undefined) setSetting('goalMinutes', goalMinutes);
    if (breakInterval !== undefined) setSetting('breakInterval', breakInterval);
    if (wfhBreakInterval !== undefined) setSetting('wfhBreakInterval', wfhBreakInterval);
    if (goalLinePercent !== undefined) setSetting('goalLinePercent', goalLinePercent);
    if (customAppCategories !== undefined) setSetting('customAppCategories', customAppCategories);
    if (officeRadius !== undefined) setSetting('officeRadius', officeRadius);
    invalidateSettingsCache(); // Force re-read on next background loop tick
    res.json({ success: true });
}));

// Get list of all apps used today for category mapping UI
app.get('/today-apps', (req, res) => {
    const usage = getTodayAppUsage();
    const apps = usage.map(app => app.app_name).sort();
    res.json({ apps });
});

app.get('/project-reports', (req, res) => {
    const { getProjectReport, getProjectMonthlyReport, getDetailedProjectHistory } = require('./db');
    res.json({
        summary: getProjectReport(),
        monthly: getProjectMonthlyReport(),
        history: getDetailedProjectHistory()
    });
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
    const { getDailyReport, getWeeklyReport, getMonthlyReport, getOfficeVisitsReport, getProjectReport } = require('./db');
    const tab = req.query.tab || 'daily';
    const timeFormat = req.query.timeFormat || '24h';
    const start = req.query.start;
    const end = req.query.end;
    let data, headers;

    const fmtTime = (s) => {
        if (!s || isNaN(s)) return '00:00:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return [h, m, sec].map(v => v < 10 ? '0' + v : v).join(':');
    };

    const safeExtractTime = (datetimeStr) => {
        if (!datetimeStr) return '—';
        const parts = datetimeStr.split(' ');
        if (parts.length < 2) {
            const tParts = datetimeStr.split('T');
            if (tParts.length >= 2) {
                return tParts[1].substring(0, 8);
            }
            return datetimeStr;
        }
        return parts[1].substring(0, 8);
    };

    if (tab === 'weekly') {
        data = getWeeklyReport(start, end);
        headers = 'Week,Workplace Duration (seconds),Workplace Duration,Day Total (seconds),Day Total,Breaks';
        res.setHeader('Content-Disposition', 'attachment; filename=weekly_report.csv');
    } else if (tab === 'monthly') {
        data = getMonthlyReport(start, end);
        headers = 'Month,Workplace Duration (seconds),Workplace Duration,Day Total (seconds),Day Total,Breaks';
        res.setHeader('Content-Disposition', 'attachment; filename=monthly_report.csv');
    } else if (tab === 'visits') {
        data = getOfficeVisitsReport(start, end);
        headers = 'Date,In Time,Out Time,Office Span (seconds),Office Span,Workplace Duration (seconds),Workplace Duration,Breaks';
        res.setHeader('Content-Disposition', 'attachment; filename=office_visits_report.csv');
        
        const formatTimeVal = (timeStr) => {
            if (!timeStr || timeStr === '—') return timeStr;
            const parts = timeStr.split(':');
            const h_24 = parseInt(parts[0]);
            const m = parts[1];
            const s = parts[2] || '00';
            
            if (timeFormat === 'ampm') {
                const ampm = h_24 >= 12 ? 'PM' : 'AM';
                let h = h_24 % 12;
                h = h ? h : 12;
                return `${h}:${m} ${ampm}`;
            }
            return `${parts[0].padStart(2, '0')}:${m}:${s}`;
        };

        const rows = data.map(item => {
            const inTime = item.in_time ? formatTimeVal(safeExtractTime(item.in_time)) : '—';
            const outTime = item.out_time ? formatTimeVal(safeExtractTime(item.out_time)) : '—';
            const officeSpanSec = item.office_span || 0;
            const workplaceSec = item.total_seconds || 0;
            const breakSec = item.break_duration || 0;
            return `${item.date},${inTime},${outTime},${officeSpanSec},${fmtTime(officeSpanSec)},${workplaceSec},${fmtTime(workplaceSec)},${fmtTime(breakSec)}`;
        });
        res.setHeader('Content-Type', 'text/csv');
        return res.send(headers + '\n' + rows.join('\n'));
    } else if (tab === 'projects') {
        data = getProjectReport();
        headers = 'Project Name,Total Duration (seconds),Total Duration,Session Count';
        res.setHeader('Content-Disposition', 'attachment; filename=projects_report.csv');

        const rows = data.map(item => {
            const name = item.name || 'No Project';
            const totalSec = item.total_seconds || 0;
            const count = item.session_count || 0;
            return `"${name.replace(/"/g, '""')}",${totalSec},${fmtTime(totalSec)},${count}`;
        });
        res.setHeader('Content-Type', 'text/csv');
        return res.send(headers + '\n' + rows.join('\n'));
    } else {
        data = getDailyReport(start, end);
        headers = 'Date,Workplace Duration (seconds),Workplace Duration,Day Total (seconds),Day Total,Breaks';
        res.setHeader('Content-Disposition', 'attachment; filename=daily_report.csv');
    }

    const rows = data.map(item => {
        const period = item.date || item.week || item.month;
        const manualSec = item.manual_total || 0;
        const autoSec = item.auto_total || 0;
        const breakSec = item.break_duration || 0;
        return `${period},${manualSec},${fmtTime(manualSec)},${autoSec},${fmtTime(autoSec)},${fmtTime(breakSec)}`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.send(headers + '\n' + rows.join('\n'));
});

app.get('/reports', (req, res) => {
    const { start, end } = req.query;
    const { getDailyReport, getWeeklyReport, getMonthlyReport, getOfficeVisitsReport } = require('./db');
    res.json({
        daily: getDailyReport(start, end),
        weekly: getWeeklyReport(start, end),
        monthly: getMonthlyReport(start, end),
        visits: getOfficeVisitsReport(start, end)
    });
});

// Migrations handled in db.js

// --- Project Management Endpoints ---
app.get('/projects', (req, res) => {
    res.json({ projects: getProjects() });
});

app.post('/projects', asyncHandler(async (req, res) => {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Project name is required' });
    }
    try {
        const id = createProject(name.trim(), color || '#8b5cf6');
        res.json({ success: true, id });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'A project with this name already exists' });
        }
        throw e;
    }
}));

app.delete('/projects/:id', asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID' });
    deleteProject(id);
    res.json({ success: true });
}));

app.get('/project-report', (req, res) => {
    res.json({ report: getProjectReport() });
});

// --- Cloud Sync Endpoints ---
app.get('/sync-status', (req, res) => {
    const syncEnabled = getSetting('cloudSyncEnabled', 'false');
    const cloudUrl = getSetting('cloudSyncUrl', '');
    res.json({
        enabled: syncEnabled === 'true',
        cloudUrl: cloudUrl ? '***configured***' : '',
        lastAttempt: lastSyncAttempt,
        lastResult: lastSyncResult
    });
});

app.post('/sync-now', asyncHandler(async (req, res) => {
    await runCloudSync();
    res.json({ success: true, result: lastSyncResult });
}));

app.post('/cloud-settings', asyncHandler(async (req, res) => {
    const { cloudSyncUrl, cloudApiKey, cloudSyncEnabled } = req.body;
    if (cloudSyncUrl !== undefined) setSetting('cloudSyncUrl', cloudSyncUrl);
    if (cloudApiKey !== undefined) setSetting('cloudApiKey', cloudApiKey);
    if (cloudSyncEnabled !== undefined) setSetting('cloudSyncEnabled', String(cloudSyncEnabled));
    invalidateSettingsCache();
    res.json({ success: true });
}));

app.get('/cloud-settings', (req, res) => {
    res.json({
        cloudSyncUrl: getSetting('cloudSyncUrl', ''),
        cloudApiKey: getSetting('cloudApiKey', '') ? '••••••••' : '',
        cloudSyncEnabled: getSetting('cloudSyncEnabled', 'false') === 'true'
    });
});

// --- Daily AI Digest Helpers & Routes ---

function getMondayOfCurrentWeek() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0,0,0,0);
    const yyyy = monday.getFullYear();
    const mm = String(monday.getMonth() + 1).padStart(2, '0');
    const dd = String(monday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function generateSmartCommentary(totalHours, apps, topProjectName, topProjectPct, isWeekly = false) {
    if (totalHours === 0) {
        return isWeekly 
            ? "You haven't logged any focus time this week yet. Start tracking to build your smart weekly digest!"
            : "You haven't logged any focus time today yet. Start a tracking session to see your daily digest!";
    }

    const greetings = isWeekly 
        ? ["Exceptional week!", "What a productive run!", "Great job!", "Solid effort this week!", "Week in review!"]
        : ["Excellent wrap-up!", "Great job today!", "Day complete!", "Way to go!", "Solid day of work!"];

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    let timephrase = isWeekly 
        ? `You worked ${totalHours.toFixed(1)} hours this week.` 
        : `You worked ${totalHours.toFixed(1)} hours today.`;

    let appPhrase = "";
    if (apps && apps.length > 0) {
        const topApps = apps.slice(0, 3); // Get up to top 3 apps
        const formatDuration = (sec) => {
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            if (h > 0) {
                return `${h}h ${m}m`;
            }
            return `${m}m`;
        };

        if (topApps.length === 1) {
            appPhrase = `your primary focus was on ${topApps[0].app_name} (${formatDuration(topApps[0].total_seconds)})`;
        } else if (topApps.length === 2) {
            appPhrase = `you spent your time mostly on ${topApps[0].app_name} (${formatDuration(topApps[0].total_seconds)}) and ${topApps[1].app_name} (${formatDuration(topApps[1].total_seconds)})`;
        } else {
            appPhrase = `you spent your time mostly on ${topApps[0].app_name} (${formatDuration(topApps[0].total_seconds)}), ${topApps[1].app_name} (${formatDuration(topApps[1].total_seconds)}), and ${topApps[2].app_name} (${formatDuration(topApps[2].total_seconds)})`;
        }
    }

    let projectPhrase = "";
    if (topProjectName && topProjectPct > 0) {
        const projComms = [
            `you spent ${topProjectPct}% of your time on ${topProjectName}`,
            `you dedicated ${topProjectPct}% of your session to ${topProjectName}`,
            `${topProjectName} occupied ${topProjectPct}% of your focus`
        ];
        projectPhrase = projComms[Math.floor(Math.random() * projComms.length)];
    }

    // Combine them smoothly
    let sentence = `${greeting} ${timephrase}`;
    if (appPhrase && projectPhrase) {
        sentence += ` ${appPhrase.charAt(0).toUpperCase() + appPhrase.slice(1)}, and ${projectPhrase}.`;
    } else if (appPhrase) {
        sentence += ` ${appPhrase.charAt(0).toUpperCase() + appPhrase.slice(1)}.`;
    } else if (projectPhrase) {
        sentence += ` And ${projectPhrase.charAt(0).toUpperCase() + projectPhrase.slice(1)}.`;
    } else {
        sentence += ".";
    }

    return sentence;
}

app.get('/ai-digest', (req, res) => {
    const { getAIDigestData } = require('./db');
    
    // 1. Get dates in local timezone (YYYY-MM-DD format)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const mondayStr = getMondayOfCurrentWeek();

    // 2. Fetch data from DB
    const todayData = getAIDigestData(todayStr, todayStr);
    const weeklyData = getAIDigestData(mondayStr, todayStr);

    // 3. Helper to format response payload
    const buildSummary = (data, isWeekly) => {
        const totalSec = data.total_manual + data.total_auto;
        const totalHours = totalSec / 3600;
        const topApp = data.apps[0]?.app_name || null;
        
        let topProjectName = null;
        let topProjectPct = 0;
        let topProjectColor = null;

        if (data.projects.length > 0) {
            const topProj = data.projects[0];
            topProjectName = topProj.name;
            topProjectColor = topProj.color;
            topProjectPct = totalSec > 0 ? Math.round((topProj.seconds / totalSec) * 100) : 0;
        }

        // Map and calculate percentage for all projects
        const projects = data.projects.map(p => ({
            name: p.name,
            color: p.color,
            seconds: p.seconds,
            pct: totalSec > 0 ? Math.round((p.seconds / totalSec) * 100) : 0
        }));

        const commentary = generateSmartCommentary(totalHours, data.apps, topProjectName, topProjectPct, isWeekly);

        return {
            total_seconds: totalSec,
            total_hours: parseFloat(totalHours.toFixed(1)),
            most_used_app: topApp,
            most_used_app_seconds: data.apps[0]?.total_seconds || 0,
            top_project_name: topProjectName,
            top_project_color: topProjectColor,
            top_project_pct: topProjectPct,
            projects,
            apps: data.apps,
            commentary
        };
    };

    res.json({
        today: buildSummary(todayData, false),
        week: buildSummary(weeklyData, true)
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

