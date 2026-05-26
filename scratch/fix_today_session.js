const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'WorkingHours', 'working_hours.db');
const db = new Database(dbPath);

console.log("--- STARTING DATABASE REPAIR FOR SESSION 371 ---");
const sessionBefore = db.prepare("SELECT * FROM sessions WHERE id = 371").get();
console.log("Before Correction:", sessionBefore);

if (sessionBefore) {
    // 30411 - 30046 = 365 seconds (~6 minutes) of actual active tracking time
    db.prepare("UPDATE sessions SET total_seconds = 365, last_break_notify = 0 WHERE id = 371").run();
    console.log("✓ Successfully updated session 371 total_seconds to 365 and last_break_notify to 0");
} else {
    console.log("❌ Error: Session 371 not found in DB!");
}

const sessionAfter = db.prepare("SELECT * FROM sessions WHERE id = 371").get();
console.log("After Correction:", sessionAfter);

console.log("\n--- TODAY'S CORRECTED TOTALS ---");
const todayTotal = db.prepare("SELECT SUM(total_seconds) as sum FROM sessions WHERE date = '2026-05-26'").get();
console.log("Total seconds for today (2026-05-26):", todayTotal.sum, `(~${(todayTotal.sum / 600).toFixed(2)} mins)`);
console.log("--- DATABASE REPAIR COMPLETE ---");
