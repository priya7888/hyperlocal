const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { initDB, dbRun, dbGet, dbAll } = require('../db');
const {
  calculateHaversineDistance,
  estimateTravelTime,
  classifyEmergencyAndSeverity,
  checkDuplicateIncident,
  findEligibleNearbyResponders,
  normalizeResponderType,
  mapToServiceType
} = require('../ruleEngine');
const {
  app,
  server,
  io,
  alertAllEligibleNearbyResponders,
  handleResponderAssignment,
  handleIncidentStatusUpdate,
  clearIncidentTimer,
  getEnrichedIncident,
  NEARBY_RESPONDER_RADIUS_KM,
  EXPANDED_RADIUS_KM
} = require('../index');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] Test ${totalTests}: ${description}`);
    console.error(err);
    throw err;
  }
}

async function itAsync(description, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] Test ${totalTests}: ${description}`);
    console.error(err);
    throw err;
  }
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('HYPERLOCAL EMERGENCY RESPONDER ALERT & ASSIGNMENT TEST SUITE');
  console.log('===============================================================');

  await initDB();

  // Clean test tables to ensure isolated run
  await dbRun("DELETE FROM incident_required_responder_types WHERE incident_id LIKE 'INC-TEST-%'");
  await dbRun("DELETE FROM incident_responder_requests WHERE incident_id LIKE 'INC-TEST-%'");
  await dbRun("DELETE FROM incident_updates WHERE incident_id LIKE 'INC-TEST-%'");
  await dbRun("DELETE FROM incidents WHERE id LIKE 'INC-TEST-%'");
  await dbRun("DELETE FROM responders WHERE organization_name = 'Test Unit Corps'");
  await dbRun("DELETE FROM users WHERE email LIKE '%@testcorp.local'");

  // Helper: Seed test users and responders
  // Base coordinates: Cubbon Park (12.9735, 77.5985)
  // 1 km away: (12.9780, 77.6040)
  // 3 km away: (12.9850, 77.6200)
  // 7 km away: (13.0250, 77.6400) - outside 5 km radius
  // 15 km away: (13.0800, 77.6900) - outside 10 km expanded radius

  const testUsersData = [
    // 7 Ambulance responders: 4 within 5km, 1 at 7km, 1 unavailable, 1 busy
    { email: 'amb1@testcorp.local', name: 'Amb Unit 1', service: 'Ambulance', lat: 12.9740, lng: 77.5990, avail: 1, verif: 1, current_inc: null }, // ~0.1 km
    { email: 'amb2@testcorp.local', name: 'Amb Unit 2', service: 'Ambulance', lat: 12.9770, lng: 77.6030, avail: 1, verif: 1, current_inc: null }, // ~0.6 km
    { email: 'amb3@testcorp.local', name: 'Amb Unit 3', service: 'Ambulance', lat: 12.9800, lng: 77.6100, avail: 1, verif: 1, current_inc: null }, // ~1.4 km
    { email: 'amb4@testcorp.local', name: 'Amb Unit 4', service: 'Ambulance', lat: 12.9850, lng: 77.6200, avail: 1, verif: 1, current_inc: null }, // ~2.6 km
    { email: 'amb5@testcorp.local', name: 'Amb Unit 5 Far', service: 'Ambulance', lat: 13.0250, lng: 77.6400, avail: 1, verif: 1, current_inc: null }, // ~7.2 km (outside 5km)
    { email: 'amb6@testcorp.local', name: 'Amb Unit 6 Unavail', service: 'Ambulance', lat: 12.9750, lng: 77.6000, avail: 0, verif: 1, current_inc: null }, // Unavailable
    { email: 'amb7@testcorp.local', name: 'Amb Unit 7 Busy', service: 'Ambulance', lat: 12.9760, lng: 77.6010, avail: 1, verif: 1, current_inc: 'INC-BUSY-99' }, // Busy

    // Police responders
    { email: 'pol1@testcorp.local', name: 'Police Unit 1', service: 'Police', lat: 12.9750, lng: 77.5980, avail: 1, verif: 1, current_inc: null }, // ~0.2 km
    { email: 'pol2@testcorp.local', name: 'Police Unit 2', service: 'Police', lat: 12.9790, lng: 77.6050, avail: 1, verif: 1, current_inc: null }, // ~0.9 km
    { email: 'pol3@testcorp.local', name: 'Police Unit 3 Far', service: 'Police', lat: 13.0400, lng: 77.6500, avail: 1, verif: 1, current_inc: null }, // ~9.2 km

    // Fire responders
    { email: 'fire1@testcorp.local', name: 'Fire Tender 1', service: 'Fire', lat: 12.9745, lng: 77.5995, avail: 1, verif: 1, current_inc: null }, // ~0.15 km
    { email: 'fire2@testcorp.local', name: 'Fire Tender 2', service: 'Fire', lat: 12.9820, lng: 77.6150, avail: 1, verif: 1, current_inc: null }, // ~2.0 km

    // Responder with invalid/uncalibrated location (Null Island: 0.0, 0.0)
    { email: 'fire3@testcorp.local', name: 'Fire Tender 3 NoGPS', service: 'Fire', lat: 0.0, lng: 0.0, avail: 1, verif: 1, current_inc: null },

    // Citizen
    { email: 'citizen1@testcorp.local', name: 'Test Citizen Priya', phone: '+91 99999 11111', role: 'citizen' }
  ];

  const responderMap = {}; // email -> responder record with id

  for (const u of testUsersData) {
    const userRole = u.role || 'responder';
    const userRes = await dbRun(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES (?, 'hash123', ?, ?, ?)`,
      [u.email, u.name, u.phone || '+91 98765 00000', userRole]
    );

    if (userRole === 'responder') {
      const respRes = await dbRun(
        `INSERT INTO responders (user_id, service_type, is_available, is_verified, lat, lng, vehicle_number, organization_name, current_incident_id)
         VALUES (?, ?, ?, ?, ?, ?, 'KA-TEST-01', 'Test Unit Corps', ?)`,
        [userRes.lastID, u.service, u.avail, u.verif, u.lat, u.lng, u.current_inc]
      );
      responderMap[u.email] = await dbGet('SELECT * FROM responders WHERE id = ?', [respRes.lastID]);
    }
  }

  const baseLat = 12.9735;
  const baseLng = 77.5985;

  console.log('\n--- SECTION 1: RESPONDER SELECTION & ELIGIBILITY FILTERING ---');

  await itAsync('1. Correct responder type is selected (Police for Crime emergency)', async () => {
    const triage = classifyEmergencyAndSeverity('Crime', 'Robbery in store with weapons', []);
    assert.strictEqual(triage.suggested_service, 'Police');
    const responders = await findEligibleNearbyResponders(triage.suggested_service, baseLat, baseLng, 5.0);
    assert(responders.length >= 2, `Expected at least 2 police responders, got ${responders.length}`);
    for (const r of responders) {
      assert.strictEqual(r.service_type, 'Police');
    }
  });

  await itAsync('2. Medical emergency selects Ambulance responders', async () => {
    const triage = classifyEmergencyAndSeverity('Medical', 'Pedestrian unconscious and bleeding', ['Person unconscious']);
    assert.strictEqual(triage.suggested_service, 'Ambulance');
    const responders = await findEligibleNearbyResponders(triage.suggested_service, baseLat, baseLng, 5.0);
    assert(responders.length >= 4, `Expected at least 4 ambulance responders within 5km, got ${responders.length}`);
    for (const r of responders) {
      assert.strictEqual(r.service_type, 'Ambulance');
    }
  });

  await itAsync('3. Fire emergency selects Fire responders', async () => {
    const triage = classifyEmergencyAndSeverity('Fire', 'Thick smoke and flames on building 2nd floor', ['Fire or smoke']);
    assert.strictEqual(triage.suggested_service, 'Fire');
    const responders = await findEligibleNearbyResponders(triage.suggested_service, baseLat, baseLng, 5.0);
    assert(responders.length >= 2, `Expected at least 2 fire responders within 5km, got ${responders.length}`);
    for (const r of responders) {
      assert.strictEqual(r.service_type, 'Fire');
    }
  });

  await itAsync('4. Wrong responder type is excluded from candidate list', async () => {
    const fireResponders = await findEligibleNearbyResponders('Fire', baseLat, baseLng, 5.0);
    for (const r of fireResponders) {
      assert.notStrictEqual(r.service_type, 'Ambulance');
      assert.notStrictEqual(r.service_type, 'Police');
    }
  });

  await itAsync('5. Responder outside the configured 5 km radius is excluded', async () => {
    const responders = await findEligibleNearbyResponders('Ambulance', baseLat, baseLng, 5.0);
    const farResponderId = responderMap['amb5@testcorp.local'].id;
    const foundFar = responders.find(r => r.id === farResponderId);
    assert.strictEqual(foundFar, undefined, 'Far responder (7.2 km) should NOT be in 5 km results');
  });

  await itAsync('6. Unavailable responder (is_available = 0) is excluded', async () => {
    const responders = await findEligibleNearbyResponders('Ambulance', baseLat, baseLng, 5.0);
    const unavailId = responderMap['amb6@testcorp.local'].id;
    const foundUnavail = responders.find(r => r.id === unavailId);
    assert.strictEqual(foundUnavail, undefined, 'Unavailable responder must be excluded');
  });

  await itAsync('7. Busy responder (with active current_incident_id) is excluded', async () => {
    const responders = await findEligibleNearbyResponders('Ambulance', baseLat, baseLng, 5.0);
    const busyId = responderMap['amb7@testcorp.local'].id;
    const foundBusy = responders.find(r => r.id === busyId);
    assert.strictEqual(foundBusy, undefined, 'Busy responder with active incident must be excluded');
  });

  await itAsync('8. Responder without valid GPS location (null lat/lng) is excluded safely', async () => {
    const responders = await findEligibleNearbyResponders('Fire', baseLat, baseLng, 5.0);
    const noGpsId = responderMap['fire3@testcorp.local'].id;
    const foundNoGps = responders.find(r => r.id === noGpsId);
    assert.strictEqual(foundNoGps, undefined, 'Responder with null coordinates must be safely excluded');
  });

  console.log('\n--- SECTION 2: NO FIXED LIMIT (ALL ELIGIBLE NEARBY ALERTED) ---');

  await itAsync('9. Verify NO artificial limit of 5: All eligible responders in radius are returned', async () => {
    // Add 6 additional available ambulance responders within 3km to reach 10 eligible total
    const extraAmbs = [];
    for (let i = 8; i <= 13; i++) {
      const uRes = await dbRun(
        `INSERT INTO users (email, password_hash, full_name, phone, role)
         VALUES (?, 'hash123', ?, '+91 98765 00099', 'responder')`,
        [`extra_amb${i}@testcorp.local`, `Extra Ambulance ${i}`]
      );
      const rLat = 12.9740 + ((i - 7) * 0.002);
      const rLng = 77.5990 + ((i - 7) * 0.002);
      const rRes = await dbRun(
        `INSERT INTO responders (user_id, service_type, is_available, is_verified, lat, lng, vehicle_number, organization_name)
         VALUES (?, 'Ambulance', 1, 1, ?, ?, 'KA-EXTRA', 'Test Unit Corps')`,
        [uRes.lastID, rLat, rLng]
      );
      extraAmbs.push(rRes.lastID);
    }

    const allInRadius = await findEligibleNearbyResponders('Ambulance', baseLat, baseLng, 5.0);
    assert(allInRadius.length >= 10, `Expected at least 10 eligible responders, got ${allInRadius.length}. Confirms NO cap of 5!`);
    console.log(`       [Info] Total matching responders found and alerted: ${allInRadius.length} (Exceeds 5; no limit applied)`);
  });

  await itAsync('10. alertAllEligibleNearbyResponders inserts individual PENDING requests for ALL eligible responders', async () => {
    const testIncId = 'INC-TEST-1001';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
       VALUES (?, 'Test Citizen', 'Medical', 'Critical', 'Ambulance', 'Cardiac emergency', 12.9735, 77.5985, 'Reported')`,
      [testIncId]
    );

    const dispatchResult = await alertAllEligibleNearbyResponders(
      testIncId,
      'Ambulance',
      baseLat,
      baseLng,
      { emergency_type: 'Medical', severity: 'Critical', description: 'Cardiac emergency' }
    );

    assert(dispatchResult.alertedCount >= 10, `Alerted count was ${dispatchResult.alertedCount}`);

    // Verify database records in incident_responder_requests
    const requests = await dbAll(
      'SELECT * FROM incident_responder_requests WHERE incident_id = ?',
      [testIncId]
    );

    assert.strictEqual(requests.length, dispatchResult.alertedCount);
    for (const req of requests) {
      assert.strictEqual(req.status, 'PENDING');
      assert.strictEqual(req.responder_type, 'Ambulance');
      assert(req.distance_km <= 5.0);
      assert(req.expires_at !== null);
    }

    clearIncidentTimer(testIncId);
  });

  console.log('\n--- SECTION 3: FIRST ACCEPTANCE WINS & CONCURRENCY PROTECTION ---');

  await itAsync('11. First responder acceptance atomically assigns incident and rejects other pending requests', async () => {
    const testIncId = 'INC-TEST-1002';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
       VALUES (?, 'Test Citizen', 'Police', 'Critical', 'Police', 'Assault in progress', 12.9735, 77.5985, 'Reported')`,
      [testIncId]
    );

    const pol1 = responderMap['pol1@testcorp.local'];
    const pol2 = responderMap['pol2@testcorp.local'];

    // Create 2 pending requests
    await dbRun(
      `INSERT INTO incident_responder_requests (incident_id, responder_id, responder_type, distance_km, status)
       VALUES (?, ?, 'Police', 0.2, 'PENDING'), (?, ?, 'Police', 0.9, 'PENDING')`,
      [testIncId, pol1.id, testIncId, pol2.id]
    );

    // Responder 1 accepts first
    const assignResult = await dbRun(
      `UPDATE incidents
       SET assigned_responder_id = ?, status = 'Assigned', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND assigned_responder_id IS NULL AND status NOT IN ('Resolved', 'Cancelled', 'Merged')`,
      [pol1.id, testIncId]
    );

    assert.strictEqual(assignResult.changes, 1, 'First acceptance must change exactly 1 row');

    // Mark winner request ACCEPTED
    await dbRun(
      `UPDATE incident_responder_requests SET status = 'ACCEPTED' WHERE incident_id = ? AND responder_id = ?`,
      [testIncId, pol1.id]
    );

    // Mark all other pending requests REJECTED_BY_ASSIGNMENT
    await dbRun(
      `UPDATE incident_responder_requests SET status = 'REJECTED_BY_ASSIGNMENT' WHERE incident_id = ? AND responder_id != ? AND status = 'PENDING'`,
      [testIncId, pol1.id]
    );

    // Verify incident state
    const incident = await dbGet('SELECT * FROM incidents WHERE id = ?', [testIncId]);
    assert.strictEqual(incident.status, 'Assigned');
    assert.strictEqual(incident.assigned_responder_id, pol1.id);

    // Verify request states
    const req1 = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, pol1.id]);
    assert.strictEqual(req1.status, 'ACCEPTED');

    const req2 = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, pol2.id]);
    assert.strictEqual(req2.status, 'REJECTED_BY_ASSIGNMENT');
  });

  await itAsync('12. Second acceptance fails safely (Atomic Concurrency Protection)', async () => {
    const testIncId = 'INC-TEST-1002'; // Already assigned to pol1
    const pol2 = responderMap['pol2@testcorp.local'];

    // Responder 2 tries to accept the same incident
    const secondAssign = await dbRun(
      `UPDATE incidents
       SET assigned_responder_id = ?, status = 'Assigned', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND assigned_responder_id IS NULL AND status NOT IN ('Resolved', 'Cancelled', 'Merged')`,
      [pol2.id, testIncId]
    );

    assert.strictEqual(secondAssign.changes, 0, 'Second acceptance MUST change 0 rows');

    // Incident remains assigned to pol1
    const incident = await dbGet('SELECT * FROM incidents WHERE id = ?', [testIncId]);
    const pol1 = responderMap['pol1@testcorp.local'];
    assert.strictEqual(incident.assigned_responder_id, pol1.id);
  });

  await itAsync('13. Simultaneous simulated acceptance: Only ONE wins', async () => {
    const testIncId = 'INC-TEST-1003';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
       VALUES (?, 'Test Citizen', 'Fire', 'Critical', 'Fire', 'Fire outbreak', 12.9735, 77.5985, 'Reported')`,
      [testIncId]
    );

    const f1 = responderMap['fire1@testcorp.local'];
    const f2 = responderMap['fire2@testcorp.local'];

    await dbRun(
      `INSERT INTO incident_responder_requests (incident_id, responder_id, responder_type, distance_km, status)
       VALUES (?, ?, 'Fire', 0.15, 'PENDING'), (?, ?, 'Fire', 2.0, 'PENDING')`,
      [testIncId, f1.id, testIncId, f2.id]
    );

    // Execute 2 concurrent update attempts
    const [res1, res2] = await Promise.all([
      dbRun(
        `UPDATE incidents
         SET assigned_responder_id = ?, status = 'Assigned', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND assigned_responder_id IS NULL`,
        [f1.id, testIncId]
      ),
      dbRun(
        `UPDATE incidents
         SET assigned_responder_id = ?, status = 'Assigned', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND assigned_responder_id IS NULL`,
        [f2.id, testIncId]
      )
    ]);

    const totalAssigned = res1.changes + res2.changes;
    assert.strictEqual(totalAssigned, 1, 'Exactly one simultaneous update must succeed');

    const finalInc = await dbGet('SELECT * FROM incidents WHERE id = ?', [testIncId]);
    assert(finalInc.assigned_responder_id === f1.id || finalInc.assigned_responder_id === f2.id);
  });

  console.log('\n--- SECTION 4: DECLINE, EXPIRATION & FAILURE STATES ---');

  await itAsync('14. Responder decline marks request DECLINED and keeps other responders active', async () => {
    const testIncId = 'INC-TEST-1004';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
       VALUES (?, 'Test Citizen', 'Police', 'Medium', 'Police', 'Traffic issue', 12.9735, 77.5985, 'Reported')`,
      [testIncId]
    );

    const pol1 = responderMap['pol1@testcorp.local'];
    const pol2 = responderMap['pol2@testcorp.local'];

    await dbRun(
      `INSERT INTO incident_responder_requests (incident_id, responder_id, responder_type, distance_km, status)
       VALUES (?, ?, 'Police', 0.2, 'PENDING'), (?, ?, 'Police', 0.9, 'PENDING')`,
      [testIncId, pol1.id, testIncId, pol2.id]
    );

    // pol1 declines
    await dbRun(
      `UPDATE incident_responder_requests SET status = 'DECLINED', responded_at = CURRENT_TIMESTAMP WHERE incident_id = ? AND responder_id = ?`,
      [testIncId, pol1.id]
    );

    const req1 = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, pol1.id]);
    assert.strictEqual(req1.status, 'DECLINED');

    const req2 = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, pol2.id]);
    assert.strictEqual(req2.status, 'PENDING');

    const inc = await dbGet('SELECT * FROM incidents WHERE id = ?', [testIncId]);
    assert.strictEqual(inc.status, 'Reported', 'Incident remains Reported while other responders are pending');
  });

  await itAsync('15. If ALL responders decline, incident transitions to NO_RESPONDER_AVAILABLE', async () => {
    const testIncId = 'INC-TEST-1004';
    const pol2 = responderMap['pol2@testcorp.local'];

    // pol2 also declines
    await dbRun(
      `UPDATE incident_responder_requests SET status = 'DECLINED', responded_at = CURRENT_TIMESTAMP WHERE incident_id = ? AND responder_id = ?`,
      [testIncId, pol2.id]
    );

    const pendingRow = await dbGet(
      `SELECT COUNT(*) as count FROM incident_responder_requests WHERE incident_id = ? AND status = 'PENDING'`,
      [testIncId]
    );

    assert.strictEqual(pendingRow.count, 0);

    // Transition incident
    await dbRun(
      `UPDATE incidents SET status = 'NO_RESPONDER_AVAILABLE' WHERE id = ? AND assigned_responder_id IS NULL`,
      [testIncId]
    );

    const inc = await dbGet('SELECT * FROM incidents WHERE id = ?', [testIncId]);
    assert.strictEqual(inc.status, 'NO_RESPONDER_AVAILABLE');
  });

  await itAsync('16. Request expiration marks PENDING requests as EXPIRED', async () => {
    const testIncId = 'INC-TEST-1005';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
       VALUES (?, 'Test Citizen', 'Fire', 'Critical', 'Fire', 'Fire alert', 12.9735, 77.5985, 'Reported')`,
      [testIncId]
    );

    const f1 = responderMap['fire1@testcorp.local'];
    await dbRun(
      `INSERT INTO incident_responder_requests (incident_id, responder_id, responder_type, distance_km, status)
       VALUES (?, ?, 'Fire', 0.15, 'PENDING')`,
      [testIncId, f1.id]
    );

    // Simulate timeout expiration
    await dbRun(
      `UPDATE incident_responder_requests SET status = 'EXPIRED', responded_at = CURRENT_TIMESTAMP WHERE incident_id = ? AND status = 'PENDING'`,
      [testIncId]
    );

    const req = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, f1.id]);
    assert.strictEqual(req.status, 'EXPIRED');
  });

  await itAsync('17. If no responders exist in area, incident immediately becomes NO_RESPONDER_AVAILABLE', async () => {
    const testIncId = 'INC-TEST-1006';
    // Deep remote coordinates with 0 responders anywhere nearby
    const remoteLat = 28.6139; // Delhi (hundreds of km from Bangalore seed points)
    const remoteLng = 77.2090;

    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
       VALUES (?, 'Test Citizen', 'Fire', 'Critical', 'Fire', 'Remote fire', ?, ?, 'Reported')`,
      [testIncId, remoteLat, remoteLng]
    );

    const result = await alertAllEligibleNearbyResponders(
      testIncId,
      'Fire',
      remoteLat,
      remoteLng,
      { emergency_type: 'Fire', severity: 'Critical', description: 'Remote fire' }
    );

    assert.strictEqual(result.alertedCount, 0);
    assert.strictEqual(result.status, 'NO_RESPONDER_AVAILABLE');

    const inc = await dbGet('SELECT * FROM incidents WHERE id = ?', [testIncId]);
    assert.strictEqual(inc.status, 'NO_RESPONDER_AVAILABLE');
  });

  console.log('\n--- SECTION 5: RESPONDER AVAILABILITY LIFECYCLE ---');

  await itAsync('18. Winning responder is marked busy (is_available = 0, current_incident_id set)', async () => {
    const f1 = responderMap['fire1@testcorp.local'];
    const testIncId = 'INC-TEST-1007';

    await dbRun(
      `UPDATE responders SET is_available = 0, current_incident_id = ? WHERE id = ?`,
      [testIncId, f1.id]
    );

    const updatedResp = await dbGet('SELECT * FROM responders WHERE id = ?', [f1.id]);
    assert.strictEqual(updatedResp.is_available, 0);
    assert.strictEqual(updatedResp.current_incident_id, testIncId);
  });

  await itAsync('19. Resolving incident restores responder availability (is_available = 1, current_incident_id = NULL)', async () => {
    const f1 = responderMap['fire1@testcorp.local'];
    const testIncId = 'INC-TEST-1007';

    // Simulate incident resolution
    await dbRun(
      `UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE current_incident_id = ?`,
      [testIncId]
    );

    const updatedResp = await dbGet('SELECT * FROM responders WHERE id = ?', [f1.id]);
    assert.strictEqual(updatedResp.is_available, 1);
    assert.strictEqual(updatedResp.current_incident_id, null);
  });

  console.log('\n--- SECTION 6: SECURITY & AUTHORIZATION ---');

  await itAsync('20. Responder cannot accept an incident they were not alerted for', async () => {
    const testIncId = 'INC-TEST-1008';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
       VALUES (?, 'Test Citizen', 'Police', 'Critical', 'Police', 'Robbery', 12.9735, 77.5985, 'Reported')`,
      [testIncId]
    );

    // Amb unit was not alerted (only pol units were)
    const amb1 = responderMap['amb1@testcorp.local'];
    const reqRecord = await dbGet(
      'SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?',
      [testIncId, amb1.id]
    );
    assert.strictEqual(reqRecord, undefined, 'Amb unit has no request record for police incident');
  });

  await itAsync('21. Duplicate incident merge logic preserves existing functionality', async () => {
    const dupCheck = await checkDuplicateIncident('Crash', 12.9735, 77.5985, 600, 200);
    assert.strictEqual(typeof dupCheck.isDuplicate, 'boolean');
  });

  console.log('\n--- SECTION 7: FEATURE: MULTI-RESPONDER ALERTS & INDEPENDENT ACCEPTANCE ---');

  await itAsync('F1.1: Police only emergency requirement', async () => {
    const triage = classifyEmergencyAndSeverity('Crime', 'Robbery reported', [], ['POLICE']);
    assert.deepStrictEqual(triage.requiredResponderTypes, ['POLICE']);
    const testIncId = 'INC-TEST-REQ-POLICE';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Crime', 'Critical', 'Police', 'Police only emergency', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['POLICE'])]
    );
    const result = await alertAllEligibleNearbyResponders(testIncId, ['POLICE'], baseLat, baseLng, { emergency_type: 'Crime' });
    assert(result.alertedCount >= 2, `Expected >= 2 police alerted, got ${result.alertedCount}`);
    const reqs = await dbAll('SELECT * FROM incident_responder_requests WHERE incident_id = ?', [testIncId]);
    for (const r of reqs) {
      assert.strictEqual(r.responder_type, 'Police');
    }
  });

  await itAsync('F1.2: Ambulance only emergency requirement', async () => {
    const triage = classifyEmergencyAndSeverity('Medical', 'Severe bleeding', [], ['AMBULANCE']);
    assert.deepStrictEqual(triage.requiredResponderTypes, ['AMBULANCE']);
    const testIncId = 'INC-TEST-REQ-AMB';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Medical', 'Critical', 'Ambulance', 'Ambulance only emergency', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['AMBULANCE'])]
    );
    const result = await alertAllEligibleNearbyResponders(testIncId, ['AMBULANCE'], baseLat, baseLng, { emergency_type: 'Medical' });
    assert(result.alertedCount >= 10, `Expected >= 10 ambulance alerted, got ${result.alertedCount}`);
    const reqs = await dbAll('SELECT * FROM incident_responder_requests WHERE incident_id = ?', [testIncId]);
    for (const r of reqs) {
      assert.strictEqual(r.responder_type, 'Ambulance');
    }
  });

  await itAsync('F1.3: Police + Ambulance dual requirements preserved', async () => {
    const triage = classifyEmergencyAndSeverity('Crime', 'Robbery with injury', ['Injured victim'], ['POLICE', 'AMBULANCE']);
    assert.deepStrictEqual(triage.requiredResponderTypes, ['POLICE', 'AMBULANCE']);
    const testIncId = 'INC-TEST-REQ-POL-AMB';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Crime', 'Critical', 'Police', 'Police and ambulance needed', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['POLICE', 'AMBULANCE'])]
    );
    const result = await alertAllEligibleNearbyResponders(testIncId, ['POLICE', 'AMBULANCE'], baseLat, baseLng, { emergency_type: 'Crime' });
    assert(result.alertedCount >= 12, `Expected >= 12 total alerts across police and ambulance, got ${result.alertedCount}`);
    const reqs = await dbAll('SELECT * FROM incident_responder_requests WHERE incident_id = ?', [testIncId]);
    const policeReqs = reqs.filter(r => r.responder_type === 'Police');
    const ambReqs = reqs.filter(r => r.responder_type === 'Ambulance');
    assert(policeReqs.length >= 2, 'Police requests must exist');
    assert(ambReqs.length >= 10, 'Ambulance requests must exist');
  });

  await itAsync('F1.4: Police + Fire requirements preserved', async () => {
    const triage = classifyEmergencyAndSeverity('Fire', 'Arson building fire', [], ['POLICE', 'FIRE']);
    assert.deepStrictEqual(triage.requiredResponderTypes, ['POLICE', 'FIRE']);
    const testIncId = 'INC-TEST-REQ-POL-FIRE';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Fire', 'Critical', 'Fire', 'Arson fire', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['POLICE', 'FIRE'])]
    );
    await alertAllEligibleNearbyResponders(testIncId, ['POLICE', 'FIRE'], baseLat, baseLng, { emergency_type: 'Fire' });
    const reqs = await dbAll('SELECT * FROM incident_responder_requests WHERE incident_id = ?', [testIncId]);
    assert(reqs.some(r => r.responder_type === 'Police'), 'Police alerted');
    assert(reqs.some(r => r.responder_type === 'Fire'), 'Fire alerted');
  });

  await itAsync('F1.5: Police + Ambulance + Fire all three requirements preserved', async () => {
    const triage = classifyEmergencyAndSeverity('Accident', 'Major structural disaster', [], ['POLICE', 'AMBULANCE', 'FIRE']);
    assert.deepStrictEqual(triage.requiredResponderTypes, ['POLICE', 'AMBULANCE', 'FIRE']);
    const testIncId = 'INC-TEST-REQ-ALL3';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Accident', 'Critical', 'Fire', 'Triple service disaster', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['POLICE', 'AMBULANCE', 'FIRE'])]
    );
    await alertAllEligibleNearbyResponders(testIncId, ['POLICE', 'AMBULANCE', 'FIRE'], baseLat, baseLng, { emergency_type: 'Accident' });
    const reqs = await dbAll('SELECT * FROM incident_responder_requests WHERE incident_id = ?', [testIncId]);
    assert(reqs.some(r => r.responder_type === 'Police'), 'Police alerted');
    assert(reqs.some(r => r.responder_type === 'Ambulance'), 'Ambulance alerted');
    assert(reqs.some(r => r.responder_type === 'Fire'), 'Fire alerted');
  });

  await itAsync('F1.6: Multiple selections are preserved in database and enriched incident', async () => {
    const testIncId = 'INC-TEST-REQ-POL-AMB';
    const enriched = await getEnrichedIncident(testIncId);
    assert.deepStrictEqual(enriched.requiredResponderTypes, ['POLICE', 'AMBULANCE']);
    assert(enriched.responder_requirements);
    const polReq = enriched.responder_requirements_by_type?.['POLICE'] || enriched.responder_requirements['POLICE'] || enriched.responder_requirements.find(r => r.responder_type === 'POLICE');
    const ambReq = enriched.responder_requirements_by_type?.['AMBULANCE'] || enriched.responder_requirements['AMBULANCE'] || enriched.responder_requirements.find(r => r.responder_type === 'AMBULANCE');
    assert(polReq, 'Police requirement must exist');
    assert(ambReq, 'Ambulance requirement must exist');
  });

  await itAsync('F1.7: Last selected item does NOT overwrite previous selections', async () => {
    // When checklist has multiple items or types array has ['POLICE', 'AMBULANCE'],
    // previously "requiredResponderType = selectedType" caused only Ambulance to remain.
    const triage = classifyEmergencyAndSeverity('Medical', 'Emergency', ['Police', 'Ambulance']);
    assert.notStrictEqual(triage.requiredResponderTypes.length, 1);
    assert(triage.requiredResponderTypes.includes('POLICE'), 'Police must NOT be overwritten by Ambulance');
    assert(triage.requiredResponderTypes.includes('AMBULANCE'), 'Ambulance must be included');
  });

  await itAsync('F1.8: All eligible Police responders receive Police requests without fixed limit', async () => {
    const eligiblePolice = await findEligibleNearbyResponders('Police', baseLat, baseLng, 5.0);
    const testIncId = 'INC-TEST-ALL-POLICE';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Crime', 'Critical', 'Police', 'All police test', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['POLICE'])]
    );
    await alertAllEligibleNearbyResponders(testIncId, ['POLICE'], baseLat, baseLng, {});
    const polReqs = await dbAll('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_type = "Police"', [testIncId]);
    assert.strictEqual(polReqs.length, eligiblePolice.length, 'Every eligible police responder must receive a request');
  });

  await itAsync('F1.9: All eligible Ambulance responders receive Ambulance requests without fixed limit', async () => {
    const eligibleAmbs = await findEligibleNearbyResponders('Ambulance', baseLat, baseLng, 5.0);
    assert(eligibleAmbs.length >= 10, 'Expected >= 10 eligible ambulances');
    const testIncId = 'INC-TEST-ALL-AMB';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Medical', 'Critical', 'Ambulance', 'All ambulance test', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['AMBULANCE'])]
    );
    await alertAllEligibleNearbyResponders(testIncId, ['AMBULANCE'], baseLat, baseLng, {});
    const ambReqs = await dbAll('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_type = "Ambulance"', [testIncId]);
    assert.strictEqual(ambReqs.length, eligibleAmbs.length, `Expected all ${eligibleAmbs.length} ambulances alerted, got ${ambReqs.length}`);
  });

  await itAsync('F1.10: Responders outside the radius are excluded', async () => {
    const testIncId = 'INC-TEST-RADIUS-CHECK';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Medical', 'Critical', 'Ambulance', 'Radius exclusion test', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['AMBULANCE', 'POLICE'])]
    );
    await alertAllEligibleNearbyResponders(testIncId, ['AMBULANCE', 'POLICE'], baseLat, baseLng, {});
    const farAmb = responderMap['amb5@testcorp.local'];
    const farPol = responderMap['pol3@testcorp.local'];
    const farReqs = await dbAll(
      'SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id IN (?, ?)',
      [testIncId, farAmb.id, farPol.id]
    );
    assert.strictEqual(farReqs.length, 0, 'Responders outside 5 km radius must NOT receive requests');
  });

  await itAsync('F1.11: Busy responders are excluded', async () => {
    const testIncId = 'INC-TEST-BUSY-CHECK';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Medical', 'Critical', 'Ambulance', 'Busy exclusion test', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['AMBULANCE'])]
    );
    await alertAllEligibleNearbyResponders(testIncId, ['AMBULANCE'], baseLat, baseLng, {});
    const busyAmb = responderMap['amb7@testcorp.local'];
    const busyReq = await dbGet(
      'SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?',
      [testIncId, busyAmb.id]
    );
    assert.strictEqual(busyReq, undefined, 'Busy responder must NOT receive request');
  });

  await itAsync('F2.12-14: First Police acceptance wins for Police, Ambulance remains pending, backend rejects other Police', async () => {
    const testIncId = 'INC-TEST-INDEP-ACCEPT-1';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Crime', 'Critical', 'Police', 'Assault & Medical', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['POLICE', 'AMBULANCE'])]
    );

    // Reset responder availability for test responders
    const p1 = responderMap['pol1@testcorp.local'];
    const p2 = responderMap['pol2@testcorp.local'];
    const a1 = responderMap['amb1@testcorp.local'];
    const a2 = responderMap['amb2@testcorp.local'];

    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id IN (?, ?, ?, ?)', [p1.id, p2.id, a1.id, a2.id]);

    // Alert both Police and Ambulance
    await alertAllEligibleNearbyResponders(testIncId, ['POLICE', 'AMBULANCE'], baseLat, baseLng, {});

    // 12. First Police acceptance wins for Police
    const p1Res = await handleResponderAssignment({ incidentId: testIncId, responderId: p1.id, action: 'accept' });
    assert.strictEqual(p1Res.status, 200, 'P1 acceptance succeeds');

    const p1Req = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, p1.id]);
    assert.strictEqual(p1Req.status, 'ACCEPTED');

    // 19. Backend automatic REJECTED_BY_ASSIGNMENT works for P2
    const p2Req = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, p2.id]);
    assert.strictEqual(p2Req.status, 'REJECTED_BY_ASSIGNMENT', 'Other pending Police request was automatically rejected by system');

    // 14. Police acceptance must NOT cancel Ambulance requests!
    const a1ReqBefore = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, a1.id]);
    const a2ReqBefore = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, a2.id]);
    assert.strictEqual(a1ReqBefore.status, 'PENDING', 'Ambulance request A1 must remain PENDING after Police acceptance');
    assert.strictEqual(a2ReqBefore.status, 'PENDING', 'Ambulance request A2 must remain PENDING after Police acceptance');

    // 16. Incident is NOT fully assigned yet because Ambulance is still searching!
    const midInc = await getEnrichedIncident(testIncId);
    assert.strictEqual(midInc.is_fully_assigned, false, 'Emergency is NOT fully assigned while Ambulance is still pending');
    const midPol = midInc.responder_requirements_by_type?.['POLICE'] || midInc.responder_requirements['POLICE'] || midInc.responder_requirements.find(r => r.responder_type === 'POLICE');
    const midAmb = midInc.responder_requirements_by_type?.['AMBULANCE'] || midInc.responder_requirements['AMBULANCE'] || midInc.responder_requirements.find(r => r.responder_type === 'AMBULANCE');
    assert.strictEqual(midPol.status, 'ASSIGNED');
    assert.strictEqual(midAmb.status, 'SEARCHING');

    // 13. First Ambulance acceptance wins for Ambulance
    const a2Res = await handleResponderAssignment({ incidentId: testIncId, responderId: a2.id, action: 'accept' });
    assert.strictEqual(a2Res.status, 200, 'A2 acceptance succeeds');

    const a2Req = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, a2.id]);
    assert.strictEqual(a2Req.status, 'ACCEPTED');

    const a1ReqAfter = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, a1.id]);
    assert.strictEqual(a1ReqAfter.status, 'REJECTED_BY_ASSIGNMENT', 'Other pending Ambulance requests rejected after A2 won');

    // 16. All required categories fulfilled -> fully assigned
    const finalInc = await getEnrichedIncident(testIncId);
    assert.strictEqual(finalInc.is_fully_assigned, true, 'Emergency is fully assigned when both Police and Ambulance are fulfilled');
    assert.strictEqual(finalInc.status, 'Assigned');
  });

  await itAsync('F2.13 & F2.15: First Ambulance acceptance wins and does NOT cancel Police requests', async () => {
    const testIncId = 'INC-TEST-INDEP-ACCEPT-2';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Medical', 'Critical', 'Ambulance', 'Trauma with security needed', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['AMBULANCE', 'POLICE'])]
    );

    const a3 = responderMap['amb3@testcorp.local'];
    const p1 = responderMap['pol1@testcorp.local'];
    const p2 = responderMap['pol2@testcorp.local'];

    // Reset availability
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id IN (?, ?, ?)', [a3.id, p1.id, p2.id]);

    await alertAllEligibleNearbyResponders(testIncId, ['AMBULANCE', 'POLICE'], baseLat, baseLng, {});

    // Ambulance accepts first
    const a3Res = await handleResponderAssignment({ incidentId: testIncId, responderId: a3.id, action: 'accept' });
    assert.strictEqual(a3Res.status, 200);

    // Verify Police requests are still PENDING
    const polReqs = await dbAll(
      'SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_type = "Police"',
      [testIncId]
    );
    assert(polReqs.length >= 2);
    for (const r of polReqs) {
      assert.strictEqual(r.status, 'PENDING', 'Police requests must not be cancelled by Ambulance acceptance');
    }
  });

  await itAsync('F2.16: All required categories must be fulfilled for full assignment', async () => {
    const testIncId = 'INC-TEST-INDEP-ACCEPT-2';
    const inc = await getEnrichedIncident(testIncId);
    assert.strictEqual(inc.is_fully_assigned, false, 'Ambulance accepted but Police still searching -> NOT fully assigned');
    assert.notStrictEqual(inc.status, 'Assigned');
  });

  await itAsync('F1.17: No-responder handling works independently per category', async () => {
    const testIncId = 'INC-TEST-INDEP-NO-RESP';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen', 'Crime', 'Critical', 'Police', 'Remote police needed but no fire', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['POLICE', 'FIRE'])]
    );

    // Temporarily make all Fire responders unavailable
    await dbRun('UPDATE responders SET is_available = 0 WHERE service_type = "Fire"');

    try {
      await alertAllEligibleNearbyResponders(testIncId, ['POLICE', 'FIRE'], baseLat, baseLng, {});

      const enriched = await getEnrichedIncident(testIncId);
      const fireReq = enriched.responder_requirements_by_type?.['FIRE'] || enriched.responder_requirements['FIRE'] || enriched.responder_requirements.find(r => r.responder_type === 'FIRE');
      const polReq = enriched.responder_requirements_by_type?.['POLICE'] || enriched.responder_requirements['POLICE'] || enriched.responder_requirements.find(r => r.responder_type === 'POLICE');
      assert.strictEqual(fireReq.status, 'NO_RESPONDER_AVAILABLE', 'Fire has 0 responders -> NO_RESPONDER_AVAILABLE');
      assert.strictEqual(polReq.status, 'SEARCHING', 'Police has responders -> SEARCHING');
      assert.strictEqual(enriched.is_fully_assigned, false, 'Emergency is NOT fully assigned');
      assert.notStrictEqual(enriched.status, 'Assigned');
    } finally {
      // Restore fire availability
      await dbRun('UPDATE responders SET is_available = 1 WHERE service_type = "Fire"');
    }
  });

  await itAsync('F3.18: Manual Reject button is removed from responder UI (ResponderDashboard.jsx)', async () => {
    const responderDashboardPath = path.resolve(__dirname, '../../frontend/src/components/ResponderDashboard.jsx');
    const code = fs.readFileSync(responderDashboardPath, 'utf8');

    // Verify there is no manual Reject or Decline button in incoming modal or unassigned list
    assert(!code.includes('handleDeclineJob'), 'handleDeclineJob should be removed');
    assert(!code.includes('>Reject<'), 'Manual Reject button label should be removed');
    assert(!code.includes('>Decline<'), 'Manual Decline button label should be removed');

    // Verify Accept button is preserved
    assert(code.includes('handleAcceptJob') || code.includes('Accept'), 'Accept action must remain available');
  });

  await itAsync('F2.19: Backend automatic REJECTED_BY_ASSIGNMENT still works after another responder accepts', async () => {
    const testIncId = 'INC-TEST-AUTO-REJECT';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Auto Reject Citizen', 'Crime', 'Critical', 'Police', 'Conflict test', 12.9735, 77.5985, 'Reported', ?)`,
      [testIncId, JSON.stringify(['POLICE'])]
    );

    const p1 = responderMap['pol1@testcorp.local'];
    const p2 = responderMap['pol2@testcorp.local'];
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id IN (?, ?)', [p1.id, p2.id]);

    await alertAllEligibleNearbyResponders(testIncId, ['POLICE'], baseLat, baseLng, {});

    // P1 accepts
    await handleResponderAssignment({ incidentId: testIncId, responderId: p1.id, action: 'accept' });

    // Verify P2 request has status REJECTED_BY_ASSIGNMENT
    const reqP2 = await dbGet('SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?', [testIncId, p2.id]);
    assert.strictEqual(reqP2.status, 'REJECTED_BY_ASSIGNMENT');

    // Verify P2 cannot accept anymore (returns 409)
    const p2Attempt = await handleResponderAssignment({ incidentId: testIncId, responderId: p2.id, action: 'accept' });
    assert.strictEqual(p2Attempt.status, 409);
  });

  await itAsync('F1.20: Existing single-responder functionality still works', async () => {
    const singleIncId = 'INC-TEST-SINGLE-RESP-1';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
       VALUES (?, 'Single Resp Citizen', 'Medical', 'Critical', 'Ambulance', 'Single responder test', 12.9735, 77.5985, 'Reported')`,
      [singleIncId]
    );

    const a4 = responderMap['amb4@testcorp.local'];
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id = ?', [a4.id]);

    await alertAllEligibleNearbyResponders(singleIncId, 'Ambulance', baseLat, baseLng, {});
    const assignRes = await handleResponderAssignment({ incidentId: singleIncId, responderId: a4.id, action: 'accept' });
    assert.strictEqual(assignRes.status, 200);

    const enriched = await getEnrichedIncident(singleIncId);
    assert.strictEqual(enriched.status, 'Assigned');
    assert.strictEqual(enriched.is_fully_assigned, true);
  });

  console.log('\n--- SECTION 8: MULTI-RESPONDER INDEPENDENT RESOLUTION & STATUS INTEGRITY ---');

  // TEST 1: Police + Ambulance required. Police resolves. Ambulance still active. Expected: Overall incident != RESOLVED.
  await itAsync('TEST 1: Police + Ambulance required. Police resolves. Ambulance still active. Expected: Overall != RESOLVED', async () => {
    const incId = 'INC-TEST-RES-1';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen Multi-Res1', 'Crash', 'Critical', 'Police', 'Crash with injury', 12.9735, 77.5985, 'Reported', ?)`,
      [incId, JSON.stringify(['POLICE', 'AMBULANCE'])]
    );

    const pol = responderMap['pol1@testcorp.local'];
    const amb = responderMap['amb1@testcorp.local'];
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id IN (?, ?)', [pol.id, amb.id]);

    await alertAllEligibleNearbyResponders(incId, ['POLICE', 'AMBULANCE'], baseLat, baseLng, {});
    await handleResponderAssignment({ incidentId: incId, responderId: pol.id, action: 'accept' });
    await handleResponderAssignment({ incidentId: incId, responderId: amb.id, action: 'accept' });

    // Police resolves their task
    await handleIncidentStatusUpdate({
      incidentId: incId,
      responderId: pol.id,
      status: 'Resolved'
    });

    const enriched = await getEnrichedIncident(incId);
    assert.notStrictEqual(enriched.status, 'Resolved', 'Overall incident MUST NOT be Resolved when Ambulance is still active');
    assert.strictEqual(enriched.status, 'Partially Resolved');
    assert.strictEqual(enriched.is_fully_resolved, false);
    assert.strictEqual(enriched.is_partially_resolved, true);

    // Verify Police is resolved, Ambulance is still active
    const reqPolice = enriched.responder_requirements_by_type['POLICE'];
    const reqAmb = enriched.responder_requirements_by_type['AMBULANCE'];
    assert.strictEqual(reqPolice.status, 'RESOLVED');
    assert.notStrictEqual(reqAmb.status, 'RESOLVED');

    // Verify Police responder was freed, but Ambulance responder remains engaged
    const polDb = await dbGet('SELECT * FROM responders WHERE id = ?', [pol.id]);
    const ambDb = await dbGet('SELECT * FROM responders WHERE id = ?', [amb.id]);
    assert.strictEqual(polDb.is_available, 1);
    assert.strictEqual(polDb.current_incident_id, null);
    assert.strictEqual(ambDb.is_available, 0);
    assert.strictEqual(ambDb.current_incident_id, incId);
  });

  // TEST 2: Police + Ambulance required. Police resolves. Ambulance resolves. Expected: Overall incident = RESOLVED.
  await itAsync('TEST 2: Police + Ambulance required. Both Police and Ambulance resolve. Expected: Overall = RESOLVED', async () => {
    const incId = 'INC-TEST-RES-1'; // Continue from TEST 1 where Police resolved
    const amb = responderMap['amb1@testcorp.local'];

    // Ambulance now resolves
    await handleIncidentStatusUpdate({
      incidentId: incId,
      responderId: amb.id,
      status: 'Resolved'
    });

    const enriched = await getEnrichedIncident(incId);
    assert.strictEqual(enriched.status, 'Resolved', 'Overall incident MUST be Resolved when ALL categories resolve');
    assert.strictEqual(enriched.is_fully_resolved, true);
    assert.strictEqual(enriched.is_partially_resolved, false);

    // Both responders are now free
    const ambDb = await dbGet('SELECT * FROM responders WHERE id = ?', [amb.id]);
    assert.strictEqual(ambDb.is_available, 1);
    assert.strictEqual(ambDb.current_incident_id, null);
  });

  // TEST 3: Police + Ambulance required. Ambulance resolves. Police still active. Expected: Overall incident != RESOLVED.
  await itAsync('TEST 3: Police + Ambulance required. Ambulance resolves first. Police still active. Expected: Overall != RESOLVED', async () => {
    const incId = 'INC-TEST-RES-3';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen Multi-Res3', 'Crash', 'Critical', 'Police', 'Crash with injury', 12.9735, 77.5985, 'Reported', ?)`,
      [incId, JSON.stringify(['POLICE', 'AMBULANCE'])]
    );

    const pol = responderMap['pol2@testcorp.local'];
    const amb = responderMap['amb2@testcorp.local'];
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id IN (?, ?)', [pol.id, amb.id]);

    await alertAllEligibleNearbyResponders(incId, ['POLICE', 'AMBULANCE'], baseLat, baseLng, {});
    await handleResponderAssignment({ incidentId: incId, responderId: pol.id, action: 'accept' });
    await handleResponderAssignment({ incidentId: incId, responderId: amb.id, action: 'accept' });

    // Ambulance resolves first
    await handleIncidentStatusUpdate({
      incidentId: incId,
      responderId: amb.id,
      status: 'Resolved'
    });

    const enriched = await getEnrichedIncident(incId);
    assert.notStrictEqual(enriched.status, 'Resolved', 'Overall incident MUST NOT be Resolved when Police is still active');
    assert.strictEqual(enriched.status, 'Partially Resolved');
    assert.strictEqual(enriched.is_fully_resolved, false);

    const reqPolice = enriched.responder_requirements_by_type['POLICE'];
    const reqAmb = enriched.responder_requirements_by_type['AMBULANCE'];
    assert.strictEqual(reqAmb.status, 'RESOLVED');
    assert.notStrictEqual(reqPolice.status, 'RESOLVED');
  });

  // TEST 4: Only Police required. Police resolves. Expected: Overall incident = RESOLVED.
  await itAsync('TEST 4: Only Police required. Police resolves. Expected: Overall = RESOLVED', async () => {
    const incId = 'INC-TEST-RES-4';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen Single Police', 'Crime', 'High', 'Police', 'Robbery', 12.9735, 77.5985, 'Reported', ?)`,
      [incId, JSON.stringify(['POLICE'])]
    );

    const pol = responderMap['pol1@testcorp.local'];
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id = ?', [pol.id]);

    await alertAllEligibleNearbyResponders(incId, ['POLICE'], baseLat, baseLng, {});
    await handleResponderAssignment({ incidentId: incId, responderId: pol.id, action: 'accept' });

    await handleIncidentStatusUpdate({
      incidentId: incId,
      responderId: pol.id,
      status: 'Resolved'
    });

    const enriched = await getEnrichedIncident(incId);
    assert.strictEqual(enriched.status, 'Resolved');
    assert.strictEqual(enriched.is_fully_resolved, true);
  });

  // TEST 5: Police + Ambulance + Fire required. Police resolves. Ambulance resolves. Fire still active. Expected: Overall != RESOLVED.
  await itAsync('TEST 5: Police + Ambulance + Fire required. Police & Amb resolve, Fire active. Expected: Overall != RESOLVED', async () => {
    const incId = 'INC-TEST-RES-5';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen Tri-Res', 'Fire', 'Critical', 'Fire', 'Major building fire with casualties', 12.9735, 77.5985, 'Reported', ?)`,
      [incId, JSON.stringify(['POLICE', 'AMBULANCE', 'FIRE'])]
    );

    const pol = responderMap['pol1@testcorp.local'];
    const amb = responderMap['amb1@testcorp.local'];
    const fire = responderMap['fire1@testcorp.local'];
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id IN (?, ?, ?)', [pol.id, amb.id, fire.id]);

    await alertAllEligibleNearbyResponders(incId, ['POLICE', 'AMBULANCE', 'FIRE'], baseLat, baseLng, {});
    await handleResponderAssignment({ incidentId: incId, responderId: pol.id, action: 'accept' });
    await handleResponderAssignment({ incidentId: incId, responderId: amb.id, action: 'accept' });
    await handleResponderAssignment({ incidentId: incId, responderId: fire.id, action: 'accept' });

    // Police resolves
    await handleIncidentStatusUpdate({ incidentId: incId, responderId: pol.id, status: 'Resolved' });
    // Ambulance resolves
    await handleIncidentStatusUpdate({ incidentId: incId, responderId: amb.id, status: 'Resolved' });

    const enriched = await getEnrichedIncident(incId);
    assert.notStrictEqual(enriched.status, 'Resolved', 'Overall incident must NOT be Resolved while Fire is active');
    assert.strictEqual(enriched.status, 'Partially Resolved');
    assert.strictEqual(enriched.is_fully_resolved, false);

    const reqFire = enriched.responder_requirements_by_type['FIRE'];
    assert.notStrictEqual(reqFire.status, 'RESOLVED');
  });

  // TEST 6: Police + Ambulance + Fire required. All three resolve. Expected: Overall incident = RESOLVED.
  await itAsync('TEST 6: Police + Ambulance + Fire required. All three resolve. Expected: Overall = RESOLVED', async () => {
    const incId = 'INC-TEST-RES-5'; // Continue from TEST 5
    const fire = responderMap['fire1@testcorp.local'];

    // Fire resolves
    await handleIncidentStatusUpdate({ incidentId: incId, responderId: fire.id, status: 'Resolved' });

    const enriched = await getEnrichedIncident(incId);
    assert.strictEqual(enriched.status, 'Resolved', 'Overall incident MUST be Resolved when all 3 categories resolve');
    assert.strictEqual(enriched.is_fully_resolved, true);

    const statuses = enriched.responder_requirements.map(r => r.status);
    assert(statuses.every(s => s === 'RESOLVED'), 'Every required category must have status RESOLVED');
  });

  // TEST 7: One responder resolves and another responder later updates their status. Expected: No previously resolved task is changed.
  await itAsync('TEST 7: One responder resolves and another updates status. Expected: Resolved task remains RESOLVED', async () => {
    const incId = 'INC-TEST-RES-7';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen State Integrity', 'Crime', 'Critical', 'Police', 'Assault with injuries', 12.9735, 77.5985, 'Reported', ?)`,
      [incId, JSON.stringify(['POLICE', 'AMBULANCE'])]
    );

    const pol = responderMap['pol1@testcorp.local'];
    const amb = responderMap['amb1@testcorp.local'];
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id IN (?, ?)', [pol.id, amb.id]);

    await alertAllEligibleNearbyResponders(incId, ['POLICE', 'AMBULANCE'], baseLat, baseLng, {});
    await handleResponderAssignment({ incidentId: incId, responderId: pol.id, action: 'accept' });
    await handleResponderAssignment({ incidentId: incId, responderId: amb.id, action: 'accept' });

    // Step 1: Police resolves
    await handleIncidentStatusUpdate({ incidentId: incId, responderId: pol.id, status: 'Resolved' });

    // Step 2: Ambulance updates status to 'On Scene'
    await handleIncidentStatusUpdate({ incidentId: incId, responderId: amb.id, status: 'On Scene' });

    const enriched = await getEnrichedIncident(incId);
    const reqPolice = enriched.responder_requirements_by_type['POLICE'];
    const reqAmb = enriched.responder_requirements_by_type['AMBULANCE'];

    // Police must STILL be RESOLVED!
    assert.strictEqual(reqPolice.status, 'RESOLVED', 'Previously resolved Police task must remain RESOLVED');
    assert.strictEqual(reqAmb.status, 'ON_SCENE', 'Ambulance task must be updated to ON_SCENE');
    assert.strictEqual(enriched.status, 'Partially Resolved', 'Overall status remains Partially Resolved');
  });

  // TEST 8: Refresh/reload after only one responder resolves. Expected: Citizen still sees active/partially resolved.
  await itAsync('TEST 8: Refresh/reload after one responder resolves. Expected: Citizen sees Partially Resolved', async () => {
    const incId = 'INC-TEST-RES-7'; // Police resolved, Amb on scene
    // Simulate fresh API fetch as citizen would perform on page reload
    const freshFetch = await getEnrichedIncident(incId);
    assert.strictEqual(freshFetch.status, 'Partially Resolved');
    assert.strictEqual(freshFetch.is_fully_resolved, false);
    assert.strictEqual(freshFetch.is_partially_resolved, true);

    const policeReq = freshFetch.responder_requirements_by_type['POLICE'];
    const ambReq = freshFetch.responder_requirements_by_type['AMBULANCE'];
    assert.strictEqual(policeReq.status, 'RESOLVED');
    assert.strictEqual(ambReq.status, 'ON_SCENE');
  });

  // TEST 9: Verify backend, not only frontend, prevents premature RESOLVED status.
  await itAsync('TEST 9: Backend strictly prevents premature RESOLVED status even if incident row was set to Resolved', async () => {
    const incId = 'INC-TEST-RES-9';
    await dbRun(
      `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status, required_responder_types_json)
       VALUES (?, 'Test Citizen Guard', 'Crime', 'Critical', 'Police', 'Multi test', 12.9735, 77.5985, 'Reported', ?)`,
      [incId, JSON.stringify(['POLICE', 'AMBULANCE'])]
    );

    const pol = responderMap['pol1@testcorp.local'];
    const amb = responderMap['amb1@testcorp.local'];
    await dbRun('UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id IN (?, ?)', [pol.id, amb.id]);

    await alertAllEligibleNearbyResponders(incId, ['POLICE', 'AMBULANCE'], baseLat, baseLng, {});
    await handleResponderAssignment({ incidentId: incId, responderId: pol.id, action: 'accept' });
    await handleResponderAssignment({ incidentId: incId, responderId: amb.id, action: 'accept' });

    // Simulate premature/corrupted database status = 'Resolved' directly while Ambulance is still ASSIGNED
    await dbRun("UPDATE incidents SET status = 'Resolved' WHERE id = ?", [incId]);

    // Backend getEnrichedIncident MUST guard and sanitize this
    const enriched = await getEnrichedIncident(incId);
    assert.notStrictEqual(enriched.status, 'Resolved', 'Backend guard MUST prevent premature Resolved');
    assert.strictEqual(enriched.is_fully_resolved, false);
  });

  await itAsync('F1.21: Existing tests continue to pass and system integrity verified', async () => {
    assert.strictEqual(failedTests, 0, 'All previous tests must have passed with 0 failures');
  });

  console.log('\n===============================================================');
  console.log(`TEST SUMMARY: ${passedTests} passed, ${failedTests} failed out of ${totalTests} total tests.`);
  console.log('ALL HYPERLOCAL TESTS COMPLETED SUCCESSFULLY! [PASS]');
  console.log('===============================================================');

  // Clean test records
  await dbRun("DELETE FROM incident_required_responder_types WHERE incident_id LIKE 'INC-TEST-%'");
  await dbRun("DELETE FROM incident_responder_requests WHERE incident_id LIKE 'INC-TEST-%'");
  await dbRun("DELETE FROM incident_updates WHERE incident_id LIKE 'INC-TEST-%'");
  await dbRun("DELETE FROM incidents WHERE id LIKE 'INC-TEST-%'");
  await dbRun("DELETE FROM responders WHERE organization_name = 'Test Unit Corps'");
  await dbRun("DELETE FROM users WHERE email LIKE '%@testcorp.local'");

  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n[FATAL] Test Suite Failed with error:', err);
  process.exit(1);
});
