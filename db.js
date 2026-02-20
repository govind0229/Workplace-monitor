const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Store DB in User's Application Support folder to persist across updates
const homeDir = os.homedir();
const appDataDir = path.join(homeDir, 'Library', 'Application Support', 'WorkingHours');

// Ensure directory exists
if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

const dbPath = path.join(appDataDir, 'working_hours.db');
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
    type TEXT DEFAULT 'manual', -- 'manual', 'automatic'
    last_break_notify INTEGER DEFAULT 0, -- total_seconds at last break reminder
    is_synced INTEGER DEFAULT 0 -- Enterprise cloud sync status
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

  CREATE TABLE IF NOT EXISTS app_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT DEFAULT (date('now')),
    app_name TEXT NOT NULL,
    total_seconds INTEGER DEFAULT 0,
    is_synced INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_app_usage_date ON app_usage(date);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_app_usage_date_app ON app_usage(date, app_name);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

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
  },
  recordAppUsage: (appName, seconds) => {
    db.prepare(`
      INSERT INTO app_usage (date, app_name, total_seconds)
      VALUES (date('now'), ?, ?)
      ON CONFLICT(date, app_name) DO UPDATE SET total_seconds = total_seconds + ?
    `).run(appName, seconds, seconds);
  },
  getTodayAppUsage: () => {
    return db.prepare(`
      SELECT app_name, total_seconds
      FROM app_usage
      WHERE date = date('now')
      ORDER BY total_seconds DESC
    `).all();
  },
  getSetting: (key, defaultValue = null) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : defaultValue;
  },
  setSetting: (key, value) => {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(key, String(value), String(value));
  },

  // Enterprise Cloud Sync queries
  getUnsyncedSessions: () => {
    // Only sync completed sessions or sessions older than 5 minutes to avoid spamming the cloud API
    return db.prepare(`
      SELECT * FROM sessions 
      WHERE is_synced = 0 AND (status = 'completed' OR (strftime('%s', 'now') - strftime('%s', end_time)) > 300)
    `).all();
  },
  markSessionsAsSynced: (ids) => {
    if (!ids || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE sessions SET is_synced = 1 WHERE id IN (${placeholders})`).run(...ids);
  }
};
