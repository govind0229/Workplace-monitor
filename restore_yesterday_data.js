const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'WorkingHours', 'working_hours.db');
const db = new Database(dbPath);

const targetDate = '2026-03-30';
const targetProjectId = 10; // revinate

console.log(`--- Restoring Missing Data for ${targetDate} ---`);

// 1. Calculate total seconds from app_usage
const usage = db.prepare("SELECT SUM(total_seconds) as total FROM app_usage WHERE date = ?").get(targetDate);
const totalSeconds = usage ? usage.total : 0;

if (totalSeconds === 0) {
    console.log("No app usage data found for yesterday. Nothing to restore.");
    process.exit(1);
}

console.log(`Found ${totalSeconds} seconds (~7.3h) of app activity.`);

// 2. Safely Clear out existing sessions for that day AND their dependent lock_events
const yesterdaySessions = db.prepare("SELECT id FROM sessions WHERE date = ?").all(targetDate);
for (const s of yesterdaySessions) {
    db.prepare("DELETE FROM lock_events WHERE session_id = ?").run(s.id);
}
const deleted = db.prepare("DELETE FROM sessions WHERE date = ?").run(targetDate);
console.log(`Cleared ${yesterdaySessions.length} existing placeholders and their lock events from yesterday.`);

// 3. Insert the restored session
const insertStmt = db.prepare(`
    INSERT INTO sessions (
        date, start_time, end_time, total_seconds, status, notified, last_tick, type, project_id
    ) VALUES (
        ?, '09:00:00', '18:00:00', ?, 'paused', 1, ?, 'automatic', ?
    )
`);

const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
const result = insertStmt.run(targetDate, totalSeconds, now, targetProjectId);

console.log(`Successfully restored session (ID: ${result.lastInsertRowid}) with ${totalSeconds} seconds for ${targetDate}.`);
console.log("History reports should now show your hours correctly.");
