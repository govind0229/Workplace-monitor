const { db } = require('./db.js');
const query = `
  SELECT date,
         SUM(total_seconds) as total_work,
         (SELECT COUNT(*) FROM lock_events le 
          JOIN sessions s2 ON le.session_id = s2.id 
          WHERE s2.date = sessions.date
          AND (le.event_type LIKE 'lock%' OR le.event_type LIKE '%discard%' OR le.event_type LIKE '%take_break%')) as break_count
  FROM sessions
  GROUP BY date
  ORDER BY date DESC
  LIMIT 5
`;
console.log(db.prepare(query).all());
