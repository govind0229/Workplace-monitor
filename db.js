const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Store DB in User's Application Support folder to persist across updates
const homeDir = os.homedir();
const basePath = path.normalize(homeDir + path.sep);
const rawAppDataDir = path.join(basePath, 'Library', 'Application Support', 'WorkingHours');
const appDataDir = path.normalize(rawAppDataDir);

// Ensure directory exists
if (!appDataDir.startsWith(basePath)) { throw new Error('Invalid path'); }
if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

const dbBasePath = path.normalize(appDataDir + path.sep);
const joinedPath = path.join(dbBasePath, 'working_hours.db');
const dbPath = path.normalize(joinedPath);
if (!dbPath.startsWith(dbBasePath)) { throw new Error('Invalid path'); }

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

  CREATE TABLE IF NOT EXISTS app_usage_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    date TEXT DEFAULT (date('now', 'localtime')),
    app_name TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_app_usage_timeline_date ON app_usage_timeline(date);

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

  CREATE TABLE IF NOT EXISTS breaks_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    status TEXT DEFAULT 'offered', -- 'offered', 'snoozed', 'started', 'completed', 'ignored'
    offered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    duration_seconds INTEGER DEFAULT 0
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
    const info = db.prepare("INSERT INTO sessions (status, last_tick, type, project_id, date) VALUES ('active', CURRENT_TIMESTAMP, ?, ?, date('now', 'localtime'))").run(type, projectId);
    return info.lastInsertRowid;
  },
  getActiveSession: (type = 'manual') => {
    return db.prepare("SELECT * FROM sessions WHERE status != 'completed' AND type = ? ORDER BY id DESC LIMIT 1").get(type);
  },
  getTodayAutomaticSession: () => {
    let session = db.prepare("SELECT * FROM sessions WHERE date = date('now', 'localtime') AND type = 'automatic' AND status != 'completed' LIMIT 1").get();
    const defaultProjectIdStr = module.exports.getSetting('defaultProjectId');
    const defaultProjectId = defaultProjectIdStr ? parseInt(defaultProjectIdStr) : null;

    if (!session) {
      // Start as PAUSED — the Swift app will send 'unlock' to activate it.
      // This prevents time from accumulating overnight when the machine is asleep.
      const info = db.prepare("INSERT INTO sessions (status, last_tick, type, project_id, date) VALUES ('paused', CURRENT_TIMESTAMP, 'automatic', ?, date('now', 'localtime'))").run(defaultProjectId);
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
      SELECT date as date, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total,
             SUM(CASE WHEN type = 'manual' THEN 
                 CASE WHEN (strftime('%s', COALESCE(end_time, last_tick)) - strftime('%s', start_time) - total_seconds) > 0 
                      THEN (strftime('%s', COALESCE(end_time, last_tick)) - strftime('%s', start_time) - total_seconds) 
                      ELSE 0 
                 END 
             ELSE 0 END) as break_duration,
             (SELECT COUNT(*) FROM lock_events le 
              JOIN sessions s2 ON le.session_id = s2.id 
              WHERE s2.date = sessions.date
              AND (le.event_type LIKE 'lock%' OR le.event_type LIKE '%discard%' OR le.event_type LIKE '%take_break%')) as break_count
      FROM sessions 
    `;
    const params = [];
    if (startDate || endDate) {
      query += " WHERE ";
      if (startDate && endDate) {
        query += "date BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += "date >= ?";
        params.push(startDate);
      } else {
        query += "date <= ?";
        params.push(endDate);
      }
    }
    query += " GROUP BY date ORDER BY date DESC LIMIT 100";
    return db.prepare(query).all(...params);
  },
  getDetailedProjectHistory: () => {
    return db.prepare(`
      SELECT s.date as date, p.name as project_name, p.color as project_color, SUM(s.total_seconds) as total_seconds
      FROM sessions s
      JOIN projects p ON s.project_id = p.id
      GROUP BY s.date, s.project_id
      ORDER BY s.date DESC, total_seconds DESC
      LIMIT 100
    `).all();
  },
  getWeeklyReport: (startDate, endDate) => {
    let query = `
      SELECT date(date, '-6 days', 'weekday 1') as week, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total,
             SUM(CASE WHEN type = 'manual' THEN 
                 CASE WHEN (strftime('%s', COALESCE(end_time, last_tick)) - strftime('%s', start_time) - total_seconds) > 0 
                      THEN (strftime('%s', COALESCE(end_time, last_tick)) - strftime('%s', start_time) - total_seconds) 
                      ELSE 0 
                 END 
             ELSE 0 END) as break_duration,
             (SELECT COUNT(*) FROM lock_events le 
              JOIN sessions s2 ON le.session_id = s2.id 
              WHERE date(s2.date, '-6 days', 'weekday 1') = date(sessions.date, '-6 days', 'weekday 1')
              AND (le.event_type LIKE 'lock%' OR le.event_type LIKE '%discard%' OR le.event_type LIKE '%take_break%')) as break_count
      FROM sessions 
    `;
    const params = [];
    if (startDate || endDate) {
      query += " WHERE ";
      if (startDate && endDate) {
        query += "date BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += "date >= ?";
        params.push(startDate);
      } else {
        query += "date <= ?";
        params.push(endDate);
      }
    }
    query += " GROUP BY week ORDER BY week DESC LIMIT 52";
    return db.prepare(query).all(...params);
  },
  getMonthlyReport: (startDate, endDate) => {
    let query = `
      SELECT strftime('%Y-%m', date) as month, 
             SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_total,
             SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_total,
             SUM(CASE WHEN type = 'manual' THEN 
                 CASE WHEN (strftime('%s', COALESCE(end_time, last_tick)) - strftime('%s', start_time) - total_seconds) > 0 
                      THEN (strftime('%s', COALESCE(end_time, last_tick)) - strftime('%s', start_time) - total_seconds) 
                      ELSE 0 
                 END 
             ELSE 0 END) as break_duration,
             (SELECT COUNT(*) FROM lock_events le 
              JOIN sessions s2 ON le.session_id = s2.id 
              WHERE strftime('%Y-%m', s2.date) = strftime('%Y-%m', sessions.date)
              AND (le.event_type LIKE 'lock%' OR le.event_type LIKE '%discard%' OR le.event_type LIKE '%take_break%')) as break_count
      FROM sessions 
    `;
    const params = [];
    if (startDate || endDate) {
      query += " WHERE ";
      if (startDate && endDate) {
        query += "date BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += "date >= ?";
        params.push(startDate);
      } else {
        query += "date <= ?";
        params.push(endDate);
      }
    }
    query += " GROUP BY month ORDER BY month DESC LIMIT 36";
    return db.prepare(query).all(...params);
  },
  getOfficeVisitsReport: (startDate, endDate) => {
    let query = `
      SELECT date,
             MIN(datetime(start_time, 'localtime')) as in_time,
             MAX(datetime(COALESCE(end_time, last_tick), 'localtime')) as out_time,
             SUM(total_seconds) as total_seconds,
             (strftime('%s', MAX(COALESCE(end_time, last_tick))) - strftime('%s', MIN(start_time))) as office_span,
             CASE WHEN (strftime('%s', MAX(COALESCE(end_time, last_tick))) - strftime('%s', MIN(start_time)) - SUM(total_seconds)) > 0 
                  THEN (strftime('%s', MAX(COALESCE(end_time, last_tick))) - strftime('%s', MIN(start_time)) - SUM(total_seconds)) 
                  ELSE 0 
             END as break_duration,
             (SELECT COUNT(*) FROM lock_events le 
              JOIN sessions s2 ON le.session_id = s2.id 
              WHERE s2.date = sessions.date
              AND (le.event_type LIKE 'lock%' OR le.event_type LIKE '%discard%' OR le.event_type LIKE '%take_break%')) as break_count
      FROM sessions
      WHERE type = 'manual'
    `;
    const params = [];
    if (startDate || endDate) {
      if (startDate && endDate) {
        query += " AND date BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += " AND date >= ?";
        params.push(startDate);
      } else {
        query += " AND date <= ?";
        params.push(endDate);
      }
    }
    query += " GROUP BY date ORDER BY date DESC LIMIT 100";
    return db.prepare(query).all(...params);
  },
  getTodayManualTotal: () => {
    const result = db.prepare("SELECT SUM(total_seconds) as sum FROM sessions WHERE date = date('now', 'localtime') AND type = 'manual'").get();
    return result ? (result.sum || 0) : 0;
  },
  hasNotifiedToday: () => {
    const result = db.prepare("SELECT SUM(notified) as sum FROM sessions WHERE date = date('now', 'localtime') AND type = 'manual'").get();
    return result && result.sum > 0;
  },
  getTodayTotal: () => {
    const result = db.prepare("SELECT SUM(total_seconds) as sum FROM sessions WHERE date = date('now', 'localtime') AND type = 'automatic'").get();
    return result ? (result.sum || 0) : 0;
  },
  recordAppUsage: (appName, seconds) => {
    db.prepare(`
      INSERT INTO app_usage (date, app_name, total_seconds)
      VALUES (date('now', 'localtime'), ?, ?)
      ON CONFLICT(date, app_name) DO UPDATE SET total_seconds = total_seconds + ?
    `).run(appName, seconds, seconds);

    db.prepare(`
      INSERT INTO app_usage_timeline (timestamp, date, app_name, duration_seconds)
      VALUES (datetime('now', 'localtime'), date('now', 'localtime'), ?, ?)
    `).run(appName, seconds);
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
  },
  getAIDigestData: (startDate, endDate) => {
    // 1. Get total seconds for manual and automatic sessions
    const sessionSummary = db.prepare(`
      SELECT 
        SUM(CASE WHEN type = 'manual' THEN total_seconds ELSE 0 END) as manual_seconds,
        SUM(CASE WHEN type = 'automatic' THEN total_seconds ELSE 0 END) as auto_seconds
      FROM sessions
      WHERE date BETWEEN ? AND ?
    `).get(startDate, endDate);

    // 2. Get top apps used in this range
    const appUsage = db.prepare(`
      SELECT app_name, SUM(total_seconds) as total_seconds
      FROM app_usage
      WHERE date BETWEEN ? AND ?
      GROUP BY app_name
      ORDER BY total_seconds DESC
      LIMIT 5
    `).all(startDate, endDate);

    // 3. Get project breakdown in this range
    const projectBreakdown = db.prepare(`
      SELECT p.name as name, p.color as color, SUM(s.total_seconds) as seconds
      FROM sessions s
      JOIN projects p ON s.project_id = p.id
      WHERE s.date BETWEEN ? AND ?
      GROUP BY s.project_id
      ORDER BY seconds DESC
    `).all(startDate, endDate);

    return {
      total_manual: sessionSummary ? (sessionSummary.manual_seconds || 0) : 0,
      total_auto: sessionSummary ? (sessionSummary.auto_seconds || 0) : 0,
      apps: appUsage || [],
      projects: projectBreakdown || []
    };
  },

  
  getTimelineReport: (startDate, endDate) => {
    let sessionQuery = "SELECT * FROM sessions";
    let params = [];
    if (startDate || endDate) {
      sessionQuery += " WHERE ";
      if (startDate && endDate) {
        sessionQuery += "date BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        sessionQuery += "date >= ?";
        params.push(startDate);
      } else {
        sessionQuery += "date <= ?";
        params.push(endDate);
      }
    }
    sessionQuery += " ORDER BY start_time ASC";
    
    const sessions = db.prepare(sessionQuery).all(...params);
    const sessionIds = sessions.map(s => s.id);
    
    let lockEvents = [];
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      lockEvents = db.prepare("SELECT * FROM lock_events WHERE session_id IN (" + placeholders + ") ORDER BY timestamp ASC").all(...sessionIds);
    }
    
    const eventsBySession = {};
    lockEvents.forEach(e => {
      if (!eventsBySession[e.session_id]) eventsBySession[e.session_id] = [];
      eventsBySession[e.session_id].push(e);
    });

    const timelineByDate = {};

    sessions.forEach(session => {
      const date = session.date;
      if (!timelineByDate[date]) timelineByDate[date] = [];
      
      let currentState = session.type === 'automatic' ? 'break' : 'working';
      let currentTime = session.start_time;
      let currentReason = session.type === 'automatic' ? 'Session Started Paused' : null;
      const events = eventsBySession[session.id] || [];
      
      events.forEach(event => {
        const isLock = event.event_type.startsWith('lock');
        const isUnlock = event.event_type.startsWith('unlock');
        
        if (isLock) {
          if (currentState === 'working') {
            timelineByDate[date].push({
              type: 'working',
              start: currentTime,
              end: event.timestamp,
              session_id: session.id,
              session_type: session.type
            });
          } else {
            timelineByDate[date].push({
              type: 'break',
              start: currentTime,
              end: event.timestamp,
              session_id: session.id,
              session_type: session.type,
              reason: currentReason,
              end_reason: event.event_type
            });
          }
          currentState = 'break';
          currentTime = event.timestamp;
          currentReason = event.event_type;
        } else if (isUnlock) {
          if (currentState === 'break') {
            timelineByDate[date].push({
              type: 'break',
              start: currentTime,
              end: event.timestamp,
              session_id: session.id,
              session_type: session.type,
              reason: currentReason,
              end_reason: event.event_type
            });
          } else {
            timelineByDate[date].push({
              type: 'working',
              start: currentTime,
              end: event.timestamp,
              session_id: session.id,
              session_type: session.type
            });
          }
          currentState = 'working';
          currentTime = event.timestamp;
          currentReason = null;
        } else if (event.event_type.startsWith('idle_respond_discard_')) {
          const choice = event.event_type.replace('idle_respond_discard_', '');
          if (currentState === 'break' && (currentReason === 'lock_idle' || currentReason === 'lock_system_idle' || currentReason === 'lock_unknown')) {
            currentReason = `lock_${choice}`;
          } else {
            const blocks = timelineByDate[date];
            if (blocks && blocks.length > 0) {
              for (let i = blocks.length - 1; i >= 0; i--) {
                if (blocks[i].type === 'break' && blocks[i].session_id === session.id) {
                  if (blocks[i].reason === 'lock_idle' || blocks[i].reason === 'lock_system_idle' || blocks[i].reason === 'lock_unknown') {
                    blocks[i].reason = `lock_${choice}`;
                  }
                  break;
                }
              }
            }
          }
        }
      });
      
      const finalEnd = session.end_time || session.last_tick;
      if (currentTime !== finalEnd) {
         timelineByDate[date].push({
          type: currentState,
          start: currentTime,
          end: finalEnd,
          session_id: session.id,
          session_type: session.type,
          reason: currentState === 'break' ? currentReason : undefined
        });
      }
    });

    return Object.keys(timelineByDate).sort((a, b) => b.localeCompare(a)).map(date => ({
      date: date,
      blocks: timelineByDate[date]
    }));
  },

  calculateDynamicBreakInterval: () => {
    // 1. Get the past 14 days of history
    const query = `
      SELECT date,
             SUM(total_seconds) as total_work,
             (SELECT COUNT(*) FROM lock_events le 
              JOIN sessions s2 ON le.session_id = s2.id 
              WHERE s2.date = sessions.date
              AND (le.event_type LIKE 'lock%' OR le.event_type LIKE '%discard%' OR le.event_type LIKE '%take_break%')) as break_count
      FROM sessions
      WHERE date >= date('now', '-14 days', 'localtime')
      GROUP BY date
    `;
    const rows = db.prepare(query).all();
    
    let totalWorkSecs = 0;
    let totalBlocks = 0; // Each day starts with 1 block, plus 1 block for every break

    for (const row of rows) {
      if (row.total_work > 0) {
        totalWorkSecs += row.total_work;
        totalBlocks += (row.break_count + 1);
      }
    }

    let intervalMins = 60; // Fallback
    if (totalBlocks > 0 && totalWorkSecs > 14400) { // Require at least 4 hours of historical data
      const averageWorkBlockSecs = totalWorkSecs / totalBlocks;
      intervalMins = Math.round(averageWorkBlockSecs / 60);
      
      // Clamp between 30 and 120 minutes
      if (intervalMins < 30) intervalMins = 30;
      if (intervalMins > 120) intervalMins = 120;
    }

    module.exports.setSetting('dynamicBreakInterval', intervalMins.toString());
    return intervalMins;
  }
};

