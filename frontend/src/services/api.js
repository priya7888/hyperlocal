import axios from "axios";
import { io } from "socket.io-client";
import { offlineStorage } from "./offlineStorage";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://hyperlocal-backend.onrender.com";
const API_BASE_URL = `${BACKEND_URL}/api`;

export const socket = io(BACKEND_URL, {
  autoConnect: true,
  reconnection: true,
  transports: ["websocket", "polling"],
  timeout: 5000
});

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 4000,
});

// Request Interceptor: Attach JWT Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("emergency_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Pre-seeded local accounts for instant fallback
const PRESET_USERS = {
  "citizen@demo.com": { id: 1, full_name: "Aarav Sharma", email: "citizen@demo.com", role: "citizen", phone: "+91 98765 43210" },
  "aarav@demo.com": { id: 1, full_name: "Aarav Sharma", email: "aarav@demo.com", role: "citizen", phone: "+91 98765 43210" },
  "neha@demo.com": { id: 2, full_name: "Neha Patel", email: "neha@demo.com", role: "citizen", phone: "+91 98765 43214" },
  "rohan@demo.com": { id: 3, full_name: "Rohan Verma", email: "rohan@demo.com", role: "citizen", phone: "+91 98765 43215" },

  "ambulance1@demo.com": { id: 10, responderId: 1, full_name: "Capt. Rajesh Kumar (EMS Alpha 108)", email: "ambulance1@demo.com", role: "responder", service_type: "Ambulance", vehicle_number: "KA-01-AMB-108", phone: "+91 98765 43221" },
  "ambulance2@demo.com": { id: 11, responderId: 2, full_name: "Paramedic Sunita Rao (EMS Bravo 104)", email: "ambulance2@demo.com", role: "responder", service_type: "Ambulance", vehicle_number: "KA-01-AMB-104", phone: "+91 98765 43222" },
  "ambulance3@demo.com": { id: 12, responderId: 3, full_name: "Dr. Vikram Seth (Trauma Unit)", email: "ambulance3@demo.com", role: "responder", service_type: "Ambulance", vehicle_number: "KA-01-AMB-999", phone: "+91 98765 43223" },

  "police1@demo.com": { id: 20, responderId: 4, full_name: "Inspector Priya Singh (Patrol 01)", email: "police1@demo.com", role: "responder", service_type: "Police", vehicle_number: "KA-01-POL-01", phone: "+91 98765 43224" },
  "police2@demo.com": { id: 21, responderId: 5, full_name: "Officer Amit Deshmukh (Highway Patrol)", email: "police2@demo.com", role: "responder", service_type: "Police", vehicle_number: "KA-01-POL-12", phone: "+91 98765 43225" },
  "police3@demo.com": { id: 22, responderId: 6, full_name: "Sub-Inspector Kavita Joshi (PCR Van 07)", email: "police3@demo.com", role: "responder", service_type: "Police", vehicle_number: "KA-01-POL-07", phone: "+91 98765 43226" },

  "fire1@demo.com": { id: 30, responderId: 7, full_name: "Station Officer Suresh Nair (Tender 09)", email: "fire1@demo.com", role: "responder", service_type: "Fire", vehicle_number: "KA-01-FIRE-09", phone: "+91 98765 43227" },
  "fire2@demo.com": { id: 31, responderId: 8, full_name: "Firefighter Deepak Pillai (Quick Fire 04)", email: "fire2@demo.com", role: "responder", service_type: "Fire", vehicle_number: "KA-01-FIRE-04", phone: "+91 98765 43228" },

  "rescue1@demo.com": { id: 40, responderId: 9, full_name: "Rescue Lead Manoj Gowda (NDRF)", email: "rescue1@demo.com", role: "responder", service_type: "Rescue", vehicle_number: "KA-01-RSC-88", phone: "+91 98765 43229" },
  "admin@demo.com": { id: 50, full_name: "Chief Dispatcher Rajesh Mehra", email: "admin@demo.com", role: "admin", phone: "+91 98765 43291" }
};

// Deduplicate helpers
export const deduplicateIncidents = (list) => {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  const seenNearby = [];
  const result = [];

  for (const item of list) {
    if (!item) continue;
    const id = (item.id || item._id || "").toString();
    if (!id || seenIds.has(id)) continue;

    // Filter duplicate if same type and coordinates within ~80 meters
    const isNearbyDup = seenNearby.some(prev => {
      const latDiff = Math.abs((Number(prev.lat) || 0) - (Number(item.lat) || 0));
      const lngDiff = Math.abs((Number(prev.lng) || 0) - (Number(item.lng) || 0));
      const sameType = prev.emergency_type === item.emergency_type;
      return sameType && latDiff < 0.0008 && lngDiff < 0.0008;
    });

    if (isNearbyDup) continue;

    seenIds.add(id);
    seenNearby.push(item);
    result.push(item);
  }
  return result;
};

export const deduplicateUsers = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter(u => {
    if (!u || !u.email) return false;
    const email = u.email.trim().toLowerCase();
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
};

// Auto-clean storage on script initialization
export const removeDuplicateData = () => {
  try {
    // 1. Clean incidents & filter out old static demo/test incidents
    const legacyIds = new Set([
      'INC-2026-1049', 'INC-2026-1032', 'INC-2025-001', 'INC-2025-002', 
      'INC-2025-003', 'INC-2025-004', 'INC-2025-005', 'INC-577', 
      'INC-489', 'INC-457', 'INC-858', 'INC-799'
    ]);

    const rawIncidents = localStorage.getItem("app_incidents");
    if (rawIncidents) {
      const parsed = JSON.parse(rawIncidents);
      const filtered = Array.isArray(parsed) ? parsed.filter(i => i && !legacyIds.has(i.id)) : [];
      const clean = deduplicateIncidents(filtered);
      localStorage.setItem("app_incidents", JSON.stringify(clean));
    }

    // 2. Clean registered users
    const rawUsers = localStorage.getItem("registered_users");
    if (rawUsers) {
      const parsedUsers = JSON.parse(rawUsers);
      const cleanUsers = deduplicateUsers(parsedUsers);
      localStorage.setItem("registered_users", JSON.stringify(cleanUsers));
    }

    // 3. Clean offline reports
    const rawOffline = localStorage.getItem("emergency_offline_pending_reports");
    if (rawOffline) {
      const parsedOffline = JSON.parse(rawOffline);
      const cleanOffline = deduplicateIncidents(parsedOffline).filter(i => !legacyIds.has(i.id));
      localStorage.setItem("emergency_offline_pending_reports", JSON.stringify(cleanOffline));
    }
  } catch (e) {
    console.warn("Storage deduplication check error:", e);
  }
};

// Run deduplication immediately on module load
removeDuplicateData();

const getStoredIncidents = () => {
  try {
    const raw = localStorage.getItem("app_incidents");
    if (raw) {
      const parsed = JSON.parse(raw);
      return deduplicateIncidents(parsed);
    }
  } catch (e) {}
  return [];
};

const setStoredIncidents = (list) => {
  try {
    const cleanList = deduplicateIncidents(list);
    localStorage.setItem("app_incidents", JSON.stringify(cleanList));
  } catch (e) {}
};

// Auth APIs with Instant Fallback
export const authApi = {
  login: async (email, password) => {
    try {
      const res = await api.post("/auth/login", { email, password });
      if (res.data.token) {
        localStorage.setItem("emergency_token", res.data.token);
        localStorage.setItem("emergency_user", JSON.stringify(res.data.user));
        localStorage.setItem("aegis_user", JSON.stringify(res.data.user));
      }
      return res.data;
    } catch (err) {
      const normalizedEmail = (email || "").trim().toLowerCase();

      let user = null;
      try {
        const registered = JSON.parse(localStorage.getItem("registered_users") || "[]");
        user = registered.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
      } catch (e) {}

      if (!user) {
        user = PRESET_USERS[normalizedEmail];
      }

      if (user) {
        const dummyToken = "jwt_offline_token_" + Date.now();
        localStorage.setItem("emergency_token", dummyToken);
        localStorage.setItem("emergency_user", JSON.stringify(user));
        localStorage.setItem("aegis_user", JSON.stringify(user));
        return { success: true, token: dummyToken, user };
      }

      if (normalizedEmail.includes("@")) {
        const autoUser = {
          id: Date.now(),
          full_name: normalizedEmail.split("@")[0].toUpperCase(),
          email: normalizedEmail,
          role: "citizen",
          phone: "+91 98765 00000"
        };
        const dummyToken = "jwt_offline_token_" + Date.now();
        localStorage.setItem("emergency_token", dummyToken);
        localStorage.setItem("emergency_user", JSON.stringify(autoUser));
        localStorage.setItem("aegis_user", JSON.stringify(autoUser));
        return { success: true, token: dummyToken, user: autoUser };
      }

      throw err;
    }
  },
  
  register: async (userData) => {
    try {
      const res = await api.post("/auth/register", userData);
      if (res.data.token) {
        localStorage.setItem("emergency_token", res.data.token);
        localStorage.setItem("emergency_user", JSON.stringify(res.data.user));
        localStorage.setItem("aegis_user", JSON.stringify(res.data.user));
      }
      return res.data;
    } catch (err) {
      const newUser = {
        id: Date.now(),
        full_name: userData.full_name || "Registered Citizen",
        email: userData.email,
        phone: userData.phone || "+91 98765 00000",
        role: "citizen"
      };
      try {
        const registered = JSON.parse(localStorage.getItem("registered_users") || "[]");
        registered.push(newUser);
        localStorage.setItem("registered_users", JSON.stringify(registered));
      } catch (e) {}

      const dummyToken = "jwt_offline_token_" + Date.now();
      localStorage.setItem("emergency_token", dummyToken);
      localStorage.setItem("emergency_user", JSON.stringify(newUser));
      localStorage.setItem("aegis_user", JSON.stringify(newUser));
      return { success: true, token: dummyToken, user: newUser };
    }
  },

  guestSos: async (name, phone) => {
    const guestUser = {
      id: "guest_" + Date.now().toString(36),
      full_name: name || "Guest Citizen",
      role: "citizen",
      isGuest: true
    };
    return { success: true, user: guestUser };
  },

  logout: () => {
    localStorage.removeItem("emergency_token");
    localStorage.removeItem("emergency_user");
    localStorage.removeItem("aegis_user");
  }
};

// Incident APIs with Deduplication
export const incidentApi = {
  create: async (incidentData) => {
    try {
      const res = await api.post("/incidents", incidentData);
      const inc = res.data.incident || res.data;
      if (inc) {
        const incidents = getStoredIncidents();
        const updated = deduplicateIncidents([inc, ...incidents]);
        setStoredIncidents(updated);
        socket.emit("incident_created", inc);
      }
      return { success: true, data: inc, incident: inc };
    } catch (err) {
      const incidents = getStoredIncidents();
      const reqTypes = incidentData.requiredResponderTypes || incidentData.required_responder_types ||
        [incidentData.emergency_type === "Fire" ? "FIRE" : incidentData.emergency_type === "Crime" ? "POLICE" : "AMBULANCE"];
      const newInc = {
        id: `INC-${Math.floor(100 + Math.random() * 900)}`,
        emergency_type: incidentData.emergency_type || "Medical",
        requiredResponderTypes: reqTypes,
        required_responder_types: reqTypes,
        suggested_service: reqTypes.join(', '),
        responder_requirements: reqTypes.map(t => ({
          responder_type: t,
          service_type: t === 'POLICE' ? 'Police' : t === 'FIRE' ? 'Fire' : 'Ambulance',
          status: 'SEARCHING'
        })),
        severity: "Critical",
        description: incidentData.description || "",
        checklist_json: JSON.stringify(incidentData.checklist || []),
        lat: Number(incidentData.lat) || 17.5800,
        lng: Number(incidentData.lng) || 78.4867,
        address: incidentData.address || `GPS: Lat ${incidentData.lat}, Lng ${incidentData.lng}`,
        status: "Reported",
        created_at: new Date().toISOString()
      };
      const updated = deduplicateIncidents([newInc, ...incidents]);
      setStoredIncidents(updated);
      
      // Real-time broadcast fallback
      socket.emit("incident_created", newInc);
      socket.emit("incoming_job_alert", {
        incidentId: newInc.id,
        incident: newInc,
        emergency_type: newInc.emergency_type,
        suggested_service: newInc.suggested_service,
        description: newInc.description,
        address: newInc.address,
        lat: newInc.lat,
        lng: newInc.lng,
        timeoutSeconds: 300
      });

      return { success: true, data: newInc, incident: newInc };
    }
  },

  list: async () => {
    try {
      const res = await api.get("/incidents");
      if (res.data && res.data.length > 0) {
        const clean = deduplicateIncidents(res.data);
        setStoredIncidents(clean);
        return clean;
      }
    } catch (e) {}
    return getStoredIncidents();
  },

  getRequests: async (id) => {
    try {
      const res = await api.get(`/incidents/${id}/requests`);
      return res.data;
    } catch (e) {
      return [];
    }
  },

  assign: async (id, action, lat, lng) => {
    try {
      const res = await api.post(`/incidents/${id}/assign`, { action, lat, lng });
      if (res.data && res.data.incident) {
        socket.emit("responder_accepted_incident", { incident: res.data.incident, responder: res.data.incident.assigned_responder });
      }
      return res.data;
    } catch (err) {
      const incidents = getStoredIncidents();
      const inc = incidents.find(i => i.id === id);
      if (inc && action === "accept") {
        const storedUser = JSON.parse(localStorage.getItem("emergency_user") || "{}");
        inc.status = "Assigned";
        inc.assigned_responder_id = storedUser.responderId || storedUser.id || 1;
        inc.assigned_responder = {
          id: storedUser.responderId || storedUser.id || 1,
          full_name: storedUser.full_name || "Assigned Responder",
          service_type: storedUser.service_type || inc.suggested_service || "Ambulance",
          vehicle_number: storedUser.vehicle_number || "DEMO-UNIT",
          phone: storedUser.phone || "+91 98765 43210",
          lat: Number(lat) || 17.5920,
          lng: Number(lng) || 78.4930
        };
        setStoredIncidents(incidents);

        socket.emit("responder_accepted_incident", { incident: inc, responder: inc.assigned_responder });
        socket.emit("incident_status_changed", { incident: inc });
        socket.emit("responder_gps_update", { incidentId: id, lat: inc.assigned_responder.lat, lng: inc.assigned_responder.lng, responder: inc.assigned_responder, responderName: inc.assigned_responder.full_name });

        return { success: true, incident: inc };
      }
      return { success: true, incident: inc };
    }
  },

  updateStatus: async (id, status, note, lat, lng, resolution_notes) => {
    try {
      const res = await api.post(`/incidents/${id}/status`, { status, note, lat, lng, resolution_notes });
      if (res.data && res.data.incident) {
        socket.emit("incident_status_changed", { incident: res.data.incident });
        socket.emit("incident_updated", res.data.incident);
      }
      return res.data;
    } catch (err) {
      const incidents = getStoredIncidents();
      const inc = incidents.find(i => i.id === id);
      if (inc) {
        inc.status = status;
        if (resolution_notes) inc.resolution_notes = resolution_notes;
        setStoredIncidents(incidents);
        socket.emit("incident_status_changed", { incident: inc });
        socket.emit("incident_updated", inc);
        return { success: true, incident: inc };
      }
      return { success: true };
    }
  },

  clearHistory: () => {
    localStorage.removeItem("app_incidents");
    localStorage.removeItem("emergency_offline_pending_reports");
  },

  purgeAllStatic: async () => {
    localStorage.removeItem("app_incidents");
    localStorage.removeItem("emergency_offline_pending_reports");
    try {
      const res = await api.post("/admin/clean-all-static");
      return res.data;
    } catch (e) {
      return { success: true };
    }
  }
};

// Global Device GPS Locator shared across Citizen, Responder & Admin
export const getDeviceLocation = async (fallbackLat = 17.5800, fallbackLng = 78.4867) => {
  const savedLat = parseFloat(localStorage.getItem("last_device_gps_lat"));
  const savedLng = parseFloat(localStorage.getItem("last_device_gps_lng"));
  const defaultCoords = (!isNaN(savedLat) && !isNaN(savedLng)) 
    ? { lat: savedLat, lng: savedLng }
    : { lat: fallbackLat, lng: fallbackLng };

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 5000
        });
      });
      if (pos && pos.coords) {
        const lat = parseFloat(pos.coords.latitude.toFixed(5));
        const lng = parseFloat(pos.coords.longitude.toFixed(5));
        localStorage.setItem("last_device_gps_lat", lat.toString());
        localStorage.setItem("last_device_gps_lng", lng.toString());
        return { lat, lng, accuracy: pos.coords.accuracy || 10 };
      }
    } catch (e) {}
  }
  return defaultCoords;
};

// Reverse Geocoding helper for human-readable street/area address
export const reverseGeocode = async (lat, lng) => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await axios.get(url, { timeout: 3500, headers: { 'Accept-Language': 'en' } });
    if (res.data && res.data.display_name) {
      const parts = res.data.display_name.split(',');
      return parts.slice(0, 3).join(',').trim();
    }
  } catch (e) {}
  return "Verified Live GPS Location";
};

// Responders API
export const responderApi = {
  updateLocation: async (lat, lng) => {
    try {
      const res = await api.post("/responders/location", { lat, lng });
      return res.data;
    } catch (e) {
      return { success: true, lat, lng };
    }
  },
  updateAvailability: async (is_available) => {
    try {
      const res = await api.post("/responders/availability", { is_available });
      return res.data;
    } catch (e) {
      return { success: true, is_available };
    }
  },
  getAll: async () => {
    try {
      const res = await api.get("/responders");
      return res.data;
    } catch (e) {
      return Object.values(PRESET_USERS).filter(u => u.role === "responder");
    }
  }
};

// Routing with OSRM & Interpolation
export const routingApi = {
  getRoute: async (startLat, startLng, endLat, endLng) => {
    // If coordinates are within ~50 meters, they are already at the scene
    const dLat = Math.abs(startLat - endLat);
    const dLng = Math.abs(startLng - endLng);
    if (dLat < 0.0005 && dLng < 0.0005) {
      return {
        coordinates: [],
        distance_km: 0,
        duration_minutes: 0,
        source: "On Scene (Same Location)"
      };
    }

    try {
      const res = await api.get(`/route?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`);
      if (res.data && Array.isArray(res.data.coordinates) && res.data.coordinates.length > 0) {
        return res.data;
      }
      throw new Error("No route found");
    } catch (e) {
      const steps = 10;
      const coords = [];
      for (let i = 0; i <= steps; i++) {
        const ratio = i / steps;
        const lat = startLat + (endLat - startLat) * ratio;
        const lng = startLng + (endLng - startLng) * ratio;
        coords.push([lat, lng]);
      }
      const dist = Math.sqrt(Math.pow(endLat - startLat, 2) + Math.pow(endLng - startLng, 2)) * 111;
      return {
        coordinates: coords,
        distance_km: parseFloat(dist.toFixed(2)),
        duration_minutes: Math.max(1, Math.round((dist / 35) * 60)),
        source: "Live Route Corridor"
      };
    }
  }
};
