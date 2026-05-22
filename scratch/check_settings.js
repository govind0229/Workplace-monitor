const dbModule = require('../db');
const db = dbModule.db;

const settings = db.prepare("SELECT * FROM settings").all();
console.log("Current Settings in DB:");
console.log(settings);

const activeSession = db.prepare("SELECT * FROM sessions WHERE status = 'active'").all();
console.log("Active Sessions:");
console.log(activeSession);
