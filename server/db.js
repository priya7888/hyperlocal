const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'emergency.sqlite');
const db = new sqlite3.Database(DB_PATH);

// Helper promise wrappers for async/await
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize schema tables
async function initDB() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'citizen', -- 'citizen', 'responder', 'admin'
      emergency_contact_phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS responders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      service_type TEXT NOT NULL, -- 'Ambulance', 'Police', 'Fire', 'Rescue'
      is_available INTEGER DEFAULT 1,
      is_verified INTEGER DEFAULT 1,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      vehicle_number TEXT,
      badge_number TEXT,
      organization_name TEXT,
      rating REAL DEFAULT 4.9,
      current_incident_id TEXT,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      citizen_id INTEGER,
      citizen_name TEXT NOT NULL,
      citizen_phone TEXT,
      emergency_type TEXT NOT NULL, -- 'Medical', 'Fire', 'Crash', 'Crime', 'Flood', 'Hazard', 'Other'
      severity TEXT NOT NULL DEFAULT 'Medium', -- 'Low', 'Medium', 'Critical'
      suggested_service TEXT NOT NULL,
      description TEXT NOT NULL,
      voice_transcript TEXT,
      checklist_json TEXT DEFAULT '[]',
      photo_url TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      address TEXT,
      status TEXT DEFAULT 'Reported', -- 'Reported', 'Assigned', 'En Route', 'On Scene', 'Resolved', 'Merged', 'Cancelled'
      assigned_responder_id INTEGER,
      merged_into_id TEXT,
      response_time_sec INTEGER,
      resolution_notes TEXT,
      outcome TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (assigned_responder_id) REFERENCES responders(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS incident_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      updated_by_name TEXT,
      lat REAL,
      lng REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS incident_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      sender_id INTEGER,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS area_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      alert_type TEXT NOT NULL, -- 'Warning', 'Evacuation', 'Hazard Alert'
      radius_km REAL DEFAULT 3.0,
      center_lat REAL NOT NULL,
      center_lng REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT NULL,
      incident_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      service_type TEXT NOT NULL,
      address TEXT,
      lat REAL,
      lng REAL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS incident_responder_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      responder_id INTEGER NOT NULL,
      responder_type TEXT NOT NULL,
      distance_km REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REJECTED_BY_ASSIGNMENT'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME,
      expires_at DATETIME,
      FOREIGN KEY (incident_id) REFERENCES incidents(id),
      FOREIGN KEY (responder_id) REFERENCES responders(id),
      UNIQUE(incident_id, responder_id)
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_requests_incident ON incident_responder_requests(incident_id);
  `);
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_requests_responder ON incident_responder_requests(responder_id);
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS incident_required_responder_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL,
      responder_type TEXT NOT NULL, -- 'POLICE', 'AMBULANCE', 'FIRE'
      status TEXT NOT NULL DEFAULT 'SEARCHING', -- 'SEARCHING', 'ASSIGNED', 'NO_RESPONDER_AVAILABLE'
      assigned_responder_id INTEGER,
      assigned_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id),
      FOREIGN KEY (assigned_responder_id) REFERENCES responders(id),
      UNIQUE(incident_id, responder_type)
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_required_responder_types_inc ON incident_required_responder_types(incident_id);
  `);

  try {
    await dbRun(`ALTER TABLE incidents ADD COLUMN required_responder_types_json TEXT DEFAULT '[]'`);
  } catch (e) {
    // Column already exists
  }

  console.log("SQLite schema initialized successfully.");
}

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDB
};
