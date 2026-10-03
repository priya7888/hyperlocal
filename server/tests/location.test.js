const assert = require('assert');
const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:5000/api';

async function testLocationFeatures() {
  console.log('========================================================');
  console.log('TESTING AUTOMATIC LOCATION CAPTURE & INCIDENT MAPPING');
  console.log('========================================================');

  // 1. Authenticate demo citizen to get token
  console.log('\n[Test 1] Authenticating demo citizen...');
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'citizen@demo.com',
    password: 'password123'
  });
  assert(loginRes.data.token, 'Token must be returned');
  const token = loginRes.data.token;
  const authHeaders = { Authorization: `Bearer ${token}` };
  console.log('[PASS] Demo citizen authenticated successfully.');

  // 2. Test Reverse Geocoding
  console.log('\n[Test 2] Testing Reverse Geocoding API (/api/geocode/reverse)...');
  const testLat = 17.3850;
  const testLng = 78.4867;
  const geoRes = await axios.get(`${BASE_URL}/geocode/reverse?lat=${testLat}&lng=${testLng}`);
  assert(geoRes.data.success, 'Reverse geocode should be successful');
  assert(geoRes.data.address, 'Address must be returned');
  console.log(`[PASS] Reverse geocoded (${testLat}, ${testLng}) to: "${geoRes.data.address}"`);

  // 3. Test Invalid Coordinates Validation (Boundary checks: lat -90 to 90, lng -180 to 180)
  console.log('\n[Test 3] Testing Coordinate & Required Field Validations...');
  
  // Case A: Latitude > 90
  try {
    await axios.post(
      `${BASE_URL}/incidents`,
      {
        emergency_type: 'Medical',
        description: 'Test invalid latitude',
        checklist: ['Person injured'],
        lat: 95.0,
        lng: 78.4867
      },
      { headers: authHeaders }
    );
    assert.fail('Should have failed for lat > 90');
  } catch (err) {
    assert.strictEqual(err.response.status, 400);
    console.log('[PASS] Rejected lat > 90 (HTTP 400: ' + err.response.data.error + ')');
  }

  // Case B: Longitude > 180
  try {
    await axios.post(
      `${BASE_URL}/incidents`,
      {
        emergency_type: 'Medical',
        description: 'Test invalid longitude',
        checklist: ['Person injured'],
        lat: 17.3850,
        lng: 200.0
      },
      { headers: authHeaders }
    );
    assert.fail('Should have failed for lng > 180');
  } catch (err) {
    assert.strictEqual(err.response.status, 400);
    console.log('[PASS] Rejected lng > 180 (HTTP 400: ' + err.response.data.error + ')');
  }

  // Case C: Missing coordinates
  try {
    await axios.post(
      `${BASE_URL}/incidents`,
      {
        emergency_type: 'Medical',
        description: 'Missing coords',
        checklist: ['Person injured']
      },
      { headers: authHeaders }
    );
    assert.fail('Should have failed for missing coords');
  } catch (err) {
    assert.strictEqual(err.response.status, 400);
    console.log('[PASS] Rejected missing coordinates (HTTP 400)');
  }

  // Case D: Missing / empty description
  try {
    await axios.post(
      `${BASE_URL}/incidents`,
      {
        emergency_type: 'Medical',
        description: '   ',
        checklist: ['Person injured'],
        lat: 17.3850,
        lng: 78.4867
      },
      { headers: authHeaders }
    );
    assert.fail('Should have failed for empty description');
  } catch (err) {
    assert.strictEqual(err.response.status, 400);
    console.log('[PASS] Rejected empty description (HTTP 400: ' + err.response.data.error + ')');
  }

  // 4. Test Valid Incident Submission with Coordinates, Accuracy, Timestamp & Address
  console.log('\n[Test 4] Submitting Incident with Location & Metadata...');
  const accurateLat = 17.4455;
  const accurateLng = 78.3772; // HITEC City, Hyderabad
  const locationAccuracy = 14.5;
  const locationCapturedAt = new Date().toISOString();
  const address = "HITEC City Main Rd, Madhapur, Hyderabad, Telangana";

  const submitRes = await axios.post(
    `${BASE_URL}/incidents`,
    {
      emergency_type: 'Medical',
      description: 'Patient experiencing chest pains near metro station',
      checklist: ['Person injured'],
      lat: accurateLat,
      lng: accurateLng,
      location_accuracy: locationAccuracy,
      location_captured_at: locationCapturedAt,
      address: address
    },
    { headers: authHeaders }
  );

  assert(submitRes.data.success, 'Incident creation must succeed');
  const incident = submitRes.data.incident;
  assert(incident.id, 'Incident ID must exist');
  assert.strictEqual(incident.lat, accurateLat, 'Stored lat must match');
  assert.strictEqual(incident.lng, accurateLng, 'Stored lng must match');
  assert.strictEqual(incident.address, address, 'Stored address must match');
  assert.strictEqual(incident.location_accuracy, locationAccuracy, 'Stored accuracy must match');
  console.log(`[PASS] Incident ${incident.id} created successfully with coordinates (${incident.lat}, ${incident.lng})`);

  // 5. Test Creating a Gas Leak Incident
  console.log('\n[Test 5] Submitting Gas Leak Incident (Feature 2 requirement)...');
  const gasLeakLat = 17.4399;
  const gasLeakLng = 78.4983;
  const gasLeakRes = await axios.post(
    `${BASE_URL}/incidents`,
    {
      emergency_type: 'Gas Leak',
      severity: 'Critical',
      description: 'Pungent gas smell leaking from pipeline near industrial gate',
      checklist: ['Other emergency'],
      lat: gasLeakLat,
      lng: gasLeakLng,
      location_accuracy: 10.0,
      location_captured_at: new Date().toISOString(),
      address: 'Industrial Sector 4, Secunderabad, Telangana'
    },
    { headers: authHeaders }
  );
  assert(gasLeakRes.data.success, 'Gas leak creation must succeed');
  const gasIncident = gasLeakRes.data.incident;
  assert.strictEqual(gasIncident.emergency_type, 'Gas Leak');
  assert.strictEqual(gasIncident.lat, gasLeakLat);
  assert.strictEqual(gasIncident.lng, gasLeakLng);
  console.log(`[PASS] Gas Leak incident ${gasIncident.id} created successfully.`);

  // 6. Test Retrieving Incidents & Map Data (/api/incidents)
  console.log('\n[Test 6] Verifying Incident List & Map Data (/api/incidents)...');
  const listRes = await axios.get(`${BASE_URL}/incidents`, { headers: authHeaders });
  const allIncidents = listRes.data;
  assert(allIncidents.length >= 2, 'Should have multiple incidents');
  
  const foundMedical = allIncidents.find(i => i.id === incident.id);
  assert(foundMedical, 'Created medical incident must be in list');
  assert.strictEqual(foundMedical.lat, accurateLat);
  assert.strictEqual(foundMedical.lng, accurateLng);

  const foundGas = allIncidents.find(i => i.id === gasIncident.id);
  assert(foundGas, 'Created gas leak incident must be in list');
  assert.strictEqual(foundGas.lat, gasLeakLat);
  assert.strictEqual(foundGas.lng, gasLeakLng);
  console.log(`[PASS] Verified incidents retrieved with valid map coordinates.`);

  // 7. Test Responders Endpoint (/api/responders)
  console.log('\n[Test 7] Verifying Responders List for Map Markers (/api/responders)...');
  const respRes = await axios.get(`${BASE_URL}/responders`, { headers: authHeaders });
  const responders = respRes.data;
  assert(Array.isArray(responders), 'Responders must be an array');
  assert(responders.length > 0, 'Responders list should not be empty');
  
  const sampleResp = responders[0];
  assert(typeof sampleResp.lat === 'number', 'Responder must have latitude');
  assert(typeof sampleResp.lng === 'number', 'Responder must have longitude');
  assert(sampleResp.service_type, 'Responder must have service_type');
  console.log(`[PASS] Verified ${responders.length} responders retrieved with GPS locations (Sample: ${sampleResp.full_name}, ${sampleResp.service_type} at ${sampleResp.lat}, ${sampleResp.lng})`);

  // 8. Test Filtering Logic (Simulating IncidentMonitoringMap filters)
  console.log('\n[Test 8] Testing Filter Logic (ALL, FIRE, MEDICAL, ACCIDENT, GAS LEAK, SECURITY)...');
  
  const allFilter = allIncidents;
  assert(allFilter.length > 0, 'ALL filter returns all incidents');

  const medicalFilter = allIncidents.filter(i => (i.emergency_type || '').toLowerCase().includes('medic'));
  assert(medicalFilter.length > 0, 'MEDICAL filter returns medical incidents');

  const gasFilter = allIncidents.filter(i => (i.emergency_type || '').toLowerCase().includes('gas'));
  assert(gasFilter.length > 0, 'GAS LEAK filter returns gas leak incidents');

  console.log(`[PASS] Filter counts: Total: ${allFilter.length}, Medical: ${medicalFilter.length}, Gas Leak: ${gasFilter.length}`);

  console.log('\n========================================================');
  console.log('ALL LOCATION, MAPPING & MONITORING TESTS PASSED! [SUCCESS]');
  console.log('========================================================');
}

testLocationFeatures().catch((err) => {
  console.error('Test Failed:', err.message, err.response?.data || '');
  process.exit(1);
});
