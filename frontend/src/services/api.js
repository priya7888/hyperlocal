import axios from "axios";
import { io } from "socket.io-client";
import { offlineStorage } from "./offlineStorage";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";
const API_BASE_URL = `${BACKEND_URL}/api`;
export const socket = io(BACKEND_URL, {
  autoConnect: true,
  reconnection: true
});

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
});

// Request Interceptor: Attach JWT Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("emergency_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Auth APIs
export const authApi = {
  login: async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    if (res.data.token) {
      localStorage.setItem("emergency_token", res.data.token);
      localStorage.setItem("emergency_user", JSON.stringify(res.data.user));
    }
    return res.data;
  },
  
  register: async (userData) => {
    const res = await api.post("/auth/register", userData);
    if (res.data.token) {
      localStorage.setItem("emergency_token", res.data.token);
      localStorage.setItem("emergency_user", JSON.stringify(res.data.user));
    }
    return res.data;
  },

  guestSos: async (name, phone) => {
    const res = await api.post("/auth/guest-sos", { name, phone });
    if (res.data.token) {
      localStorage.setItem("emergency_token", res.data.token);
      localStorage.setItem("emergency_user", JSON.stringify(res.data.user));
    }
    return res.data;
  },

  switchRole: async (roleName) => {
    const res = await api.post(`/auth/demo-switch?role=${roleName}`);
    if (res.data.token) {
      localStorage.setItem("emergency_token", res.data.token);
      localStorage.setItem("emergency_user", JSON.stringify(res.data.user));
    }
    return res.data;
  },

  logout: () => {
    localStorage.removeItem("emergency_token");
    localStorage.removeItem("emergency_user");
  }
};

// Incident APIs
export const incidentApi = {
  create: async (incidentData) => {
    try {
      const res = await api.post("/incidents", incidentData);
      return { success: true, data: res.data.incident, isDuplicate: res.data.isDuplicate, mergedInto: res.data.mergedInto, offline: false };
    } catch (err) {
      if (!navigator.onLine || !err.response) {
        const saved = offlineStorage.saveOfflineReport(incidentData);
        return { 
          success: true, 
          offline: true, 
          data: {
            id: saved.offlineId,
            emergency_type: incidentData.emergency_type,
            suggested_service: "Pending Sync",
            severity: "Critical",
            description: incidentData.description,
            checklist: incidentData.checklist,
            lat: incidentData.lat,
            lng: incidentData.lng,
            status: "Saved offline — not yet sent",
            created_at: saved.createdOfflineAt,
            updates: [
              {
                id: 1,
                status: "Offline Draft",
                note: "Saved locally on device. Will auto-sync when connection is restored.",
                created_at: saved.createdOfflineAt
              }
            ]
          }
        };
      }
      throw err;
    }
  },

  list: async () => {
    const res = await api.get("/incidents");
    return res.data;
  },

  getById: async (id) => {
    const res = await api.get(`/incidents/${id}`);
    return res.data;
  },

  assign: async (id, action) => {
    const res = await api.post(`/incidents/${id}/assign`, { action });
    return res.data;
  },

  updateStatus: async (id, status, note = null, lat = null, lng = null, resolution_notes = null, outcome = null) => {
    const res = await api.post(`/incidents/${id}/status`, {
      status,
      note,
      lat,
      lng,
      resolution_notes,
      outcome
    });
    return res.data;
  },

  override: async (id, severity, suggested_service, note) => {
    const res = await api.post(`/incidents/${id}/override`, { severity, suggested_service, note });
    return res.data;
  }
};

// In-App Chat APIs
export const chatApi = {
  getChats: async (incidentId) => {
    const res = await api.get(`/incidents/${incidentId}/chat`);
    return res.data;
  },
  sendChat: async (incidentId, message) => {
    const res = await api.post(`/incidents/${incidentId}/chat`, { message });
    return res.data;
  }
};

// Responders & Location APIs
export const responderApi = {
  updateLocation: async (lat, lng) => {
    const res = await api.post("/responders/location", { lat, lng });
    return res.data;
  },

  updateAvailability: async (is_available) => {
    const res = await api.post("/responders/availability", { is_available });
    return res.data;
  },

  getAll: async () => {
    const res = await api.get("/responders");
    return res.data;
  }
};

// Area Alerts API
export const alertApi = {
  getAll: async () => {
    const res = await api.get("/alerts");
    return res.data;
  },
  create: async (alertData) => {
    const res = await api.post("/alerts", alertData);
    return res.data;
  }
};

// Route & Navigation APIs
export const routingApi = {
  getRoute: async (startLat, startLng, endLat, endLng) => {
    try {
      const res = await api.get(`/route?start_lat=${startLat}&start_lng=${startLng}&end_lat=${endLat}&end_lng=${endLng}`);
      return res.data;
    } catch (e) {
      return {
        coordinates: [[startLat, startLng], [endLat, endLng]],
        distance_km: 1.5,
        duration_minutes: 4,
        source: "Direct Interpolation"
      };
    }
  }
};

// Reverse Geocoding API
export const geocodingApi = {
  reverse: async (lat, lng) => {
    try {
      const res = await api.get(`/geocode/reverse?lat=${lat}&lng=${lng}`);
      return res.data;
    } catch (e) {
      return {
        success: true,
        address: `Lat: ${parseFloat(lat).toFixed(5)}, Lng: ${parseFloat(lng).toFixed(5)}`,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        fallback: true
      };
    }
  }
};

// Contacts API
export const contactsApi = {
  fetchAndCache: async () => {
    try {
      const res = await api.get("/contacts");
      offlineStorage.saveContacts(res.data);
      return { contacts: res.data, offline: false };
    } catch (e) {
      const cached = offlineStorage.getContacts();
      return { contacts: cached.data || [], offline: true, cachedAt: cached.cachedAt };
    }
  }
};

// Translation Helper
export const translationApi = {
  translate: async (text, sourceLanguage = "auto") => {
    // Fast dictionary & phonetic translator
    const dict = {
      "madad": "Help needed immediately",
      "bachao": "Save me / Help",
      "aag": "Fire broke out",
      "accident": "Road accident occurred",
      "khoon": "Severe bleeding reported",
      "chot": "Injuries sustained",
      "behosh": "Person is unconscious",
      "saans": "Difficulty breathing",
      "flood": "Flash flood / Water rising",
      "paani": "Water rising rapidly",
      "chori": "Theft / robbery occurred",
      "police": "Send police immediately",
      "ambulance": "Send ambulance immediately"
    };

    let translated = text;
    for (const [k, v] of Object.entries(dict)) {
      if (text.toLowerCase().includes(k)) {
        translated = `${v} (Details: ${text})`;
        break;
      }
    }
    return { original_text: text, translated_text: translated, detected_language: sourceLanguage };
  }
};

// Analytics API
export const analyticsApi = {
  getStats: async () => {
    const res = await api.get("/analytics");
    return res.data;
  },
  downloadCsvUrl: `${API_BASE_URL}/analytics/export-csv`
};

// Demo Mode Simulation
export const demoApi = {
  simulateFullCycle: async () => {
    const res = await api.post("/demo/simulate-full-cycle");
    return res.data;
  }
};
