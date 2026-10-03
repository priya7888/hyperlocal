import React, { useState, useEffect, useRef } from "react";
import { 
  AlertOctagon, Phone, MapPin, Navigation, CheckCircle2, 
  Clock, RefreshCw, User, LogOut, PhoneCall, ChevronRight, Check,
  ShieldAlert, HeartPulse, Flame, Maximize2, Minimize2, Radio, Shield, Activity,
  ListFilter, AlertTriangle, ChevronDown, Layers, ArrowLeft, Trash2, X, Bell
} from "lucide-react";
import MapComponent from "./MapComponent";
import { incidentApi, routingApi, socket, deduplicateIncidents } from "../services/api";
import { sounds } from "../services/soundEffects";

const STATUS_STEPS = ["Reported", "Assigned", "En Route", "On Scene", "Resolved"];

export default function CitizenDashboard({ currentUser, onOpenSos, onLogout, initialIncident }) {
  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(initialIncident || null);
  // View mode: 'list' (all reports list) | 'details' (single report details & map)
  const [viewMode, setViewMode] = useState(initialIncident ? "details" : "list");
  const [routeCoords, setRouteCoords] = useState([]);
  const [responderLiveLoc, setResponderLiveLoc] = useState(null);

  // Live Responder Acceptance Popup Toast
  const [acceptanceToast, setAcceptanceToast] = useState(null);

  // Keep a ref of activeIncident for socket callbacks
  const activeIncidentRef = useRef(activeIncident);
  activeIncidentRef.current = activeIncident;

  useEffect(() => {
    if (initialIncident) {
      setActiveIncident(initialIncident);
      setViewMode("details");
      setIncidents((prev) => deduplicateIncidents([initialIncident, ...prev]));
      if (initialIncident.assigned_responder) {
        fetchRoute(initialIncident);
      }
    }
  }, [initialIncident]);

  useEffect(() => {
    loadIncidents();

    // 1. New incident submitted
    const handleCreated = (data) => {
      sounds.playAlertSiren();
      if (data && data.id) {
        setActiveIncident(data);
        setViewMode("details");
        setIncidents((prev) => deduplicateIncidents([data, ...prev]));
        if (data.assigned_responder && data.status !== "Reported" && data.status !== "Awaiting Responder") {
          setResponderLiveLoc({ lat: data.assigned_responder.lat, lng: data.assigned_responder.lng });
          fetchRoute(data);
        } else {
          setResponderLiveLoc(null);
          setRouteCoords([]);
        }
        setAcceptanceToast({
          title: "🚨 Emergency Dispatched!",
          message: `Your ${data.emergency_type || "Emergency"} report is broadcasting to nearest emergency units.`,
          service: data.suggested_service || "Emergency"
        });
      }
    };

    // 2. Responder Accepted Incident
    const handleAccepted = (data) => {
      sounds.playSuccess();
      const inc = data.incident || data;
      const resp = data.responder || inc.assigned_responder;
      const respName = resp?.full_name || "Emergency Officer";
      const sType = resp?.service_type || inc.suggested_service || "Responder";
      
      sounds.showSystemNotification("🚨 Emergency Unit Accepted!", `${respName} (${sType}) has accepted your emergency report and is en route!`);

      setAcceptanceToast({
        title: "🚨 Emergency Unit Accepted!",
        message: `${respName} (${sType}) accepted your report. Unit is en route!`,
        service: sType
      });

      if (inc && inc.id) {
        setActiveIncident(inc);
        setViewMode("details");
        if (resp && resp.lat && resp.lng) {
          setResponderLiveLoc({ lat: resp.lat, lng: resp.lng });
          fetchRoute(inc);
        }
      }
      loadIncidents();
    };

    // 3. Status changes (Assigned, En Route, On Scene, Resolved)
    const handleStatusChanged = (data) => {
      sounds.playStep();
      loadIncidents();
      const inc = data?.incident;
      if (activeIncidentRef.current && inc?.id === activeIncidentRef.current.id) {
        setActiveIncident(inc);
        if (inc.assigned_responder) {
          setResponderLiveLoc({ lat: inc.assigned_responder.lat, lng: inc.assigned_responder.lng });
          fetchRoute(inc);
        }
      }
    };

    const handleUpdated = (data) => {
      loadIncidents();
      if (activeIncidentRef.current && data?.id === activeIncidentRef.current.id) {
        setActiveIncident(data);
        if (data.assigned_responder) {
          setResponderLiveLoc({ lat: data.assigned_responder.lat, lng: data.assigned_responder.lng });
          fetchRoute(data);
        }
      }
    };

    // 4. Live moving GPS stream from responder
    const handleGps = (data) => {
      if (data && data.lat && data.lng) {
        setResponderLiveLoc({ lat: data.lat, lng: data.lng });
      }
    };

    socket.on("incident_created", handleCreated);
    socket.on("responder_accepted_incident", handleAccepted);
    socket.on("incident_status_changed", handleStatusChanged);
    socket.on("incident_updated", handleUpdated);
    socket.on("responder_gps_update", handleGps);

    return () => {
      socket.off("incident_created", handleCreated);
      socket.off("responder_accepted_incident", handleAccepted);
      socket.off("incident_status_changed", handleStatusChanged);
      socket.off("incident_updated", handleUpdated);
      socket.off("responder_gps_update", handleGps);
    };
  }, []);

  // Auto-dismiss acceptance notification toast after 7 seconds
  useEffect(() => {
    if (acceptanceToast) {
      const t = setTimeout(() => setAcceptanceToast(null), 7000);
      return () => clearTimeout(t);
    }
  }, [acceptanceToast]);

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

  const handleOpenDetails = (inc) => {
    sounds.playTap();
    setActiveIncident(inc);
    setViewMode("details");
    if (inc.assigned_responder && inc.status !== "Reported" && inc.status !== "Awaiting Responder") {
      setResponderLiveLoc({ lat: inc.assigned_responder.lat, lng: inc.assigned_responder.lng });
      fetchRoute(inc);
    } else {
      setResponderLiveLoc(null);
      setRouteCoords([]);
    }
  };

  const handleBackToList = () => {
    sounds.playTap();
    setViewMode("list");
  };

  const handleDeleteIncident = (e, id) => {
    e.stopPropagation();
    sounds.playTap();
    const updated = incidents.filter(i => i.id !== id);
    setIncidents(updated);
    try {
      localStorage.setItem("app_incidents", JSON.stringify(updated));
    } catch (err) {}
    if (activeIncident?.id === id) {
      setActiveIncident(updated.length > 0 ? updated[0] : null);
      if (updated.length === 0) setViewMode("list");
    }
  };

  const handleClearAllReports = () => {
    sounds.playTap();
    if (window.confirm("Clear all past emergency reports from your list?")) {
      setIncidents([]);
      setActiveIncident(null);
      try {
        localStorage.removeItem("app_incidents");
        localStorage.removeItem("emergency_offline_pending_reports");
      } catch (err) {}
      setViewMode("list");
    }
  };

  const fetchRoute = async (incident) => {
    if (!incident || !incident.assigned_responder || incident.status === "Reported" || incident.status === "Awaiting Responder") {
      setRouteCoords([]);
      return;
    }
    try {
      const r = incident.assigned_responder;
      if (!r.lat || !r.lng || !incident.lat || !incident.lng) {
        setRouteCoords([]);
        return;
      }
      const res = await routingApi.getRoute(r.lat, r.lng, incident.lat, incident.lng);
      if (res && res.coordinates) {
        setRouteCoords(res.coordinates);
      } else {
        setRouteCoords([]);
      }
    } catch (e) {
      console.warn("Route fetch error", e);
      setRouteCoords([]);
    }
  };

  const getStepIndex = (status) => {
    if (status === "Reported" || status === "Awaiting Responder") return 0;
    if (status === "Assigned") return 1;
    if (status === "En Route") return 2;
    if (status === "On Scene") return 3;
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
    if (service === "Fire") return <Flame size={16} color="#ff334b" />;
    if (service === "Police") return <Shield size={16} color="#00e5ff" />;
    return <HeartPulse size={16} color="#00ff88" />;
  };

  return (
    <div style={{
      maxWidth: "860px",
      margin: "0 auto",
      padding: "16px 14px",
      display: "flex",
      flexDirection: "column",
      gap: "14px",
      minHeight: "100vh"
    }}>
      
      {/* 1. Live Responder Acceptance Popup Banner */}
      {acceptanceToast && (
        <div style={{
          background: "linear-gradient(135deg, rgba(0, 229, 255, 0.22), rgba(14, 20, 36, 0.98))",
          border: "2px solid #00e5ff",
          borderRadius: "14px",
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 8px 30px rgba(0, 229, 255, 0.4)",
          animation: "slideDown 0.3s ease",
          zIndex: 1000
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "rgba(0, 229, 255, 0.2)",
              color: "#00e5ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Bell size={22} className="animate-bounce" />
            </div>
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: "900", color: "#00e5ff" }}>
                {acceptanceToast.title}
              </div>
              <div style={{ fontSize: "0.82rem", color: "#f8fafc", fontWeight: "600" }}>
                {acceptanceToast.message}
              </div>
            </div>
          </div>

          <button
            onClick={() => setAcceptanceToast(null)}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* 2. Sleek Top Navigation Bar */}
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
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
              Emergency Tracking
            </div>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
              {currentUser?.full_name || "Citizen"}
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

      {/* ================= VIEW 1: ALL REPORTS VERTICAL LIST ================= */}
      {viewMode === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* Header Banner with Clear All option */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            background: "rgba(14, 20, 36, 0.8)",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.08)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Layers size={18} color="#00e5ff" />
              <span style={{ fontSize: "0.92rem", fontWeight: "800", color: "#f8fafc" }}>
                All Emergency Reports
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="neon-badge neon-badge-info" style={{ fontSize: "0.72rem" }}>
                {incidents.length} Total
              </span>
            </div>
          </div>

          {/* Vertical Stack of Report Cards */}
          {incidents.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {incidents.map((inc) => {
                const serviceColor = getServiceColor(inc.suggested_service || inc.emergency_type);

                return (
                  <div
                    key={inc.id}
                    onClick={() => handleOpenDetails(inc)}
                    style={{
                      background: "rgba(14, 20, 36, 0.95)",
                      backdropFilter: "blur(14px)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "14px",
                      padding: "16px",
                      cursor: "pointer",
                      transition: "all 0.25s ease",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#00e5ff";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    {/* Top Row: Service Icon, ID & Status + Delete Icon */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: `${serviceColor}20`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}>
                          {getServiceIcon(inc.suggested_service || inc.emergency_type)}
                        </div>
                        <div>
                          <span style={{ fontFamily: "monospace", fontWeight: "900", fontSize: "0.88rem", color: "#00e5ff" }}>
                            {inc.id}
                          </span>
                          <span style={{ color: "#64748b", margin: "0 6px" }}>•</span>
                          <span style={{ fontSize: "0.82rem", fontWeight: "800", color: "#f8fafc" }}>
                            {inc.emergency_type} Emergency
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className={`neon-badge ${inc.status === "Resolved" ? "neon-badge-resolved" : "neon-badge-critical"}`} style={{ fontSize: "0.68rem", padding: "3px 8px" }}>
                          {inc.status}
                        </span>
                        <button
                          onClick={(e) => handleDeleteIncident(e, inc.id)}
                          title="Delete report"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#64748b",
                            cursor: "pointer",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = "#ff4d67"}
                          onMouseLeave={(e) => e.currentTarget.style.color = "#64748b"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Middle: Details & Address */}
                    {inc.description && (
                      <div style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                        {inc.description}
                      </div>
                    )}

                    {inc.address && (
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "5px" }}>
                        <MapPin size={12} color="#00e5ff" />
                        <span>{inc.address}</span>
                      </div>
                    )}

                    {/* Bottom Action Row */}
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: "8px",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      marginTop: "2px"
                    }}>
                      <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                        {inc.created_at ? new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently"}
                      </span>

                      <div style={{
                        background: "rgba(0, 229, 255, 0.12)",
                        border: "1px solid rgba(0, 229, 255, 0.35)",
                        color: "#00e5ff",
                        padding: "5px 12px",
                        borderRadius: "8px",
                        fontSize: "0.76rem",
                        fontWeight: "800",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        View Details & Map <ChevronRight size={14} />
                      </div>
                    </div>
                  </div>
                );
              })}
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
      )}

      {/* ================= VIEW 2: SINGLE REPORT DETAILS & INTERACTIVE MAP WITH BACK ARROW ================= */}
      {viewMode === "details" && activeIncident && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* Prominent Back Arrow Button Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={handleBackToList}
              style={{
                background: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(0, 229, 255, 0.4)",
                color: "#00e5ff",
                padding: "8px 14px",
                borderRadius: "10px",
                fontSize: "0.82rem",
                fontWeight: "800",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 10px rgba(0,0,0,0.3)"
              }}
            >
              <ArrowLeft size={16} /> Back to All Reports
            </button>

            <span className={`neon-badge ${activeIncident.status === "Resolved" ? "neon-badge-resolved" : "neon-badge-critical"}`} style={{ fontSize: "0.72rem", padding: "4px 10px" }}>
              {activeIncident.status}
            </span>
          </div>

          {/* Interactive Live Map Canvas */}
          <div style={{
            height: "46vh",
            minHeight: "340px",
            maxHeight: "520px",
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
              responderLocation={(activeIncident.assigned_responder && activeIncident.status !== "Reported" && activeIncident.status !== "Awaiting Responder") ? (responderLiveLoc || { lat: activeIncident.assigned_responder.lat, lng: activeIncident.assigned_responder.lng }) : null}
              responderType={activeIncident.assigned_responder?.service_type || activeIncident.suggested_service}
              responderLabel={activeIncident.assigned_responder?.full_name ? `${activeIncident.assigned_responder.full_name} (Live GPS)` : "Assigned Responder"}
              routeCoordinates={(activeIncident.assigned_responder && activeIncident.status !== "Reported" && activeIncident.status !== "Awaiting Responder") ? routeCoords : []}
            />

            {/* Floating Info Pill over Map */}
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
                <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "#f8fafc" }}>
                  {activeIncident.emergency_type}
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
            ) : null}

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
      )}

    </div>
  );
}
