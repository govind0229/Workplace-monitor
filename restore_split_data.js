const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'WorkingHours', 'working_hours.db');
const db = new Database(dbPath);

const targetDate = '2026-03-30';
const targetProjectId = 10; // revinate

console.log(`--- Splitting Missing Data for ${targetDate} (WFO & WFH) ---`);

// 1. Total to split: 26,425 seconds
const totalSeconds = 26425;
const manualSeconds = 16200; // 4.5 hours for WFO (Office)
const autoSeconds = totalSeconds - manualSeconds; // ~2.84 hours for WFH (Home)

// 2. Clear out the previous unified session (ID 136) to avoid duplication
db.prepare("DELETE FROM sessions WHERE date = ?").run(targetDate);
console.log(`Cleared 2026-03-30 sessions.`);

// 3. Insert the Manual (WFO) session
db.prepare(`
    INSERT INTO sessions (
        date, start_time, end_time, total_seconds, status, notified, last_tick, type, project_id
    ) VALUES (
        ?, '09:00:00', '13:30:00', ?, 'paused', 1, ?, 'manual', ?
    )
`).run(targetDate, manualSeconds, new Date().toISOString(), targetProjectId);

// 4. Insert the Automatic (WFH) session
db.prepare(`
    INSERT INTO sessions (
        date, start_time, end_time, total_seconds, status, notified, last_tick, type, project_id
    ) VALUES (
        ?, '13:30:00', '17:40:00', ?, 'paused', 1, ?, 'automatic', ?
    )
`).run(targetDate, autoSeconds, new Date().toISOString(), targetProjectId);

console.log(`Successfully split and restored data:`);
console.log(`  - 🟦 WFO (Office): 4.5h (16,200s)`);
console.log(`  - 🏠 WFH (Home):  2.8h (${autoSeconds}s)`);
console.log("History reports should now show BOTH your Office and Home hours.");
