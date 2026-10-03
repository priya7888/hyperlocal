import React, { useState, useEffect } from "react";
import { 
  Shield, Check, X, Navigation, MapPin, AlertTriangle, 
  Clock, HeartPulse, Flame, Activity, CheckCircle2,
  RefreshCw, Power, FastForward, Phone, AlertOctagon, LogOut,
  Volume2, VolumeX, Radio
} from "lucide-react";
import MapComponent from "./MapComponent";
import { incidentApi, responderApi, routingApi, socket } from "../services/api";
import { sounds } from "../services/soundEffects";

export default function ResponderDashboard({ currentUser, onLogout }) {
  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeStats, setRouteStats] = useState({ distanceKm: 0, durationMinutes: 0 });
  const [isAvailable, setIsAvailable] = useState(true);
  const [isMuted, setIsMuted] = useState(sounds.isMuted());

  // Auto-detected Responder GPS location (Requirement 6)
  const [responderCoords, setResponderCoords] = useState({ lat: 17.5950, lng: 78.4950 });
  const [isLocating, setIsLocating] = useState(false);
  const [isSimulatingMovement, setIsSimulatingMovement] = useState(false);

  // 5-Minute Incoming Job Alert (Requirement 4 & 5)
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [countdown, setCountdown] = useState(300); // 5 minutes

  const serviceType = currentUser?.service_type || "Ambulance";

  useEffect(() => {
    loadIncidents();
    handleDetectGPS();

    if (currentUser?.responderId) {
      socket.emit("join_responder", currentUser.responderId);
    }

    socket.on("incoming_job_alert", (data) => {
      sounds.playAlertSiren();
      setIncomingAlert(data);
      setCountdown(data.timeoutSeconds || 300);
    });

    socket.on("job_offer_expired", () => {
      setIncomingAlert(null);
    });

    socket.on("job_assigned_to_other", (data) => {
      setIncomingAlert(null);
      loadIncidents();
    });

    socket.on("incident_status_changed", () => {
      loadIncidents();
    });

    return () => {
      socket.off("incoming_job_alert");
      socket.off("job_offer_expired");
      socket.off("job_assigned_to_other");
      socket.off("incident_status_changed");
    };
  }, [currentUser]);

  // Countdown timer for incoming 5-minute escalation alert
  useEffect(() => {
    let timer;
    if (incomingAlert && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => c - 1);
        // Beep gently every 10 seconds during alert
        if (countdown % 10 === 0) {
          sounds.playStep();
        }
      }, 1000);
    } else if (countdown === 0 && incomingAlert) {
      setIncomingAlert(null);
    }
    return () => clearInterval(timer);
  }, [incomingAlert, countdown]);

  const handleToggleAudio = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  const handleDetectGPS = () => {
    sounds.playTap();
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(5));
          const lng = parseFloat(pos.coords.longitude.toFixed(5));
          setResponderCoords({ lat, lng });
          sounds.playStep();
          setIsLocating(false);
        },
        () => {
          setResponderCoords({ lat: 17.5950, lng: 78.4950 });
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setIsLocating(false);
    }
  };

  const loadIncidents = async () => {
    try {
      const data = await incidentApi.list();
      setIncidents(data || []);

      const assigned = data.find(i => {
        const isDirect = i.assigned_responder_id === currentUser?.responderId;
        const myReq = i.responder_requirements?.find(r =>
          r.assigned_responder_id === currentUser?.responderId ||
          r.assigned_responder?.id === currentUser?.responderId ||
          (serviceType && r.service_type?.toLowerCase() === serviceType?.toLowerCase())
        );
        const myTaskActive = myReq ? (myReq.status !== 'RESOLVED' && myReq.status !== 'Resolved') : (i.status !== 'Resolved');
        return (isDirect || myReq) && myTaskActive && i.status !== "Cancelled";
      });

      if (assigned) {
        setActiveIncident(assigned);
        fetchRoute(assigned);
      } else {
        setActiveIncident(null);
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
    try {
      const res = await incidentApi.assign(incidentId, "accept");
      setIncomingAlert(null);
      setActiveIncident(res.incident);
      fetchRoute(res.incident);
      loadIncidents();
    } catch (err) {
      alert(err.response?.data?.error || "Incident already accepted or unavailable.");
      setIncomingAlert(null);
      loadIncidents();
    }
  };

  const handleStatusChange = async (nextStatus) => {
    if (!activeIncident) return;
    if (nextStatus === "Resolved") {
      sounds.playSuccess();
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
        setActiveIncident(null);
      } else {
        setActiveIncident(res.incident);
      }
      loadIncidents();
    } catch (err) {
      alert("Failed to update status.");
    }
  };

  const simulateLiveMovement = () => {
    if (!activeIncident || !routeCoords || routeCoords.length < 2) return;
    sounds.playStep();
    setIsSimulatingMovement(true);

    let step = 0;
    const interval = setInterval(() => {
      if (step < routeCoords.length) {
        const [lat, lng] = routeCoords[step];
        setResponderCoords({ lat, lng });
        socket.emit("live_gps_stream", { incidentId: activeIncident.id, lat, lng });
        step += 1;
      } else {
        clearInterval(interval);
        setIsSimulatingMovement(false);
        handleStatusChange("On Scene");
      }
    }, 1000);
  };

  const unassignedMatchingPool = incidents.filter(i => {
    const isUnresolved = i.status !== "Resolved" && i.status !== "Cancelled" && i.status !== "Merged";
    const requiresThisType = serviceType === "Rescue" ||
      (i.suggested_service && i.suggested_service.toLowerCase().includes(serviceType.toLowerCase())) ||
      (i.requiredResponderTypes && i.requiredResponderTypes.some(t => t.toUpperCase() === serviceType.toUpperCase())) ||
      (i.required_responder_types && i.required_responder_types.some(t => t.toUpperCase() === serviceType.toUpperCase()));

    const categoryAlreadyAssigned = i.responder_requirements &&
      i.responder_requirements.some(r => r.service_type?.toLowerCase() === serviceType.toLowerCase() && r.status === 'ASSIGNED');

    const isAlreadyAssignedToMe = i.assigned_responder_id === currentUser?.responderId;

    return isUnresolved && requiresThisType && !categoryAlreadyAssigned && !isAlreadyAssignedToMe;
  });

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>
      
      {/* 5-Minute Incoming Job Alert Modal (Requirement 4 & 5) */}
      {incomingAlert && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: "480px", padding: "28px", textAlign: "center", border: "2px solid #ff334b", background: "#0e1424", boxShadow: "0 0 35px rgba(255, 51, 75, 0.4)" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(255, 51, 75, 0.2)", color: "#ff334b", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "14px", animation: "pulse 1.5s infinite" }}>
              <AlertOctagon size={32} />
            </div>

            <div style={{ fontSize: "2rem", fontWeight: "900", color: "#ff334b", fontFamily: "monospace", marginBottom: "4px" }}>
              {Math.floor(countdown / 60).toString().padStart(2, '0')}:{(countdown % 60).toString().padStart(2, '0')}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#00e5ff", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "14px", fontWeight: "700" }}>
              Hyperlocal Radius Alert ({incomingAlert.radiusKm || 5} km Sector) • First Acceptance Wins
            </div>

            <h3 style={{ fontSize: "1.3rem", fontWeight: "800", color: "#f8fafc", marginBottom: "6px" }}>
              {incomingAlert.emergencyType || "Emergency"} Incident Alert
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "0.88rem", marginBottom: "8px" }}>
              Incident <strong>{incomingAlert.incidentId}</strong> • Severity: <span style={{ color: incomingAlert.severity === 'Critical' ? '#ff334b' : '#ffb800', fontWeight: 'bold' }}>{incomingAlert.severity || 'Critical'}</span>
              <br />Est. Distance: <strong>{incomingAlert.distanceKm} km</strong> (~{incomingAlert.etaMinutes} mins)
            </p>
            {incomingAlert.shortDescription && (
              <p style={{ color: "#cbd5e1", fontSize: "0.82rem", background: "rgba(255,255,255,0.05)", padding: "8px 12px", borderRadius: "6px", marginBottom: "16px" }}>
                "{incomingAlert.shortDescription}"
              </p>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => handleAccept(incomingAlert.incidentId)}
                className="btn-emergency-main"
                style={{ flex: 1, padding: "12px", fontSize: "0.95rem" }}
              >
                <Check size={18} /> Accept Emergency
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: "900", color: "#f8fafc", margin: 0 }}>
              {serviceType} Responder Console
            </h1>
            <span className="neon-badge neon-badge-enroute" style={{ fontSize: "0.75rem" }}>
              {currentUser?.full_name || "Demo Responder"}
            </span>
          </div>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: "4px" }}>
            Auto-Detecting GPS: Lat {responderCoords.lat}, Lng {responderCoords.lng} • Matching Service: <strong>{serviceType}</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={handleDetectGPS}
            className="btn-outline"
            style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "4px" }}
          >
            <Navigation size={14} className={isLocating ? "animate-spin" : ""} />
            {isLocating ? "Locating..." : "Refresh GPS"}
          </button>

          <button
            onClick={() => { sounds.playTap(); onLogout(); }}
            className="btn-outline"
            style={{ padding: "8px 14px", fontSize: "0.85rem" }}
          >
            <LogOut size={16} /> Exit
          </button>
        </div>
      </div>

      {/* Main Grid: Left = Available Matching Incidents Pool, Right = Navigation Route Map */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "20px", alignItems: "start" }}>
        
        {/* Left: Matching Incidents Pool (Requirement 5) */}
        <div className="tactical-glass-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: "800", color: "#f8fafc", margin: 0 }}>
              Matching Emergency Pool ({unassignedMatchingPool.length})
            </h2>
            <button
              onClick={() => { sounds.playTap(); loadIncidents(); }}
              style={{ background: "transparent", border: "none", color: "#00e5ff", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "0.78rem" }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "550px", overflowY: "auto" }}>
            {unassignedMatchingPool.length === 0 && !activeIncident ? (
              <div style={{ padding: "30px 10px", textAlign: "center", color: "#94a3b8", fontSize: "0.88rem" }}>
                <CheckCircle2 size={32} color="#00ff88" style={{ margin: "0 auto 8px auto" }} />
                No pending {serviceType} emergency calls in your sector.
              </div>
            ) : (
              unassignedMatchingPool.map((inc) => (
                <div
                  key={inc.id}
                  style={{
                    background: "rgba(30, 41, 59, 0.6)",
                    border: "1px solid rgba(255,51,75,0.3)",
                    borderRadius: "10px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "monospace", fontWeight: "800", color: "#00e5ff", fontSize: "0.88rem" }}>{inc.id}</span>
                    <span className="neon-badge neon-badge-critical" style={{ fontSize: "0.68rem" }}>{inc.severity}</span>
                  </div>

                  <div style={{ fontWeight: "700", fontSize: "0.95rem", color: "#f8fafc" }}>
                    {inc.emergency_type} Emergency
                  </div>

                  {inc.checklist_json && (
                    <div style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                      Checklist: {JSON.parse(inc.checklist_json || "[]").join(", ")}
                    </div>
                  )}

                  {inc.description && (
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                      "{inc.description}"
                    </div>
                  )}

                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Location: {inc.address || `Lat ${inc.lat}, Lng ${inc.lng}`}
                  </div>

                  {/* Accept Button (Only action available to responder) */}
                  <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <button
                      onClick={() => handleAccept(inc.id)}
                      className="btn-emergency-main"
                      style={{ flex: 1, padding: "8px", fontSize: "0.85rem" }}
                    >
                      <Check size={16} /> Accept Incident
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Active Assignment Map & Directions (Requirement 6 & 7) */}
        {activeIncident ? (
          <div className="tactical-glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <span className="neon-badge neon-badge-enroute" style={{ marginBottom: "4px" }}>
                  Active Dispatch • {activeIncident.status}
                </span>
                <h2 style={{ fontSize: "1.35rem", fontWeight: "900", color: "#f8fafc", margin: "4px 0" }}>
                  {activeIncident.id} • {activeIncident.emergency_type}
                </h2>
                <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                  Caller: {activeIncident.citizen_name || "Citizen"} • Phone: {activeIncident.citizen_phone || "+91 98765 43210"}
                </div>
              </div>

              {/* Status Update Controls (Requirement 7 & 9) */}
              {(() => {
                const myReq = activeIncident.responder_requirements?.find(
                  r => r.assigned_responder_id === currentUser?.responderId ||
                       r.assigned_responder?.id === currentUser?.responderId ||
                       (serviceType && r.service_type?.toLowerCase() === serviceType?.toLowerCase())
                );
                const myStage = myReq?.status || activeIncident.status;

                return (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                    {(myStage === "ASSIGNED" || myStage === "Assigned" || (!myReq && (activeIncident.status === "Assigned" || activeIncident.status === "Partially Assigned"))) && (
                      <button
                        onClick={() => handleStatusChange("En Route")}
                        style={{ background: "#00e5ff", color: "#070a12", border: "none", borderRadius: "8px", padding: "8px 14px", fontWeight: "800", fontSize: "0.82rem", cursor: "pointer" }}
                      >
                        Start Travel (En Route)
                      </button>
                    )}

                    {(myStage === "EN_ROUTE" || myStage === "En Route") && (
                      <button
                        onClick={() => handleStatusChange("On Scene")}
                        style={{ background: "#ffb800", color: "#070a12", border: "none", borderRadius: "8px", padding: "8px 14px", fontWeight: "800", fontSize: "0.82rem", cursor: "pointer" }}
                      >
                        Arrived (On Scene)
                      </button>
                    )}

                    {(myStage === "ON_SCENE" || myStage === "On Scene") && (
                      <button
                        onClick={() => handleStatusChange("Resolved")}
                        style={{ background: "#00ff88", color: "#070a12", border: "none", borderRadius: "8px", padding: "8px 14px", fontWeight: "800", fontSize: "0.82rem", cursor: "pointer" }}
                      >
                        Mark Resolved ✓
                      </button>
                    )}

                    {(myStage === "RESOLVED" || myStage === "Resolved") && (
                      <span className="neon-badge neon-badge-resolved" style={{ fontSize: "0.82rem", padding: "6px 12px" }}>
                        ✓ Your Task Resolved
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Distance & Travel Time Telemetry (Requirement 6) */}
            <div style={{ background: "rgba(15, 23, 42, 0.7)", borderRadius: "10px", padding: "12px 16px", border: "1px solid rgba(56,189,248,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Distance to Scene: </span>
                <strong style={{ color: "#00e5ff" }}>{routeStats.distanceKm} km</strong>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Est. Travel Time: </span>
                <strong style={{ color: "#00ff88" }}>~{routeStats.durationMinutes} mins</strong>
              </div>
              <button
                onClick={simulateLiveMovement}
                disabled={isSimulatingMovement}
                className="btn-outline"
                style={{ fontSize: "0.78rem", padding: "4px 10px", color: isSimulatingMovement ? "#00ff88" : "#f8fafc" }}
              >
                <FastForward size={14} className={isSimulatingMovement ? "animate-spin" : ""} /> {isSimulatingMovement ? "Navigating GPS..." : "Simulate Travel"}
              </button>
            </div>

            {/* Turn-by-Turn Map & Directions (Requirement 6) */}
            <div style={{ height: "320px", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(56,189,248,0.3)" }}>
              <MapComponent
                height="320px"
                center={[activeIncident.lat, activeIncident.lng]}
                zoom={14}
                incidentLocation={{ lat: activeIncident.lat, lng: activeIncident.lng }}
                incidentLabel={`Incident (${activeIncident.emergency_type})`}
                responderLocation={responderCoords}
                responderType={serviceType}
                responderLabel={`You (${currentUser?.full_name || serviceType})`}
                routeCoordinates={routeCoords}
              />
            </div>

            {/* Checklist & Description details */}
            <div style={{ background: "rgba(30, 41, 59, 0.5)", borderRadius: "10px", padding: "14px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: "700", color: "#ff334b", marginBottom: "4px" }}>
                Emergency Checklist:
              </div>
              <div style={{ fontSize: "0.85rem", color: "#f8fafc", marginBottom: "6px" }}>
                {activeIncident.checklist_json ? JSON.parse(activeIncident.checklist_json || "[]").join(", ") : "Standard Emergency"}
              </div>

              {activeIncident.description && (
                <>
                  <div style={{ fontSize: "0.78rem", fontWeight: "700", color: "#94a3b8", marginTop: "8px", marginBottom: "2px" }}>
                    Citizen Description:
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
                    "{activeIncident.description}"
                  </div>
                </>
              )}
            </div>

          </div>
        ) : (
          <div className="tactical-glass-card" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Accept an emergency incident from the pool on the left to activate turn-by-turn road navigation.
          </div>
        )}

      </div>

    </div>
  );
}
