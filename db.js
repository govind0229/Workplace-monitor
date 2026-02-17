const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'working_hours.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT DEFAULT (date('now')),
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    total_seconds INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed'
    last_tick DATETIME DEFAULT CURRENT_TIMESTAMP,
    notified INTEGER DEFAULT 0,
    type TEXT DEFAULT 'manual' -- 'manual', 'automatic'
  );

  CREATE TABLE IF NOT EXISTS lock_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    event_type TEXT, -- 'lock', 'unlock'
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
  CREATE INDEX IF NOT EXISTS idx_lock_events_session ON lock_events(session_id);
`);

// Migrations
try {
  db.exec("ALTER TABLE sessions ADD COLUMN notified INTEGER DEFAULT 0");
} catch (e) {
  // Column already exists
}

try {
  db.exec("ALTER TABLE sessions ADD COLUMN last_tick DATETIME");
  db.exec("UPDATE sessions SET last_tick = CURRENT_TIMESTAMP WHERE last_tick IS NULL");
} catch (e) {
  // Column already exists
}

try {
  db.exec("ALTER TABLE sessions ADD COLUMN day_total INTEGER DEFAULT 0");
} catch (e) {
  // Column already exists
}

try {
  db.exec("ALTER TABLE sessions ADD COLUMN type TEXT DEFAULT 'manual'");
} catch (e) {
  // Column already exists
}

module.exports = {
  db,
  startSession: (type = 'manual') => {
    const info = db.prepare("INSERT INTO sessions (status, last_tick, type) VALUES ('active', CURRENT_TIMESTAMP, ?)").run(type);
    return info.lastInsertRowid;
  },
  getActiveSession: (type = 'manual') => {
    return db.prepare("SELECT * FROM sessions WHERE status != 'completed' AND type = ? ORDER BY id DESC LIMIT 1").get(type);
  },
  getTodayAutomaticSession: () => {
    let session = db.prepare("SELECT * FROM sessions WHERE date = date('now') AND type = 'automatic' LIMIT 1").get();
    if (!session) {
      const id = module.exports.startSession('automatic');
      session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    }
    return session;
  },
  addEvent: (sessionId, eventType) => {
    db.prepare("INSERT INTO lock_events (session_id, event_type) VALUES (?, ?)").run(sessionId, eventType);

    if (eventType === 'lock') {
      // We handle logic in server to calculate delta
    }
  },
  updateSessionSeconds: (sessionId, seconds) => {
    db.prepare("UPDATE sessions SET total_seconds = total_seconds + ? WHERE id = ?").run(seconds, sessionId);
  },
  completeSession: (sessionId) => {
    db.prepare("UPDATE sessions SET status = 'completed', end_time = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
  },
  getDailyReport: () => {
    return db.prepare(`
      SELECT date, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total
      FROM sessions 
      GROUP BY date 
      ORDER BY date DESC 
      LIMIT 30
    `).all();
  },
  getWeeklyReport: () => {
    return db.prepare(`
      SELECT strftime('%Y-%W', date) as week, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total
      FROM sessions 
      GROUP BY week 
      ORDER BY week DESC 
      LIMIT 10
    `).all();
  },
  getMonthlyReport: () => {
    return db.prepare(`
      SELECT strftime('%Y-%m', date) as month, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total
      FROM sessions 
      GROUP BY month 
      ORDER BY month DESC 
      LIMIT 12
    `).all();
  },
  getTodayTotal: () => {
    const result = db.prepare("SELECT total_seconds FROM sessions WHERE date = date('now') AND type = 'automatic' LIMIT 1").get();
    return result ? (result.total_seconds || 0) : 0;
  }
};
