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
    date TEXT DEFAULT (date('now', 'localtime')),
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    total_seconds INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed'
    last_tick DATETIME DEFAULT CURRENT_TIMESTAMP,
    notified INTEGER DEFAULT 0,
    type TEXT DEFAULT 'manual', -- 'manual', 'automatic'
    last_break_notify INTEGER DEFAULT 0 -- total_seconds at last break reminder
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
    date TEXT DEFAULT (date('now', 'localtime')),
    app_name TEXT NOT NULL,
    total_seconds INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_app_usage_date ON app_usage(date);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_app_usage_date_app ON app_usage(date, app_name);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suggestion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_key TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_suggestion_history_key ON suggestion_history(message_key);
  CREATE INDEX IF NOT EXISTS idx_suggestion_history_sent ON suggestion_history(sent_at);

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#8b5cf6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL UNIQUE,
    last_synced_id INTEGER DEFAULT 0,
    last_sync_time DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations for existing databases
try { db.exec("ALTER TABLE sessions ADD COLUMN type TEXT DEFAULT 'manual'"); } catch (e) { }
try { db.exec("ALTER TABLE sessions ADD COLUMN notified INTEGER DEFAULT 0"); } catch (e) { }
try { db.exec("ALTER TABLE sessions ADD COLUMN last_break_notify INTEGER DEFAULT 0"); } catch (e) { }
try { db.exec("ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id)"); } catch (e) { }

module.exports = {
  db,
  startSession: (type = 'manual', projectId = null) => {
    const info = db.prepare("INSERT INTO sessions (status, last_tick, type, project_id) VALUES ('active', CURRENT_TIMESTAMP, ?, ?)").run(type, projectId);
    return info.lastInsertRowid;
  },
  getActiveSession: (type = 'manual') => {
    return db.prepare("SELECT * FROM sessions WHERE status != 'completed' AND type = ? ORDER BY id DESC LIMIT 1").get(type);
  },
  getTodayAutomaticSession: () => {
    let session = db.prepare("SELECT * FROM sessions WHERE date(start_time, 'localtime') = date('now', 'localtime') AND type = 'automatic' AND status != 'completed' LIMIT 1").get();
    const defaultProjectIdStr = module.exports.getSetting('defaultProjectId');
    const defaultProjectId = defaultProjectIdStr ? parseInt(defaultProjectIdStr) : null;

    if (!session) {
      // Start as PAUSED — the Swift app will send 'unlock' to activate it.
      // This prevents time from accumulating overnight when the machine is asleep.
      const info = db.prepare("INSERT INTO sessions (status, last_tick, type, project_id) VALUES ('paused', CURRENT_TIMESTAMP, 'automatic', ?)").run(defaultProjectId);
      session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(info.lastInsertRowid);
    } else if (session.project_id === null && defaultProjectId !== null) {
      // If session exists but has no project, and we have a default project, apply it!
      db.prepare("UPDATE sessions SET project_id = ? WHERE id = ?").run(defaultProjectId, session.id);
      session.project_id = defaultProjectId;
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
  getDailyReport: (startDate, endDate) => {
    let query = `
      SELECT date(start_time, 'localtime') as date, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total
      FROM sessions 
    `;
    const params = [];
    if (startDate || endDate) {
      query += " WHERE ";
      if (startDate && endDate) {
        query += "date(start_time, 'localtime') BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += "date(start_time, 'localtime') >= ?";
        params.push(startDate);
      } else {
        query += "date(start_time, 'localtime') <= ?";
        params.push(endDate);
      }
    }
    query += " GROUP BY date ORDER BY date DESC LIMIT 100";
    return db.prepare(query).all(...params);
  },
  getDetailedProjectHistory: () => {
    return db.prepare(`
      SELECT date(s.start_time, 'localtime') as date, p.name as project_name, p.color as project_color, SUM(s.total_seconds) as total_seconds
      FROM sessions s
      JOIN projects p ON s.project_id = p.id
      GROUP BY date, s.project_id
      ORDER BY date DESC, total_seconds DESC
      LIMIT 100
    `).all();
  },
  getWeeklyReport: (startDate, endDate) => {
    let query = `
      SELECT date(start_time, 'localtime', '-6 days', 'weekday 1') as week, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total
      FROM sessions 
    `;
    const params = [];
    if (startDate || endDate) {
      query += " WHERE ";
      if (startDate && endDate) {
        query += "date(start_time, 'localtime') BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += "date(start_time, 'localtime') >= ?";
        params.push(startDate);
      } else {
        query += "date(start_time, 'localtime') <= ?";
        params.push(endDate);
      }
    }
    query += " GROUP BY week ORDER BY week DESC LIMIT 52";
    return db.prepare(query).all(...params);
  },
  getMonthlyReport: (startDate, endDate) => {
    let query = `
      SELECT strftime('%Y-%m', start_time, 'localtime') as month, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total
      FROM sessions 
    `;
    const params = [];
    if (startDate || endDate) {
      query += " WHERE ";
      if (startDate && endDate) {
        query += "date(start_time, 'localtime') BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += "date(start_time, 'localtime') >= ?";
        params.push(startDate);
      } else {
        query += "date(start_time, 'localtime') <= ?";
        params.push(endDate);
      }
    }
    query += " GROUP BY month ORDER BY month DESC LIMIT 36";
    return db.prepare(query).all(...params);
  },
  getOfficeVisitsReport: (startDate, endDate) => {
    let query = `
      SELECT date(start_time, 'localtime') as date,
             MIN(datetime(start_time, 'localtime')) as in_time,
             MAX(datetime(end_time, 'localtime')) as out_time,
             SUM(total_seconds) as total_seconds,
             (strftime('%s', MAX(end_time)) - strftime('%s', MIN(start_time))) as office_span
      FROM sessions
      WHERE type = 'manual'
    `;
    const params = [];
    if (startDate || endDate) {
      if (startDate && endDate) {
        query += " AND date(start_time, 'localtime') BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += " AND date(start_time, 'localtime') >= ?";
        params.push(startDate);
      } else {
        query += " AND date(start_time, 'localtime') <= ?";
        params.push(endDate);
      }
    }
    query += " GROUP BY date ORDER BY date DESC LIMIT 100";
    return db.prepare(query).all(...params);
  },
  getTodayManualTotal: () => {
    const result = db.prepare("SELECT SUM(total_seconds) as sum FROM sessions WHERE date(start_time, 'localtime') = date('now', 'localtime') AND type = 'manual'").get();
    return result ? (result.sum || 0) : 0;
  },
  hasNotifiedToday: () => {
    const result = db.prepare("SELECT SUM(notified) as sum FROM sessions WHERE date(start_time, 'localtime') = date('now', 'localtime') AND type = 'manual'").get();
    return result && result.sum > 0;
  },
  getTodayTotal: () => {
    const result = db.prepare("SELECT SUM(total_seconds) as sum FROM sessions WHERE date(start_time, 'localtime') = date('now', 'localtime') AND type = 'automatic'").get();
    return result ? (result.sum || 0) : 0;
  },
  recordAppUsage: (appName, seconds) => {
    db.prepare(`
      INSERT INTO app_usage (date, app_name, total_seconds)
      VALUES (date('now', 'localtime'), ?, ?)
      ON CONFLICT(date, app_name) DO UPDATE SET total_seconds = total_seconds + ?
    `).run(appName, seconds, seconds);
  },
  getTodayAppUsage: () => {
    return db.prepare(`
      SELECT app_name, total_seconds
      FROM app_usage
      WHERE date = date('now', 'localtime')
      ORDER BY total_seconds DESC
    `).all();
  },
  getSetting: (key, defaultValue = null) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : defaultValue;
  },
  setSetting: (key, value) => {
    const val = (value === null || value === undefined) ? "" : String(value);
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(key, val, val);
  },
  getRecentlySentMessages: (days = 7) => {
    const rows = db.prepare(
      `SELECT message_key FROM suggestion_history
       WHERE sent_at >= datetime('now', ? || ' days')
       ORDER BY sent_at DESC`
    ).all(`-${days}`);
    return rows.map(r => r.message_key);
  },
  markMessageSent: (messageKey) => {
    db.prepare("INSERT INTO suggestion_history (message_key) VALUES (?)").run(messageKey);
  },
  // --- Project Management ---
  createProject: (name, color = '#8b5cf6') => {
    const info = db.prepare("INSERT INTO projects (name, color) VALUES (?, ?)").run(name, color);
    return info.lastInsertRowid;
  },
  getProjects: () => {
    return db.prepare("SELECT * FROM projects ORDER BY name ASC").all();
  },
  deleteProject: (id) => {
    // 1. Clear it from any past sessions
    db.prepare("UPDATE sessions SET project_id = NULL WHERE project_id = ?").run(id);

    // 2. Clear it from default setting if it matches
    const currentDefault = module.exports.getSetting('defaultProjectId');
    if (String(currentDefault) === String(id)) {
      module.exports.setSetting('defaultProjectId', null);
    }

    // 3. Delete the project itself
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  },
  getProjectReport: () => {
    return db.prepare(`
      SELECT p.id, p.name, p.color, SUM(s.total_seconds) as total_seconds, COUNT(s.id) as session_count
      FROM projects p
      LEFT JOIN sessions s ON s.project_id = p.id
      GROUP BY p.id
      ORDER BY total_seconds DESC
    `).all();
  },
  getProjectMonthlyReport: () => {
    return db.prepare(`
      SELECT 
        p.id, 
        p.name, 
        p.color, 
        strftime('%Y-%m', s.date) as month,
        SUM(s.total_seconds) as total_seconds,
        COUNT(s.id) as session_count
      FROM projects p
      JOIN sessions s ON s.project_id = p.id
      GROUP BY p.id, month
      ORDER BY month DESC, total_seconds DESC
    `).all();
  },
  // --- Cloud Sync Helpers ---
  getLastSyncedId: (tableName) => {
    const row = db.prepare("SELECT last_synced_id FROM sync_log WHERE table_name = ?").get(tableName);
    return row ? row.last_synced_id : 0;
  },
  updateSyncedId: (tableName, lastId) => {
    db.prepare(`
      INSERT INTO sync_log (table_name, last_synced_id, last_sync_time)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(table_name) DO UPDATE SET last_synced_id = ?, last_sync_time = CURRENT_TIMESTAMP
    `).run(tableName, lastId, lastId);
  },
  getUnsyncedData: () => {
    const lastSessionId = db.prepare("SELECT last_synced_id FROM sync_log WHERE table_name = 'sessions'").get();
    const lastAppUsageId = db.prepare("SELECT last_synced_id FROM sync_log WHERE table_name = 'app_usage'").get();
    const sessionsFrom = lastSessionId ? lastSessionId.last_synced_id : 0;
    const appUsageFrom = lastAppUsageId ? lastAppUsageId.last_synced_id : 0;

    const sessions = db.prepare("SELECT * FROM sessions WHERE id > ? AND status = 'completed'").all(sessionsFrom);
    const appUsage = db.prepare("SELECT * FROM app_usage WHERE id > ?").all(appUsageFrom);
    const projects = db.prepare("SELECT * FROM projects").all();

    return { sessions, appUsage, projects };
  }
};
