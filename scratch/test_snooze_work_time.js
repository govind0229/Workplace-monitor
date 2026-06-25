const Database = require('better-sqlite3');
const path = require('path');

const os = require('os');
const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'WorkingHours', 'working_hours.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

async function test() {
    console.log("--- Starting Snooze & Work Time Verification ---");

    // 1. Get active session ID or create a mock session
    let session = db.prepare("SELECT * FROM sessions WHERE status = 'active' AND type = 'manual' LIMIT 1").get();
    if (!session) {
        console.log("No active manual session. Starting a new one via HTTP /start...");
        const res = await fetch('http://127.0.0.1:3000/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ include_automatic: false })
        });
        const json = await res.json();
        console.log("Session started:", json);
        session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(json.session.id);
    }

    const sessionId = session.id;
    console.log(`Active session ID: ${sessionId}`);

    // 2. Set initial state: total_seconds = 3600 (60 mins), last_break_notify = 0, snooze_until = 0
    db.prepare("UPDATE sessions SET total_seconds = 3600, last_break_notify = 0, snooze_until = 0 WHERE id = ?").run(sessionId);
    console.log("Set total_seconds = 3600, last_break_notify = 0, snooze_until = 0");

    // Force server cache reload or wait for background loop to trigger.
    // Actually, we can trigger the reminder by hitting /snooze-break-reminder with 0 to simulate trigger,
    // or just let the background loop trigger it (the server runs background loop every 5s).
    // Let's wait 6 seconds for the background loop to pick it up.
    console.log("Waiting 6 seconds for background loop to trigger break reminder...");
    await new Promise(r => setTimeout(r, 6000));

    // Check status
    let statusRes = await fetch('http://127.0.0.1:3000/status');
    let statusJson = await statusRes.json();
    console.log("Status response after trigger:", {
        pending_break_reminder: statusJson.pending_break_reminder
    });

    if (!statusJson.pending_break_reminder) {
        throw new Error("Break reminder did not trigger!");
    }
    
    console.log(`Initial reminder minutes shown: ${statusJson.pending_break_reminder.minutes} mins (Expected: 60 mins)`);
    if (statusJson.pending_break_reminder.minutes !== 60) {
        throw new Error(`Expected 60 mins, got ${statusJson.pending_break_reminder.minutes}`);
    }

    // 3. POST /snooze-break-reminder with 10 mins
    console.log("Snoozing break for 10 minutes...");
    const snoozeRes = await fetch('http://127.0.0.1:3000/snooze-break-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: 10 })
    });
    const snoozeJson = await snoozeRes.json();
    console.log("Snooze response:", snoozeJson);

    // Verify snooze_until in DB
    let sessionAfterSnooze = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    console.log(`Database state after snooze: total_seconds = ${sessionAfterSnooze.total_seconds}, snooze_until = ${sessionAfterSnooze.snooze_until}`);
    if (sessionAfterSnooze.snooze_until !== sessionAfterSnooze.total_seconds + 600) {
        throw new Error(`Expected snooze_until = ${sessionAfterSnooze.total_seconds + 600}, got ${sessionAfterSnooze.snooze_until}`);
    }

    // 4. Update total_seconds to 4200 (simulate 10 minutes of further work)
    db.prepare("UPDATE sessions SET total_seconds = 4200 WHERE id = ?").run(sessionId);
    console.log("Simulated 10 minutes of further work. Set total_seconds = 4200");

    // Wait 6 seconds for background loop to trigger again after snooze
    console.log("Waiting 6 seconds for background loop to trigger after snooze...");
    await new Promise(r => setTimeout(r, 6000));

    // Check status again
    statusRes = await fetch('http://127.0.0.1:3000/status');
    statusJson = await statusRes.json();
    console.log("Status response after snooze trigger:", {
        pending_break_reminder: statusJson.pending_break_reminder
    });

    if (!statusJson.pending_break_reminder) {
        throw new Error("Break reminder did not trigger after snooze!");
    }

    console.log(`Reminder minutes shown after snooze: ${statusJson.pending_break_reminder.minutes} mins (Expected: 70 mins)`);
    if (statusJson.pending_break_reminder.minutes !== 70) {
        throw new Error(`Expected 70 mins, got ${statusJson.pending_break_reminder.minutes}`);
    }

    // 5. POST /dismiss-break-reminder
    console.log("Dismissing break reminder...");
    const dismissRes = await fetch('http://127.0.0.1:3000/dismiss-break-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    const dismissJson = await dismissRes.json();
    console.log("Dismiss response:", dismissJson);

    // Verify snooze_until in DB (should be total_seconds + breakSec = 4200 + 3600 = 7800 assuming 60 min interval)
    let sessionAfterDismiss = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    console.log(`Database state after dismiss: snooze_until = ${sessionAfterDismiss.snooze_until}`);
    if (sessionAfterDismiss.snooze_until <= sessionAfterDismiss.total_seconds) {
        throw new Error(`Expected snooze_until > ${sessionAfterDismiss.total_seconds}, got ${sessionAfterDismiss.snooze_until}`);
    }

    // 6. POST /start-break
    console.log("Starting a break...");
    const startBreakRes = await fetch('http://127.0.0.1:3000/start-break', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'coffee' })
    });
    const startBreakJson = await startBreakRes.json();
    console.log("Start Break response:", startBreakJson);

    // Verify last_break_notify was reset to current total_seconds (4200)
    let sessionAfterBreak = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    console.log(`Database state after starting break: status = ${sessionAfterBreak.status}, last_break_notify = ${sessionAfterBreak.last_break_notify}`);
    if (sessionAfterBreak.last_break_notify !== sessionAfterBreak.total_seconds) {
        throw new Error(`Expected last_break_notify = ${sessionAfterBreak.total_seconds}, got ${sessionAfterBreak.last_break_notify}`);
    }

    console.log("--- Snooze & Work Time Verification PASSED! ---");
}

test().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
