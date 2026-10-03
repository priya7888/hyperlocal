const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const { initDB, dbRun, dbGet, dbAll } = require('./db');
const seedDatabase = require('./seed');
const {
  calculateHaversineDistance,
  estimateTravelTime,
  fetchOsrmRoute,
  checkDuplicateIncident,
  classifyEmergencyAndSeverity,
  findRankedResponders,
  findEligibleNearbyResponders,
  normalizeResponderType,
  mapToServiceType
} = require('./ruleEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'hyperlocal-secret-key-socket-2026';

// Configurable Hyperlocal Responder Parameters
const NEARBY_RESPONDER_RADIUS_KM = parseFloat(process.env.NEARBY_RESPONDER_RADIUS_KM || '5.0');
const EXPANDED_RADIUS_KM = parseFloat(process.env.EXPANDED_RADIUS_KM || '10.0');
const RESPONDER_REQUEST_TIMEOUT_SECONDS = parseInt(process.env.RESPONDER_REQUEST_TIMEOUT_SECONDS || '120', 10);
const ENABLE_RADIUS_EXPANSION = process.env.ENABLE_RADIUS_EXPANSION !== 'false';

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    platform: 'Hyperlocal Emergency Response',
    config: {
      nearbyRadiusKm: NEARBY_RESPONDER_RADIUS_KM,
      expandedRadiusKm: EXPANDED_RADIUS_KM,
      timeoutSeconds: RESPONDER_REQUEST_TIMEOUT_SECONDS
    }
  });
});

// In-memory registry of active dispatch countdown timers: incidentId -> timeout timer
const activeDispatchTimers = new Map();

function clearIncidentTimer(incidentId) {
  if (activeDispatchTimers.has(incidentId)) {
    clearTimeout(activeDispatchTimers.get(incidentId));
    activeDispatchTimers.delete(incidentId);
  }
}
const clearDispatchTimer = clearIncidentTimer; // backward-compatibility alias

// ================= AUTH MIDDLEWARE =================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = { id: 9999, full_name: 'Guest Citizen', role: 'citizen', phone: '+91 90000 00000', isGuest: true };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = { id: 9999, full_name: 'Guest Citizen', role: 'citizen', phone: '+91 90000 00000', isGuest: true };
      return next();
    }
    req.user = user;
    next();
  });
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires one of roles: ${roles.join(', ')}` });
    }
    next();
  };
}

// Audit Logger
async function logAudit(userId, userName, action, incidentId, details, req) {
  try {
    const ip = req ? req.ip || req.connection.remoteAddress : '127.0.0.1';
    await dbRun(
      `INSERT INTO audit_logs (user_id, user_name, action, incident_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId || null, userName || 'System', action, incidentId || null, details || null, ip]
    );
  } catch (e) {
    console.warn('Audit log error:', e.message);
  }
}

// ================= HYPERLOCAL RESPONDER ALERT & REQUEST ENGINE =================

// Helper to fetch full enriched incident including required responder types, statuses, and assigned responders
async function getEnrichedIncident(incidentId) {
  const inc = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
  if (!inc) return null;
  inc.checklist = JSON.parse(inc.checklist_json || '[]');

  const reqRows = await dbAll(
    'SELECT * FROM incident_required_responder_types WHERE incident_id = ? ORDER BY id ASC',
    [incidentId]
  );

  let requiredTypes = [];
  if (reqRows && reqRows.length > 0) {
    requiredTypes = reqRows.map(r => r.responder_type);
  } else if (inc.required_responder_types_json) {
    try {
      requiredTypes = JSON.parse(inc.required_responder_types_json || '[]');
    } catch (e) {
      requiredTypes = [];
    }
  }
  if (!requiredTypes || requiredTypes.length === 0) {
    requiredTypes = [normalizeResponderType(inc.suggested_service) || 'AMBULANCE'];
  }

  inc.requiredResponderTypes = requiredTypes;
  inc.required_responder_types = requiredTypes;

  const requirements = [];
  let fullyAssigned = reqRows.length > 0;
  let fullyResolved = reqRows.length > 0;
  let anyResolved = false;
  let anyActive = false;
  let allNoResponder = reqRows.length > 0;

  for (const row of reqRows) {
    let assignedResp = null;
    if (row.assigned_responder_id) {
      assignedResp = await dbGet(
        `SELECT r.*, u.full_name, u.phone, u.email
         FROM responders r JOIN users u ON r.user_id = u.id
         WHERE r.id = ?`,
        [row.assigned_responder_id]
      );
    }

    const isAssignedOrHigher = ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED'].includes(row.status);
    if (!isAssignedOrHigher) {
      fullyAssigned = false;
    }

    if (row.status === 'RESOLVED') {
      anyResolved = true;
    } else {
      fullyResolved = false;
      if (row.status !== 'NO_RESPONDER_AVAILABLE') {
        anyActive = true;
      }
    }

    if (row.status !== 'NO_RESPONDER_AVAILABLE') {
      allNoResponder = false;
    }

    const item = {
      responder_type: row.responder_type,
      service_type: mapToServiceType(row.responder_type),
      status: row.status, // 'SEARCHING', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED', 'NO_RESPONDER_AVAILABLE'
      assigned_responder_id: row.assigned_responder_id,
      assigned_responder: assignedResp,
      assigned_at: row.assigned_at
    };
    requirements.push(item);
    requirements[row.responder_type] = item;
  }

  const reqByType = {};
  for (const item of requirements) {
    reqByType[item.responder_type] = item;
  }

  inc.responder_requirements = requirements;
  inc.responder_requirements_by_type = reqByType;
  inc.is_fully_assigned = fullyAssigned;
  inc.is_fully_resolved = fullyResolved;
  inc.any_resolved = anyResolved;
  inc.is_partially_resolved = anyResolved && !fullyResolved;

  // CORE RULE & BACKEND SOURCE OF TRUTH:
  // An incident with required responder types is ONLY Resolved if EVERY required category is Resolved.
  // If at least one is Resolved and others are still active -> status is 'Partially Resolved'.
  if (reqRows.length > 0) {
    if (fullyResolved) {
      inc.status = 'Resolved';
    } else if (anyResolved) {
      inc.status = 'Partially Resolved';
    } else if (inc.status === 'Resolved') {
      // Guard against stale/premature DB status: cannot be Resolved if categories are incomplete
      inc.status = fullyAssigned ? 'Assigned' : 'Partially Assigned';
    }
  } else {
    inc.is_fully_resolved = (inc.status === 'Resolved');
  }

  if (inc.assigned_responder_id) {
    inc.assigned_responder = await dbGet(
      `SELECT r.*, u.full_name, u.phone, u.email
       FROM responders r JOIN users u ON r.user_id = u.id
       WHERE r.id = ?`,
      [inc.assigned_responder_id]
    );
  } else {
    const firstAssigned = requirements.find(r => r.assigned_responder);
    if (firstAssigned) {
      inc.assigned_responder = firstAssigned.assigned_responder;
    }
  }

  return inc;
}

/**
 * Alerts ALL eligible registered responders within the configured radius for each required responder type.
 * CRITICAL RULES:
 * 1. Preserves MULTIPLE responder requirements (e.g. POLICE + AMBULANCE).
 * 2. NO ARTIFICIAL LIMIT (No nearest 5, no max 5) - alerts ALL eligible responders in radius.
 * 3. Filters strictly by radius, availability, verification, and valid GPS.
 */
async function alertAllEligibleNearbyResponders(incidentId, requiredService, incidentLat, incidentLng, incidentDetails = {}) {
  clearIncidentTimer(incidentId);

  // Normalize list of required responder services
  let serviceList = [];
  if (Array.isArray(requiredService) && requiredService.length > 0) {
    serviceList = requiredService;
  } else if (incidentDetails.requiredResponderTypes && Array.isArray(incidentDetails.requiredResponderTypes) && incidentDetails.requiredResponderTypes.length > 0) {
    serviceList = incidentDetails.requiredResponderTypes;
  } else if (incidentDetails.required_responder_types && Array.isArray(incidentDetails.required_responder_types) && incidentDetails.required_responder_types.length > 0) {
    serviceList = incidentDetails.required_responder_types;
  } else if (typeof requiredService === 'string' && requiredService.includes(',')) {
    serviceList = requiredService.split(',').map(s => s.trim());
  } else if (requiredService) {
    serviceList = [requiredService];
  } else {
    serviceList = ['Ambulance'];
  }

  let normalizedTypes = Array.from(new Set(serviceList.map(s => normalizeResponderType(s)).filter(Boolean)));
  if (normalizedTypes.length === 0) normalizedTypes = ['AMBULANCE'];

  let totalAlertedAcrossTypes = 0;
  let allTypesNoResponders = true;
  let maxRadiusUsed = NEARBY_RESPONDER_RADIUS_KM;
  const expiresAt = new Date(Date.now() + RESPONDER_REQUEST_TIMEOUT_SECONDS * 1000).toISOString();
  const alertedRespondersAll = [];

  for (const normType of normalizedTypes) {
    const svcName = mapToServiceType(normType);

    // Ensure category row exists in incident_required_responder_types table
    await dbRun(
      `INSERT OR IGNORE INTO incident_required_responder_types
       (incident_id, responder_type, status)
       VALUES (?, ?, 'SEARCHING')`,
      [incidentId, normType]
    );

    // 1. Primary search within configured radius (default 5 km)
    let radiusUsed = NEARBY_RESPONDER_RADIUS_KM;
    let eligibleResponders = await findEligibleNearbyResponders(svcName, incidentLat, incidentLng, radiusUsed);

    // 2. Controlled 1-step radius fallback if 0 responders found initially
    if (eligibleResponders.length === 0 && ENABLE_RADIUS_EXPANSION && EXPANDED_RADIUS_KM > NEARBY_RESPONDER_RADIUS_KM) {
      console.log(`[Hyperlocal Dispatch] No ${svcName} responders within ${NEARBY_RESPONDER_RADIUS_KM}km for ${incidentId}. Expanding to fallback radius ${EXPANDED_RADIUS_KM}km...`);
      radiusUsed = EXPANDED_RADIUS_KM;
      eligibleResponders = await findEligibleNearbyResponders(svcName, incidentLat, incidentLng, radiusUsed);
    }

    if (radiusUsed > maxRadiusUsed) maxRadiusUsed = radiusUsed;

    // 3. If still NO eligible responders available for this category
    if (eligibleResponders.length === 0) {
      console.log(`[Hyperlocal Dispatch] 0 eligible ${svcName} responders found within ${radiusUsed}km for incident ${incidentId}. Setting status to NO_RESPONDER_AVAILABLE.`);
      await dbRun(
        `UPDATE incident_required_responder_types
         SET status = 'NO_RESPONDER_AVAILABLE'
         WHERE incident_id = ? AND responder_type = ? AND status != 'ASSIGNED'`,
        [incidentId, normType]
      );
      continue;
    }

    // Found eligible responders for this category
    allTypesNoResponders = false;
    totalAlertedAcrossTypes += eligibleResponders.length;
    alertedRespondersAll.push(...eligibleResponders);

    console.log(`[Hyperlocal Dispatch] Alerting ALL ${eligibleResponders.length} eligible ${svcName} responders within ${radiusUsed}km for incident ${incidentId} (NO fixed limit applied)`);

    // 4. Create request records and broadcast alert to EVERY eligible responder of this type
    for (const responder of eligibleResponders) {
      await dbRun(
        `INSERT OR IGNORE INTO incident_responder_requests
         (incident_id, responder_id, responder_type, distance_km, status, expires_at)
         VALUES (?, ?, ?, ?, 'PENDING', ?)`,
        [incidentId, responder.id, responder.service_type, responder.distance_km, expiresAt]
      );

      // Alert responder via socket room
      io.to(`responder_${responder.id}`).emit('incoming_job_alert', {
        incidentId,
        emergencyType: incidentDetails.emergency_type || 'Emergency',
        requiredService: svcName,
        responderType: normType,
        severity: incidentDetails.severity || 'Critical',
        shortDescription: incidentDetails.description || '',
        incidentLocation: {
          lat: incidentLat,
          lng: incidentLng,
          address: incidentDetails.address || 'GPS Location'
        },
        distanceKm: responder.distance_km,
        etaMinutes: responder.eta_minutes,
        reportTime: incidentDetails.created_at || new Date().toISOString(),
        timeoutSeconds: RESPONDER_REQUEST_TIMEOUT_SECONDS,
        expiresAt,
        radiusKm: radiusUsed,
        totalAlerted: eligibleResponders.length
      });
    }
  }

  // 5. If ALL categories have NO responders
  if (allTypesNoResponders) {
    await dbRun(
      `UPDATE incidents SET status = 'NO_RESPONDER_AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND assigned_responder_id IS NULL`,
      [incidentId]
    );

    const noRespMsg = `No nearby registered responder is currently available for your emergency. Please contact emergency services directly (112 / 108).`;
    await dbRun(
      `INSERT INTO incident_updates (incident_id, status, note, updated_by_name)
       VALUES (?, 'NO_RESPONDER_AVAILABLE', ?, 'System')`,
      [incidentId, noRespMsg]
    );

    const updated = await getEnrichedIncident(incidentId);
    io.to(`incident_${incidentId}`).emit('incident_status_changed', { incident: updated, note: noRespMsg });
    io.to(`incident_${incidentId}`).emit('no_responders_alert', { incidentId, message: noRespMsg });
    io.to('dispatch_room').emit('incident_status_changed', { incident: updated });
    return { alertedCount: 0, status: 'NO_RESPONDER_AVAILABLE', radiusUsed: maxRadiusUsed };
  }

  // Notify citizen that nearby responders are being contacted
  const searchMsg = `Contacting ${totalAlertedAcrossTypes} nearby eligible responder(s) within ${maxRadiusUsed}km across required services (${normalizedTypes.map(mapToServiceType).join(', ')}). Awaiting acceptance...`;
  io.to(`incident_${incidentId}`).emit('incident_searching_responders', {
    incidentId,
    message: searchMsg,
    totalAlerted: totalAlertedAcrossTypes,
    radiusKm: maxRadiusUsed
  });

  // 6. Expiration timer: mark PENDING requests EXPIRED after timeout
  const timer = setTimeout(async () => {
    try {
      console.log(`[Hyperlocal Dispatch] Request timeout (${RESPONDER_REQUEST_TIMEOUT_SECONDS}s) reached for incident ${incidentId}.`);

      // Expire any requests still in PENDING state
      await dbRun(
        `UPDATE incident_responder_requests
         SET status = 'EXPIRED', responded_at = CURRENT_TIMESTAMP
         WHERE incident_id = ? AND status = 'PENDING'`,
        [incidentId]
      );

      // Also mark searching categories as NO_RESPONDER_AVAILABLE
      await dbRun(
        `UPDATE incident_required_responder_types
         SET status = 'NO_RESPONDER_AVAILABLE'
         WHERE incident_id = ? AND status = 'SEARCHING'`,
        [incidentId]
      );

      // Notify alerted responders of expiration
      for (const responder of alertedRespondersAll) {
        io.to(`responder_${responder.id}`).emit('job_offer_expired', { incidentId });
      }

      // Check if incident has any assigned responders
      const reqRows = await dbAll('SELECT * FROM incident_required_responder_types WHERE incident_id = ?', [incidentId]);
      const hasAnyAssigned = reqRows.some(r => r.status === 'ASSIGNED');

      if (!hasAnyAssigned) {
        await dbRun(
          `UPDATE incidents SET status = 'NO_RESPONDER_AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND assigned_responder_id IS NULL`,
          [incidentId]
        );

        const expMsg = 'No nearby responders accepted the alert within the response window. Please contact emergency services (112).';
        await dbRun(
          `INSERT INTO incident_updates (incident_id, status, note, updated_by_name)
           VALUES (?, 'NO_RESPONDER_AVAILABLE', ?, 'System')`,
          [incidentId, expMsg]
        );

        const updated = await getEnrichedIncident(incidentId);
        io.to(`incident_${incidentId}`).emit('incident_status_changed', { incident: updated, note: expMsg });
        io.to(`incident_${incidentId}`).emit('no_responders_alert', { incidentId, message: expMsg });
        io.to('dispatch_room').emit('incident_status_changed', { incident: updated });
      }
    } catch (e) {
      console.error('Error handling dispatch expiration:', e);
    }
  }, RESPONDER_REQUEST_TIMEOUT_SECONDS * 1000);

  activeDispatchTimers.set(incidentId, timer);
  return { alertedCount: totalAlertedAcrossTypes, status: 'ALERTED', radiusUsed: maxRadiusUsed };
}

// ================= AUTH ROUTES =================

// 1. One-Tap SOS for Guests without login
app.post('/api/auth/guest-sos', async (req, res) => {
  const { name = 'Guest Citizen', phone = '+91 90000 00000' } = req.body;
  const guestUser = {
    id: 9999 + Math.floor(Math.random() * 1000),
    email: `guest_${Date.now()}@emergency.sos`,
    full_name: name,
    phone,
    role: 'citizen'
  };

  const token = jwt.sign(guestUser, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: guestUser });
});

// 2. Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, full_name, phone, role = 'citizen', service_type, emergency_contact_phone } = req.body;
  try {
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = await dbRun(
      `INSERT INTO users (email, password_hash, full_name, phone, role, emergency_contact_phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, hash, full_name, phone, role, emergency_contact_phone || null]
    );

    let responderId = null;
    if (role === 'responder') {
      const respResult = await dbRun(
        `INSERT INTO responders (user_id, service_type, is_available, is_verified, lat, lng, vehicle_number, organization_name)
         VALUES (?, ?, 1, 1, 12.9716, 77.5946, ?, ?)`,
        [result.lastID, service_type || 'Ambulance', `UNIT-${Math.floor(Math.random()*100)}`, 'City Emergency Corps']
      );
      responderId = respResult.lastID;
    }

    const user = { id: result.lastID, email, full_name, phone, role, service_type, responderId };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  let { email, password } = req.body;
  try {
    // Demo account aliases
    let targetEmail = email;
    if (email === 'citizen@demo.com' || email === 'priya@example.com') {
      targetEmail = 'aarav@demo.com';
    } else if (email === 'responder@demo.com') {
      targetEmail = 'ambulance1@demo.com';
    }

    let user = await dbGet('SELECT * FROM users WHERE email = ?', [targetEmail]);
    
    // Check password or allow standard demo password
    const isDemoPass = password === '123456' || password === 'password123';
    const isPassValid = user && (isDemoPass || (await bcrypt.compare(password, user.password_hash)));

    if (!user || !isPassValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let responder = null;
    if (user.role === 'responder') {
      responder = await dbGet('SELECT * FROM responders WHERE user_id = ?', [user.id]);
    }

    const payload = {
      id: user.id,
      email: email, // keep requested email for UI
      full_name: email.includes('priya') ? 'Priya Sharma' : user.full_name,
      phone: user.phone,
      role: user.role,
      service_type: responder ? responder.service_type : null,
      responderId: responder ? responder.id : null
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. One-Click Demo Role Switcher
app.post('/api/auth/demo-switch', async (req, res) => {
  const { role } = req.query;
  const emailMap = {
    citizen: 'aarav@demo.com',
    ambulance: 'ambulance1@demo.com',
    responder: 'ambulance1@demo.com',
    police: 'police1@demo.com',
    fire: 'fire1@demo.com',
    rescue: 'rescue1@demo.com',
    admin: 'admin@demo.com'
  };

  const targetEmail = emailMap[role ? role.toLowerCase() : 'citizen'] || 'aarav@demo.com';
  const user = await dbGet('SELECT * FROM users WHERE email = ?', [targetEmail]);
  if (!user) return res.status(404).json({ error: 'Demo user not found' });

  let responder = null;
  if (user.role === 'responder') {
    responder = await dbGet('SELECT * FROM responders WHERE user_id = ?', [user.id]);
  }

  const payload = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
    service_type: responder ? responder.service_type : null,
    responderId: responder ? responder.id : null
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: payload });
});

// ================= INCIDENT ENDPOINTS =================

// Create Emergency Incident (with Duplicate Check, Rule Classification, & Auto-Dispatch)
app.post('/api/incidents', authenticateToken, async (req, res) => {
  const {
    emergency_type = 'Medical',
    description = '',
    voice_transcript = null,
    checklist = [],
    requiredResponderTypes = null,
    required_responder_types = null,
    lat,
    lng,
    address = 'GPS Location',
    photo_url = null
  } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude and Longitude are required' });
  }

  try {
    const explicitTypes = requiredResponderTypes || required_responder_types || [];
    // 1. Check for duplicate incident within 200m and 10 mins
    const dupCheck = await checkDuplicateIncident(emergency_type, lat, lng, 600, 200);

    // 2. Rule engine triage & severity classification preserving all required types
    const classification = classifyEmergencyAndSeverity(emergency_type, description, checklist, explicitTypes);

    const incidentId = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const checklistStr = JSON.stringify(checklist);
    const reqTypesJson = JSON.stringify(classification.requiredResponderTypes);

    // If duplicate detected, link/merge into parent
    let initialStatus = 'Reported';
    let mergedInto = null;
    if (dupCheck.isDuplicate) {
      initialStatus = 'Merged';
      mergedInto = dupCheck.parentIncident.id;
    }

    await dbRun(
      `INSERT INTO incidents (
        id, citizen_id, citizen_name, citizen_phone, emergency_type, severity, 
        suggested_service, description, voice_transcript, checklist_json, photo_url,
        lat, lng, address, status, merged_into_id, required_responder_types_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        incidentId,
        req.user.id || null,
        req.user.full_name,
        req.user.phone || '+91 98765 43210',
        emergency_type,
        classification.severity,
        classification.suggested_service,
        description,
        voice_transcript,
        checklistStr,
        photo_url,
        lat,
        lng,
        address,
        initialStatus,
        mergedInto,
        reqTypesJson
      ]
    );

    // Initialize required categories in incident_required_responder_types
    for (const rType of classification.requiredResponderTypes) {
      await dbRun(
        `INSERT OR IGNORE INTO incident_required_responder_types
         (incident_id, responder_type, status)
         VALUES (?, ?, 'SEARCHING')`,
        [incidentId, rType]
      );
    }

    // Timeline update
    const noteMsg = dupCheck.isDuplicate
      ? `Merged into active incident ${mergedInto} (Duplicate within ${dupCheck.distanceMeters}m).`
      : `Emergency reported. Triaged to ${classification.suggested_service} with ${classification.severity} priority. ${classification.reason}`;

    await dbRun(
      `INSERT INTO incident_updates (incident_id, status, note, updated_by_name)
       VALUES (?, ?, ?, ?)`,
      [incidentId, initialStatus, noteMsg, req.user.full_name]
    );

    await logAudit(req.user.id, req.user.full_name, 'CREATE_INCIDENT', incidentId, `Reported ${emergency_type} emergency`, req);

    const createdIncident = await getEnrichedIncident(incidentId);

    // Real-time broadcast
    io.emit('incident_created', createdIncident);

    // 3. Auto-Dispatch: Alert ALL eligible nearby responders for EVERY required type
    if (!dupCheck.isDuplicate) {
      await alertAllEligibleNearbyResponders(
        incidentId,
        classification.requiredResponderTypes,
        lat,
        lng,
        createdIncident
      );
    }

    const finalIncident = await getEnrichedIncident(incidentId);

    res.json({
      success: true,
      isDuplicate: dupCheck.isDuplicate,
      mergedInto: dupCheck.isDuplicate ? dupCheck.parentIncident.id : null,
      incident: finalIncident
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Incidents
app.get('/api/incidents', authenticateToken, async (req, res) => {
  try {
    const rows = await dbAll('SELECT id FROM incidents ORDER BY created_at DESC');
    const enriched = await Promise.all(
      rows.map(async (row) => {
        return await getEnrichedIncident(row.id);
      })
    );
    res.json(enriched.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Incident Detail
app.get('/api/incidents/:id', authenticateToken, async (req, res) => {
  try {
    const incident = await getEnrichedIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    // Updates timeline
    const updates = await dbAll('SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC', [incident.id]);
    incident.updates = updates;

    // Responder requests for this incident
    const requests = await dbAll(
      `SELECT req.*, r.vehicle_number, r.organization_name, u.full_name, u.phone
       FROM incident_responder_requests req
       JOIN responders r ON req.responder_id = r.id
       JOIN users u ON r.user_id = u.id
       WHERE req.incident_id = ?
       ORDER BY req.distance_km ASC`,
      [incident.id]
    );
    incident.requests = requests;

    // Chat history
    const chats = await dbAll('SELECT * FROM incident_chats WHERE incident_id = ? ORDER BY created_at ASC', [incident.id]);
    incident.chats = chats;

    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Responder Requests for Incident
app.get('/api/incidents/:id/requests', authenticateToken, async (req, res) => {
  try {
    const requests = await dbAll(
      `SELECT req.*, r.vehicle_number, r.organization_name, u.full_name, u.phone
       FROM incident_responder_requests req
       JOIN responders r ON req.responder_id = r.id
       JOIN users u ON r.user_id = u.id
       WHERE req.incident_id = ?
       ORDER BY req.distance_km ASC`,
      [req.params.id]
    );
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reusable function for accepting/declining incident assignment
async function handleResponderAssignment({ incidentId, responderId = null, userId = null, action, userName = 'Responder', req = null }) {
  if (action !== 'accept' && action !== 'decline') {
    return { status: 400, data: { error: "Invalid action. Must be 'accept' or 'decline'." } };
  }

  const incident = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
  if (!incident) return { status: 404, data: { error: 'Incident not found' } };

  let responder;
  if (responderId) {
    responder = await dbGet('SELECT * FROM responders WHERE id = ?', [responderId]);
  } else if (userId) {
    responder = await dbGet('SELECT * FROM responders WHERE user_id = ?', [userId]);
  }
  if (!responder) return { status: 403, data: { error: 'User is not a registered responder' } };

  if ((!userName || userName === 'Responder') && responder.user_id) {
    const u = await dbGet('SELECT full_name FROM users WHERE id = ?', [responder.user_id]);
    if (u && u.full_name) userName = u.full_name;
  }

  // Look up this responder's request record
  const reqRecord = await dbGet(
    'SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ?',
    [incidentId, responder.id]
  );

  if (!reqRecord) {
    return { status: 403, data: { error: 'You are not an alerted responder for this incident.' } };
  }

  if (action === 'accept') {
    const respCategory = normalizeResponderType(responder.service_type);

    // 1. Verify request status
    if (reqRecord.status === 'EXPIRED') {
      return { status: 410, data: { error: 'Your request for this emergency has expired.' } };
    }
    if (reqRecord.status === 'DECLINED') {
      return { status: 400, data: { error: 'You previously declined this emergency.' } };
    }
    if (reqRecord.status === 'REJECTED_BY_ASSIGNMENT') {
      return { status: 409, data: { error: 'Another responder has already accepted this emergency for this service category.' } };
    }

    // 2. Check responder current availability
    if (responder.is_available === 0 || responder.current_incident_id) {
      return { status: 400, data: { error: 'You are currently unavailable or already assigned to another incident.' } };
    }

    // Ensure category row exists in incident_required_responder_types
    await dbRun(
      `INSERT OR IGNORE INTO incident_required_responder_types (incident_id, responder_type, status)
       VALUES (?, ?, 'SEARCHING')`,
      [incidentId, respCategory]
    );

    // 3. FIRST ACCEPTANCE WINS PER CATEGORY — ATOMIC DATABASE UPDATE
    const assignTypeResult = await dbRun(
      `UPDATE incident_required_responder_types
       SET assigned_responder_id = ?, status = 'ASSIGNED', assigned_at = CURRENT_TIMESTAMP
       WHERE incident_id = ?
         AND responder_type = ?
         AND status != 'ASSIGNED'`,
      [responder.id, incidentId, respCategory]
    );

    // Concurrency protection: If changes === 0, another responder of this category already won!
    if (assignTypeResult.changes === 0) {
      await dbRun(
        `UPDATE incident_responder_requests
         SET status = 'REJECTED_BY_ASSIGNMENT', responded_at = CURRENT_TIMESTAMP
         WHERE incident_id = ? AND responder_id = ?`,
        [incidentId, responder.id]
      );
      return { status: 409, data: { error: 'Another responder has already accepted this emergency for this service category.' } };
    }

    // Mark winning responder's request as ACCEPTED
    await dbRun(
      `UPDATE incident_responder_requests
       SET status = 'ACCEPTED', responded_at = CURRENT_TIMESTAMP
       WHERE incident_id = ? AND responder_id = ?`,
      [incidentId, responder.id]
    );

    // REJECT ALL OTHER PENDING REQUESTS FOR THIS RESPONDER TYPE ONLY
    // IMPORTANT: Does NOT reject requests of other responder types!
    await dbRun(
      `UPDATE incident_responder_requests
       SET status = 'REJECTED_BY_ASSIGNMENT', responded_at = CURRENT_TIMESTAMP
       WHERE incident_id = ?
         AND responder_id != ?
         AND (UPPER(responder_type) = UPPER(?) OR responder_type = ?)
         AND status = 'PENDING'`,
      [incidentId, responder.id, respCategory, responder.service_type]
    );

    // Update responder status: mark busy and link current incident
    await dbRun(
      `UPDATE responders SET is_available = 0, current_incident_id = ? WHERE id = ?`,
      [incidentId, responder.id]
    );

    // Check overall incident fulfillment across ALL required responder categories
    const allReqRows = await dbAll(
      'SELECT * FROM incident_required_responder_types WHERE incident_id = ?',
      [incidentId]
    );

    const allFulfilled = allReqRows.length > 0 && allReqRows.every(r => r.status === 'ASSIGNED');

    if (allFulfilled) {
      // ALL required categories fulfilled -> mark overall incident as Assigned
      await dbRun(
        `UPDATE incidents
         SET assigned_responder_id = COALESCE(assigned_responder_id, ?), status = 'Assigned', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [responder.id, incidentId]
      );
      clearIncidentTimer(incidentId);
    } else {
      // Partial fulfillment -> update assigned_responder_id, but overall incident is NOT fully assigned
      await dbRun(
        `UPDATE incidents
         SET assigned_responder_id = COALESCE(assigned_responder_id, ?), status = 'Partially Assigned', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status != 'Resolved' AND status != 'Cancelled'`,
        [responder.id, incidentId]
      );
    }

    // Add timeline update
    const acceptMsg = `Help is on the way. A nearby ${responder.service_type} responder (${userName}, ${responder.organization_name || responder.service_type}) has accepted your emergency request.`;
    await dbRun(
      `INSERT INTO incident_updates (incident_id, status, note, updated_by_name, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [incidentId, allFulfilled ? 'Assigned' : 'Partially Assigned', acceptMsg, userName, responder.lat, responder.lng]
    );

    if (req) {
      await logAudit(userId || responder.user_id, userName, 'ACCEPT_ASSIGNMENT', incidentId, `Accepted emergency assignment for ${respCategory}`, req);
    }

    // Fetch enriched incident
    const updated = await getEnrichedIncident(incidentId);

    // Real-time broadcasts
    io.to(`incident_${incidentId}`).emit('incident_updated', updated);
    io.to(`incident_${incidentId}`).emit('incident_status_changed', { incident: updated, note: acceptMsg });
    io.to(`incident_${incidentId}`).emit('citizen_assignment_notification', {
      incidentId,
      message: acceptMsg,
      responder: updated.assigned_responder,
      responder_requirements: updated.responder_requirements,
      is_fully_assigned: updated.is_fully_assigned
    });
    io.to('dispatch_room').emit('incident_updated', updated);

    // Notify other alerted responders of THIS CATEGORY ONLY that category has been assigned
    const otherCategoryRequests = await dbAll(
      `SELECT responder_id FROM incident_responder_requests
       WHERE incident_id = ?
         AND responder_id != ?
         AND (UPPER(responder_type) = UPPER(?) OR responder_type = ?)`,
      [incidentId, responder.id, respCategory, responder.service_type]
    );
    for (const row of otherCategoryRequests) {
      io.to(`responder_${row.responder_id}`).emit('job_assigned_to_other', {
        incidentId,
        responderType: respCategory,
        message: `This emergency ${respCategory} assignment has already been accepted by another nearby responder.`
      });
    }

    return { status: 200, data: { success: true, message: 'Assignment accepted successfully', incident: updated } };

  } else if (action === 'decline') {
    const respCategory = normalizeResponderType(responder.service_type);

    // Record decline
    await dbRun(
      `UPDATE incident_responder_requests
       SET status = 'DECLINED', responded_at = CURRENT_TIMESTAMP
       WHERE incident_id = ? AND responder_id = ?`,
      [incidentId, responder.id]
    );

    if (req) {
      await logAudit(userId || responder.user_id, userName, 'DECLINE_ASSIGNMENT', incidentId, `Declined emergency request`, req);
    }

    // Check if any other requests for this category are still PENDING
    const pendingRow = await dbGet(
      `SELECT COUNT(*) as count FROM incident_responder_requests
       WHERE incident_id = ?
         AND (UPPER(responder_type) = UPPER(?) OR responder_type = ?)
         AND status = 'PENDING'`,
      [incidentId, respCategory, responder.service_type]
    );

    // Check if this category is already ASSIGNED
    const catRow = await dbGet(
      `SELECT * FROM incident_required_responder_types WHERE incident_id = ? AND responder_type = ?`,
      [incidentId, respCategory]
    );

    if (pendingRow.count === 0 && (!catRow || catRow.status !== 'ASSIGNED')) {
      await dbRun(
        `UPDATE incident_required_responder_types
         SET status = 'NO_RESPONDER_AVAILABLE'
         WHERE incident_id = ? AND responder_type = ? AND status != 'ASSIGNED'`,
        [incidentId, respCategory]
      );
    }

    // Check if ALL categories for incident are now NO_RESPONDER_AVAILABLE and none ASSIGNED
    const allCats = await dbAll(
      'SELECT * FROM incident_required_responder_types WHERE incident_id = ?',
      [incidentId]
    );
    const anyAssigned = allCats.some(c => c.status === 'ASSIGNED');
    const allDeclinedOrNoResp = allCats.length > 0 && allCats.every(c => c.status === 'NO_RESPONDER_AVAILABLE');

    if (!anyAssigned && allDeclinedOrNoResp) {
      clearIncidentTimer(incidentId);

      await dbRun(
        `UPDATE incidents SET status = 'NO_RESPONDER_AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND assigned_responder_id IS NULL`,
        [incidentId]
      );

      const noRespMsg = 'All nearby responders declined or were unavailable. Please contact emergency services directly (112 / 108).';
      await dbRun(
        `INSERT INTO incident_updates (incident_id, status, note, updated_by_name)
         VALUES (?, 'NO_RESPONDER_AVAILABLE', ?, 'System')`,
        [incidentId, noRespMsg]
      );

      const updated = await getEnrichedIncident(incidentId);
      io.to(`incident_${incidentId}`).emit('incident_status_changed', { incident: updated, note: noRespMsg });
      io.to(`incident_${incidentId}`).emit('no_responders_alert', { incidentId, message: noRespMsg });
      io.to('dispatch_room').emit('incident_status_changed', { incident: updated });
    }

    return { status: 200, data: { success: true, message: 'Assignment declined' } };
  }
}

// Responder Accept / Decline Assignment (FIRST ACCEPTANCE WINS PER TYPE WITH INDEPENDENT REJECTION)
app.post('/api/incidents/:id/assign', authenticateToken, async (req, res) => {
  try {
    const result = await handleResponderAssignment({
      incidentId: req.params.id,
      userId: req.user.id,
      action: req.body.action,
      userName: req.user.full_name,
      req
    });
    return res.status(result.status).json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reusable function for updating incident / responder status workflow
async function handleIncidentStatusUpdate({
  incidentId,
  user = null,
  responderId = null,
  status,
  note = null,
  lat = null,
  lng = null,
  resolution_notes = null,
  outcome = null,
  req = null
}) {
  const incident = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
  if (!incident) return { status: 404, data: { error: 'Incident not found' } };

  // Resolve user and responder context
  let responder = null;
  let respCategory = null;
  let effectiveUser = user || { id: null, full_name: 'System', role: 'admin' };

  if (responderId) {
    responder = await dbGet('SELECT * FROM responders WHERE id = ?', [responderId]);
    if (responder && (!user || !user.id)) {
      const u = await dbGet('SELECT * FROM users WHERE id = ?', [responder.user_id]);
      if (u) effectiveUser = u;
    }
  } else if (effectiveUser.role === 'responder') {
    responder = await dbGet('SELECT * FROM responders WHERE user_id = ?', [effectiveUser.id]);
  }

  // Security checks:
  if (effectiveUser.role === 'citizen') {
    if (incident.citizen_id && incident.citizen_id !== effectiveUser.id && !effectiveUser.isGuest) {
      return { status: 403, data: { error: 'You are not authorized to modify another citizen incident.' } };
    }
  }

  if (effectiveUser.role === 'responder') {
    if (!responder) {
      return { status: 403, data: { error: 'User is not a registered responder' } };
    }
    respCategory = normalizeResponderType(responder.service_type);

    // Verify that responder is assigned to this incident/category
    const isDirect = incident.assigned_responder_id === responder.id;
    const reqRow = await dbGet(
      'SELECT * FROM incident_required_responder_types WHERE incident_id = ? AND (assigned_responder_id = ? OR responder_type = ?)',
      [incidentId, responder.id, respCategory]
    );
    const respReq = await dbGet(
      'SELECT * FROM incident_responder_requests WHERE incident_id = ? AND responder_id = ? AND status IN ("ACCEPTED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "RESOLVED")',
      [incidentId, responder.id]
    );

    if (!isDirect && !reqRow && !respReq) {
      return { status: 403, data: { error: 'You are not an assigned responder for this incident.' } };
    }
  }

  // If responder sent GPS coords, update responder location in DB
  if (lat && lng && responder) {
    await dbRun('UPDATE responders SET lat = ?, lng = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?', [lat, lng, responder.id]);
  }

  let responseTimeSec = incident.response_time_sec;
  if ((status === 'On Scene' || status === 'ON_SCENE') && !responseTimeSec) {
    const created = new Date(incident.created_at).getTime();
    responseTimeSec = Math.round((Date.now() - created) / 1000);
  }

  // 1. UPDATE RESPONDER'S OWN ASSIGNMENT / TASK STATUS (IF RESPONDER)
  if (responder) {
    const normCategory = respCategory || normalizeResponderType(responder.service_type);

    if (status === 'Resolved' || status === 'RESOLVED') {
      // Mark this responder's category as RESOLVED
      await dbRun(
        `UPDATE incident_required_responder_types
         SET status = 'RESOLVED', assigned_responder_id = COALESCE(assigned_responder_id, ?)
         WHERE incident_id = ? AND (responder_type = ? OR assigned_responder_id = ?)`,
        [responder.id, incidentId, normCategory, responder.id]
      );

      // Mark this responder's individual request as RESOLVED
      await dbRun(
        `UPDATE incident_responder_requests
         SET status = 'RESOLVED', responded_at = CURRENT_TIMESTAMP
         WHERE incident_id = ? AND responder_id = ?`,
        [incidentId, responder.id]
      );

      // Free THIS responder immediately so they can take new calls
      await dbRun(
        'UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id = ?',
        [responder.id]
      );

    } else if (status === 'En Route' || status === 'EN_ROUTE') {
      await dbRun(
        `UPDATE incident_required_responder_types
         SET status = 'EN_ROUTE', assigned_responder_id = COALESCE(assigned_responder_id, ?)
         WHERE incident_id = ? AND (responder_type = ? OR assigned_responder_id = ?) AND status != 'RESOLVED'`,
        [responder.id, incidentId, normCategory, responder.id]
      );
      await dbRun(
        `UPDATE incident_responder_requests
         SET status = 'EN_ROUTE'
         WHERE incident_id = ? AND responder_id = ? AND status != 'RESOLVED'`,
        [incidentId, responder.id]
      );

    } else if (status === 'On Scene' || status === 'ON_SCENE') {
      await dbRun(
        `UPDATE incident_required_responder_types
         SET status = 'ON_SCENE', assigned_responder_id = COALESCE(assigned_responder_id, ?)
         WHERE incident_id = ? AND (responder_type = ? OR assigned_responder_id = ?) AND status != 'RESOLVED'`,
        [responder.id, incidentId, normCategory, responder.id]
      );
      await dbRun(
        `UPDATE incident_responder_requests
         SET status = 'ON_SCENE'
         WHERE incident_id = ? AND responder_id = ? AND status != 'RESOLVED'`,
        [incidentId, responder.id]
      );
    }
  } else if (effectiveUser.role === 'admin' && status === 'Resolved') {
    // Admin override: resolve all categories
    await dbRun("UPDATE incident_required_responder_types SET status = 'RESOLVED' WHERE incident_id = ?", [incidentId]);
    await dbRun("UPDATE incident_responder_requests SET status = 'RESOLVED' WHERE incident_id = ?", [incidentId]);
    await dbRun("UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE current_incident_id = ?", [incidentId]);
  }

  // 2. RECALCULATE OVERALL INCIDENT STATUS
  const reqRows = await dbAll(
    'SELECT * FROM incident_required_responder_types WHERE incident_id = ?',
    [incidentId]
  );

  let newIncidentStatus;
  if (reqRows.length > 0) {
    const allResolved = reqRows.every(r => r.status === 'RESOLVED');
    const anyResolved = reqRows.some(r => r.status === 'RESOLVED');
    const anyOnScene = reqRows.some(r => r.status === 'ON_SCENE');
    const anyEnRoute = reqRows.some(r => r.status === 'EN_ROUTE');
    const allAssignedOrHigher = reqRows.every(r => ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED'].includes(r.status));

    if (allResolved) {
      newIncidentStatus = 'Resolved';
    } else if (anyResolved) {
      newIncidentStatus = 'Partially Resolved';
    } else if (anyOnScene) {
      newIncidentStatus = 'On Scene';
    } else if (anyEnRoute) {
      newIncidentStatus = 'En Route';
    } else if (allAssignedOrHigher) {
      newIncidentStatus = 'Assigned';
    } else {
      newIncidentStatus = incident.status || 'Partially Assigned';
    }
  } else {
    // Single-responder or legacy without categories table entries
    newIncidentStatus = status;
  }

  // If newly fully Resolved: free any remaining responders and clear timer
  if (newIncidentStatus === 'Resolved') {
    await dbRun(
      'UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE current_incident_id = ?',
      [incidentId]
    );
    if (incident.assigned_responder_id) {
      await dbRun(
        'UPDATE responders SET is_available = 1, current_incident_id = NULL WHERE id = ?',
        [incident.assigned_responder_id]
      );
    }
    clearIncidentTimer(incidentId);
    io.to('dispatch_room').emit('responder_updated', { incidentId, is_available: 1 });
  }

  // Update incidents row
  await dbRun(
    `UPDATE incidents
     SET status = ?,
         response_time_sec = COALESCE(?, response_time_sec),
         resolution_notes = COALESCE(?, resolution_notes),
         outcome = COALESCE(?, outcome),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [newIncidentStatus, responseTimeSec || null, resolution_notes || null, outcome || null, incidentId]
  );

  // Timeline note
  let finalNote = note;
  if (!finalNote) {
    if (status === 'Resolved') {
      if (newIncidentStatus === 'Resolved') {
        finalNote = 'Emergency successfully resolved. All required responder tasks completed.';
      } else {
        finalNote = `${effectiveUser.full_name} (${responder?.service_type || 'Responder'}) resolved their task. Response in progress for other services.`;
      }
    } else {
      finalNote = `${effectiveUser.full_name} (${responder?.service_type || 'Responder'}) updated status to ${status}`;
    }
  }

  await dbRun(
    `INSERT INTO incident_updates (incident_id, status, note, updated_by_name, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [incidentId, newIncidentStatus, finalNote, effectiveUser.full_name, lat || null, lng || null]
  );

  if (req) {
    await logAudit(effectiveUser.id, effectiveUser.full_name, 'UPDATE_STATUS', incidentId, `Status: ${newIncidentStatus} (${status})`, req);
  }

  const updated = await getEnrichedIncident(incidentId);

  io.to(`incident_${incidentId}`).emit('incident_status_changed', { incident: updated, note: finalNote });
  io.to(`incident_${incidentId}`).emit('incident_updated', updated);
  io.to('dispatch_room').emit('incident_status_changed', { incident: updated });
  io.to('dispatch_room').emit('incident_updated', updated);
  if (responder) {
    io.to(`responder_${responder.id}`).emit('task_status_updated', {
      incidentId,
      responderType: respCategory,
      status: status,
      overallStatus: newIncidentStatus,
      is_fully_resolved: updated.is_fully_resolved
    });
  }

  return { success: true, incident: updated };
}

// Update Incident Status Workflow
app.post('/api/incidents/:id/status', authenticateToken, async (req, res) => {
  const { status, note, lat, lng, resolution_notes, outcome } = req.body;
  const incidentId = req.params.id;

  try {
    const result = await handleIncidentStatusUpdate({
      incidentId,
      user: req.user,
      status,
      note,
      lat,
      lng,
      resolution_notes,
      outcome,
      req
    });

    if (result.status && result.status >= 400) {
      return res.status(result.status).json(result.data);
    }
    return res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dispatcher Severity / Service Override
app.post('/api/incidents/:id/override', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { severity, suggested_service, note } = req.body;
  const incidentId = req.params.id;

  try {
    await dbRun(
      `UPDATE incidents 
       SET severity = COALESCE(?, severity), suggested_service = COALESCE(?, suggested_service), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [severity || null, suggested_service || null, incidentId]
    );

    await dbRun(
      `INSERT INTO incident_updates (incident_id, status, note, updated_by_name)
       VALUES (?, 'Override', ?, ?)`,
      [incidentId, note || `Dispatcher override: Severity set to ${severity}, Service to ${suggested_service}`, req.user.full_name]
    );

    const updated = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    io.to(`incident_${incidentId}`).emit('incident_updated', updated);
    io.to('dispatch_room').emit('incident_updated', updated);

    res.json({ success: true, incident: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// In-App Chat Messages
app.get('/api/incidents/:id/chat', authenticateToken, async (req, res) => {
  const chats = await dbAll('SELECT * FROM incident_chats WHERE incident_id = ? ORDER BY created_at ASC', [req.params.id]);
  res.json(chats);
});

app.post('/api/incidents/:id/chat', authenticateToken, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  const result = await dbRun(
    `INSERT INTO incident_chats (incident_id, sender_id, sender_name, sender_role, message)
     VALUES (?, ?, ?, ?, ?)`,
    [req.params.id, req.user.id, req.user.full_name, req.user.role, message.trim()]
  );

  const newChat = await dbGet('SELECT * FROM incident_chats WHERE id = ?', [result.lastID]);
  io.to(`incident_${req.params.id}`).emit('new_chat_message', newChat);
  res.json(newChat);
});

// Area Broadcast Alerts
app.get('/api/alerts', async (req, res) => {
  const alerts = await dbAll('SELECT * FROM area_alerts ORDER BY created_at DESC LIMIT 10');
  res.json(alerts);
});

app.post('/api/alerts', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { title, message, alert_type = 'Warning', radius_km = 3.0, center_lat, center_lng } = req.body;
  const result = await dbRun(
    `INSERT INTO area_alerts (title, message, alert_type, radius_km, center_lat, center_lng)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, message, alert_type, radius_km, center_lat || 12.9716, center_lng || 77.5946]
  );

  const alert = await dbGet('SELECT * FROM area_alerts WHERE id = ?', [result.lastID]);
  io.emit('area_alert_broadcast', alert);
  res.json(alert);
});

// Responders API
app.get('/api/responders', authenticateToken, async (req, res) => {
  const responders = await dbAll(
    `SELECT r.*, u.full_name, u.phone, u.email 
     FROM responders r 
     JOIN users u ON r.user_id = u.id`
  );
  res.json(responders);
});

app.post('/api/responders/availability', authenticateToken, async (req, res) => {
  const { is_available } = req.body;
  await dbRun('UPDATE responders SET is_available = ? WHERE user_id = ?', [is_available ? 1 : 0, req.user.id]);
  io.to('dispatch_room').emit('responder_updated', { userId: req.user.id, is_available });
  res.json({ success: true, is_available });
});

app.post('/api/responders/location', authenticateToken, async (req, res) => {
  const { lat, lng } = req.body;
  await dbRun('UPDATE responders SET lat = ?, lng = ?, last_active = CURRENT_TIMESTAMP WHERE user_id = ?', [lat, lng, req.user.id]);
  io.emit('responder_location_ping', { userId: req.user.id, lat, lng });
  res.json({ success: true, lat, lng });
});

// OSRM Road Route
app.get('/api/route', async (req, res) => {
  const { start_lat, start_lng, end_lat, end_lng } = req.query;
  const route = await fetchOsrmRoute(parseFloat(start_lat), parseFloat(start_lng), parseFloat(end_lat), parseFloat(end_lng));
  res.json(route);
});

// Emergency Contacts
app.get('/api/contacts', async (req, res) => {
  const contacts = await dbAll('SELECT * FROM contacts');
  res.json(contacts);
});

// Analytics & KPIs
app.get('/api/analytics', authenticateToken, requireRole(['admin']), async (req, res) => {
  const total = await dbGet('SELECT COUNT(*) as count FROM incidents');
  const active = await dbGet("SELECT COUNT(*) as count FROM incidents WHERE status NOT IN ('Resolved', 'Cancelled', 'Merged')");
  const resolved = await dbGet("SELECT COUNT(*) as count FROM incidents WHERE status = 'Resolved'");
  const avgResponse = await dbGet("SELECT AVG(response_time_sec) as avg_sec FROM incidents WHERE response_time_sec IS NOT NULL");
  const byType = await dbAll('SELECT emergency_type, COUNT(*) as count FROM incidents GROUP BY emergency_type');
  const bySeverity = await dbAll('SELECT severity, COUNT(*) as count FROM incidents GROUP BY severity');
  const heatmap = await dbAll('SELECT lat, lng, severity FROM incidents');

  res.json({
    totalIncidents: total.count,
    activeIncidents: active.count,
    resolvedIncidents: resolved.count,
    avgResponseMinutes: avgResponse.avg_sec ? Math.round(avgResponse.avg_sec / 60) : 4,
    byType,
    bySeverity,
    heatmap
  });
});

// Downloadable CSV Audit Report
app.get('/api/analytics/export-csv', authenticateToken, requireRole(['admin']), async (req, res) => {
  const incidents = await dbAll('SELECT * FROM incidents ORDER BY created_at DESC');
  let csv = 'ID,Type,Severity,Status,Citizen,Phone,Address,Lat,Lng,ResponseSec,Created,Outcome\n';
  for (const inc of incidents) {
    csv += `"${inc.id}","${inc.emergency_type}","${inc.severity}","${inc.status}","${inc.citizen_name}","${inc.citizen_phone}","${inc.address}",${inc.lat},${inc.lng},${inc.response_time_sec || 0},"${inc.created_at}","${inc.outcome || ''}"\n`;
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=emergency_incident_report.csv');
  res.send(csv);
});

// 1-Click "Demo Mode" Full Incident Simulation
app.post('/api/demo/simulate-full-cycle', async (req, res) => {
  const simId = `INC-2026-SIM${Math.floor(100 + Math.random() * 900)}`;
  const simIncident = {
    id: simId,
    citizen_name: 'Simulated Citizen (Demo Mode)',
    citizen_phone: '+91 99999 88888',
    emergency_type: 'Medical',
    severity: 'Critical',
    suggested_service: 'Ambulance',
    description: 'Sudden collapse at Metro station platform with respiratory distress',
    checklist_json: JSON.stringify(['Person unconscious', 'Immediate danger']),
    lat: 12.9730,
    lng: 77.5990,
    address: 'Central Metro Station Plaza',
    status: 'Reported'
  };

  await dbRun(
    `INSERT INTO incidents (id, citizen_name, citizen_phone, emergency_type, severity, suggested_service, description, checklist_json, lat, lng, address, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [simIncident.id, simIncident.citizen_name, simIncident.citizen_phone, simIncident.emergency_type, simIncident.severity, simIncident.suggested_service, simIncident.description, simIncident.checklist_json, simIncident.lat, simIncident.lng, simIncident.address, simIncident.status]
  );

  io.emit('incident_created', simIncident);

  // Progressive simulation timers
  setTimeout(async () => {
    await dbRun("UPDATE incidents SET status = 'Assigned', assigned_responder_id = 1 WHERE id = ?", [simId]);
    io.emit('incident_status_changed', { incident: { ...simIncident, status: 'Assigned' } });
  }, 1500);

  setTimeout(async () => {
    await dbRun("UPDATE incidents SET status = 'En Route' WHERE id = ?", [simId]);
    io.emit('incident_status_changed', { incident: { ...simIncident, status: 'En Route' } });
  }, 3000);

  setTimeout(async () => {
    await dbRun("UPDATE incidents SET status = 'On Scene', response_time_sec = 240 WHERE id = ?", [simId]);
    io.emit('incident_status_changed', { incident: { ...simIncident, status: 'On Scene', response_time_sec: 240 } });
  }, 4500);

  setTimeout(async () => {
    await dbRun("UPDATE incidents SET status = 'Resolved', outcome = 'Patient stabilized and transported.' WHERE id = ?", [simId]);
    io.emit('incident_status_changed', { incident: { ...simIncident, status: 'Resolved' } });
  }, 6000);

  res.json({ success: true, message: 'Full lifecycle simulation triggered in real-time!', incidentId: simId });
});

// ================= SOCKET.IO EVENTS =================
io.on('connection', (socket) => {
  socket.on('join_incident', (incidentId) => {
    socket.join(`incident_${incidentId}`);
  });

  socket.on('join_responder', (responderId) => {
    socket.join(`responder_${responderId}`);
  });

  socket.on('join_dispatch', () => {
    socket.join('dispatch_room');
  });

  socket.on('send_chat', async (data) => {
    const { incidentId, message, senderId, senderName, senderRole } = data;
    const res = await dbRun(
      `INSERT INTO incident_chats (incident_id, sender_id, sender_name, sender_role, message)
       VALUES (?, ?, ?, ?, ?)`,
      [incidentId, senderId, senderName, senderRole, message]
    );
    const chat = await dbGet('SELECT * FROM incident_chats WHERE id = ?', [res.lastID]);
    io.to(`incident_${incidentId}`).emit('new_chat_message', chat);
  });

  socket.on('live_gps_stream', (data) => {
    const { incidentId, lat, lng, heading } = data;
    io.to(`incident_${incidentId}`).emit('responder_gps_update', { lat, lng, heading });
    io.to('dispatch_room').emit('responder_gps_update', { lat, lng, heading });
  });
});

// ================= DATABASE DEDUPLICATION ROUTINE =================
async function cleanDatabaseDuplicates() {
  try {
    // 1. Remove duplicate incidents with identical IDs
    await dbRun(`
      DELETE FROM incidents
      WHERE rowid NOT IN (
        SELECT MIN(rowid)
        FROM incidents
        GROUP BY id
      )
    `);

    // 2. Remove duplicate users with identical emails
    await dbRun(`
      DELETE FROM users
      WHERE rowid NOT IN (
        SELECT MIN(rowid)
        FROM users
        GROUP BY LOWER(email)
      )
    `);

    // 3. Remove duplicate contacts
    await dbRun(`
      DELETE FROM contacts
      WHERE rowid NOT IN (
        SELECT MIN(rowid)
        FROM contacts
        GROUP BY name, phone
      )
    `);

    console.log("🧹 SQLite database duplicates cleaned successfully.");
  } catch (e) {
    console.warn("Deduplication warning:", e.message);
  }
}

// Admin API to trigger deduplication on demand
app.post('/api/admin/clean-duplicates', async (req, res) => {
  await cleanDatabaseDuplicates();
  res.json({ success: true, message: "All duplicate data removed from database." });
});

// ================= SERVER STARTUP =================
if (require.main === module) {
  server.listen(PORT, async () => {
    await seedDatabase();
    await cleanDatabaseDuplicates();
    console.log(`🚨 Hyperlocal Emergency Response Platform Server running on http://127.0.0.1:${PORT}`);
  });
}

module.exports = {
  app,
  server,
  io,
  alertAllEligibleNearbyResponders,
  handleResponderAssignment,
  handleIncidentStatusUpdate,
  clearIncidentTimer,
  getEnrichedIncident,
  NEARBY_RESPONDER_RADIUS_KM,
  EXPANDED_RADIUS_KM,
  RESPONDER_REQUEST_TIMEOUT_SECONDS
};
