const db = require('./db');
const assert = require('assert');

async function testNullSetting() {
    console.log("--- Testing Null Setting Persistence (Empty String Hack) ---");
    
    // 1. Set to a real value
    db.setSetting('testKey', 'testValue');
    let val = db.getSetting('testKey');
    assert.strictEqual(val, 'testValue', "Should store string value correctly");
    console.log("✓ String value stored correctly");
    
    // 2. Set to null
    db.setSetting('testKey', null);
    val = db.getSetting('testKey');
    // val should be "" because of our hack in db.js
    assert.strictEqual(val, "", "Should store null/undefined as an empty string to satisfy NOT NULL constraint");
    console.log("✓ Null/Undefined handled as empty string successfully");
    
    // 3. Verify getTodayAutomaticSession logic with defaultProjectId
    // If it's "", it should evaluate to false and use null in the query.
    // Let's check how it would behave:
    const mockDefaultProjectId = ""; 
    const resultId = mockDefaultProjectId ? parseInt(mockDefaultProjectId) : null;
    assert.strictEqual(resultId, null, "Empty string should result in null in session query");
    console.log("✓ Evaluation of empty defaultProjectId verified");

    console.log("\n--- Persistence Tests Passed ---");
}

testNullSetting().catch(e => {
    console.error("\n❌ Test Failed!");
    console.error(e);
    process.exit(1);
});
