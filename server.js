const express = require('express');
const path = require('path');
const os = require('os');
const notificationQueue = [];

function sanitizeLog(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[\r\n]/g, '');
}

let pendingIdlePrompt = null;
let pendingBreakReminder = null;
let consecutiveSkippedBreaks = 0;
let lastIdleStart = null;
let currentBreakState = null;
const IDLE_PROMPT_THRESHOLD_SEC = 600; // 10 minutes

function clearSessionState(sessionId) {
    if (pendingBreakReminder && pendingBreakReminder.sessionId === sessionId) {
        pendingBreakReminder = null;
    }
    if (pendingIdlePrompt && pendingIdlePrompt.sessionId === sessionId) {
        pendingIdlePrompt = null;
    }
}

function triggerMacLockScreen(reason = 'unknown') {
    console.log(`[System] Executing Mac screen lock (Reason: ${reason})`);
    const { exec } = require('child_process');
    // Try Python login framework lock first (immediate native lock)
    const pythonCmd = `python3 -c 'import ctypes; ctypes.CDLL("/System/Library/PrivateFrameworks/login.framework/Versions/Current/login").SACLockScreenImmediate()' || python -c 'import ctypes; ctypes.CDLL("/System/Library/PrivateFrameworks/login.framework/Versions/Current/login").SACLockScreenImmediate()'`;
    exec(pythonCmd, (err) => {
        if (err) {
            console.warn("[System] Failed to lock screen via python, trying CGSession...", err);
            // Try CGSession suspend
            exec('/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend', (err2) => {
                if (err2) {
                    console.error("[System] Failed to lock screen via CGSession, falling back to pmset displaysleepnow:", err2);
                    exec('pmset displaysleepnow');
                }
            });
        }
    });
}

function checkBurnoutPrevention() {
    const strictBreakMode = getSetting('strictBreakMode', 'false') === 'true';
    if (!strictBreakMode) return;

    const maxSkips = parseInt(getSetting('maxSkipsBeforeLock', '5'));
    
    if (consecutiveSkippedBreaks === Math.max(1, maxSkips - 2)) {
        // Tier 2: Warning
        sendNativeNotification("Burnout Warning", "You've skipped multiple breaks. Your productivity is dropping. Please step away.");
    } else if (consecutiveSkippedBreaks >= maxSkips) {
        // Tier 3: Enforced Lock
        console.log(`[Burnout Prevention] Enforced lock triggered (Skips: ${consecutiveSkippedBreaks}/${maxSkips}). Locking screen...`);
        sendNativeNotification("Forced Break", "Screen locking to enforce a break.");
        
        triggerMacLockScreen('burnout_prevention');
        
        // Reset counter after enforcing
        consecutiveSkippedBreaks = 0;
    }
}

function sendNativeNotification(title, message) {
    notificationQueue.push({ title, message });
    console.log(`[Queueing Notification] ${title}: ${message} (Queue length: ${notificationQueue.length})`);
}

const { db, startSession, getActiveSession, addEvent, updateSessionSeconds, completeSession, getDailyReport, getWeeklyReport, getMonthlyReport, getOfficeVisitsReport, getTodayTotal, getTodayManualTotal, hasNotifiedToday, getTodayAutomaticSession, recordAppUsage, getTodayAppUsage, getSetting, setSetting, getRecentlySentMessages, markMessageSent, createProject, getProjects, deleteProject, getProjectReport, getLastSyncedId, updateSyncedId, getUnsyncedData } = require('./db');
const cors = require('cors');
const { syncStatus } = require('./services/statusSyncService');

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
const stmtSetSnoozeUntil = db.prepare("UPDATE sessions SET snooze_until = ? WHERE id = ?");

// Settings cache — settings rarely change mid-session, so we cache them for 30 seconds
let _settingsCache = new Map();
let _settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30000; // 30 seconds
function getCachedSetting(key, defaultValue = null) {
    const now = Date.now();
    if (now - _settingsCacheTime > SETTINGS_CACHE_TTL) {
        _settingsCache.clear(); // invalidate
        _settingsCacheTime = now;
    }
    if (!_settingsCache.has(key)) {
        _settingsCache.set(key, getSetting(key, defaultValue));
    }
    return _settingsCache.get(key);
}
function invalidateSettingsCache() { _settingsCache.clear(); _settingsCacheTime = 0; }
global.invalidateSettingsCache = invalidateSettingsCache;


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

const SLOT_BODY_KEYS = new Map([['morning', 'tip'], ['lunch', 'meal_tip'], ['afternoon', 'slump_tip'], ['late_afternoon', 'wind_tip'], ['evening', 'eve_tip']]);
function buildGrammar(slot) {
    const rules = Object.hasOwn(SLOT_RULES, slot) ? Reflect.get(SLOT_RULES, slot) : Reflect.get(SLOT_RULES, 'afternoon');
    const bodyKey = SLOT_BODY_KEYS.get(slot) || 'slump_tip';
    return tracery.createGrammar({
        ...rules,
        origin: [`#${bodyKey}#`],
    });
}

function getSmartBreakMessage(sessionType = 'manual', overrideSlot = null, intensity = 'low') {
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

    const recentKeys = new Set(getRecentlySentMessages(7));

    let body, title, key;
    let attempts = 0;
    const MAX_ATTEMPTS = 8;

    do {
        body = grammar.flatten('#origin#');
        key = `${slot}_${body.trim().toLowerCase().replace(/\\W+/g, '_').substring(0, 100)}`;
        const slotData = Object.hasOwn(SLOT_RULES, slot) ? Reflect.get(SLOT_RULES, slot) : Reflect.get(SLOT_RULES, 'afternoon');
        title = slotData.slot_title.at(Math.floor(Math.random() * slotData.slot_title.length));
        attempts++;
    } while (recentKeys.has(key) && attempts < MAX_ATTEMPTS);

    markMessageSent(key);

    let prefix = sessionType === 'automatic' ? '(WFH) ' : '';
    
    // Add health guidance based on intensity
    if (intensity === 'high') {
        body += " You've been in high focus mode! Remember the 20-20-20 rule to rest your eyes.";
    } else if (intensity === 'medium') {
        body += " Great work staying productive. Take a short stretch to relieve tension.";
    }

    console.log(`[Tracery Break] Slot: ${slot}, Intensity: ${intensity}, Attempts: ${attempts}, Key: ${key}`);

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
const HIGH_INTENSITY_APPS = ['Xcode', 'Code', 'IntelliJ IDEA', 'Android Studio', 'Terminal', 'iTerm2', 'Figma', 'Sketch'];

function calculateDynamicBreakInterval(baseMinutes) {
    if (getCachedSetting('wbAiToggle', 'false') !== 'true') {
        return { min: baseMinutes, intensity: 'low' };
    }

    try {
        const todayApps = db.prepare("SELECT app_name, total_seconds FROM app_usage WHERE date = date('now', 'localtime')").all();
        if (!todayApps || todayApps.length === 0) return { min: baseMinutes, intensity: 'low' };

        let totalTime = 0;
        let highIntensityTime = 0;

        todayApps.forEach(app => {
            totalTime += app.total_seconds;
            if (HIGH_INTENSITY_APPS.some(hi => app.app_name.includes(hi))) {
                highIntensityTime += app.total_seconds;
            }
        });

        if (totalTime === 0) return { min: baseMinutes, intensity: 'low' };
        const intensityRatio = highIntensityTime / totalTime;
        
        if (intensityRatio > 0.6) {
            return { min: Math.max(20, Math.floor(baseMinutes * 0.75)), intensity: 'high' };
        } else if (intensityRatio > 0.3) {
            return { min: Math.max(30, Math.floor(baseMinutes * 0.85)), intensity: 'medium' };
        }
    } catch (err) {
        console.error("Error calculating dynamic break interval:", err);
    }
    return { min: baseMinutes, intensity: 'low' };
}

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
            
            // Phase 1: Verified Breaks Check
            // We used to cancel breaks here, but now /start-break forces a lock instantly.
            // We will cancel the break if we receive /app-heartbeat while paused.
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

            if (delta > 0) {
                updateSessionSeconds(activeSession.id, delta);
                activeSession.total_seconds += delta;
            }
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
                if (pendingBreakReminder && pendingBreakReminder.sessionId === activeSession.id) {
                    // Already has a pending break reminder, do not trigger a new one
                } else {
                    const baseMin = parseInt(getCachedSetting('dynamicBreakInterval', '60'));
                    let { min: breakMin, intensity } = calculateDynamicBreakInterval(baseMin);
                    if (breakMin === 1) breakMin = 60; // Self-healing if set to 1 for tests

                    if (breakMin > 0) {
                        const breakSec = breakMin * 60;
                        const lastBreak = activeSession.last_break_notify || 0;
                        const snoozeUntil = activeSession.snooze_until || 0;

                        let shouldTrigger = false;
                        if (snoozeUntil > 0) {
                            if (activeSession.total_seconds >= snoozeUntil) {
                                shouldTrigger = true;
                            }
                        } else {
                            if (activeSession.total_seconds - lastBreak >= breakSec) {
                                shouldTrigger = true;
                            }
                        }

                        if (shouldTrigger) {
                            const msg = getSmartBreakMessage('manual', null, intensity);
                            sendNativeNotification(msg.title, msg.body);
                            // We do NOT update last_break_notify on triggering reminder!
                            stmtSetSnoozeUntil.run(0, activeSession.id);
                            
                            const snoozeCount = db.prepare("SELECT COUNT(*) as cnt FROM breaks_history WHERE session_id = ? AND status = 'snoozed' AND date(offered_at) = date('now')").get(activeSession.id).cnt;
                            
                            const breakRecord = db.prepare("INSERT INTO breaks_history (session_id, status) VALUES (?, 'offered')").run(activeSession.id);
                            pendingBreakReminder = {
                                id: breakRecord.lastInsertRowid,
                                sessionId: activeSession.id,
                                type: 'manual',
                                minutes: Math.max(1, Math.floor((activeSession.total_seconds - lastBreak) / 60)),
                                message: msg.body,
                                snoozeCount: snoozeCount
                            };
                        }
                    }
                }
            } else if (type === 'automatic') {
                if (pendingBreakReminder && pendingBreakReminder.sessionId === activeSession.id) {
                    // Already has a pending break reminder, do not trigger a new one
                } else {
                    const baseMin = parseInt(getCachedSetting('dynamicBreakInterval', '60'));
                    let { min: wfhBreakMin, intensity } = calculateDynamicBreakInterval(baseMin);
                    if (wfhBreakMin === 1) wfhBreakMin = 60;

                    if (wfhBreakMin > 0) {
                        const breakSec = wfhBreakMin * 60;
                        const lastBreak = activeSession.last_break_notify || 0;
                        const snoozeUntil = activeSession.snooze_until || 0;

                        let shouldTrigger = false;
                        if (snoozeUntil > 0) {
                            if (activeSession.total_seconds >= snoozeUntil) {
                                shouldTrigger = true;
                            }
                        } else {
                            if (activeSession.total_seconds - lastBreak >= breakSec) {
                                shouldTrigger = true;
                            }
                        }

                        if (shouldTrigger) {
                            const msg = getSmartBreakMessage('automatic', null, intensity);
                            sendNativeNotification(msg.title, msg.body);
                            // We do NOT update last_break_notify on triggering reminder!
                            stmtSetSnoozeUntil.run(0, activeSession.id);
                            
                            const snoozeCount = db.prepare("SELECT COUNT(*) as cnt FROM breaks_history WHERE session_id = ? AND status = 'snoozed' AND date(offered_at) = date('now')").get(activeSession.id).cnt;

                            const breakRecord = db.prepare("INSERT INTO breaks_history (session_id, status) VALUES (?, 'offered')").run(activeSession.id);
                            pendingBreakReminder = {
                                id: breakRecord.lastInsertRowid,
                                sessionId: activeSession.id,
                                type: 'automatic',
                                minutes: Math.max(1, Math.floor((activeSession.total_seconds - lastBreak) / 60)),
                                message: msg.body,
                                snoozeCount: snoozeCount
                            };
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
            device_id: getCachedSetting('deviceId', os.hostname()),
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
        console.log(sanitizeLog(`[Manual] Session started: ${id}${targetProjectId ? ` (project: ${targetProjectId})` : ''}`));
        sendNativeNotification('🏢 Workplace Session Started', 'Manual tracking is now active. Good luck!');
    } else {
        const providedProjectId = project_id !== undefined ? (project_id || null) : session.project_id;

        if (String(providedProjectId) !== String(session.project_id)) {
            console.log(sanitizeLog(`[${sessionType}] Project changed from ${session.project_id} to ${providedProjectId}. Splitting session.`));
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
            console.log(sanitizeLog(`[Settings] Updating default project ID to ${targetProjectId}`));
            setSetting('defaultProjectId', targetProjectId);
        }
    }

    syncStatus('active');
    res.json({ success: true, session });
}));

app.post('/pause', asyncHandler(async (req, res) => {
    const session = getActiveSession('manual');
    if (session && session.status === 'active') {
        db.prepare("UPDATE sessions SET status = 'paused', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
        sendNativeNotification('Workplace Monitor', 'Tracking paused.');
        syncStatus('paused');
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
        currentBreakState = null;
        syncStatus('away');
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

    if (event === 'lock' && metadata && metadata.action === 'lock_screen') {
        triggerMacLockScreen(reason);
    }

    if (event === 'lock') {
        if (!lastIdleStart) {
            lastIdleStart = Date.now();
        }
        consecutiveSkippedBreaks = 0;
        if (!currentBreakState) {
            syncStatus('away');
        }
    } else if (event === 'unlock') {
        currentBreakState = null;
        syncStatus('active');
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

        // Discard any idle duration over 4 hours (14400s) to prevent timer leakage
        // (e.g. user sleeping but isOvernight logic fails because they slept past midnight)
        if (duration > 14400) {
            console.log(`[Idle] Discarding extremely large idle duration of ${duration}s (isOvernight: ${isOvernight})`);
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
                pendingBreakReminder = null; // Clear old break reminders
                console.log(`[Idle Prompt] Generated pending prompt for session #${session.id}, duration: ${duration}s`);
            }
        }
    }

    // 1. Handle Automatic Session
    const autoSession = getTodayAutomaticSession();
    const wasAutoStatus = autoSession.status;

    // Phase 1 enhancement: Link pending break reason to the lock event
    let finalReason = reason;
    if (event === 'lock') {
        const manualSession = getActiveSession('manual');
        for (const session of [manualSession, autoSession]) {
            if (session && session.pending_break_reason) {
                finalReason = session.pending_break_reason;
                console.log(`[Verified Breaks] Linked reason '${session.pending_break_reason}' to idle lock for session #${session.id}`);
                session.pending_break_reason = null; // Clear it so it only applies once
            }
        }
    }

    const autoStatus = event === 'lock' ? 'paused' : 'active';
    if (wasAutoStatus !== autoStatus) {
        db.prepare("UPDATE sessions SET status = ?, last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(autoStatus, autoSession.id);
        
        if (event === 'unlock' && autoSession.total_seconds === 0) {
            db.prepare("UPDATE sessions SET start_time = CURRENT_TIMESTAMP WHERE id = ?").run(autoSession.id);
        }
        if (event === 'lock') {
            addEvent(autoSession.id, `lock_${finalReason}`);
        } else if (event === 'unlock') {
            addEvent(autoSession.id, `unlock_${finalReason}`);
        }
    }

    // Send notification for automatic session state changes
    if (event === 'unlock' && wasAutoStatus !== 'active') {
        if (!autoSession.notified) {
            console.log(sanitizeLog(`[Auto] Screen unlocked — automatic session started (Reason: ${reason}).`));
            sendNativeNotification('🏠 WFH Session Started', 'Automatic tracking is now active.');
            db.prepare("UPDATE sessions SET notified = 1 WHERE id = ?").run(autoSession.id);
        } else {
            console.log(sanitizeLog(`[Auto] Screen unlocked — automatic session resumed (Reason: ${reason}).`));
            sendNativeNotification('🏠 WFH Session Resumed', 'Screen unlocked. Timer resumed.');
        }
    } else if (event === 'lock' && wasAutoStatus === 'active') {
        console.log(sanitizeLog(`[Auto] Screen locked — automatic session paused (Reason: ${reason}).`));
        sendNativeNotification('🏠 WFH Session Paused', 'Screen locked. Timer paused.');
    }

    // 2. Handle Manual Session
    const activeSession = getActiveSession('manual');
    if (activeSession) {
        const wasManualStatus = activeSession.status;
        if (event === 'lock' && wasManualStatus !== 'paused') {
            db.prepare("UPDATE sessions SET status = 'paused', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(activeSession.id);
            addEvent(activeSession.id, `lock_${finalReason}`);
            console.log(`[Manual] Session #${activeSession.id} PAUSED due to idle (${reason})`);
        } else if (event === 'unlock' && wasManualStatus !== 'active') {
            db.prepare("UPDATE sessions SET status = 'active', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(activeSession.id);
            addEvent(activeSession.id, `unlock_${finalReason}`);
            console.log(`[Manual] Session #${activeSession.id} RESUMED after unlock.`);
            if (activeSession.total_seconds === 0) {
                db.prepare("UPDATE sessions SET start_time = CURRENT_TIMESTAMP WHERE id = ?").run(activeSession.id);
            }
        }
    }

    console.log(sanitizeLog(`Received event: ${event} (Reason: ${reason}).`));
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

    // Calculate today's office span (total working hours in office location)
    let officeSpan = 0;
    const officeSpanRecord = db.prepare(`
        SELECT 
            MIN(start_time) as first_arrival,
            MAX(COALESCE(end_time, last_tick)) as last_departure
        FROM sessions 
        WHERE date = date('now', 'localtime') AND type = 'manual'
    `).get();

    if (officeSpanRecord && officeSpanRecord.first_arrival) {
        const firstArrivalMs = new Date(officeSpanRecord.first_arrival.replace(' ', 'T') + 'Z').getTime();
        if (manual && (manual.status === 'active' || manual.status === 'paused')) {
            // Currently at office: span is from arrival until now
            officeSpan = Math.max(0, Math.floor((Date.now() - firstArrivalMs) / 1000));
        } else {
            // Left office: span is from arrival until last departure
            const lastDepartureMs = new Date(officeSpanRecord.last_departure.replace(' ', 'T') + 'Z').getTime();
            officeSpan = Math.max(0, Math.floor((lastDepartureMs - firstArrivalMs) / 1000));
        }
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
        officeSpan,
        officeLat,
        officeLng,
        officeRadius: parseInt(officeRadius),
        pending_notification: pendingNotification,
        pending_idle_prompt: pendingIdlePrompt,
        pending_break_reminder: pendingIdlePrompt ? null : pendingBreakReminder,
        suggested_poll_ms: suggestedPollMs
    });
});

app.post('/respond-idle-prompt', asyncHandler(async (req, res) => {
    const { choice } = req.body;

    if (!pendingIdlePrompt) {
        return res.status(400).json({ error: 'No pending idle prompt' });
    }

    const { sessionId, duration } = pendingIdlePrompt;

    const autoSession = getTodayAutomaticSession();
    const manualSession = getActiveSession('manual');
    const targetSessions = [];

    if (autoSession && autoSession.id) targetSessions.push(autoSession);
    if (manualSession && manualSession.id && manualSession.id !== autoSession.id) targetSessions.push(manualSession);

    if (choice === 'meeting' || choice === 'designing' || choice === 'work_call') {
        targetSessions.forEach(session => {
            updateSessionSeconds(session.id, duration);
            addEvent(session.id, `idle_respond_keep_${choice}`);
            console.log(sanitizeLog(`[Idle Prompt] Added ${duration}s back to session #${session.id} (Choice: ${choice})`));
            
            const updated = db.prepare("SELECT total_seconds, last_break_notify FROM sessions WHERE id = ?").get(session.id);
            let breakMin = parseInt(getCachedSetting('dynamicBreakInterval', '60'));
            if (breakMin === 1) breakMin = 60;
            const breakSec = breakMin * 60;
            
            if (updated && (updated.total_seconds - updated.last_break_notify >= breakSec)) {
                const snoozeUntil = updated.total_seconds + 600; // 10 mins grace period
                stmtSetSnoozeUntil.run(snoozeUntil, session.id);
                console.log(`[Grace Period] Applied 10-minute grace period (snooze_until) to session #${session.id}`);
            }
        });
    } else {
        targetSessions.forEach(session => {
            addEvent(session.id, `idle_respond_discard_${choice}`);
            console.log(`[Idle Prompt] Discarded idle duration ${duration}s for session #${session.id} (Choice: ${choice})`);
            
            const updated = db.prepare("SELECT total_seconds FROM sessions WHERE id = ?").get(session.id);
            if (updated) {
                stmtSetBreakNotify.run(updated.total_seconds, session.id);
                stmtSetSnoozeUntil.run(0, session.id);
                // Mark any offered or started break as completed
                db.prepare("UPDATE breaks_history SET status = 'completed', completed_at = CURRENT_TIMESTAMP, duration_seconds = ? WHERE session_id = ? AND status IN ('started', 'offered')").run(duration, session.id);
                if (pendingBreakReminder && pendingBreakReminder.sessionId === session.id) {
                    pendingBreakReminder = null;
                }
                console.log(`[Idle Prompt] Reset break reminder and cleared snooze for session #${session.id} to ${updated.total_seconds}s`);
            }
        });
    }

    pendingIdlePrompt = null;
    res.json({ success: true });
}));

app.post('/dismiss-break-reminder', asyncHandler(async (req, res) => {
    if (pendingBreakReminder) {
        db.prepare("UPDATE breaks_history SET status = 'ignored' WHERE id = ?").run(pendingBreakReminder.id);
    }
    pendingBreakReminder = null;

    const manualSession = getActiveSession('manual');
    const autoSession = getTodayAutomaticSession();
    const baseMin = parseInt(getCachedSetting('dynamicBreakInterval', '60'));
    let { min: breakMin } = calculateDynamicBreakInterval(baseMin);
    if (breakMin === 1) breakMin = 60;
    const breakSec = breakMin * 60;

    for (const session of [manualSession, autoSession]) {
        if (session && session.status === 'active') {
            const snoozeUntil = session.total_seconds + breakSec;
            stmtSetSnoozeUntil.run(snoozeUntil, session.id);
            console.log(`[Break Reminder] Dismissed reminder for session #${session.id}. Rescheduled in ${breakMin}m (snooze_until = ${snoozeUntil})`);
        }
    }
    
    // Burnout Prevention
    consecutiveSkippedBreaks++;
    console.log(`[Burnout Prevention] Break dismissed. Consecutive skips: ${consecutiveSkippedBreaks}`);
    checkBurnoutPrevention();

    res.json({ success: true });
}));

app.post('/start-break', asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    
    // Reset skipped breaks on a real break
    consecutiveSkippedBreaks = 0;
    
    const manualSession = getActiveSession('manual');
    const autoSession = getTodayAutomaticSession();
    for (const session of [manualSession, autoSession]) {
        if (session) {
            stmtSetSnoozeUntil.run(0, session.id);
        }
    }
    
    if (pendingBreakReminder) {
        db.prepare("UPDATE breaks_history SET status = 'started', started_at = CURRENT_TIMESTAMP WHERE id = ?").run(pendingBreakReminder.id);
        
        // Link the selected activity reason to the session and simulate a lock instantly!
        const manualSession = getActiveSession('manual');
        const autoSession = getTodayAutomaticSession();
        for (const session of [manualSession, autoSession]) {
            if (session && session.id === pendingBreakReminder.sessionId) {
                session.pending_break_reason = null; // No need to pend it
                
                // Simulate lock immediately so the UI updates and break starts instantly
                if (session.status === 'active') {
                    db.prepare("UPDATE sessions SET status = 'paused', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
                    stmtSetBreakNotify.run(session.total_seconds, session.id); // Reset continuous work baseline
                    addEvent(session.id, `lock_${reason || 'unknown'}`);
                    console.log(`[Verified Breaks] Instantly started break '${reason}' for session #${session.id}`);
                }
            }
        }
        
        pendingBreakReminder = null;
    } else {
        // Even if no pending reminder, allow starting a break from the Wellbeing Dashboard manually
        const manualSession = getActiveSession('manual');
        const autoSession = getTodayAutomaticSession();
        for (const session of [manualSession, autoSession]) {
            if (session && session.status === 'active') {
                db.prepare("UPDATE sessions SET status = 'paused', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
                stmtSetBreakNotify.run(session.total_seconds, session.id); // Reset continuous work baseline
                addEvent(session.id, `lock_${reason || 'unknown'}`);
                console.log(`[Verified Breaks] Manually started break '${reason}' for session #${session.id}`);
            }
        }
    }

    // Physically lock the Mac screen to enforce the break!
    triggerMacLockScreen(reason || 'start_break');

    currentBreakState = reason || 'break';
    syncStatus(currentBreakState);

    res.json({ success: true });
}));

app.post('/snooze-break-reminder', asyncHandler(async (req, res) => {
    const manualSession = getActiveSession('manual');
    const autoSession = getTodayAutomaticSession();
    
    const snoozeMin = parseInt(req.body.minutes || '10');
    const snoozeSec = snoozeMin * 60;

    for (const session of [manualSession, autoSession]) {
        if (session) {
            const snoozeUntil = session.total_seconds + snoozeSec;
            stmtSetSnoozeUntil.run(snoozeUntil, session.id);
            console.log(`[Break Reminder] Snoozed session #${session.id} for ${snoozeMin} minutes. snooze_until = ${snoozeUntil}`);
        }
    }

    if (pendingBreakReminder) {
        db.prepare("UPDATE breaks_history SET status = 'snoozed' WHERE id = ?").run(pendingBreakReminder.id);
    }
    pendingBreakReminder = null;
    
    // Burnout Prevention
    consecutiveSkippedBreaks++;
    console.log(`[Burnout Prevention] Break snoozed. Consecutive skips: ${consecutiveSkippedBreaks}`);
    checkBurnoutPrevention();

    res.json({ success: true });
}));

app.post('/app-heartbeat', asyncHandler(async (req, res) => {
    const { app_name, seconds, minIdle } = req.body;
    if (!app_name || !seconds) {
        return res.status(400).json({ error: 'app_name and seconds required' });
    }
    
    // Phase 1: Verified Breaks Check
    // If the session is currently paused (meaning they are supposedly on a break),
    // but they are physically using the computer (minIdle < 15 seconds)
    // and it's been more than 60 seconds since the break started, we cancel it.
    const manualSession = getActiveSession('manual');
    const autoSession = getTodayAutomaticSession();
    for (const session of [manualSession, autoSession]) {
        if (session && session.status === 'paused') {
            const latestLock = db.prepare("SELECT * FROM lock_events WHERE session_id = ? ORDER BY id DESC LIMIT 1").get(session.id);
            if (latestLock && latestLock.event_type.startsWith('lock_')) {
                const lockTime = new Date(latestLock.timestamp.replace(' ', 'T') + 'Z').getTime();
                if ((Date.now() - lockTime) > 60000 && minIdle !== undefined && minIdle < 15) {
                    console.log(`[Verified Breaks] User actively working (minIdle: ${minIdle}) 60s after starting break! Cancelling break.`);
                    db.prepare("UPDATE sessions SET status = 'active', last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
                    addEvent(session.id, `unlock_unknown`);
                    
                    // Mark any breaks_history as ignored
                    db.prepare("UPDATE breaks_history SET status = 'ignored' WHERE session_id = ? AND status = 'started'").run(session.id);
                    
                    // Penalize: rollback the last_break_notify so they instantly get a new popup!
                    const breakMinForRollback = parseInt(getCachedSetting('dynamicBreakInterval', '60'));
                    const penaltyNotify = session.total_seconds - (breakMinForRollback * 60) - 60;
                    stmtSetBreakNotify.run(penaltyNotify, session.id);
                    session.last_break_notify = penaltyNotify; // Update local memory
                }
            } else if (minIdle !== undefined && minIdle < 15 && session.type === 'automatic') {
                // Session is paused, but has no pending lock event. 
                // This happens when the app restarts and creates the automatic session as paused by default.
                // Since minIdle < 15, the user is actively using the computer, so we unpause it automatically!
                console.log(`[Startup] User actively working (minIdle: ${minIdle}), unpausing fresh session #${session.id}.`);
                db.prepare("UPDATE sessions SET status = 'active', start_time = CURRENT_TIMESTAMP, last_tick = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
                addEvent(session.id, `unlock_startup`);
            }
        }
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
        'Productivity': [
            'Xcode', 'Visual Studio Code', 'Code', 'Terminal', 'iTerm2', 'Sublime Text', 
            'IntelliJ IDEA', 'PyCharm', 'WebStorm', 'Android Studio', 'Cursor', 'Windsurf', 
            'Nova', 'BBEdit', 'TextMate', 'github.com', 'gitlab.com', 'bitbucket.org', 
            'stackoverflow.com', 'jira.atlassian.com', 'linear.app', 'notion.so', 
            'trello.com', 'asana.com', 'clickup.com', 'slack.com', 'teams.microsoft.com',
            'localhost', '127.0.0.1'
        ],
        'Communication': [
            'Slack', 'Microsoft Teams', 'Zoom', 'Discord', 'Telegram', 'WhatsApp', 
            'Messages', 'Mail', 'Outlook', 'Spark', 'FaceTime', 'Skype', 'Signal',
            'mail.google.com', 'outlook.live.com', 'slack.com', 'teams.microsoft.com', 
            'discord.com', 'web.whatsapp.com', 'web.telegram.org'
        ],
        'Browsers': [
            'Safari', 'Google Chrome', 'Firefox', 'Arc', 'Brave Browser', 
            'Microsoft Edge', 'Opera', 'Vivaldi'
        ],
        'Design': [
            'Figma', 'Sketch', 'Adobe Photoshop', 'Adobe Illustrator', 'Adobe XD', 
            'Canva', 'Affinity Designer', 'Affinity Photo', 'Preview',
            'figma.com', 'canva.com', 'dribbble.com', 'behance.net', 'adobe.com'
        ],
        'Documents': [
            'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Pages', 
            'Numbers', 'Keynote', 'Notion', 'Obsidian', 'Bear', 'Notes', 'TextEdit',
            'docs.google.com', 'sheets.google.com', 'slides.google.com'
        ],
        'Entertainment': [
            'Spotify', 'Music', 'YouTube', 'Netflix', 'VLC', 'IINA', 'TV', 
            'Podcasts', 'Books', 'Disney+', 'Prime Video', 'youtube.com', 
            'netflix.com', 'twitch.tv', 'spotify.com', 'disneyplus.com', 'primevideo.com'
        ],
        'Social Media': [
            'Instagram', 'Facebook', 'Twitter', 'LinkedIn', 'TikTok', 'Reddit',
            'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'reddit.com',
            'tiktok.com', 'linkedin.com', 'threads.net', 'pinterest.com'
        ],
        'Gaming': [
            'Steam', 'Epic Games Launcher', 'Minecraft', 'Roblox', 'Battle.net',
            'League of Legends', 'World of Warcraft', 'GOG Galaxy', 'Origin',
            'steamcommunity.com', 'roblox.com', 'itch.io', 'epicgames.com'
        ],
        'Finance': [
            'Stocks', 'Calculator', 'QuickBooks', 'TurboTax', 'Tally',
            'paypal.com', 'stripe.com', 'coinbase.com', 'binance.com', 
            'zerodha.com', 'groww.in'
        ],
        'AI & Learning': [
            'Wikipedia', 'Duolingo', 'Coursera', 'Udemy', 'Khan Academy',
            'wikipedia.org', 'duolingo.com', 'coursera.org', 'udemy.com',
            'chatgpt.com', 'gemini.google.com', 'claude.ai', 'poe.com'
        ],
        'Utilities': [
            'Finder', 'System Preferences', 'System Settings', 'Activity Monitor', 
            'Disk Utility', 'Calendar', 'Reminders', 'Clock', 'Shortcuts', 'App Store',
            'calendar.google.com', 'drive.google.com', 'dropbox.com', 'icloud.com'
        ]
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
        if (!Object.hasOwn(mergedMap, category)) {
            Reflect.set(mergedMap, category, []);
        }
        Reflect.set(mergedMap, category, [...new Set([...Reflect.get(mergedMap, category), ...apps])]);
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

app.get('/app-timeline', (req, res) => {
    const range = req.query.range || 'day';
    let top8AppNames = [];
    let timelineEvents = [];
    let labels = [];
    let labelToDate = {};
    let labelToHour = {};

    try {
        if (range === 'day') {
            // 1. Determine top 8 apps for today
            const topAppsUsage = getTodayAppUsage();
            top8AppNames = topAppsUsage.slice(0, 8).map(u => u.app_name);

            // 2. Query timeline events for today
            timelineEvents = db.prepare(`
                SELECT strftime('%H', timestamp) as hour, app_name, SUM(duration_seconds) as duration
                FROM app_usage_timeline
                WHERE date = date('now', 'localtime')
                GROUP BY hour, app_name
                ORDER BY hour ASC
            `).all();

            const currentHour = new Date().getHours();
            const activeHours = timelineEvents.map(e => parseInt(e.hour, 10)).sort((a, b) => a - b);
            let minHour = activeHours.length > 0 ? activeHours[0] : 8;
            minHour = Math.min(minHour, currentHour);
            
            if (currentHour - minHour < 4) {
                minHour = Math.max(0, currentHour - 4);
            }

            for (let h = minHour; h <= currentHour; h++) {
                const ampm = h >= 12 ? 'p' : 'a';
                const hour12 = h % 12 || 12;
                const display = `${hour12}${ampm}`;
                labels.push(display);
                labelToHour[display] = String(h).padStart(2, '0');
            }

        } else if (range === 'week') {
            // 1. Determine top 8 apps for the last 7 days
            const topAppsUsage = db.prepare(`
                SELECT app_name, SUM(total_seconds) as total_seconds
                FROM app_usage
                WHERE date >= date('now', '-6 days', 'localtime')
                GROUP BY app_name
                ORDER BY total_seconds DESC
                LIMIT 8
            `).all();
            top8AppNames = topAppsUsage.map(u => u.app_name);

            // 2. Query timeline events for the last 7 days
            timelineEvents = db.prepare(`
                SELECT date, app_name, SUM(duration_seconds) as duration
                FROM app_usage_timeline
                WHERE date >= date('now', '-6 days', 'localtime')
                GROUP BY date, app_name
                ORDER BY date ASC
            `).all();

            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const dateStr = `${yyyy}-${mm}-${dd}`;
                const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
                labels.push(weekday);
                labelToDate[weekday] = dateStr;
            }

        } else if (range === 'month') {
            // 1. Determine top 8 apps for the last 30 days
            const topAppsUsage = db.prepare(`
                SELECT app_name, SUM(total_seconds) as total_seconds
                FROM app_usage
                WHERE date >= date('now', '-29 days', 'localtime')
                GROUP BY app_name
                ORDER BY total_seconds DESC
                LIMIT 8
            `).all();
            top8AppNames = topAppsUsage.map(u => u.app_name);

            // 2. Query timeline events for the last 30 days
            timelineEvents = db.prepare(`
                SELECT date, app_name, SUM(duration_seconds) as duration
                FROM app_usage_timeline
                WHERE date >= date('now', '-29 days', 'localtime')
                GROUP BY date, app_name
                ORDER BY date ASC
            `).all();

            for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const dateStr = `${yyyy}-${mm}-${dd}`;
                const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                labels.push(formatted);
                labelToDate[formatted] = dateStr;
            }
        }

        const timeline = {};
        labels.forEach(label => {
            timeline[label] = {};
            top8AppNames.forEach(appName => {
                timeline[label][appName] = 0;
            });
        });

        timelineEvents.forEach(event => {
            if (!top8AppNames.includes(event.app_name)) return;
            
            let matchedLabel = null;
            if (range === 'day') {
                const hourInt = parseInt(event.hour, 10);
                const ampm = hourInt >= 12 ? 'p' : 'a';
                const hour12 = hourInt % 12 || 12;
                matchedLabel = `${hour12}${ampm}`;
            } else {
                matchedLabel = labels.find(l => labelToDate[l] === event.date);
            }

            if (matchedLabel && timeline[matchedLabel]) {
                timeline[matchedLabel][event.app_name] += event.duration;
            }
        });

        res.json({ timeline, topApps: top8AppNames, labels });

    } catch (e) {
        console.error('Error fetching app timeline:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.use('/', require('./routes/settings'));

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
    const { getDailyReport, getWeeklyReport, getMonthlyReport, getOfficeVisitsReport, getProjectReport, getTimelineReport } = require('./db');
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
    } else if (tab === 'timeline') {
        data = getTimelineReport(start, end);
        headers = 'Date,Block Start,Block End,Duration (seconds),Duration,Type,Details';
        res.setHeader('Content-Disposition', 'attachment; filename=timeline_report.csv');

        const formatReason = (reason) => {
            if (!reason) return '';
            const map = {
                'take_break': 'Took Break (UI)',
                'lock_take_break': 'Took Break (UI)',
                'lock_idle': 'System Idle',
                'lock_system_idle': 'System Idle',
                'lock_sleep': 'Computer Sleep',
                'lock_screen_saver': 'Screen Saver',
                'unlock_idle_return': 'Returned from Idle',
                'unlock_unknown': 'System Unlock',
                'lock_unknown': 'System Lock',
                'lock_user_initiated': 'User Locked',
            };
            return map[reason] || reason.replace(/_/g, ' ');
        };

        const formatLocalTime = (datetimeStr) => {
            if (!datetimeStr) return '—';
            const d = new Date(datetimeStr.replace(' ', 'T') + 'Z');
            if (isNaN(d.getTime())) return '—';
            const h = d.getHours();
            const m = d.getMinutes().toString().padStart(2, '0');
            const s = d.getSeconds().toString().padStart(2, '0');
            if (timeFormat === 'ampm') {
                const ampm = h >= 12 ? 'PM' : 'AM';
                let h12 = h % 12;
                h12 = h12 ? h12 : 12;
                return `${h12}:${m}:${s} ${ampm}`;
            }
            return `${h.toString().padStart(2, '0')}:${m}:${s}`;
        };

        const rows = [];
        data.forEach(item => {
            item.blocks.forEach(b => {
                const t1 = b.start ? new Date(b.start.replace(' ', 'T') + 'Z').getTime() : 0;
                const t2 = b.end ? new Date(b.end.replace(' ', 'T') + 'Z').getTime() : 0;
                const durationSec = Math.floor((t2 - t1) / 1000);
                const durFormat = durationSec > 0 ? fmtTime(durationSec) : '00:00:00';
                
                const typeLabel = b.type === 'working' ? 'Working' : 'Break';
                
                let details = b.session_type + ' session #' + b.session_id;
                if (b.type === 'break') {
                    const r1 = formatReason(b.reason);
                    const r2 = formatReason(b.end_reason);
                    if (r1 && r2) details += ` (${r1} -> ${r2})`;
                    else if (r1 || r2) details += ` (${r1 || r2})`;
                    else if (b.reason) details += ` (${b.reason})`;
                }
                
                rows.push(`${item.date},${formatLocalTime(b.start)},${formatLocalTime(b.end)},${durationSec},${durFormat},${typeLabel},"${details}"`);
            });
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
    const { getDailyReport, getWeeklyReport, getMonthlyReport, getOfficeVisitsReport, getTimelineReport } = require('./db');
    res.json({
        daily: getDailyReport(start, end),
        weekly: getWeeklyReport(start, end),
        monthly: getMonthlyReport(start, end),
        visits: getOfficeVisitsReport(start, end),
        timeline: getTimelineReport(start, end)
    });
});

// Migrations handled in db.js

// --- Project Management Endpoints ---
app.use('/', require('./routes/projects'));

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
    monday.setHours(0, 0, 0, 0);
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

    const greeting = greetings.at(Math.floor(Math.random() * greetings.length));

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
        projectPhrase = projComms.at(Math.floor(Math.random() * projComms.length));
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
// Dynamic Break Interval Scheduler
function updateDynamicBreak() {
    console.log("[Dynamic Breaks] Recalculating dynamic break interval based on past 14 days of work behavior...");
    const { calculateDynamicBreakInterval } = require('./db');
    const newInterval = calculateDynamicBreakInterval();
    invalidateSettingsCache();
    console.log(`[Dynamic Breaks] New dynamic break interval set to ${newInterval} minutes.`);
}

// Run immediately on boot, and then every 24 hours
updateDynamicBreak();
setInterval(updateDynamicBreak, 24 * 60 * 60 * 1000);

app.get('/dynamic-break-stats', (req, res) => {
    const interval = getCachedSetting('dynamicBreakInterval', '60');
    const useAi = getCachedSetting('useAiDynamicBreak', 'false') === 'true';
    res.json({ interval: parseInt(interval), useAi: useAi });
});

app.get('/wellness-report-data', (req, res) => {
    try {
        const { getTimelineReport } = require('./db');
        const todayDateStr = db.prepare("SELECT date('now', 'localtime') as date").get().date;

        const isGenericReason = (reason) => {
            if (!reason) return true;
            const generic = [
              'lock_idle', 
              'lock_system_idle', 
              'lock_unknown', 
              'lock_user_initiated', 
              'lock_lock_screen', 
              'lock_away', 
              'lock_startup',
              'Session Started Paused'
            ];
            return generic.includes(reason);
        };

        const isWellnessActivity = (reason) => {
            if (!reason) return false;
            if (reason === 'lock_driving') return false;
            return reason.startsWith('lock_') && !isGenericReason(reason);
        };

        const parseUtcDate = (str) => {
            if (!str) return null;
            let formatted = str;
            if (!formatted.includes('T') && formatted.includes(' ')) {
                formatted = formatted.replace(' ', 'T');
            }
            if (!formatted.endsWith('Z') && !formatted.includes('+')) {
                formatted = formatted + 'Z';
            }
            const dateObj = new Date(formatted);
            return isNaN(dateObj.getTime()) ? null : dateObj;
        };

        const mergeTimelineBlocks = (blocks) => {
            if (blocks.length === 0) return [];
            
            const events = [];
            blocks.forEach(b => {
                const start = parseUtcDate(b.start);
                const end = parseUtcDate(b.end);
                if (start && end) {
                    events.push({ time: start.getTime(), type: 'start', block: b });
                    events.push({ time: end.getTime(), type: 'end', block: b });
                }
            });
            
            events.sort((a, b) => {
                if (a.time !== b.time) return a.time - b.time;
                return a.type === 'end' ? -1 : 1;
            });
            
            const merged = [];
            let activeWorking = 0;
            let activeBreaks = [];
            let currentStart = null;
            let currentState = null;
            
            events.forEach(e => {
                const isStart = e.type === 'start';
                const type = e.block.type;
                
                if (isStart) {
                    if (type === 'working') {
                        activeWorking++;
                    } else {
                        activeBreaks.push(e.block);
                    }
                } else {
                    if (type === 'working') {
                        activeWorking--;
                    } else {
                        activeBreaks = activeBreaks.filter(b => b !== e.block);
                    }
                }
                
                let newState = null;
                if (activeWorking > 0) {
                    newState = 'working';
                } else if (activeBreaks.length > 0) {
                    newState = 'break';
                }
                
                if (newState !== currentState) {
                    if (currentState !== null && currentStart !== null && e.time > currentStart) {
                        let reason = undefined;
                        if (currentState === 'break') {
                            const wellnessBreak = activeBreaks.find(b => b.reason && isWellnessActivity(b.reason));
                            const drivingBreak = activeBreaks.find(b => b.reason === 'lock_driving');
                            reason = wellnessBreak ? wellnessBreak.reason : (drivingBreak ? 'lock_driving' : (activeBreaks[0]?.reason || 'lock_idle'));
                        }
                        
                        const startStr = new Date(currentStart).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
                        const endStr = new Date(e.time).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
                        
                        merged.push({
                            type: currentState,
                            start: startStr,
                            end: endStr,
                            reason
                        });
                    }
                    currentState = newState;
                    currentStart = e.time;
                }
            });
            
            return merged;
        };

        const calculateDailyWellnessScore = (dateStr, rawBlocks) => {
            const dayBlocks = mergeTimelineBlocks(rawBlocks);

            // Filter wellness and skipped breaks
            const wellbeingBreaks = dayBlocks.filter(b => b.type === 'break' && b.reason && isWellnessActivity(b.reason));
            const skippedBreaks = dayBlocks.filter(b => b.type === 'break' && isGenericReason(b.reason));
            
            const totalWellnessBreaks = wellbeingBreaks.length + skippedBreaks.length;
            let complianceRate = 100;
            if (totalWellnessBreaks > 0) {
                complianceRate = Math.round((wellbeingBreaks.length / totalWellnessBreaks) * 100);
            }

            let workSecs = 0;
            let healthyBreakSecs = 0;

            dayBlocks.forEach(b => {
                const start = parseUtcDate(b.start);
                const end = parseUtcDate(b.end);
                if (start && end) {
                    const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
                    if (b.type === 'working') {
                        workSecs += diff;
                    } else if (b.type === 'break' && isWellnessActivity(b.reason)) {
                        healthyBreakSecs += diff;
                    }
                }
            });

            let avgFocusStreak = 0;
            if (workSecs > 0) {
                avgFocusStreak = Math.round((workSecs / 60) / (wellbeingBreaks.length + 1));
            }

            let score = 100;
            if (totalWellnessBreaks > 0) {
                score -= (100 - complianceRate) * 0.4;
            }
            if (avgFocusStreak > 90) {
                score -= 15;
            } else if (avgFocusStreak > 120) {
                score -= 25;
            }
            if (workSecs > 14400 && wellbeingBreaks.length === 0) {
                score -= 20;
            }

            score = Math.max(10, Math.min(100, Math.round(score)));
            return {
                score,
                compliance: totalWellnessBreaks > 0 ? complianceRate : "-",
                streak: workSecs > 0 ? avgFocusStreak : "-",
                focusTime: workSecs,
                breakTime: healthyBreakSecs
            };
        };

        // 1. Calculate 7-Day Trend and Today's blocks
        const weeklyTrend = [];
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        const startD = new Date();
        startD.setDate(startD.getDate() - 6);
        const startYyyy = startD.getFullYear();
        const startMm = String(startD.getMonth() + 1).padStart(2, '0');
        const startDd = String(startD.getDate()).padStart(2, '0');
        const startDateStr = `${startYyyy}-${startMm}-${startDd}`;

        const trendReport = getTimelineReport(startDateStr, todayDateStr);

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const dayLabel = daysOfWeek[d.getDay()];
            
            const dayObj = trendReport.find(r => r.date === dateStr);
            const dayBlocks = dayObj ? dayObj.blocks : [];
            const stats = calculateDailyWellnessScore(dateStr, dayBlocks);
            
            weeklyTrend.push({
                day: dayLabel,
                date: dateStr,
                score: stats.score
            });
        }

        // Today's specific statistics
        const todayObj = trendReport.find(r => r.date === todayDateStr);
        const todayBlocks = todayObj ? todayObj.blocks : [];
        const todayStats = calculateDailyWellnessScore(todayDateStr, todayBlocks);

        const mergedTodayBlocks = mergeTimelineBlocks(todayBlocks);

        // 2. Compute Hourly Work vs Break Distribution on Merged Blocks
        const hours = {};
        for (let h = 0; h < 24; h++) {
            hours[h] = { work: 0, break: 0, idle: 0 };
        }

        mergedTodayBlocks.forEach(b => {
            const start = parseUtcDate(b.start);
            const end = parseUtcDate(b.end);
            if (!start || !end) return;

            const startHour = start.getHours();
            const endHour = end.getHours();
            const type = b.type === 'working' ? 'work' : (b.type === 'break' ? 'break' : 'idle');

            if (startHour === endHour) {
                const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
                hours[startHour][type] += duration;
            } else {
                const startHourEnd = new Date(start);
                startHourEnd.setMinutes(59, 59, 999);
                hours[startHour][type] += Math.floor((startHourEnd.getTime() - start.getTime()) / 1000);

                const endHourStart = new Date(end);
                endHourStart.setMinutes(0, 0, 0, 0);
                hours[endHour][type] += Math.floor((end.getTime() - endHourStart.getTime()) / 1000);

                for (let h = startHour + 1; h < endHour; h++) {
                    hours[h][type] += 3600;
                }
            }
        });

        const hourlyStats = [];
        for (let h = 0; h < 24; h++) {
            const total = hours[h].work + hours[h].break + hours[h].idle;
            if (total > 0) {
                const label = `${String(h).padStart(2, '0')}:00`;
                hourlyStats.push({
                    hour: label,
                    work: Math.round((hours[h].work / total) * 100),
                    break: Math.round((hours[h].break / total) * 100),
                    idle: Math.round((hours[h].idle / total) * 100)
                });
            }
        }

        // 3. Dynamic Suggestions
        const tips = [];
        if (todayStats.focusTime === 0) {
            tips.push({
                category: "General",
                severity: "low",
                icon: "👋",
                title: "Welcome!",
                desc: "No screen activity recorded yet. Start tracking to receive focus diagnostics."
            });
        } else {
            if (todayStats.focusTime > 28800) {
                tips.push({
                    category: "Cognitive Load",
                    severity: "high",
                    icon: "🧠",
                    title: "High Burnout Risk",
                    desc: "You have exceeded 8 hours of screen time today. Disconnect now to allow your mind to recover."
                });
            }

            if (todayStats.streak > 90) {
                tips.push({
                    category: "Ergonomics",
                    severity: "high",
                    icon: "🪑",
                    title: "Excessive Focus Streak",
                    desc: `Your average focus streak is ${todayStats.streak}m. Sitting for >90m without standing causes joint compression. Take a walk break.`
                });
            } else if (todayStats.streak > 45) {
                tips.push({
                    category: "Eye Strain",
                    severity: "medium",
                    icon: "👀",
                    title: "Moderate Focus Streak",
                    desc: "Your focus blocks are around 45-90m. Practice the 20-20-20 rule (look 20ft away for 20s) to relieve screen fatigue."
                });
            } else {
                tips.push({
                    category: "Workplace Health",
                    severity: "low",
                    icon: "✨",
                    title: "Balanced Focus Intervals",
                    desc: "Excellent! You are taking regular breaks that keep your muscle tension low and circulation active."
                });
            }

            if (todayStats.compliance !== "-" && todayStats.compliance < 50) {
                tips.push({
                    category: "Habit Strength",
                    severity: "high",
                    icon: "⏳",
                    title: "Low Break Adherence",
                    desc: "You are ignoring or skipping more than half of your break prompts. Try setting a shorter dynamic interval."
                });
            } else if (todayStats.compliance >= 80) {
                tips.push({
                    category: "Habit Strength",
                    severity: "low",
                    icon: "💖",
                    title: "Superb Break Compliance",
                    desc: "Fantastic break discipline! You are maintaining a healthy pattern of active rest."
                });
            }
        }

        res.json({
            wellnessScore: todayStats.score,
            avgFocusStreak: todayStats.streak,
            breakComplianceRate: todayStats.compliance,
            totalFocusTime: todayStats.focusTime,
            totalBreakTime: todayStats.breakTime,
            totalScreenTime: todayStats.focusTime,
            hourlyStats,
            weeklyTrend,
            tips
        });
    } catch (err) {
        console.error("Error fetching wellness report data:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
