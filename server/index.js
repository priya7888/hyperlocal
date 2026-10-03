const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const { initDB, dbRun, dbGet, dbAll } = require('./db');
const seedDatabase = require('./seed');
const {
  calculateHaversineDistance,
  estimateTravelTime,
  fetchOsrmRoute,
  checkDuplicateIncident,
  classifyEmergencyAndSeverity,
  findRankedResponders
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

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), platform: 'Hyperlocal Emergency Response' });
});

// In-memory registry of active dispatch countdown timers
const activeDispatchBatches = new Map(); // incidentId -> { timer, batchIndex, rankedResponders, currentBatch, expiresAt }
const activeDispatchTimers = activeDispatchBatches;

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

// ================= REAL-TIME 5-SERVICE DISPATCH BATCH & 5-MIN TIMEOUT =================
async function dispatchBatchToResponders(incidentId, rankedResponders, batchSize = 5, batchIndex = 0, timeoutSeconds = 300) {
  const startIndex = batchIndex * batchSize;
  const currentBatch = rankedResponders.slice(startIndex, startIndex + batchSize);

  if (currentBatch.length === 0) {
    console.log(`[Escalation] All nearby service batches exhausted for incident ${incidentId}. Escalating to supervisor...`);
    io.to('dispatch_room').emit('supervisor_escalation_alert', {
      incidentId,
      message: `🚨 ESCALATION: No services accepted incident ${incidentId} after multiple 5-minute batch alerts. Supervisor manual dispatch required.`
    });
    return;
  }

  console.log(`[Dispatch Batch ${batchIndex + 1}] Alerting top ${currentBatch.length} nearby services for incident ${incidentId} (5-minute countdown started)`);

  const expiresAt = Date.now() + timeoutSeconds * 1000;

  // Alert all responders in current batch of 5
  currentBatch.forEach((responder) => {
    io.to(`responder_${responder.id}`).emit('incoming_job_alert', {
      incidentId,
      timeoutSeconds,
      expiresAt,
      batchNumber: batchIndex + 1,
      totalInBatch: currentBatch.length,
      distanceKm: responder.distance_km,
      etaMinutes: responder.eta_minutes
    });
  });

  // 5-minute timeout timer (300 seconds)
  const timer = setTimeout(async () => {
    console.log(`[Timeout] 5 minutes expired for Batch ${batchIndex + 1} on incident ${incidentId}. Rotating to next 5 nearby services...`);
    
    currentBatch.forEach((responder) => {
      io.to(`responder_${responder.id}`).emit('job_offer_expired', { incidentId });
    });

    dispatchBatchToResponders(incidentId, rankedResponders, batchSize, batchIndex + 1, timeoutSeconds);
  }, timeoutSeconds * 1000);

  activeDispatchBatches.set(incidentId, {
    timer,
    batchIndex,
    rankedResponders,
    currentBatch,
    expiresAt
  });
}

function clearDispatchTimer(incidentId) {
  if (activeDispatchBatches.has(incidentId)) {
    const { timer } = activeDispatchBatches.get(incidentId);
    clearTimeout(timer);
    activeDispatchBatches.delete(incidentId);
  }
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
    lat: bodyLat,
    lng: bodyLng,
    latitude: bodyLatitude,
    longitude: bodyLongitude,
    incidentLatitude,
    incidentLongitude,
    location_accuracy,
    locationAccuracy,
    accuracy,
    location_captured_at,
    locationCapturedAt,
    capturedAt,
    address = 'GPS Location',
    photo_url = null
  } = req.body;

  if (!emergency_type || (typeof emergency_type === 'string' && !emergency_type.trim())) {
    return res.status(400).json({ error: 'Incident type is required' });
  }

  if (!description || (typeof description === 'string' && !description.trim())) {
    return res.status(400).json({ error: 'Description is required' });
  }

  // Resolve latitude & longitude from standard or alias properties
  const rawLat = bodyLat ?? bodyLatitude ?? incidentLatitude;
  const rawLng = bodyLng ?? bodyLongitude ?? incidentLongitude;

  if (rawLat === undefined || rawLat === null || rawLng === undefined || rawLng === null) {
    return res.status(400).json({ error: 'Valid incident latitude and longitude are required' });
  }

  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);

  // Validate coordinate boundaries: lat -90 to 90, lng -180 to 180
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: 'Invalid coordinates. Latitude must be between -90 and 90, and Longitude between -180 and 180.'
    });
  }

  const resolvedAccuracy = (location_accuracy ?? locationAccuracy ?? accuracy != null)
    ? parseFloat(location_accuracy ?? locationAccuracy ?? accuracy)
    : null;
  const resolvedCapturedAt = location_captured_at ?? locationCapturedAt ?? capturedAt ?? new Date().toISOString();

  try {
    // 1. Check for duplicate incident within 200m and 10 mins
    const dupCheck = await checkDuplicateIncident(emergency_type, lat, lng, 600, 200);

    // 2. Rule engine triage & severity classification
    const classification = classifyEmergencyAndSeverity(emergency_type, description, checklist);

    const incidentId = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const checklistStr = JSON.stringify(checklist);

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
        lat, lng, address, location_accuracy, location_captured_at, status, merged_into_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        incidentId,
        req.user.id || null,
        req.user.full_name,
        req.user.phone || '+91 98765 43210',
        emergency_type,
        req.body.severity || classification.severity,
        classification.suggested_service,
        description,
        voice_transcript,
        checklistStr,
        photo_url,
        lat,
        lng,
        address,
        resolvedAccuracy,
        resolvedCapturedAt,
        initialStatus,
        mergedInto
      ]
    );

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

    const createdIncident = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    createdIncident.checklist = JSON.parse(createdIncident.checklist_json || '[]');

    // Real-time broadcast
    io.emit('incident_created', createdIncident);

    // 3. Auto-Dispatch: Find ranked available responders
    if (!dupCheck.isDuplicate) {
      const rankedResponders = await findRankedResponders(classification.suggested_service, lat, lng, 20.0);
      if (rankedResponders.length > 0) {
        dispatchBatchToResponders(incidentId, rankedResponders, 5, 0, 300);
      } else {
        io.to('dispatch_room').emit('no_responders_alert', {
          incidentId,
          message: `⚠️ No ${classification.suggested_service} units currently available within 20km for incident ${incidentId}.`
        });
      }
    }

    res.json({
      success: true,
      isDuplicate: dupCheck.isDuplicate,
      mergedInto: dupCheck.isDuplicate ? dupCheck.parentIncident.id : null,
      incident: createdIncident
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Incidents
app.get('/api/incidents', authenticateToken, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM incidents ORDER BY created_at DESC');
    const enriched = await Promise.all(
      rows.map(async (inc) => {
        inc.checklist = JSON.parse(inc.checklist_json || '[]');
        if (inc.assigned_responder_id) {
          const resp = await dbGet(
            `SELECT r.*, u.full_name, u.phone FROM responders r JOIN users u ON r.user_id = u.id WHERE r.id = ?`,
            [inc.assigned_responder_id]
          );
          inc.assigned_responder = resp;
        }
        return inc;
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Incident Detail
app.get('/api/incidents/:id', authenticateToken, async (req, res) => {
  try {
    const incident = await dbGet('SELECT * FROM incidents WHERE id = ?', [req.params.id]);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    incident.checklist = JSON.parse(incident.checklist_json || '[]');

    // Updates timeline
    const updates = await dbAll('SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY created_at ASC', [incident.id]);
    incident.updates = updates;

    // Assigned Responder info
    if (incident.assigned_responder_id) {
      const resp = await dbGet(
        `SELECT r.*, u.full_name, u.phone FROM responders r JOIN users u ON r.user_id = u.id WHERE r.id = ?`,
        [incident.assigned_responder_id]
      );
      incident.assigned_responder = resp;
    }

    // Chat history
    const chats = await dbAll('SELECT * FROM incident_chats WHERE incident_id = ? ORDER BY created_at ASC', [incident.id]);
    incident.chats = chats;

    res.json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Responder Accept / Decline Assignment
app.post('/api/incidents/:id/assign', authenticateToken, async (req, res) => {
  const { action } = req.body; // 'accept' or 'decline'
  const incidentId = req.params.id;

  try {
    const incident = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const responder = await dbGet('SELECT * FROM responders WHERE user_id = ?', [req.user.id]);
    if (!responder) return res.status(403).json({ error: 'User is not a registered responder' });

    if (action === 'accept') {
      // Prevent race conditions
      if (incident.assigned_responder_id && incident.assigned_responder_id !== responder.id) {
        return res.status(409).json({ error: 'Incident has already been accepted by another responder.' });
      }

      clearDispatchTimer(incidentId);

      await dbRun(
        `UPDATE incidents 
         SET assigned_responder_id = ?, status = 'Assigned', updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [responder.id, incidentId]
      );

      await dbRun(
        `UPDATE responders SET current_incident_id = ? WHERE id = ?`,
        [incidentId, responder.id]
      );

      await dbRun(
        `INSERT INTO incident_updates (incident_id, status, note, updated_by_name, lat, lng)
         VALUES (?, 'Assigned', ?, ?, ?, ?)`,
        [incidentId, `Accepted by ${req.user.full_name} (${responder.organization_name})`, req.user.full_name, responder.lat, responder.lng]
      );

      await logAudit(req.user.id, req.user.full_name, 'ACCEPT_ASSIGNMENT', incidentId, `Accepted assignment`, req);

      const updated = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
      io.to(`incident_${incidentId}`).emit('incident_updated', updated);
      io.to('dispatch_room').emit('incident_updated', updated);

      return res.json({ success: true, message: 'Assignment accepted', incident: updated });
    } else if (action === 'decline') {
      // Reassign to next responder
      if (activeDispatchTimers.has(incidentId)) {
        const { currentIndex, rankedResponders } = activeDispatchTimers.get(incidentId);
        clearDispatchTimer(incidentId);
        dispatchToNextResponder(incidentId, rankedResponders, currentIndex + 1);
      }

      await logAudit(req.user.id, req.user.full_name, 'DECLINE_ASSIGNMENT', incidentId, `Declined assignment`, req);
      return res.json({ success: true, message: 'Assignment declined' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Incident Status Workflow
app.post('/api/incidents/:id/status', authenticateToken, async (req, res) => {
  const { status, note, lat, lng, resolution_notes, outcome } = req.body;
  const incidentId = req.params.id;

  try {
    const incident = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    let responseTimeSec = incident.response_time_sec;
    if (status === 'On Scene' && !responseTimeSec) {
      const created = new Date(incident.created_at).getTime();
      responseTimeSec = Math.round((Date.now() - created) / 1000);
    }

    await dbRun(
      `UPDATE incidents 
       SET status = ?, response_time_sec = ?, resolution_notes = ?, outcome = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, responseTimeSec || null, resolution_notes || null, outcome || null, incidentId]
    );

    // If responder sent GPS coords, update responder location in DB
    if (lat && lng && req.user.role === 'responder') {
      await dbRun('UPDATE responders SET lat = ?, lng = ?, last_active = CURRENT_TIMESTAMP WHERE user_id = ?', [lat, lng, req.user.id]);
    }

    await dbRun(
      `INSERT INTO incident_updates (incident_id, status, note, updated_by_name, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [incidentId, status, note || `Status transitioned to ${status}`, req.user.full_name, lat || null, lng || null]
    );

    await logAudit(req.user.id, req.user.full_name, 'UPDATE_STATUS', incidentId, `Status: ${status}`, req);

    const updated = await dbGet('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    io.to(`incident_${incidentId}`).emit('incident_status_changed', { incident: updated, note });
    io.to('dispatch_room').emit('incident_status_changed', { incident: updated });

    res.json({ success: true, incident: updated });
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

// Reverse Geocoding Endpoint
app.get('/api/geocode/reverse', async (req, res) => {
  const { lat, lng, latitude, longitude } = req.query;
  const targetLat = parseFloat(lat ?? latitude);
  const targetLng = parseFloat(lng ?? longitude);

  if (isNaN(targetLat) || isNaN(targetLng) || targetLat < -90 || targetLat > 90 || targetLng < -180 || targetLng > 180) {
    return res.status(400).json({ error: 'Invalid coordinates for reverse geocoding' });
  }

  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${targetLat}&lon=${targetLng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'HyperlocalEmergencyResponsePlatform/1.0 (Emergency Coordination Service; contact: support@demo.emergency)'
        },
        timeout: 4500
      }
    );

    if (response.data && response.data.display_name) {
      return res.json({
        success: true,
        address: response.data.display_name,
        details: response.data.address || {},
        lat: targetLat,
        lng: targetLng
      });
    }
  } catch (err) {
    // Graceful fallback if OpenStreetMap reverse geocode times out or is offline
    console.warn("Reverse geocode external request failed:", err.message);
  }

  // Graceful fallback to readable coordinates
  return res.json({
    success: true,
    address: `Incident Pin: Lat ${targetLat.toFixed(5)}, Lng ${targetLng.toFixed(5)}`,
    details: {},
    lat: targetLat,
    lng: targetLng,
    fallback: true
  });
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

// ================= SERVER STARTUP =================
server.listen(PORT, async () => {
  await seedDatabase();
  console.log(`🚨 Hyperlocal Emergency Response Platform Server running on http://127.0.0.1:${PORT}`);
});
