const { db } = require('./db.js');
console.log(db.prepare("SELECT event_type, COUNT(*) FROM lock_events GROUP BY event_type").all());
