const { db, startSession, getTodayTotal } = require('./db');

const initialTotal = getTodayTotal();

// Add a completed automatic session with 300 seconds
const id1 = startSession('automatic');
db.prepare("UPDATE sessions SET total_seconds = 300, status='completed' WHERE id = ?").run(id1);

const total1 = getTodayTotal();
console.log('Total after 1st automatic session diff:', total1 - initialTotal, '(expected 300)');

// Add another active automatic session with 200 seconds
const id2 = startSession('automatic');
db.prepare("UPDATE sessions SET total_seconds = 200 WHERE id = ?").run(id2);

const total2 = getTodayTotal();
console.log('Total after 2nd automatic session diff:', total2 - initialTotal, '(expected 500)');

// cleanup
db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(id1, id2);

console.log('Test complete!');
