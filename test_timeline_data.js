const { db } = require('./db');

const apps = ['Visual Studio Code', 'Google Chrome', 'Slack', 'Terminal', 'Spotify'];

for (let i = 0; i < 24; i++) {
    for (const app of apps) {
        // Random usage between 0 and 1800 seconds
        const duration = Math.floor(Math.random() * 1800);
        db.prepare(`
            INSERT INTO app_usage_timeline (timestamp, date, app_name, duration_seconds)
            VALUES (datetime('now', 'localtime', 'start of day', '+' || ? || ' hours'), date('now', 'localtime'), ?, ?)
        `).run(i, app, duration);
    }
}
console.log("Inserted timeline data");
