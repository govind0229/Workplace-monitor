const { db, getTimelineReport } = require('./db.js');

const timeline = getTimelineReport();
console.log(JSON.stringify(timeline, null, 2));
