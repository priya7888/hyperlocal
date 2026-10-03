import React, { useState, useEffect, useRef } from "react";
import { 
  AlertOctagon, Phone, MapPin, Navigation, CheckCircle2, 
  Clock, RefreshCw, User, LogOut, PhoneCall, ChevronRight, Check,
  ShieldAlert, HeartPulse, Flame, Maximize2, Minimize2, Radio, Shield, Activity,
  ListFilter, AlertTriangle, ChevronDown, Layers
} from "lucide-react";
import MapComponent from "./MapComponent";
import { incidentApi, routingApi, socket, deduplicateIncidents } from "../services/api";
import { sounds } from "../services/soundEffects";

const STATUS_STEPS = ["Reported", "Assigned", "En Route", "On Scene", "Resolved"];

export default function CitizenDashboard({ currentUser, onOpenSos, onLogout, initialIncident }) {
  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(initialIncident || null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [responderLiveLoc, setResponderLiveLoc] = useState(null);

  // Keep a ref of activeIncident for socket callbacks
  const activeIncidentRef = useRef(activeIncident);
  activeIncidentRef.current = activeIncident;

  useEffect(() => {
    if (initialIncident) {
      setActiveIncident(initialIncident);
      setIncidents((prev) => deduplicateIncidents([initialIncident, ...prev]));
      if (initialIncident.assigned_responder) {
        fetchRoute(initialIncident);
      }
    }
  }, [initialIncident]);

  useEffect(() => {
    loadIncidents();

    const handleCreated = (data) => {
      sounds.playAlertSiren();
      if (data && data.id) {
        setActiveIncident(data);
        setIncidents((prev) => deduplicateIncidents([data, ...prev]));
        if (data.assigned_responder) fetchRoute(data);
      }
    };

    const handleStatusChanged = (data) => {
      sounds.playStep();
      loadIncidents();
      if (activeIncidentRef.current && data?.incident?.id === activeIncidentRef.current.id) {
        setActiveIncident(data.incident);
        if (data.incident.assigned_responder) {
          fetchRoute(data.incident);
        }
      }
    };

    const handleUpdated = (data) => {
      loadIncidents();
      if (activeIncidentRef.current && data?.id === activeIncidentRef.current.id) {
        setActiveIncident(data);
        if (data.assigned_responder) {
          fetchRoute(data);
        }
      }
    };

    const handleGps = (data) => {
      setResponderLiveLoc({ lat: data.lat, lng: data.lng });
    };

    const handleAssignmentNotice = (data) => {
      loadIncidents();
    };

    const handleNoResponders = (data) => {
      loadIncidents();
    };

    socket.on("incident_created", handleCreated);
    socket.on("incident_status_changed", handleStatusChanged);
    socket.on("incident_updated", handleUpdated);
    socket.on("citizen_assignment_notification", handleAssignmentNotice);
    socket.on("no_responders_alert", handleNoResponders);
    socket.on("responder_gps_update", handleGps);

    return () => {
      socket.off("incident_created", handleCreated);
      socket.off("incident_status_changed", handleStatusChanged);
      socket.off("incident_updated", handleUpdated);
      socket.off("citizen_assignment_notification", handleAssignmentNotice);
      socket.off("no_responders_alert", handleNoResponders);
      socket.off("responder_gps_update", handleGps);
    };
  }, []);

  const loadIncidents = async () => {
    try {
      const data = await incidentApi.list();
      const clean = deduplicateIncidents(data || []);
      setIncidents(clean);
      if (clean.length > 0) {
        if (!activeIncidentRef.current) {
          const current = clean.find(i => i.status !== "Resolved" && i.status !== "Cancelled") || clean[0];
          setActiveIncident(current);
          if (current.assigned_responder) {
            fetchRoute(current);
          }
        } else {
          const matched = clean.find(i => i.id === activeIncidentRef.current.id);
          if (matched) {
            setActiveIncident(matched);
            if (matched.assigned_responder) fetchRoute(matched);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load citizen incidents", e);
    }
  };

  const handleSelectIncident = (inc) => {
    sounds.playTap();
    setActiveIncident(inc);
    if (inc.assigned_responder) {
      fetchRoute(inc);
    } else {
      setRouteCoords([]);
    }
  };

  const fetchRoute = async (incident) => {
    if (!incident.assigned_responder) return;
    try {
      const r = incident.assigned_responder;
      const res = await routingApi.getRoute(r.lat, r.lng, incident.lat, incident.lng);
      if (res && res.coordinates) {
        setRouteCoords(res.coordinates);
      }
    } catch (e) {
      console.warn("Route fetch error", e);
    }
  };

  const getStepIndex = (status) => {
    if (status === "Reported" || status === "Awaiting Responder") return 0;
    if (status === "Assigned" || status === "Partially Assigned") return 1;
    if (status === "En Route") return 2;
    if (status === "On Scene" || status === "Partially Resolved" || status === "In Progress") return 3;
    if (status === "Resolved") return 4;
    return 0;
  };

  const currentStepIdx = activeIncident ? getStepIndex(activeIncident.status) : 0;

  const getServiceColor = (service) => {
    if (service === "Fire") return "#ff334b";
    if (service === "Police") return "#00e5ff";
    return "#00ff88"; // Ambulance
  };

  const getServiceIcon = (service) => {
    if (service === "Fire") return <Flame size={15} color="#ff334b" />;
    if (service === "Police") return <Shield size={15} color="#00e5ff" />;
    return <HeartPulse size={15} color="#00ff88" />;
  };

  return (
    <div style={{
      maxWidth: "1180px",
      margin: "0 auto",
      padding: "16px 14px",
      display: "flex",
      flexDirection: "column",
      gap: "14px",
      minHeight: "100vh"
    }}>
      
      {/* 1. Sleek Top Navigation Bar */}
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 18px",
        background: "rgba(14, 20, 36, 0.95)",
        backdropFilter: "blur(16px)",
        borderRadius: "14px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(0, 229, 255, 0.15)", color: "#00e5ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Radio size={18} className="animate-pulse" />
          </div>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: "900", color: "#f8fafc", lineHeight: "1.1" }}>
              Live Emergency Tracking
            </div>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
              {currentUser?.full_name || "Citizen"} • {incidents.length} active report{incidents.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={() => { sounds.playAlertSiren(); onOpenSos(); }}
            className="btn-emergency-main"
            style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "5px" }}
          >
            <AlertOctagon size={14} /> + New SOS
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

      {/* 2. Main Workspace Layout: Vertical Reports Bar (Left) + Details & Live Map (Right) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: incidents.length > 1 ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr",
        gap: "14px",
        alignItems: "start"
      }}>

        {/* ================= VERTICAL REPORTS BAR ================= */}
        {incidents.length > 0 && (
          <div style={{
            background: "rgba(14, 20, 36, 0.95)",
            backdropFilter: "blur(18px)",
            borderRadius: "16px",
            padding: "14px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxHeight: "82vh",
            overflowY: "auto"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: "8px",
              borderBottom: "1px solid rgba(255,255,255,0.08)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: "800", color: "#f8fafc" }}>
                <Layers size={16} color="#00e5ff" />
                <span>Active Reports</span>
              </div>
              <span className="neon-badge neon-badge-info" style={{ fontSize: "0.68rem" }}>
                {incidents.length} Listed
              </span>
            </div>

            {/* Vertical Cards Stack */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {incidents.map((inc) => {
                const isSel = activeIncident?.id === inc.id;
                const serviceColor = getServiceColor(inc.suggested_service || inc.emergency_type);

                return (
                  <div
                    key={inc.id}
                    onClick={() => handleSelectIncident(inc)}
                    style={{
                      background: isSel
                        ? "linear-gradient(135deg, rgba(0, 229, 255, 0.18), rgba(15, 23, 42, 0.9))"
                        : "rgba(30, 41, 59, 0.5)",
                      border: isSel
                        ? "1.8px solid #00e5ff"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "12px",
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "all 0.25s ease",
                      boxShadow: isSel ? "0 4px 20px rgba(0, 229, 255, 0.25)" : "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      position: "relative"
                    }}
                  >
                    {/* Card Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "6px",
                          background: `${serviceColor}20`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}>
                          {getServiceIcon(inc.suggested_service || inc.emergency_type)}
                        </div>
                        <span style={{ fontFamily: "monospace", fontWeight: "800", fontSize: "0.82rem", color: isSel ? "#00e5ff" : "#f8fafc" }}>
                          {inc.id}
                        </span>
                      </div>

                      <span className={`neon-badge ${
                        inc.status === "Resolved"
                          ? "neon-badge-resolved"
                          : inc.status === "Partially Resolved"
                          ? "neon-badge-enroute"
                          : "neon-badge-critical"
                      }`} style={{ fontSize: "0.64rem", padding: "2px 6px" }}>
                        {inc.status === "Partially Resolved" ? "Partially Resolved" : inc.status}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div style={{ fontSize: "0.78rem", color: "#cbd5e1", fontWeight: "600", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{inc.emergency_type} Emergency</span>
                      <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                        {inc.created_at ? new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                      </span>
                    </div>

                    {inc.address && (
                      <div style={{ fontSize: "0.7rem", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        📍 {inc.address}
                      </div>
                    )}

                    {/* Click Indicator */}
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: "2px" }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: "700", color: isSel ? "#00e5ff" : "#64748b", display: "flex", alignItems: "center", gap: "2px" }}>
                        {isSel ? "● Viewing Details" : "Click to view details →"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= DETAILED REPORT INSPECTION VIEW & INTERACTIVE MAP ================= */}
        {activeIncident ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            flex: 2
          }}>
            
            {/* Live Interactive Map Canvas */}
            <div style={{
              height: "44vh",
              minHeight: "320px",
              maxHeight: "500px",
              borderRadius: "16px",
              overflow: "hidden",
              border: "1.5px solid rgba(56, 189, 248, 0.35)",
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.6)",
              position: "relative"
            }}>
              <MapComponent
                height="100%"
                center={[activeIncident.lat, activeIncident.lng]}
                zoom={14}
                incidentLocation={{ lat: activeIncident.lat, lng: activeIncident.lng }}
                incidentLabel={`${activeIncident.id} (${activeIncident.emergency_type})`}
                responderLocation={responderLiveLoc || (activeIncident.assigned_responder ? { lat: activeIncident.assigned_responder.lat, lng: activeIncident.assigned_responder.lng } : null)}
                responderType={activeIncident.assigned_responder?.service_type || activeIncident.suggested_service}
                responderLabel={activeIncident.assigned_responder?.full_name || "Assigned Responder"}
                routeCoordinates={routeCoords}
              />

              {/* Floating Header Badge over Map */}
              <div style={{
                position: "absolute",
                top: "12px",
                left: "12px",
                right: "12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                zIndex: 999,
                pointerEvents: "none"
              }}>
                <div style={{
                  background: "rgba(14, 20, 36, 0.92)",
                  backdropFilter: "blur(10px)",
                  padding: "6px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)"
                }}>
                  <span style={{ fontFamily: "monospace", fontWeight: "800", color: "#00e5ff", fontSize: "0.82rem" }}>
                    {activeIncident.id}
                  </span>
                  <span style={{ color: "#64748b" }}>•</span>
                  <span style={{
                    fontSize: "0.78rem",
                    fontWeight: "700",
                    color: activeIncident.status === "Resolved" ? "#00ff88" : activeIncident.status === "Partially Resolved" ? "#00e5ff" : "#f8fafc"
                  }}>
                    {activeIncident.status === "Partially Resolved"
                      ? "Emergency Partially Resolved"
                      : activeIncident.status === "Resolved"
                      ? "Emergency Resolved"
                      : `${activeIncident.emergency_type} • ${activeIncident.status}`}
                  </span>
                </div>

                <div style={{
                  background: "rgba(14, 20, 36, 0.92)",
                  backdropFilter: "blur(10px)",
                  padding: "6px 12px",
                  borderRadius: "10px",
                  border: `1px solid ${getServiceColor(activeIncident.suggested_service)}60`,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  fontSize: "0.76rem",
                  fontWeight: "800",
                  color: getServiceColor(activeIncident.suggested_service)
                }}>
                  {getServiceIcon(activeIncident.suggested_service)}
                  <span>{activeIncident.suggested_service}</span>
                </div>
              </div>
            </div>

            {/* Unified Details & Progress Card */}
            <div style={{
              background: "rgba(14, 20, 36, 0.95)",
              backdropFilter: "blur(18px)",
              borderRadius: "16px",
              padding: "16px",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}>

              {/* 5-Step Connected Progress Bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", position: "relative", alignItems: "center" }}>
                  {/* Connecting Line */}
                  <div style={{
                    position: "absolute",
                    top: "13px",
                    left: "20px",
                    right: "20px",
                    height: "2px",
                    background: "rgba(255, 255, 255, 0.1)",
                    zIndex: 0
                  }} />

                  {STATUS_STEPS.map((step, idx) => {
                    const isDone = idx < currentStepIdx;
                    const isCurrent = idx === currentStepIdx;

                    return (
                      <div key={step} style={{ flex: 1, textAlign: "center", position: "relative", zIndex: 1 }}>
                        <div style={{
                          width: "26px",
                          height: "26px",
                          borderRadius: "50%",
                          margin: "0 auto 4px auto",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: isDone ? "#00ff88" : isCurrent ? "#ff334b" : "#1e293b",
                          color: isDone ? "#070a12" : "white",
                          fontSize: "10px",
                          fontWeight: "800",
                          boxShadow: isCurrent ? "0 0 14px rgba(255, 51, 75, 0.85)" : "none",
                          transition: "all 0.3s ease"
                        }}>
                          {isDone ? <Check size={13} /> : idx + 1}
                        </div>
                        <div style={{ fontSize: "0.65rem", fontWeight: isCurrent ? "800" : isDone ? "700" : "500", color: isCurrent ? "#f8fafc" : isDone ? "#00ff88" : "#64748b" }}>
                          {step}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Individual Responder Requirements Breakdown (Feature 1 & Status Display) */}
              {activeIncident.responder_requirements && activeIncident.responder_requirements.length > 0 && (
                <div style={{
                  background: "rgba(15, 23, 42, 0.75)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "6px" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: "800", color: "#f8fafc", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Required Services ({activeIncident.responder_requirements.filter(r => ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED'].includes(r.status)).length}/{activeIncident.responder_requirements.length} Assigned)
                    </span>
                    {(() => {
                      const resCount = activeIncident.responder_requirements.filter(r => r.status === 'RESOLVED' || r.status === 'Resolved').length;
                      const totCount = activeIncident.responder_requirements.length;
                      const isFullRes = activeIncident.status === "Resolved" || activeIncident.is_fully_resolved || (totCount > 0 && resCount === totCount);
                      const isPartRes = activeIncident.status === "Partially Resolved" || resCount > 0;

                      return (
                        <span style={{
                          fontSize: "0.68rem",
                          fontWeight: "800",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: isFullRes ? "rgba(0, 255, 136, 0.2)" : isPartRes ? "rgba(0, 229, 255, 0.2)" : activeIncident.is_fully_assigned ? "rgba(0, 255, 136, 0.2)" : "rgba(255, 184, 0, 0.2)",
                          color: isFullRes ? "#00ff88" : isPartRes ? "#00e5ff" : activeIncident.is_fully_assigned ? "#00ff88" : "#ffb800",
                          border: `1px solid ${isFullRes ? '#00ff88' : isPartRes ? '#00e5ff' : activeIncident.is_fully_assigned ? '#00ff88' : '#ffb800'}40`
                        }}>
                          {isFullRes ? "Emergency Resolved ✓" : isPartRes ? `Partially Resolved (${resCount}/${totCount} Completed)` : activeIncident.is_fully_assigned ? "Fully Assigned ✓" : "Fulfillment In Progress..."}
                        </span>
                      );
                    })()}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {activeIncident.responder_requirements.map((req) => {
                      const isResolved = req.status === "RESOLVED" || req.status === "Resolved";
                      const isAssigned = req.status === "ASSIGNED" || req.status === "EN_ROUTE" || req.status === "ON_SCENE";
                      const isNoResp = req.status === "NO_RESPONDER_AVAILABLE";
                      const sColor = getServiceColor(req.service_type);

                      return (
                        <div
                          key={req.responder_type}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: isResolved ? "rgba(0, 255, 136, 0.12)" : isAssigned ? "rgba(0, 229, 255, 0.08)" : isNoResp ? "rgba(255, 51, 75, 0.08)" : "rgba(30, 41, 59, 0.4)",
                            border: `1px solid ${isResolved ? '#00ff88' : isAssigned ? '#00e5ff' : isNoResp ? '#ff334b' : sColor}35`,
                            borderRadius: "8px",
                            padding: "8px 10px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "26px", height: "26px", borderRadius: "6px", background: `${sColor}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {getServiceIcon(req.service_type)}
                            </div>
                            <div>
                              <div style={{ fontSize: "0.82rem", fontWeight: "800", color: "#f8fafc" }}>
                                {req.service_type}
                              </div>
                              {req.assigned_responder && (
                                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                                  {req.assigned_responder.full_name} ({req.assigned_responder.vehicle_number || "Unit"})
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            {isResolved ? (
                              <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "#00ff88", display: "flex", alignItems: "center", gap: "4px" }}>
                                <CheckCircle2 size={14} color="#00ff88" /> Resolved ✓
                              </span>
                            ) : req.status === "ON_SCENE" || req.status === "On Scene" ? (
                              <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "#ffb800", display: "flex", alignItems: "center", gap: "4px" }}>
                                <Check size={14} /> On Scene
                              </span>
                            ) : req.status === "EN_ROUTE" || req.status === "En Route" ? (
                              <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "#00e5ff", display: "flex", alignItems: "center", gap: "4px" }}>
                                <Navigation size={13} /> En Route
                              </span>
                            ) : isAssigned ? (
                              <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "#00e5ff", display: "flex", alignItems: "center", gap: "4px" }}>
                                <Check size={14} /> Assigned ✓
                              </span>
                            ) : isNoResp ? (
                              <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "#ff334b", display: "flex", alignItems: "center", gap: "4px" }}>
                                <AlertTriangle size={13} /> No responder available
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.75rem", fontWeight: "700", color: "#00e5ff", display: "flex", alignItems: "center", gap: "4px" }}>
                                <Clock size={13} className="animate-spin" /> Searching...
                              </span>
                            )}

                            {req.assigned_responder?.phone && (
                              <a
                                href={`tel:${req.assigned_responder.phone}`}
                                onClick={() => sounds.playTap()}
                                style={{
                                  background: "linear-gradient(135deg, #00ff88, #059669)",
                                  color: "#070a12",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  fontSize: "0.72rem",
                                  fontWeight: "800",
                                  textDecoration: "none",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px"
                                }}
                              >
                                <Phone size={11} /> Call
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Responder Information or 5-Min Escalation Alert */}
              {activeIncident.assigned_responder ? (
                <div style={{
                  background: "rgba(30, 41, 59, 0.6)",
                  border: "1px solid rgba(0, 229, 255, 0.3)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "rgba(0, 229, 255, 0.18)", color: "#00e5ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Navigation size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.92rem", fontWeight: "900", color: "#f8fafc" }}>
                        {activeIncident.assigned_responder.full_name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        {activeIncident.assigned_responder.service_type} • Vehicle: <strong>{activeIncident.assigned_responder.vehicle_number || "DEMO-UNIT"}</strong>
                      </div>
                    </div>
                  </div>

                  <a
                    href={`tel:${activeIncident.assigned_responder.phone || "112"}`}
                    onClick={() => sounds.playTap()}
                    style={{
                      background: "linear-gradient(135deg, #00ff88, #059669)",
                      color: "#070a12",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      fontWeight: "900",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: "0 4px 14px rgba(0, 255, 136, 0.3)"
                    }}
                  >
                    <Phone size={14} /> Call
                  </a>
                </div>
              ) : activeIncident.status === "NO_RESPONDER_AVAILABLE" ? (
                <div style={{
                  background: "rgba(255, 51, 75, 0.12)",
                  border: "1px solid rgba(255, 51, 75, 0.35)",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#ff334b" }}>
                    <AlertTriangle size={22} />
                    <div>
                      <div style={{ fontWeight: "800", color: "#f8fafc", fontSize: "0.88rem" }}>
                        No Responder Currently Available
                      </div>
                      <div style={{ color: "#fca5a5", fontSize: "0.76rem", marginTop: "2px" }}>
                        All nearby units are engaged or outside coverage radius. Please dial national emergency services immediately:
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                    <a
                      href="tel:112"
                      onClick={() => sounds.playTap()}
                      style={{
                        flex: 1,
                        background: "linear-gradient(135deg, #ff334b, #b91c1c)",
                        color: "#fff",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.82rem",
                        fontWeight: "900",
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        boxShadow: "0 4px 14px rgba(255, 51, 75, 0.4)"
                      }}
                    >
                      <Phone size={14} /> Call 112 (National Helpline)
                    </a>
                    <a
                      href="tel:108"
                      onClick={() => sounds.playTap()}
                      style={{
                        background: "rgba(255, 255, 255, 0.1)",
                        color: "#f8fafc",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "0.82rem",
                        fontWeight: "800",
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        border: "1px solid rgba(255, 255, 255, 0.15)"
                      }}
                    >
                      <Phone size={14} /> Call 108
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: "rgba(255, 184, 0, 0.12)",
                  border: "1px solid rgba(255, 184, 0, 0.35)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "#ffb800"
                }}>
                  <Clock size={20} className="animate-spin" />
                  <div style={{ fontSize: "0.78rem" }}>
                    <div style={{ fontWeight: "800", color: "#f8fafc" }}>
                      Contacting Nearby Eligible Responders...
                    </div>
                    <div style={{ color: "#cbd5e1", marginTop: "1px" }}>
                      Emergency broadcast sent to all verified {activeIncident.suggested_service} units within radius. First available responder will be dispatched immediately.
                    </div>
                  </div>
                </div>
              )}

              {/* Checklist Conditions & Details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "4px" }}>
                {activeIncident.checklist_json && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: "700" }}>Reported Hazards:</span>
                    {JSON.parse(activeIncident.checklist_json || "[]").map((item) => (
                      <span key={item} style={{ fontSize: "0.7rem", background: "rgba(255, 51, 75, 0.15)", border: "1px solid rgba(255, 51, 75, 0.3)", color: "#ff4d67", padding: "2px 8px", borderRadius: "6px", fontWeight: "600" }}>
                        {item}
                      </span>
                    ))}
                  </div>
                )}

                {activeIncident.description && (
                  <div style={{ fontSize: "0.78rem", color: "#e2e8f0", background: "rgba(255,255,255,0.04)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "#94a3b8", fontWeight: "700" }}>Description: </span>
                    {activeIncident.description}
                  </div>
                )}

                {activeIncident.address && (
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "5px" }}>
                    <MapPin size={13} color="#00e5ff" />
                    <span>{activeIncident.address}</span>
                  </div>
                )}
              </div>

            </div>

          </div>
        ) : (
          <div style={{
            background: "rgba(14, 20, 36, 0.95)",
            borderRadius: "16px",
            padding: "40px 20px",
            textAlign: "center",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            margin: "auto 0"
          }}>
            <CheckCircle2 size={40} color="#00ff88" style={{ margin: "0 auto 10px auto" }} />
            <h3 style={{ fontSize: "1.15rem", fontWeight: "800", color: "#f8fafc", marginBottom: "4px" }}>
              No Active Emergencies
            </h3>
            <p style={{ fontSize: "0.82rem", color: "#94a3b8", maxWidth: "340px", margin: "0 auto 16px auto" }}>
              Press the button below if emergency help or rescue is needed.
            </p>
            <button
              onClick={() => { sounds.playAlertSiren(); onOpenSos(); }}
              className="btn-emergency-main"
              style={{ padding: "10px 24px", fontSize: "0.9rem" }}
            >
              <AlertOctagon size={16} /> Report Emergency SOS
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
