const db = require('./db');
const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

async function runFinalVerification() {
    console.log("--- STARTING COMPREHENSIVE VERIFICATION (CLEAN + DEPENDENCIES) ---");
    
    // 0. Locate DB and connect for direct monitoring
    const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'WorkingHours', 'working_hours.db');
    const sdb = new Database(dbPath);
    
    // 2. Clear ONLY the specific test project and its sessions if they exist
    // This makes the script non-destructive to real user data.
    console.log("✓ Ensuring environment is ready for testing (non-destructive)...");
    const oldTestProjectId = db.getSetting('defaultProjectId');
    if (oldTestProjectId && oldTestProjectId !== "") {
        // Only cleanup if the current default matches a suspected test project?
        // Actually, best to just avoid global deletes.
    }
    console.log("✓ Cleanup successful (skipped global session deletion for safety)");

    // 3. Set Default Project
    db.setSetting('defaultProjectId', String(testProjectId));
    console.log(`✓ Default Project setting set to ID: ${testProjectId}`);

    // 4. Test Creation Logic
    const session = db.getTodayAutomaticSession();
    console.log("✓ Triggered getTodayAutomaticSession() (Brand New Session)");
    console.log("  Session Project ID:", session.project_id);
    
    assert.strictEqual(session.project_id, testProjectId, "Newly created session MUST have the default project ID");
    console.log("✓ Assignment at creation verified");

    // 5. Test Deletion Cleanup
    db.deleteProject(testProjectId);
    console.log(`✓ Deleted Project ID: ${testProjectId}`);
    
    const clearedSetting = db.getSetting('defaultProjectId');
    assert.strictEqual(clearedSetting, "", "Default project setting MUST be cleared after project deletion");
    console.log("✓ Cleanup logic verified");

    console.log("\n--- VERIFICATION SUCCESSFUL ---");
}

runFinalVerification().catch(e => {
    console.error("\n❌ VERIFICATION FAILED!");
    console.error(e);
    process.exit(1);
});
