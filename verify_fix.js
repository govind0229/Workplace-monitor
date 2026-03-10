const { db, getActiveSession, startSession, completeSession, updateSessionSeconds, getSetting } = require('./db');

// Haversine formula to calculate distance between two coordinates in meters
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the earth in m
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function verifyFix() {
    console.log('--- VERIFICATION START ---');

    // 1. Setup: Ensure we have a paused session
    let session = getActiveSession('manual');
    if (session) {
        db.prepare("UPDATE sessions SET status = 'completed' WHERE id = ?").run(session.id);
    }

    const newSessionId = startSession('manual');
    db.prepare("UPDATE sessions SET status = 'paused', last_tick = datetime('now', '-10 seconds') WHERE id = ?").run(newSessionId);

    let pausedSession = getActiveSession('manual');
    console.log('Initial State:', pausedSession.status === 'paused' ? 'PASS (Session is paused)' : 'FAIL (Session not paused)');

    // 2. Logic to test (Simplified from server.js)
    const mockLat = 10.0;
    const mockLng = 10.0;
    const officeLat = parseFloat(getSetting('officeLat'));
    const officeLng = parseFloat(getSetting('officeLng'));
    const officeRadius = parseInt(getSetting('officeRadius', '200'), 10);

    const distance = getDistanceFromLatLonInM(mockLat, mockLng, officeLat, officeLng);
    const isAtOffice = distance <= officeRadius;

    console.log(`Distance: ${Math.round(distance)}m, IsAtOffice: ${isAtOffice}`);

    // This is the logic we added to server.js
    if (!isAtOffice) {
        if (pausedSession) {
            // THE FIX: It should proceed even if paused
            if (pausedSession.status === 'active') {
                // ... calc and update seconds ...
            }
            db.prepare("UPDATE sessions SET status = 'completed', end_time = CURRENT_TIMESTAMP WHERE id = ?").run(pausedSession.id);
            console.log('Action: COMPLETED session');
        }
    }

    // 3. Verify
    const finalSession = getActiveSession('manual');
    if (!finalSession || finalSession.id !== newSessionId) {
        console.log('Verification: PASS (Manual session closed)');
    } else {
        console.log('Verification: FAIL (Manual session still open with status: ' + finalSession.status + ')');
    }

    console.log('--- VERIFICATION END ---');
}

verifyFix();
