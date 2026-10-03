import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Search, Clock, RefreshCw, X, Radio, AlertOctagon,
  Flame, HeartPulse, Activity, ShieldAlert, Shield, Compass, MapPin, Navigation
} from "lucide-react";
import MapComponent from "./MapComponent";
import { incidentApi, responderApi, socket } from "../services/api";

const TYPE_FILTER_DEFS = [
  { id: "ALL", label: "ALL", icon: null, color: "#cbd5e1" },
  { id: "FIRE", label: "FIRE", icon: Flame, color: "#ef4444", bg: "rgba(239, 68, 68, 0.2)" },
  { id: "MEDICAL", label: "MEDICAL", icon: HeartPulse, color: "#3b82f6", bg: "rgba(59, 130, 246, 0.2)" },
  { id: "ACCIDENT", label: "ACCIDENT", icon: Activity, color: "#f97316", bg: "rgba(249, 115, 22, 0.2)" },
  { id: "GAS LEAK", label: "GAS LEAK", icon: AlertOctagon, color: "#a855f7", bg: "rgba(168, 85, 247, 0.2)" },
  { id: "SECURITY", label: "SECURITY", icon: ShieldAlert, color: "#eab308", bg: "rgba(234, 179, 8, 0.2)" }
];

const TIME_FILTERS = [
  { id: "LIVE", label: "TIME: LIVE" },
  { id: "15MIN", label: "Last 15 minutes" },
  { id: "1HOUR", label: "Last 1 hour" },
  { id: "24HOURS", label: "Last 24 hours" },
  { id: "ALL", label: "All" }
];

export default function IncidentMonitoringMap({
  height = "600px",
  selectedIncident = null,
  onIncidentSelect = null,
  onOpenTracker = null
}) {
  const [incidents, setIncidents] = useState([]);
  const [responders, setResponders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState("LIVE");
  const [activeSelectedId, setActiveSelectedId] = useState(selectedIncident?.id || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(true);

  // Sync external selectedIncident prop if passed
  useEffect(() => {
    if (selectedIncident?.id) {
      setActiveSelectedId(selectedIncident.id);
    }
  }, [selectedIncident]);

  // Load real incidents & responders from backend
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [incData, respData] = await Promise.all([
        incidentApi.list(),
        responderApi.getAll().catch(() => [])
      ]);
      setIncidents(incData || []);
      setResponders(respData || []);
    } catch (e) {
      console.warn("Failed to load live map data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Socket.IO real-time updates: Automatically adds new markers without reloading
    const handleIncidentCreated = (newIncident) => {
      if (!newIncident) return;
      setIncidents((prev) => {
        const exists = prev.some((i) => i.id === newIncident.id);
        if (exists) {
          return prev.map((i) => (i.id === newIncident.id ? newIncident : i));
        }
        return [newIncident, ...prev];
      });
      // Auto-focus on newly created incident
      setActiveSelectedId(newIncident.id);
    };

    const handleIncidentStatus = (data) => {
      if (data?.incident) {
        setIncidents((prev) =>
          prev.map((i) => (i.id === data.incident.id ? data.incident : i))
        );
      } else {
        loadData();
      }
    };

    const handleIncidentUpdated = (updated) => {
      if (updated?.id) {
        setIncidents((prev) =>
          prev.map((i) => (i.id === updated.id ? updated : i))
        );
      }
    };

    const handleResponderGps = (data) => {
      if (data?.responderId && data?.lat && data?.lng) {
        setResponders((prev) =>
          prev.map((r) =>
            r.id === data.responderId ? { ...r, lat: data.lat, lng: data.lng } : r
          )
        );
      }
    };

    socket.on("incident_created", handleIncidentCreated);
    socket.on("incident_status_changed", handleIncidentStatus);
    socket.on("incident_updated", handleIncidentUpdated);
    socket.on("responder_gps_update", handleResponderGps);

    socket.on("connect", () => setIsLiveConnected(true));
    socket.on("disconnect", () => setIsLiveConnected(false));

    return () => {
      socket.off("incident_created", handleIncidentCreated);
      socket.off("incident_status_changed", handleIncidentStatus);
      socket.off("incident_updated", handleIncidentUpdated);
      socket.off("responder_gps_update", handleResponderGps);
    };
  }, []);

  // Compute exact actual data counts for filter pills (e.g. ALL 27, FIRE 2, MEDICAL 24...)
  const filterCounts = useMemo(() => {
    const counts = { ALL: incidents.length, FIRE: 0, MEDICAL: 0, ACCIDENT: 0, "GAS LEAK": 0, SECURITY: 0 };
    incidents.forEach((i) => {
      const t = (i.emergency_type || "").toLowerCase();
      if (t.includes("fire")) counts.FIRE++;
      else if (t.includes("medic")) counts.MEDICAL++;
      else if (t.includes("accident") || t.includes("crash")) counts.ACCIDENT++;
      else if (t.includes("gas") || t.includes("leak")) counts["GAS LEAK"]++;
      else if (t.includes("secur") || t.includes("crime") || t.includes("threat")) counts.SECURITY++;
    });
    return counts;
  }, [incidents]);

  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchContainerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered incidents based on Search, Type Filter, and Time Filter
  const filteredIncidents = useMemo(() => {
    const now = Date.now();

    return incidents.filter((inc) => {
      // 1. Incident Type Filter
      if (typeFilter !== "ALL") {
        const typeStr = (inc.emergency_type || "").toLowerCase();
        if (typeFilter === "FIRE" && !typeStr.includes("fire")) return false;
        if (typeFilter === "MEDICAL" && !typeStr.includes("medic")) return false;
        if (
          typeFilter === "ACCIDENT" &&
          !typeStr.includes("accident") &&
          !typeStr.includes("crash")
        )
          return false;
        if (
          typeFilter === "GAS LEAK" &&
          !typeStr.includes("gas") &&
          !typeStr.includes("leak")
        )
          return false;
        if (
          typeFilter === "SECURITY" &&
          !typeStr.includes("secur") &&
          !typeStr.includes("crime") &&
          !typeStr.includes("threat")
        )
          return false;
      }

      // 2. Time Filter
      if (timeFilter !== "ALL" && inc.created_at) {
        const createdMs = new Date(inc.created_at).getTime();
        const diffMs = now - createdMs;

        if (timeFilter === "LIVE") {
          // Live: active incidents (not Resolved/Cancelled) OR within last 2 hours
          const isActive = inc.status !== "Resolved" && inc.status !== "Cancelled";
          const isRecent = diffMs <= 2 * 60 * 60 * 1000;
          if (!isActive && !isRecent) return false;
        } else if (timeFilter === "15MIN") {
          if (diffMs > 15 * 60 * 1000) return false;
        } else if (timeFilter === "1HOUR") {
          if (diffMs > 60 * 60 * 1000) return false;
        } else if (timeFilter === "24HOURS") {
          if (diffMs > 24 * 60 * 60 * 1000) return false;
        }
      }

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchId = (inc.id || "").toLowerCase().includes(query);
        const matchType = (inc.emergency_type || "").toLowerCase().includes(query);
        const matchAddress = (inc.address || "").toLowerCase().includes(query);
        const matchDesc = (inc.description || "").toLowerCase().includes(query);
        const matchResponder = inc.assigned_responder?.full_name?.toLowerCase().includes(query);

        if (!matchId && !matchType && !matchAddress && !matchDesc && !matchResponder) {
          return false;
        }
      }

      return true;
    });
  }, [incidents, typeFilter, timeFilter, searchQuery]);

  // Filtered Responders based on search
  const filteredResponders = useMemo(() => {
    if (!searchQuery.trim()) return responders;
    const query = searchQuery.toLowerCase().trim();
    return responders.filter((r) => {
      const matchName = (r.full_name || r.name || "").toLowerCase().includes(query);
      const matchService = (r.service_type || r.service || "").toLowerCase().includes(query);
      const matchVehicle = (r.vehicle_number || "").toLowerCase().includes(query);
      return matchName || matchService || matchVehicle;
    });
  }, [responders, searchQuery]);

  // Dropdown suggestions for quick search jump
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { incidents: [], responders: [] };
    const query = searchQuery.toLowerCase().trim();

    const matchingInc = incidents.filter((inc) => {
      const matchId = (inc.id || "").toLowerCase().includes(query);
      const matchType = (inc.emergency_type || "").toLowerCase().includes(query);
      const matchAddress = (inc.address || "").toLowerCase().includes(query);
      const matchDesc = (inc.description || "").toLowerCase().includes(query);
      const matchResponder = inc.assigned_responder?.full_name?.toLowerCase().includes(query);
      return matchId || matchType || matchAddress || matchDesc || matchResponder;
    }).slice(0, 6);

    const matchingResp = responders.filter((r) => {
      const matchName = (r.full_name || r.name || "").toLowerCase().includes(query);
      const matchService = (r.service_type || r.service || "").toLowerCase().includes(query);
      const matchVehicle = (r.vehicle_number || "").toLowerCase().includes(query);
      return matchName || matchService || matchVehicle;
    }).slice(0, 4);

    return { incidents: matchingInc, responders: matchingResp };
  }, [incidents, responders, searchQuery]);

  // Handle marker click or search focus / popup close
  const handleIncidentClick = (inc) => {
    setActiveSelectedId(inc ? inc.id : null);
    if (onIncidentSelect) onIncidentSelect(inc);
  };

  const handleSelectSearchResult = (inc) => {
    setActiveSelectedId(inc.id);
    setShowSearchDropdown(false);
    if (onIncidentSelect) onIncidentSelect(inc);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
      
      {/* 1. HEADER ROW: Title, Live Status, Time Filter & Refresh */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        paddingBottom: "8px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
      }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "900", color: "#f8fafc", display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
            <Compass size={20} color="#00e5ff" /> LIVE INCIDENT MONITORING MAP
          </h2>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "2px" }}>
            Emergency Operations Dispatch • Real-Time Fleet & Active Incident Surveillance
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Time Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={15} color="#00e5ff" />
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              style={{
                background: "rgba(15, 23, 42, 0.9)",
                border: "1.5px solid rgba(0, 229, 255, 0.4)",
                borderRadius: "8px",
                color: "#00e5ff",
                fontSize: "0.82rem",
                fontWeight: "800",
                padding: "7px 12px",
                cursor: "pointer",
                outline: "none"
              }}
            >
              {TIME_FILTERS.map((tf) => (
                <option key={tf.id} value={tf.id}>
                  {tf.label}
                </option>
              ))}
            </select>
          </div>

          {/* Live Status Indicator */}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.76rem",
              fontWeight: "900",
              color: isLiveConnected ? "#00ff88" : "#ffb800",
              background: isLiveConnected ? "rgba(0, 255, 136, 0.12)" : "rgba(255, 184, 0, 0.12)",
              border: isLiveConnected ? "1.5px solid rgba(0, 255, 136, 0.35)" : "1.5px solid rgba(255, 184, 0, 0.35)",
              padding: "6px 12px",
              borderRadius: "20px",
              boxShadow: isLiveConnected ? "0 0 10px rgba(0,255,136,0.2)" : "none"
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: isLiveConnected ? "#00ff88" : "#ffb800",
                boxShadow: isLiveConnected ? "0 0 8px #00ff88" : "none"
              }}
            />
            {isLiveConnected ? "LIVE" : "SYNCING"}
          </span>

          {/* Refresh Button */}
          <button
            onClick={loadData}
            title="Refresh Incident Data"
            disabled={isLoading}
            style={{
              background: "rgba(30, 41, 59, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#cbd5e1",
              borderRadius: "8px",
              padding: "7px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.82rem",
              fontWeight: "700"
            }}
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* 2. SEARCH BAR ROW WITH AUTOCOMPLETE SUGGESTIONS */}
      <div ref={searchContainerRef} style={{ position: "relative", width: "100%" }}>
        <Search
          size={17}
          color="#94a3b8"
          style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowSearchDropdown(true);
          }}
          onFocus={() => {
            if (searchQuery.trim()) setShowSearchDropdown(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchResults.incidents.length > 0) {
              handleSelectSearchResult(searchResults.incidents[0]);
            } else if (e.key === "Escape") {
              setShowSearchDropdown(false);
            }
          }}
          placeholder="Search location, incident or responder..."
          style={{
            width: "100%",
            padding: "11px 40px 11px 42px",
            borderRadius: "10px",
            background: "rgba(15, 23, 42, 0.85)",
            border: searchQuery ? "1.5px solid #00e5ff" : "1px solid rgba(255, 255, 255, 0.15)",
            color: "#f8fafc",
            fontSize: "0.88rem",
            outline: "none",
            boxShadow: searchQuery ? "0 0 14px rgba(0,229,255,0.2)" : "none"
          }}
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              setShowSearchDropdown(false);
            }}
            style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              display: "flex",
              alignItems: "center"
            }}
          >
            <X size={16} />
          </button>
        )}

        {/* Quick Search Dropdown Suggestions */}
        {showSearchDropdown && searchQuery.trim().length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              zIndex: 1100,
              background: "rgba(15, 23, 42, 0.98)",
              backdropFilter: "blur(12px)",
              border: "1.5px solid rgba(0, 229, 255, 0.4)",
              borderRadius: "10px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.8)",
              maxHeight: "340px",
              overflowY: "auto",
              padding: "8px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px 6px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: "0.72rem", color: "#94a3b8" }}>
              <span>MATCHING INCIDENTS & RESPONDERS ({searchResults.incidents.length + searchResults.responders.length})</span>
              <button
                type="button"
                onClick={() => setShowSearchDropdown(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.72rem" }}
              >
                Close [Esc]
              </button>
            </div>

            {searchResults.incidents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" }}>
                {searchResults.incidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => handleSelectSearchResult(inc)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: activeSelectedId === inc.id ? "rgba(0, 229, 255, 0.18)" : "rgba(30, 41, 59, 0.6)",
                      border: activeSelectedId === inc.id ? "1px solid #00e5ff" : "1px solid transparent",
                      transition: "background 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                      <span style={{ fontSize: "15px" }}>
                        {inc.emergency_type?.toLowerCase().includes("fire") ? "🔥" : inc.emergency_type?.toLowerCase().includes("medic") ? "🩺" : "🚨"}
                      </span>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ fontSize: "0.84rem", fontWeight: "800", color: "#f8fafc" }}>
                          <span style={{ color: "#00e5ff", fontFamily: "monospace", marginRight: "6px" }}>{inc.id}</span>
                          {inc.emergency_type} Emergency
                        </div>
                        <div style={{ fontSize: "0.74rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inc.address || `Lat ${Number(inc.lat).toFixed(4)}, Lng ${Number(inc.lng).toFixed(4)}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span className={`neon-badge ${inc.status === "Resolved" ? "neon-badge-resolved" : inc.status === "En Route" ? "neon-badge-enroute" : "neon-badge-critical"}`} style={{ fontSize: "0.68rem" }}>
                        {inc.status === "Reported" ? "Awaiting Responder" : inc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : searchResults.responders.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "0.82rem" }}>
                No matching incidents or responders found.
              </div>
            ) : null}

            {searchResults.responders.length > 0 && (
              <div style={{ marginTop: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "6px" }}>
                <div style={{ fontSize: "0.7rem", color: "#64748b", padding: "2px 8px 4px 8px", textTransform: "uppercase" }}>
                  Matching Fleet Units
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {searchResults.responders.map((r) => (
                    <div
                      key={r.id || r.user_id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "8px",
                        background: "rgba(30, 41, 59, 0.4)",
                        fontSize: "0.78rem"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>🚑</span>
                        <span style={{ fontWeight: "700", color: "#f8fafc" }}>{r.full_name || r.name}</span>
                        <span style={{ color: "#94a3b8" }}>({r.service_type || r.service})</span>
                      </div>
                      <span style={{ color: "#00ff88", fontWeight: "700", fontSize: "0.72rem" }}>
                        {r.vehicle_number || "Active Unit"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. INCIDENT TYPE FILTERS ROW: ALL 27, FIRE 2, MEDICAL 24... */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {TYPE_FILTER_DEFS.map((f) => {
          const isSel = typeFilter === f.id;
          const count = filterCounts[f.id] ?? 0;
          return (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              style={{
                padding: "7px 16px",
                borderRadius: "20px",
                border: isSel ? `1.5px solid ${f.color || "#00e5ff"}` : "1px solid rgba(255,255,255,0.12)",
                background: isSel ? (f.bg || "rgba(0, 229, 255, 0.22)") : "rgba(30, 41, 59, 0.55)",
                color: isSel ? "#ffffff" : "#cbd5e1",
                fontWeight: isSel ? "900" : "600",
                fontSize: "0.82rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s ease",
                boxShadow: isSel ? `0 0 12px ${f.color}44` : "none"
              }}
            >
              <span>{f.label}</span>
              <span
                style={{
                  fontSize: "0.74rem",
                  background: isSel ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                  padding: "1px 7px",
                  borderRadius: "10px",
                  fontWeight: "800"
                }}
              >
                {count}
              </span>
            </button>
          );
        })}

        <span style={{ fontSize: "0.74rem", color: "#64748b", marginLeft: "auto" }}>
          Showing {filteredIncidents.length} incident{filteredIncidents.length !== 1 ? "s" : ""} • {filteredResponders.length} responder{filteredResponders.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* 4. LARGE INTERACTIVE MAP CONTAINER */}
      <div style={{
        position: "relative",
        width: "100%",
        height: height,
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid rgba(56, 189, 248, 0.25)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
      }}>
        <MapComponent
          height="100%"
          incidents={filteredIncidents}
          responders={filteredResponders}
          showControls={true}
          showLegend={true}
          selectedIncidentId={activeSelectedId}
          onIncidentSelect={handleIncidentClick}
          onOpenTracker={onOpenTracker}
        />
      </div>

    </div>
  );
}
