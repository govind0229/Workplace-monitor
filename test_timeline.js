const db = require('./db');
const res = db.getTimelineReport(null, null);
console.log(JSON.stringify(res, null, 2));
