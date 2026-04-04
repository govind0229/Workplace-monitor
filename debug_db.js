const db = require('./db');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

async function debugDB() {
    console.log("--- DB Debug ---");
    const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'WorkingHours', 'working_hours.db');
    console.log("DB Path:", dbPath);
    
    // Check projects from the Node connection
    // We can't access 'db' directly from db.js as it's not exported, 
    // but the getProjects method is exported.
    try {
        const projects = db.getProjects();
        console.log("Projects in DB:", JSON.stringify(projects));
        
        const defaultProj = db.getSetting('defaultProjectId');
        console.log("Default Project Setting:", defaultProj);
        
        if (projects.length > 0) {
            const firstId = projects[0].id;
            console.log("Setting default to first available project ID:", firstId);
            db.setSetting('defaultProjectId', String(firstId));
            
            const session = db.getTodayAutomaticSession();
            console.log("Resulting Session Project ID:", session.project_id);
        } else {
            console.log("NO PROJECTS FOUND IN DB!");
        }
    } catch (e) {
        console.error("DEBUG ERROR:", e);
    }
}

debugDB();
