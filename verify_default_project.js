const db = require('./db');
const assert = require('assert');

async function testDefaultProject() {
    console.log("--- Starting Minimal Default Project Verification ---");
    
    // 1. Set default project to 1
    db.setSetting('defaultProjectId', '1');
    console.log("✓ Set defaultProjectId to 1");
    
    // 2. Check getTodayAutomaticSession logic
    const session = db.getTodayAutomaticSession();
    console.log("✓ Session lookup/creation performed");
    console.log("  Session Project ID:", session.project_id);
    
    assert.strictEqual(session.project_id, 1, "Session should have project_id 1");
    
    // 3. Verify settings persistence
    const setting = db.getSetting('defaultProjectId');
    assert.strictEqual(setting, '1', "Setting should be persisted as '1'");
    console.log("✓ Settings persistence verified");

    console.log("\n--- Verification Successful! ---");
}

testDefaultProject().catch(e => {
    console.error("\n❌ Verification Failed!");
    console.error(e); // Added this
    process.exit(1);
});
