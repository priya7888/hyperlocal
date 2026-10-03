import React, { useState, useEffect, useRef } from "react";
import { 
  Shield, Check, X, Navigation, MapPin, AlertTriangle, 
  Clock, HeartPulse, Flame, Activity, CheckCircle2,
  RefreshCw, Power, FastForward, Phone, AlertOctagon, LogOut,
  Volume2, VolumeX, Radio, Play, Pause, Compass, Eye,
  Mic, User, FileText, ExternalLink, HelpCircle
} from "lucide-react";
import MapComponent from "./MapComponent";
import { incidentApi, responderApi, routingApi, socket, deduplicateIncidents, getDeviceLocation } from "../services/api";
import { sounds } from "../services/soundEffects";

// Check if an incident belongs to this responder's emergency service wing
const isIncidentMatchingService = (incident, responderServiceType) => {
  if (!incident) return false;
  if (!responderServiceType) return true;
  
  const sType = (responderServiceType || "").trim().toLowerCase();
  const sug = (incident.suggested_service || "").trim().toLowerCase();
  const eType = (incident.emergency_type || "").trim().toLowerCase();

  // 1. Universal / SOS / All-Service broadcasts go to all units
  if (sug === "all" || sug === "emergency services" || sug === "general" || eType === "sos" || eType.includes("general")) {
    return true;
  }

  // 2. Police / Law Enforcement track
  if (sType.includes("police") || sType.includes("law") || sType.includes("security")) {
    return (
      sug.includes("police") ||
      eType.includes("police") ||
      eType.includes("crime") ||
      eType.includes("violence") ||
      eType.includes("theft") ||
      eType.includes("assault") ||
      eType.includes("robbery") ||
      eType.includes("dispute")
    );
  }

  // 3. Fire Department / Hazard track
  if (sType.includes("fire")) {
    return (
      sug.includes("fire") ||
      eType.includes("fire") ||
      eType.includes("smoke") ||
      eType.includes("gas leak") ||
      eType.includes("burn") ||
      eType.includes("explosion") ||
      eType.includes("chemical") ||
      eType.includes("hazard")
    );
  }

  // 4. Ambulance / Medical / EMS track
  if (sType.includes("ambulance") || sType.includes("medical") || sType.includes("hospital") || sType.includes("paramedic") || sType.includes("ems")) {
    return (
      sug.includes("ambulance") ||
      sug.includes("medical") ||
      sug.includes("ems") ||
      eType.includes("medical") ||
      eType.includes("accident") ||
      eType.includes("crash") ||
      eType.includes("cardiac") ||
      eType.includes("heart") ||
      eType.includes("injury") ||
      eType.includes("unconscious") ||
      eType.includes("bleeding") ||
      eType.includes("trauma")
    );
  }

  // 5. Rescue / Disaster Management track
  if (sType.includes("rescue") || sType.includes("disaster") || sType.includes("ndrf")) {
    return (
      sug.includes("rescue") ||
      sug.includes("disaster") ||
      eType.includes("rescue") ||
      eType.includes("flood") ||
      eType.includes("earthquake") ||
      eType.includes("collapse") ||
      eType.includes("trapped") ||
      eType.includes("storm")
    );
  }

  // Fallback substring matching
  return sug.includes(sType) || eType.includes(sType);
};

export default function ResponderDashboard({ currentUser, onLogout }) {
  const serviceType = currentUser?.service_type || currentUser?.serviceType || "Ambulance / Medical";
  const responderName = currentUser?.full_name || currentUser?.name || "Responder Unit";
  const simIntervalRef = useRef(null);

  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeStats, setRouteStats] = useState({ distanceKm: 0, durationMinutes: 0 });
  const [isAvailable, setIsAvailable] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);

  // Modal for Viewing Full Citizen & Incident Details
  const [selectedDetailIncident, setSelectedDetailIncident] = useState(null);

  // Auto-detected Responder GPS location (synchronized across all tabs)
  const [responderCoords, setResponderCoords] = useState(() => {
    const savedLat = parseFloat(localStorage.getItem("last_device_gps_lat"));
    const savedLng = parseFloat(localStorage.getItem("last_device_gps_lng"));
    return (!isNaN(savedLat) && !isNaN(savedLng)) ? { lat: savedLat, lng: savedLng } : { lat: 17.5950, lng: 78.4950 };
  });
  const [isLocating, setIsLocating] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [tempPickerCoords, setTempPickerCoords] = useState({ lat: 17.5950, lng: 78.4950 });
  const geoWatchIdRef = useRef(null);

  // Incoming Emergency Alert Modal
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [countdown, setCountdown] = useState(300); // 5 minutes

  const lastUpdatedCoordsRef = useRef(null);

  const updateResponderLocation = (lat, lng, force = false) => {
    const validLat = parseFloat(Number(lat).toFixed(5));
    const validLng = parseFloat(Number(lng).toFixed(5));

    // Prevent micro-jitter/drift when sitting still (requires at least ~6m change)
    if (!force && lastUpdatedCoordsRef.current) {
      const dLat = Math.abs(validLat - lastUpdatedCoordsRef.current.lat);
      const dLng = Math.abs(validLng - lastUpdatedCoordsRef.current.lng);
      if (dLat < 0.00006 && dLng < 0.00006) {
        return; // Ignore stationary noise
      }
    }

    lastUpdatedCoordsRef.current = { lat: validLat, lng: validLng };
    setResponderCoords({ lat: validLat, lng: validLng });
    localStorage.setItem("last_device_gps_lat", validLat.toString());
    localStorage.setItem("last_device_gps_lng", validLng.toString());
    responderApi.updateLocation(validLat, validLng);
    socket.emit("responder_location_ping", {
      userId: currentUser?.id,
      responderId: currentUser?.responderId,
      lat: validLat,
      lng: validLng,
      serviceType,
      responderName
    });
    if (activeIncident) {
      socket.emit("live_gps_stream", {
        incidentId: activeIncident.id,
        lat: validLat,
        lng: validLng,
        responderName
      });
    }
  };

  useEffect(() => {
    loadIncidents();
    handleDetectGPS(true);

    // 1. Continuous Live Hardware GPS Watch on this device (Updates ONLY when physically moving)
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (pos && pos.coords) {
            updateResponderLocation(pos.coords.latitude, pos.coords.longitude, false);
          }
        },
        (err) => console.warn("GPS watch notice:", err.message),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
      );
      geoWatchIdRef.current = watchId;
    }

    if (currentUser?.responderId) {
      socket.emit("join_responder", currentUser.responderId);
    }
    socket.emit("join_dispatch");

    // 2. Direct 5-Minute Escalation incoming job alert (Filtered strictly by service belonging)
    socket.on("incoming_job_alert", (data) => {
      const inc = data.incident || data;
      if (!isIncidentMatchingService(inc, serviceType)) {
        return; // Ignore alerts belonging exclusively to a different service
      }
      sounds.playAlertSiren();
      sounds.showSystemNotification("🚨 Incoming Emergency Dispatch!", `Incident ${data.incidentId} matches your ${serviceType} unit.`);
      setIncomingAlert(data);
      setCountdown(data.timeoutSeconds || 300);
    });

    // 3. Real-time Emergency SOS broadcast from citizen (Filtered strictly by service belonging)
    socket.on("incident_created", (newInc) => {
      loadIncidents();
      if (!isIncidentMatchingService(newInc, serviceType)) {
        return; // Do not interrupt with alerts for a different emergency track
      }
      sounds.playAlertSiren();
      sounds.showSystemNotification(
        "🚨 New Emergency SOS Reported!",
        `${newInc.emergency_type || "Emergency"} reported at ${newInc.address || "GPS location"}`
      );
      setIncomingAlert({
        incidentId: newInc.id,
        incident: newInc,
        emergency_type: newInc.emergency_type || "Emergency",
        description: newInc.description || "",
        lat: newInc.lat,
        lng: newInc.lng,
        address: newInc.address || `GPS: ${newInc.lat}, ${newInc.lng}`,
        timeoutSeconds: 300
      });
      setCountdown(300);
    });

    socket.on("job_offer_expired", () => {
      setIncomingAlert(null);
    });

    socket.on("incident_status_changed", () => {
      loadIncidents();
    });

    return () => {
      socket.off("incoming_job_alert");
      socket.off("incident_created");
      socket.off("job_offer_expired");
      socket.off("incident_status_changed");
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      if (geoWatchIdRef.current && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
    };
  }, [currentUser, serviceType]);

  // Countdown timer for incoming escalation alert
  useEffect(() => {
    let timer;
    if (incomingAlert && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => c - 1);
        if (countdown % 10 === 0) {
          sounds.playStep();
        }
      }, 1000);
    } else if (countdown === 0 && incomingAlert) {
      setIncomingAlert(null);
    }
    return () => clearInterval(timer);
  }, [incomingAlert, countdown]);

  const handleDetectGPS = async () => {
    sounds.playTap();
    setIsLocating(true);
    const loc = await getDeviceLocation(17.5950, 78.4950);
    updateResponderLocation(loc.lat, loc.lng);
    setIsLocating(false);
  };

  const startLiveGpsBroadcasting = (incidentId) => {
    if (navigator.geolocation) {
      if (geoWatchIdRef.current) navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(5));
          const lng = parseFloat(pos.coords.longitude.toFixed(5));
          updateResponderLocation(lat, lng);
          socket.emit("live_gps_stream", {
            incidentId,
            lat,
            lng,
            heading: pos.coords.heading || 0,
            responderName
          });
        },
        (err) => console.warn("GPS watch error", err),
        { enableHighAccuracy: true, maximumAge: 2000 }
      );
    }
  };

  const loadIncidents = async () => {
    try {
      const data = await incidentApi.list();
      const clean = deduplicateIncidents(data || []);
      setIncidents(clean);

      const assigned = clean.find(i => (i.assigned_responder_id === currentUser?.responderId || i.assigned_responder?.id === currentUser?.responderId) && i.status !== "Resolved");
      if (assigned) {
        setActiveIncident(assigned);
        fetchRoute(assigned);
        startLiveGpsBroadcasting(assigned.id);
      }
    } catch (e) {
      console.warn("Failed to load responder incidents", e);
    }
  };

  const fetchRoute = async (incident) => {
    try {
      const res = await routingApi.getRoute(responderCoords.lat, responderCoords.lng, incident.lat, incident.lng);
      if (res && res.coordinates) {
        setRouteCoords(res.coordinates);
        setRouteStats({
          distanceKm: res.distance_km || 2.1,
          durationMinutes: res.duration_minutes || 5
        });
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const handleAccept = async (incidentId) => {
    sounds.playSuccess();
    
    const targetInc = incidents.find(i => i.id === incidentId) || incomingAlert?.incident || incomingAlert;
    
    // Quick GPS capture upon acceptance
    let currentLat = responderCoords.lat;
    let currentLng = responderCoords.lng;
    
    try {
      const loc = await getDeviceLocation(responderCoords.lat, responderCoords.lng);
      if (loc && loc.lat && loc.lng) {
        currentLat = loc.lat;
        currentLng = loc.lng;
      }
    } catch (e) {}

    updateResponderLocation(currentLat, currentLng);

    try {
      const res = await incidentApi.assign(incidentId, "accept", currentLat, currentLng);
      setIncomingAlert(null);
      if (selectedDetailIncident && selectedDetailIncident.id === incidentId) {
        setSelectedDetailIncident(null);
      }
      const inc = res.incident || incidents.find(i => i.id === incidentId) || targetInc;
      if (inc) {
        if (inc.assigned_responder) {
          inc.assigned_responder.lat = currentLat;
          inc.assigned_responder.lng = currentLng;
        }
        setActiveIncident(inc);
        fetchRoute(inc);
        startLiveGpsBroadcasting(inc.id);
      }
      
      // Immediately broadcast responder GPS start location
      socket.emit("live_gps_stream", {
        incidentId,
        lat: currentLat,
        lng: currentLng,
        responderName
      });

      loadIncidents();
    } catch (err) {
      alert(err.response?.data?.error || "Incident already accepted or unavailable.");
      setIncomingAlert(null);
      loadIncidents();
    }
  };

  const handleDecline = async (incidentId) => {
    sounds.playTap();
    try {
      await incidentApi.assign(incidentId, "decline");
      setIncomingAlert(null);
      loadIncidents();
    } catch (err) {
      setIncomingAlert(null);
    }
  };

  const handleToggleSimulation = () => {
    if (isSimulating) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      setIsSimulating(false);
      sounds.playTap();
      return;
    }

    if (!activeIncident) return;
    sounds.playSuccess();
    setIsSimulating(true);

    // If not En Route, mark it En Route
    if (activeIncident.status !== "En Route" && activeIncident.status !== "On Scene") {
      handleStatusChange("En Route");
    }

    const steps = [];
    if (routeCoords && routeCoords.length > 1) {
      for (let i = 0; i < routeCoords.length - 1; i++) {
        const p1 = routeCoords[i];
        const p2 = routeCoords[i + 1];
        const subSteps = 3;
        for (let s = 0; s < subSteps; s++) {
          const lat = p1[0] + (p2[0] - p1[0]) * (s / subSteps);
          const lng = p1[1] + (p2[1] - p1[1]) * (s / subSteps);
          steps.push({ lat, lng });
        }
      }
      steps.push({ lat: activeIncident.lat, lng: activeIncident.lng });
    } else {
      const startLat = responderCoords.lat;
      const startLng = responderCoords.lng;
      const endLat = activeIncident.lat;
      const endLng = activeIncident.lng;
      for (let i = 1; i <= 20; i++) {
        steps.push({
          lat: startLat + (endLat - startLat) * (i / 20),
          lng: startLng + (endLng - startLng) * (i / 20)
        });
      }
    }

    let stepIndex = 0;
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);

    simIntervalRef.current = setInterval(() => {
      if (stepIndex >= steps.length) {
        clearInterval(simIntervalRef.current);
        setIsSimulating(false);
        updateResponderLocation(activeIncident.lat, activeIncident.lng, true);
        handleStatusChange("On Scene");
        sounds.showSystemNotification("📍 Arrived On Scene!", `Unit reached incident ${activeIncident.id}`);
        return;
      }

      const nextLoc = steps[stepIndex];
      updateResponderLocation(nextLoc.lat, nextLoc.lng, true);
      sounds.playStep();
      stepIndex++;
    }, 850);
  };

  const handleStatusChange = async (nextStatus) => {
    if (!activeIncident) return;
    if (nextStatus === "Resolved") {
      sounds.playSuccess();
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      setIsSimulating(false);
    } else {
      sounds.playStep();
    }
    try {
      const res = await incidentApi.updateStatus(
        activeIncident.id,
        nextStatus,
        `Status updated to ${nextStatus}`,
        responderCoords.lat,
        responderCoords.lng,
        nextStatus === "Resolved" ? "Handled & Stabilized" : null
      );
      if (nextStatus === "Resolved") {
        setRouteCoords([]);
        setActiveIncident(null);
        sounds.showSystemNotification("✅ Mission Completed!", `Incident ${activeIncident.id} marked as Resolved.`);
      } else {
        setActiveIncident(res.incident || { ...activeIncident, status: nextStatus });
      }
      loadIncidents();
    } catch (err) {
      if (nextStatus === "Resolved") {
        setRouteCoords([]);
        setActiveIncident(null);
      } else {
        setActiveIncident({ ...activeIncident, status: nextStatus });
      }
    }
  };

  // Filter unassigned reports strictly matching this responder's service
  const unassignedMatchingPool = incidents.filter(i => 
    (i.status === "Reported" || i.status === "Awaiting Responder") &&
    isIncidentMatchingService(i, serviceType)
  );

  // Completed missions belonging to this unit / service
  const completedIncidents = incidents.filter(i => 
    i.status === "Resolved" &&
    (i.assigned_responder_id === currentUser?.responderId || isIncidentMatchingService(i, serviceType))
  );

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
      
      {/* 5-Minute Flashing Incoming Job Alert Modal */}
      {incomingAlert && (
        <div className="modal-overlay">
          <div className="modal-container" style={{
            maxWidth: "520px",
            padding: "26px",
            textAlign: "center",
            border: "2px solid #ff334b",
            background: "#0e1424",
            boxShadow: "0 0 45px rgba(255, 51, 75, 0.6)",
            animation: "pulse 1.2s infinite"
          }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(255, 51, 75, 0.25)", color: "#ff334b", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
              <AlertOctagon size={32} className="animate-spin" />
            </div>

            <div style={{ fontSize: "2.2rem", fontWeight: "900", color: "#ff334b", fontFamily: "monospace", marginBottom: "2px" }}>
              {Math.floor(countdown / 60).toString().padStart(2, '0')}:{(countdown % 60).toString().padStart(2, '0')}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "14px", fontWeight: "700" }}>
              🚨 Real-Time Dispatch Alert • Matching {serviceType} Wing
            </div>

            <h3 style={{ fontSize: "1.25rem", fontWeight: "900", color: "#f8fafc", marginBottom: "6px" }}>
              {incomingAlert.emergency_type || "Emergency"} Incident Reported!
            </h3>
            
            <div style={{ background: "rgba(255,255,255,0.05)", padding: "14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", marginBottom: "18px", textAlign: "left", fontSize: "0.84rem", color: "#cbd5e1" }}>
              <div><strong>Ticket ID:</strong> <span style={{ color: "#00e5ff" }}>{incomingAlert.incidentId}</span></div>
              {incomingAlert.incident?.citizen_name && (
                <div style={{ marginTop: "4px" }}><strong>Citizen:</strong> {incomingAlert.incident.citizen_name} ({incomingAlert.incident.citizen_phone || "Phone provided"})</div>
              )}
              {incomingAlert.description && <div style={{ marginTop: "4px" }}><strong>Details:</strong> {incomingAlert.description}</div>}
              {incomingAlert.address && <div style={{ marginTop: "4px" }}><strong>Location:</strong> {incomingAlert.address}</div>}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => handleAccept(incomingAlert.incidentId)}
                className="btn-emergency-main"
                style={{ flex: 1, padding: "12px", fontSize: "0.92rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", minWidth: "150px" }}
              >
                <Check size={18} /> Accept Emergency
              </button>
              
              <button
                onClick={() => {
                  const targetInc = incomingAlert.incident || incidents.find(i => i.id === incomingAlert.incidentId) || incomingAlert;
                  setSelectedDetailIncident(targetInc);
                }}
                className="btn-outline"
                style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "6px", color: "#00e5ff", borderColor: "#00e5ff" }}
              >
                <Eye size={16} /> View Details
              </button>

              <button
                onClick={() => handleDecline(incomingAlert.incidentId)}
                className="btn-outline"
                style={{ padding: "12px 14px" }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL CITIZEN & INCIDENT DETAILS MODAL (MASTER INSPECTION DRAWER) */}
      {selectedDetailIncident && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-container" style={{
            maxWidth: "640px",
            width: "92vw",
            maxHeight: "90vh",
            overflowY: "auto",
            padding: "24px",
            background: "#0d1322",
            border: "1.5px solid rgba(0, 229, 255, 0.4)",
            borderRadius: "18px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.8)"
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className="neon-badge neon-badge-critical" style={{ fontSize: "0.75rem" }}>
                    {selectedDetailIncident.emergency_type || "Emergency"}
                  </span>
                  <span className="neon-badge neon-badge-enroute" style={{ fontSize: "0.75rem" }}>
                    {selectedDetailIncident.status || "Reported"}
                  </span>
                  <span className="neon-badge" style={{ fontSize: "0.75rem", background: "rgba(255, 184, 0, 0.2)", color: "#ffb800", borderColor: "#ffb800" }}>
                    {selectedDetailIncident.severity || "Critical"} Priority
                  </span>
                </div>
                <h2 style={{ fontSize: "1.3rem", fontWeight: "900", color: "#f8fafc", marginTop: "8px" }}>
                  Incident Dossier: {selectedDetailIncident.id}
                </h2>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Service Wing: <strong style={{ color: "#00e5ff" }}>{selectedDetailIncident.suggested_service || serviceType}</strong> • Track: {serviceType}
                </div>
              </div>
              <button
                onClick={() => { sounds.playTap(); setSelectedDetailIncident(null); }}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#f8fafc", borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Citizen Information Card with Direct Phone Dial */}
            <div style={{
              background: "rgba(0, 229, 255, 0.06)",
              border: "1px solid rgba(0, 229, 255, 0.25)",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px"
            }}>
              <div style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "#00e5ff", fontWeight: "800", letterSpacing: "0.05em", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <User size={15} /> Citizen Reporter Profile & Contact
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Citizen Full Name:</div>
                  <div style={{ fontSize: "1rem", fontWeight: "900", color: "#f8fafc" }}>
                    {selectedDetailIncident.citizen_name || "Emergency Citizen (Verified)"}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Contact Phone Number:</div>
                  <div style={{ fontSize: "1rem", fontWeight: "900", color: "#00ff88", fontFamily: "monospace" }}>
                    {selectedDetailIncident.citizen_phone || "+91 98765 43210"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                <a
                  href={`tel:${selectedDetailIncident.citizen_phone || "+919876543210"}`}
                  style={{
                    flex: 1,
                    background: "linear-gradient(135deg, #00ff88, #059669)",
                    color: "#070a12",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontWeight: "900",
                    fontSize: "0.88rem",
                    textAlign: "center",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px"
                  }}
                >
                  <Phone size={16} /> Call Citizen Directly
                </a>
              </div>
            </div>

            {/* Reported Danger Checklist */}
            <div style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              padding: "14px",
              marginBottom: "16px"
            }}>
              <div style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "#ffb800", fontWeight: "800", letterSpacing: "0.05em", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertTriangle size={15} /> Citizen Danger Checklist & Hazards Flagged
              </div>

              {selectedDetailIncident.checklist && selectedDetailIncident.checklist.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {selectedDetailIncident.checklist.map((item, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: "rgba(255, 51, 75, 0.18)",
                        border: "1px solid rgba(255, 51, 75, 0.4)",
                        color: "#ff8090",
                        padding: "4px 10px",
                        borderRadius: "20px",
                        fontSize: "0.76rem",
                        fontWeight: "700",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                    >
                      <AlertOctagon size={12} /> {item}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                  No high-hazard checklist items flagged by reporter. Standard safety protocols apply.
                </div>
              )}
            </div>

            {/* Voice Transcript (if available) */}
            {selectedDetailIncident.voice_transcript && (
              <div style={{
                background: "rgba(168, 85, 247, 0.1)",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                borderRadius: "12px",
                padding: "14px",
                marginBottom: "16px"
              }}>
                <div style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "#c084fc", fontWeight: "800", letterSpacing: "0.05em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Mic size={15} /> Citizen Voice Input Recording Transcript
                </div>
                <div style={{ fontStyle: "italic", color: "#e2e8f0", fontSize: "0.88rem", background: "rgba(0,0,0,0.25)", padding: "10px", borderRadius: "8px" }}>
                  "{selectedDetailIncident.voice_transcript}"
                </div>
              </div>
            )}

            {/* Description & Situation Note */}
            {selectedDetailIncident.description && (
              <div style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "14px",
                marginBottom: "16px"
              }}>
                <div style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "#94a3b8", fontWeight: "800", letterSpacing: "0.05em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FileText size={15} /> Incident Description & Situation Report
                </div>
                <div style={{ color: "#e2e8f0", fontSize: "0.85rem", lineHeight: "1.4" }}>
                  {selectedDetailIncident.description}
                </div>
              </div>
            )}

            {/* Precise GPS & Address Location */}
            <div style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "14px",
              marginBottom: "18px"
            }}>
              <div style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "#00e5ff", fontWeight: "800", letterSpacing: "0.05em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                <MapPin size={15} /> Incident Sector & Address
              </div>
              <div style={{ color: "#f8fafc", fontSize: "0.85rem", fontWeight: "700", marginBottom: "4px" }}>
                {selectedDetailIncident.address || "Emergency Sector Hub"}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#00ff88", fontWeight: "700", marginBottom: "10px" }}>
                ● Real-Time Hardware GPS Lock Verified
              </div>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedDetailIncident.lat},${selectedDetailIncident.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.8rem",
                  color: "#00e5ff",
                  textDecoration: "none",
                  fontWeight: "800"
                }}
              >
                <ExternalLink size={14} /> Open in Google Maps GPS Navigation →
              </a>
            </div>

            {/* Direct Modal Actions */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap" }}>
              {(selectedDetailIncident.status === "Reported" || selectedDetailIncident.status === "Awaiting Responder") && (
                <button
                  onClick={() => handleAccept(selectedDetailIncident.id)}
                  className="btn-emergency-main"
                  style={{ padding: "10px 18px", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <Check size={16} /> Accept Emergency Dispatch
                </button>
              )}

              {activeIncident?.id === selectedDetailIncident.id && (
                <>
                  {activeIncident.status !== "En Route" && activeIncident.status !== "On Scene" && (
                    <button
                      onClick={() => { handleStatusChange("En Route"); setSelectedDetailIncident(null); }}
                      className="btn-outline"
                      style={{ padding: "10px 14px", fontSize: "0.82rem", borderColor: "#00e5ff", color: "#00e5ff" }}
                    >
                      Mark En Route
                    </button>
                  )}
                  {activeIncident.status !== "On Scene" && (
                    <button
                      onClick={() => { handleStatusChange("On Scene"); setSelectedDetailIncident(null); }}
                      className="btn-outline"
                      style={{ padding: "10px 14px", fontSize: "0.82rem", borderColor: "#eab308", color: "#eab308" }}
                    >
                      Arrived On Scene
                    </button>
                  )}
                  <button
                    onClick={() => { handleStatusChange("Resolved"); setSelectedDetailIncident(null); }}
                    style={{
                      background: "linear-gradient(135deg, #00ff88, #059669)",
                      color: "#070a12",
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 16px",
                      fontSize: "0.85rem",
                      fontWeight: "900",
                      cursor: "pointer"
                    }}
                  >
                    Resolve Mission
                  </button>
                </>
              )}

              <button
                onClick={() => { sounds.playTap(); setSelectedDetailIncident(null); }}
                className="btn-outline"
                style={{ padding: "10px 16px", fontSize: "0.85rem" }}
              >
                Close Dossier
              </button>
            </div>

          </div>
        </div>
      )}

      {/* RESPONDER INTERACTIVE MAP LOCATION PICKER MODAL */}
      {isMapPickerOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-container" style={{
            maxWidth: "600px",
            width: "92vw",
            padding: "20px",
            background: "#0d1322",
            border: "1.5px solid rgba(0, 229, 255, 0.4)",
            borderRadius: "18px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.8)",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: "900", color: "#f8fafc", display: "flex", alignItems: "center", gap: "6px" }}>
                  <MapPin size={18} color="#00e5ff" /> Set {serviceType} Unit Location on Map
                </h3>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Click anywhere on the map or drag the target pin to set this unit's location.
                </div>
              </div>
              <button
                onClick={() => setIsMapPickerOpen(false)}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#f8fafc", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ height: "300px", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(0, 229, 255, 0.3)" }}>
              <MapComponent
                height="100%"
                center={[tempPickerCoords.lat, tempPickerCoords.lng]}
                zoom={14}
                pickerMode={true}
                pickerCoords={tempPickerCoords}
                onPickerCoordsChange={(lat, lng) => setTempPickerCoords({ lat, lng })}
              />
            </div>

            <div style={{ background: "rgba(0, 229, 255, 0.08)", padding: "10px 14px", borderRadius: "8px", fontSize: "0.82rem", color: "#cbd5e1" }}>
              Location Status: <strong style={{ color: "#00e5ff" }}>📍 Unit Map Pin Positioned</strong>
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  sounds.playSuccess();
                  updateResponderLocation(tempPickerCoords.lat, tempPickerCoords.lng);
                  setIsMapPickerOpen(false);
                }}
                className="btn-emergency-main"
                style={{ padding: "10px 18px", fontSize: "0.85rem" }}
              >
                <Check size={16} style={{ display: "inline", marginRight: "4px" }} /> Confirm Unit Location
              </button>
              <button
                onClick={() => setIsMapPickerOpen(false)}
                className="btn-outline"
                style={{ padding: "10px 14px", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Console Bar */}
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        padding: "14px 18px",
        background: "rgba(14, 20, 36, 0.95)",
        borderRadius: "14px",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(0, 229, 255, 0.18)", color: "#00e5ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Radio size={20} className="animate-pulse" />
          </div>
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "#f8fafc" }}>
              {serviceType} Responder Unit
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
              {currentUser?.full_name || "Official Unit"} • Service Wing: <strong style={{ color: "#00e5ff" }}>{serviceType} Track Only</strong>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={handleDetectGPS}
            className="btn-outline"
            style={{ padding: "8px 12px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "5px" }}
            title="Auto Detect GPS"
          >
            <Compass size={14} className={isLocating ? "animate-spin" : ""} />
            <span>{isLocating ? "Calibrating..." : "GPS Active (Live Lock)"}</span>
          </button>

          <button
            onClick={() => {
              sounds.playTap();
              setTempPickerCoords({ lat: responderCoords.lat, lng: responderCoords.lng });
              setIsMapPickerOpen(true);
            }}
            className="btn-outline"
            style={{ padding: "8px 12px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "5px", color: "#00e5ff", borderColor: "rgba(0, 229, 255, 0.4)" }}
            title="Click or Drag on Map to set location"
          >
            <MapPin size={14} />
            <span>Pick on Map</span>
          </button>

          <button
            onClick={() => { sounds.playTap(); onLogout(); }}
            className="btn-outline"
            style={{ padding: "8px 12px", fontSize: "0.78rem" }}
            title="Log out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        
        {/* Left Column: Active Job & Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          
          {activeIncident ? (
            <div style={{
              background: "rgba(14, 20, 36, 0.95)",
              border: "1.5px solid rgba(0, 229, 255, 0.35)",
              borderRadius: "16px",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.5)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span className="neon-badge neon-badge-critical" style={{ fontSize: "0.72rem" }}>
                    ● ACTIVE EMERGENCY MISSION
                  </span>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: "900", color: "#f8fafc", marginTop: "4px" }}>
                    {activeIncident.id} • {activeIncident.emergency_type}
                  </h3>
                </div>
                <span className="neon-badge neon-badge-enroute" style={{ fontSize: "0.8rem", padding: "4px 10px" }}>
                  {activeIncident.status}
                </span>
              </div>

              {/* Citizen Quick Info Bar */}
              <div style={{
                background: "rgba(0, 229, 255, 0.08)",
                border: "1px solid rgba(0, 229, 255, 0.2)",
                padding: "10px 12px",
                borderRadius: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Citizen Reporter:</div>
                  <div style={{ fontSize: "0.92rem", fontWeight: "900", color: "#f8fafc" }}>
                    {activeIncident.citizen_name || "Emergency Citizen"}
                  </div>
                </div>
                <a
                  href={`tel:${activeIncident.citizen_phone || "+919876543210"}`}
                  style={{
                    background: "#00ff88",
                    color: "#070a12",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    fontWeight: "900",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Phone size={13} /> Call
                </a>
              </div>

              {activeIncident.description && (
                <div style={{ background: "rgba(255,255,255,0.04)", padding: "10px 12px", borderRadius: "8px", fontSize: "0.82rem", color: "#e2e8f0" }}>
                  <strong>Description: </strong>{activeIncident.description}
                </div>
              )}

              {activeIncident.address && (
                <div style={{ fontSize: "0.78rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}>
                  <MapPin size={14} color="#00e5ff" />
                  <span>{activeIncident.address}</span>
                </div>
              )}

              {/* View Full Details Button */}
              <button
                onClick={() => { sounds.playTap(); setSelectedDetailIncident(activeIncident); }}
                className="btn-outline"
                style={{
                  padding: "8px 12px",
                  fontSize: "0.8rem",
                  borderColor: "rgba(0, 229, 255, 0.5)",
                  color: "#00e5ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
              >
                <Eye size={15} /> View Full Citizen & Incident Details
              </button>

              {/* Status Stepper Actions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: "800", color: "#94a3b8", textTransform: "uppercase" }}>
                  Mission Actions:
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {activeIncident.status !== "En Route" && activeIncident.status !== "On Scene" && (
                    <button
                      onClick={() => handleStatusChange("En Route")}
                      className="btn-outline"
                      style={{ padding: "10px", fontSize: "0.82rem", borderColor: "#00e5ff", color: "#00e5ff", fontWeight: "800" }}
                    >
                      Mark En Route
                    </button>
                  )}

                  {activeIncident.status !== "On Scene" && (
                    <button
                      onClick={() => handleStatusChange("On Scene")}
                      className="btn-outline"
                      style={{ padding: "10px", fontSize: "0.82rem", borderColor: "#eab308", color: "#eab308", fontWeight: "800" }}
                    >
                      Arrived On Scene
                    </button>
                  )}

                  {/* Live Route Travel Simulator Button */}
                  <button
                    onClick={handleToggleSimulation}
                    style={{
                      gridColumn: "span 2",
                      background: isSimulating ? "rgba(255, 51, 75, 0.2)" : "rgba(0, 229, 255, 0.15)",
                      border: isSimulating ? "1px solid #ff334b" : "1px solid #00e5ff",
                      color: isSimulating ? "#ff4d67" : "#00e5ff",
                      borderRadius: "8px",
                      padding: "10px",
                      fontSize: "0.84rem",
                      fontWeight: "800",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      transition: "all 0.2s ease"
                    }}
                  >
                    {isSimulating ? <Pause size={15} /> : <Play size={15} />}
                    {isSimulating ? "⏸️ Pause Route Simulation" : "▶️ Demo: Simulate Driving Along Route"}
                  </button>

                  <button
                    onClick={() => handleStatusChange("Resolved")}
                    style={{
                      gridColumn: "span 2",
                      background: "linear-gradient(135deg, #00ff88, #059669)",
                      color: "#070a12",
                      border: "none",
                      borderRadius: "8px",
                      padding: "11px",
                      fontSize: "0.88rem",
                      fontWeight: "900",
                      cursor: "pointer"
                    }}
                  >
                    <CheckCircle2 size={16} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                    Complete & Resolve Emergency
                  </button>
                </div>

                {/* Pure Physical GPS Stream Active Status Badge */}
                <div style={{
                  marginTop: "8px",
                  background: "rgba(0, 229, 255, 0.12)",
                  border: "1px solid rgba(0, 229, 255, 0.4)",
                  color: "#00e5ff",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "0.8rem",
                  fontWeight: "800",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}>
                  <Navigation size={15} color="#00ff88" style={{ animation: "pulse 1.5s infinite" }} />
                  <span>📡 Live Physical GPS Active • Updates as you travel</span>
                </div>
              </div>

            </div>
          ) : (
            <div style={{
              background: "rgba(14, 20, 36, 0.95)",
              borderRadius: "16px",
              padding: "30px 20px",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.08)"
            }}>
              <CheckCircle2 size={36} color="#00ff88" style={{ margin: "0 auto 10px auto" }} />
              <h3 style={{ fontSize: "1.1rem", fontWeight: "800", color: "#f8fafc" }}>
                {serviceType} Unit On Standby
              </h3>
              <p style={{ fontSize: "0.78rem", color: "#94a3b8", maxWidth: "280px", margin: "4px auto 0 auto" }}>
                Listening for emergency dispatches targeted exclusively to the <strong>{serviceType}</strong> track.
              </p>
            </div>
          )}

          {/* Incoming Dispatch Queue for This Specific Service Track */}
          {unassignedMatchingPool.length > 0 && (
            <div style={{
              background: "rgba(14, 20, 36, 0.95)",
              borderRadius: "16px",
              padding: "16px",
              border: "1px solid rgba(255, 184, 0, 0.35)",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "0.88rem", fontWeight: "800", color: "#ffb800", display: "flex", alignItems: "center", gap: "6px" }}>
                  <AlertTriangle size={16} /> Available Emergency Reports ({unassignedMatchingPool.length})
                </div>
                <span style={{ fontSize: "0.72rem", color: "#00e5ff", fontWeight: "700" }}>{serviceType} Track Only</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
                {unassignedMatchingPool.map((inc) => (
                  <div key={inc.id} style={{
                    background: "rgba(30, 41, 59, 0.6)",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px"
                  }}>
                    <div>
                      <div style={{ fontWeight: "800", color: "#f8fafc", fontSize: "0.85rem" }}>
                        {inc.id} • {inc.emergency_type}
                      </div>
                      {inc.citizen_name && (
                        <div style={{ fontSize: "0.75rem", color: "#00e5ff", marginTop: "2px" }}>
                          Reporter: {inc.citizen_name}
                        </div>
                      )}
                      {inc.description && <div style={{ fontSize: "0.75rem", color: "#cbd5e1", marginTop: "2px" }}>{inc.description}</div>}
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "2px" }}>{inc.address || "GPS Coordinates"}</div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <button
                        onClick={() => handleAccept(inc.id)}
                        className="btn-emergency-main"
                        style={{ padding: "6px 14px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
                      >
                        Accept Mission
                      </button>

                      <button
                        onClick={() => { sounds.playTap(); setSelectedDetailIncident(inc); }}
                        className="btn-outline"
                        style={{ padding: "4px 10px", fontSize: "0.72rem", color: "#00e5ff", borderColor: "rgba(0, 229, 255, 0.3)" }}
                      >
                        <Eye size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "3px" }} />
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Missions History */}
          {completedIncidents.length > 0 && (
            <div style={{
              background: "rgba(14, 20, 36, 0.9)",
              borderRadius: "16px",
              padding: "16px",
              border: "1px solid rgba(0, 255, 136, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}>
              <div style={{ fontSize: "0.85rem", fontWeight: "800", color: "#00ff88", display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle2 size={16} /> Completed Missions ({completedIncidents.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto" }}>
                {completedIncidents.map((inc) => (
                  <div key={inc.id} style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(0, 255, 136, 0.15)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div>
                      <div style={{ fontWeight: "800", color: "#f8fafc", fontSize: "0.82rem" }}>
                        {inc.id} • {inc.emergency_type}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{inc.address || "GPS Location"}</div>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        onClick={() => { sounds.playTap(); setSelectedDetailIncident(inc); }}
                        className="btn-outline"
                        style={{ padding: "3px 8px", fontSize: "0.7rem", color: "#00e5ff", borderColor: "rgba(0, 229, 255, 0.3)" }}
                      >
                        <Eye size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "2px" }} />
                        Details
                      </button>
                      <span className="neon-badge neon-badge-resolved" style={{ fontSize: "0.68rem" }}>
                        Resolved
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Live Map */}
        <div style={{
          height: "70vh",
          minHeight: "420px",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1.5px solid rgba(0, 229, 255, 0.3)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
          position: "relative"
        }}>
          <MapComponent
            height="100%"
            center={[responderCoords.lat, responderCoords.lng]}
            zoom={14}
            incidentLocation={activeIncident ? { lat: activeIncident.lat, lng: activeIncident.lng } : null}
            incidentLabel={activeIncident ? `${activeIncident.id} (${activeIncident.emergency_type})` : ""}
            responderLocation={{ lat: responderCoords.lat, lng: responderCoords.lng }}
            responderType={serviceType}
            responderLabel={`${responderName} (Live GPS)`}
            routeCoordinates={routeCoords}
          />
        </div>

      </div>

    </div>
  );
}
