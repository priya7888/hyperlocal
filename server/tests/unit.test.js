const assert = require('assert');
const {
  calculateHaversineDistance,
  estimateTravelTime,
  classifyEmergencyAndSeverity,
  checkDuplicateIncident
} = require('../ruleEngine');
const { initDB, dbRun } = require('../db');

async function runUnitTests() {
  console.log('====================================================');
  console.log('RUNNING UNIT TESTS FOR EMERGENCY CORE LOGIC');
  console.log('====================================================');

  // Test 1: Haversine Distance
  console.log('\n[Unit Test 1] Haversine Distance Calculation...');
  const dist = calculateHaversineDistance(12.9716, 77.5946, 12.9760, 77.6010);
  assert(dist.km > 0.5 && dist.km < 1.5, `Distance was ${dist.km} km`);
  assert(dist.meters > 500 && dist.meters < 1500);
  console.log(`[PASS] Distance computed: ${dist.km} km (${dist.meters} meters)`);

  // Test 2: ETA Travel Time
  console.log('\n[Unit Test 2] ETA Travel Time Estimation...');
  const eta = estimateTravelTime(2.5); // 2.5 km
  assert(eta.minutes >= 3 && eta.minutes <= 8);
  console.log(`[PASS] ETA for 2.5 km is estimated at ${eta.minutes} mins (${eta.seconds}s)`);

  // Test 3: Classification Rules
  console.log('\n[Unit Test 3] Classification & Severity Rules Engine...');
  
  // Medical Critical
  const med = classifyEmergencyAndSeverity('Medical', 'Victim fell from height and is unconscious', ['Person unconscious']);
  assert.strictEqual(med.suggested_service, 'Ambulance');
  assert.strictEqual(med.severity, 'Critical');
  console.log(`[PASS] Medical triage: ${med.suggested_service}, Severity: ${med.severity}`);

  // Fire Critical
  const fire = classifyEmergencyAndSeverity('Fire', 'Thick black smoke and flames on 3rd floor', ['Fire or smoke', 'Immediate danger']);
  assert.strictEqual(fire.suggested_service, 'Fire');
  assert.strictEqual(fire.severity, 'Critical');
  console.log(`[PASS] Fire triage: ${fire.suggested_service}, Severity: ${fire.severity}`);

  // Crime/Police
  const crime = classifyEmergencyAndSeverity('Crime', 'Armed robbery in progress at store', []);
  assert.strictEqual(crime.suggested_service, 'Police');
  console.log(`[PASS] Crime triage: ${crime.suggested_service}, Severity: ${crime.severity}`);

  // Fire/Rescue triage (Ambulance, Police, Fire)
  const flood = classifyEmergencyAndSeverity('Fire', 'Thick smoke and 4 people trapped on roof', ['Person trapped']);
  assert.strictEqual(flood.suggested_service, 'Fire');
  assert.strictEqual(flood.severity, 'Critical');
  console.log(`[PASS] Trapped person triage: ${flood.suggested_service}, Severity: ${flood.severity}`);

  // Test 4: Duplicate Detection & Merge Logic
  console.log('\n[Unit Test 4] Duplicate Incident Detection...');
  await initDB();
  
  // Insert test primary incident
  const testId = `INC-TEST-${Date.now()}`;
  await dbRun(
    `INSERT INTO incidents (id, citizen_name, emergency_type, severity, suggested_service, description, lat, lng, status)
     VALUES (?, 'Test User', 'Crash', 'Critical', 'Ambulance', 'Vehicle collision on main road', 12.9750, 77.5950, 'Reported')`,
    [testId]
  );

  // Check duplicate within 50 meters
  const dupResult = await checkDuplicateIncident('Crash', 12.9752, 77.5951, 600, 200);
  assert.strictEqual(dupResult.isDuplicate, true);
  assert(dupResult.parentIncident.id.startsWith('INC-TEST-'));
  console.log(`[PASS] Duplicate detected within ${dupResult.distanceMeters}m and mapped to parent ${dupResult.parentIncident.id}`);

  // Cleanup test records
  await dbRun("DELETE FROM incidents WHERE id LIKE 'INC-TEST-%'");

  // Check non-duplicate far away (e.g. 5 km away)
  const nonDup = await checkDuplicateIncident('Crash', 13.0200, 77.6500, 600, 200);
  assert.strictEqual(nonDup.isDuplicate, false);
  console.log(`[PASS] Far-away incident correctly identified as non-duplicate.`);

  console.log('\n====================================================');
  console.log('ALL UNIT TESTS PASSED SUCCESSFULLY! [SUCCESS]');
  console.log('====================================================');
  process.exit(0);
}

runUnitTests().catch((err) => {
  console.error('Unit Test Failure:', err);
  process.exit(1);
});
