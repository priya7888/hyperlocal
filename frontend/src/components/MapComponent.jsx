import React, { useEffect, useMemo, useRef } from "react";
import { 
  MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, Circle, useMap, useMapEvents 
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default leaflet marker icon assets
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Helper: Calculate Haversine distance in km
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Format Time Ago (e.g. "5 min ago", "Just now")
export function formatTimeAgo(dateInput) {
  if (!dateInput) return "Just now";
  const date = new Date(dateInput);
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now - date) / 1000));
  if (diffSec < 45) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
}

// Helper: Get Responders En Route count and ETA from actual incident data
export function getIncidentResponderMetrics(incident) {
  let enRouteCount = 0;
  let etaText = "Dispatch pending";

  const status = incident.status || "Reported";

  if (status === "En Route") {
    enRouteCount = 1;
    if (incident.assigned_responder?.lat && incident.lat) {
      const d = calculateDistance(
        Number(incident.assigned_responder.lat),
        Number(incident.assigned_responder.lng),
        Number(incident.lat),
        Number(incident.lng)
      );
      const mins = Math.max(1, Math.round((d / 35.0) * 60 + 1.5));
      etaText = `${mins} min`;
    } else {
      etaText = "6 min";
    }
  } else if (status === "Assigned") {
    enRouteCount = 0;
    if (incident.assigned_responder?.lat && incident.lat) {
      const d = calculateDistance(
        Number(incident.assigned_responder.lat),
        Number(incident.assigned_responder.lng),
        Number(incident.lat),
        Number(incident.lng)
      );
      const mins = Math.max(2, Math.round((d / 35.0) * 60 + 2));
      etaText = `~${mins} min`;
    } else {
      etaText = "Assigned";
    }
  } else if (status === "On Scene") {
    enRouteCount = 0;
    etaText = "On scene";
  } else if (status === "Resolved") {
    enRouteCount = 0;
    etaText = "Resolved";
  } else {
    // Reported / Awaiting
    enRouteCount = 0;
    etaText = "Awaiting dispatch";
  }

  return { enRouteCount, etaText };
}

// Helper: Emergency type icon, label and visual color
export function getEmergencyTypeDisplay(type) {
  const norm = (type || "").toLowerCase();
  if (norm.includes("fire")) return { label: "Fire Incident", icon: "🔥", color: "#ef4444" };
  if (norm.includes("medic")) return { label: "Medical Incident", icon: "🔴", color: "#ef4444" };
  if (norm.includes("accident") || norm.includes("crash")) return { label: "Accident Incident", icon: "💥", color: "#f97316" };
  if (norm.includes("gas") || norm.includes("leak")) return { label: "Gas Leak Incident", icon: "☣️", color: "#a855f7" };
  if (norm.includes("secur") || norm.includes("crime") || norm.includes("threat")) return { label: "Security Incident", icon: "🛡️", color: "#eab308" };
  return { label: `${type || "Emergency"} Incident`, icon: "🚨", color: "#ef4444" };
}

// Redesigned Compact & Tactical Incident Marker Popup
function IncidentMarkerPopup({ incident, onOpenTracker, onClose }) {
  if (!incident) return null;
  const metrics = getIncidentResponderMetrics(incident);
  const typeInfo = getEmergencyTypeDisplay(incident.emergency_type);

  return (
    <div style={{
      padding: "12px 14px",
      width: "310px",
      maxWidth: "330px",
      color: "#f8fafc",
      fontFamily: "var(--font-body, -apple-system, BlinkMacSystemFont, sans-serif)",
      display: "flex",
      flexDirection: "column",
      gap: "9px",
      boxSizing: "border-box"
    }}>
      {/* Row 1: Icon + Incident Type + Severity + Close X */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
          <span style={{ fontSize: "14px", lineHeight: 1 }}>{typeInfo.icon}</span>
          <strong style={{ fontSize: "0.88rem", fontWeight: "800", color: "#f8fafc", whiteSpace: "nowrap" }}>
            {typeInfo.label}
          </strong>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {/* Severity Badge */}
          <span style={{
            fontSize: "0.68rem",
            fontWeight: "800",
            padding: "2px 6px",
            borderRadius: "4px",
            color: incident.severity === "Critical" ? "#ff4d67" : incident.severity === "High" ? "#fb923c" : "#facc15",
            background: incident.severity === "Critical" ? "rgba(255, 77, 103, 0.15)" : incident.severity === "High" ? "rgba(251, 146, 60, 0.15)" : "rgba(250, 204, 21, 0.15)",
            border: `1px solid ${incident.severity === "Critical" ? "rgba(255, 77, 103, 0.4)" : incident.severity === "High" ? "rgba(251, 146, 60, 0.4)" : "rgba(250, 204, 21, 0.4)"}`
          }}>
            {incident.severity || "Medium"}
          </span>

          {/* Close X Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onClose) onClose();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "17px",
              lineHeight: 1,
              padding: "0 2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s ease"
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f8fafc")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
            title="Close popup"
          >
            ×
          </button>
        </div>
      </div>

      {/* Row 2: Incident ID */}
      <div style={{ fontSize: "0.75rem", color: "#00e5ff", fontFamily: "var(--font-mono, monospace)", fontWeight: "700", marginTop: "-4px" }}>
        {incident.id}
      </div>

      {/* Row 3: Location */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Location
        </span>
        <span style={{
          fontSize: "0.78rem",
          fontWeight: "500",
          color: "#cbd5e1",
          lineHeight: "1.3",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden"
        }}>
          {incident.address || `Lat ${Number(incident.lat).toFixed(5)}, Lng ${Number(incident.lng).toFixed(5)}`}
        </span>
      </div>

      {/* Row 4: 2-column Grid for Time & Status */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "8px",
        background: "rgba(15, 23, 42, 0.65)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "8px",
        padding: "6px 10px"
      }}>
        <div>
          <span style={{ fontSize: "0.68rem", color: "#64748b", display: "block" }}>Time</span>
          <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "#f8fafc" }}>
            {formatTimeAgo(incident.created_at)}
          </span>
        </div>
        <div>
          <span style={{ fontSize: "0.68rem", color: "#64748b", display: "block" }}>Status</span>
          <span style={{
            fontSize: "0.78rem",
            fontWeight: "700",
            color: incident.status === "Resolved" ? "#00ff88" : incident.status === "En Route" ? "#38bdf8" : "#fb923c"
          }}>
            {incident.status === "Reported" ? "Awaiting Responder" : incident.status || "Reported"}
          </span>
        </div>
      </div>

      {/* Row 5: Responders & ETA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "0 2px" }}>
        <div>
          <span style={{ fontSize: "0.68rem", color: "#64748b", display: "block" }}>Responders</span>
          <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "#38bdf8" }}>
            {metrics.enRouteCount > 0 ? `${metrics.enRouteCount} En Route` : (incident.assigned_responder ? "1 Assigned" : "Awaiting Dispatch")}
          </span>
        </div>
        <div>
          <span style={{ fontSize: "0.68rem", color: "#64748b", display: "block" }}>ETA</span>
          <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "#38bdf8" }}>
            {metrics.etaText}
          </span>
        </div>
      </div>

      {/* Row 6: Action Button */}
      {onOpenTracker && (
        <button
          type="button"
          onClick={() => onOpenTracker(incident)}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            padding: "7px 10px",
            fontSize: "0.8rem",
            fontWeight: "800",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            boxShadow: "0 2px 10px rgba(2, 132, 199, 0.4)",
            transition: "all 0.15s ease",
            marginTop: "2px"
          }}
        >
          Open Incident Tracker →
        </button>
      )}
    </div>
  );
}

// Custom DivIcons: Clean markers without overlapping labels at normal zoom
export const createCustomIcon = (
  type,
  severity = "Medium",
  isResponder = false,
  isUser = false,
  isPicker = false,
  isSelected = false
) => {
  // 1. Draggable Incident Location Picker
  if (isPicker || type === "picker") {
    return L.divIcon({
      className: "custom-leaflet-marker",
      html: `
        <div style="
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ff334b;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 0 16px rgba(255,51,75,0.8), 0 4px 12px rgba(0,0,0,0.5);
          font-size: 20px;
          cursor: grab;
          transform: translate(-50%, -50%);
        ">
          <span>🎯</span>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  }

  // 2. User's Current Device Location Marker (Pulsing cyan/blue dot)
  if (isUser || type === "userLocation") {
    return L.divIcon({
      className: "custom-leaflet-marker",
      html: `
        <div style="
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0284c7;
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 14px rgba(2,132,199,0.9), 0 3px 10px rgba(0,0,0,0.5);
          font-size: 16px;
          cursor: pointer;
          transform: translate(-50%, -50%);
        ">
          <span>📱</span>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  // 3. Responder Markers (Distinct vehicle capsule shape with vehicle icon)
  if (isResponder || ["Ambulance", "Police", "Fire", "Rescue", "responder"].includes(type)) {
    let color = "#0284c7";
    let iconSvg = "🚑";

    const tLower = (type || "").toLowerCase();
    if (tLower.includes("police")) {
      color = "#d97706";
      iconSvg = "🚓";
    } else if (tLower.includes("fire")) {
      color = "#dc2626";
      iconSvg = "🚒";
    } else if (tLower.includes("rescue")) {
      color = "#0f766e";
      iconSvg = "🛟";
    } else {
      color = "#0284c7";
      iconSvg = "🚑";
    }

    const selectedHalo = isSelected
      ? "box-shadow: 0 0 0 3px #00e5ff, 0 0 18px rgba(0,229,255,0.85); transform: translate(-50%, -50%) scale(1.15);"
      : "box-shadow: 0 4px 12px rgba(0,0,0,0.5); transform: translate(-50%, -50%);";

    return L.divIcon({
      className: "custom-leaflet-marker",
      html: `
        <div style="
          width: 36px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${color};
          border: 2px solid #ffffff;
          border-radius: 8px;
          font-size: 17px;
          cursor: pointer;
          transition: transform 0.15s ease;
          ${selectedHalo}
        ">
          <span>${iconSvg}</span>
        </div>
      `,
      iconSize: [36, 32],
      iconAnchor: [18, 16]
    });
  }

  // 4. Incident Markers (Visually distinguishable circular markers)
  const normType = (type || "").toLowerCase();
  let bgColor = "#ef4444";
  let iconSvg = "🚨";

  if (normType.includes("fire")) {
    bgColor = "#ef4444"; // Fire Red
    iconSvg = "🔥";
  } else if (normType.includes("medic")) {
    bgColor = "#3b82f6"; // Medical Blue
    iconSvg = "🩺";
  } else if (normType.includes("accident") || normType.includes("crash")) {
    bgColor = "#f97316"; // Accident Orange
    iconSvg = "💥";
  } else if (normType.includes("gas") || normType.includes("leak")) {
    bgColor = "#a855f7"; // Gas Leak Purple
    iconSvg = "☣️";
  } else if (normType.includes("secur") || normType.includes("crime") || normType.includes("threat")) {
    bgColor = "#eab308"; // Security Amber
    iconSvg = "🛡️";
  } else {
    bgColor = "#8b5cf6"; // Hazard / Other
    iconSvg = "⚠️";
  }

  // Visual Severity Indicators
  let severityHalo = "box-shadow: 0 4px 12px rgba(0,0,0,0.4);";
  if (isSelected) {
    severityHalo = "box-shadow: 0 0 0 3px #00e5ff, 0 0 20px rgba(0, 229, 255, 0.9); transform: translate(-50%, -50%) scale(1.18);";
  } else if (severity === "Critical") {
    severityHalo = `box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.45), 0 0 12px rgba(239, 68, 68, 0.8); transform: translate(-50%, -50%);`;
  } else if (severity === "High") {
    severityHalo = `box-shadow: 0 0 0 2.5px rgba(249, 115, 22, 0.4), 0 0 10px rgba(249, 115, 22, 0.6); transform: translate(-50%, -50%);`;
  } else if (severity === "Medium") {
    severityHalo = `box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35), 0 4px 8px rgba(0,0,0,0.4); transform: translate(-50%, -50%);`;
  } else {
    severityHalo = "box-shadow: 0 3px 8px rgba(0,0,0,0.4); transform: translate(-50%, -50%);";
  }

  return L.divIcon({
    className: "custom-leaflet-marker",
    html: `
      <div style="
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${bgColor};
        border: 2px solid #ffffff;
        border-radius: 50%;
        font-size: 18px;
        cursor: pointer;
        transition: transform 0.15s ease;
        ${severityHalo}
      ">
        <span>${iconSvg}</span>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });
};

// Component to handle draggable map pin picker
function LocationPicker({ position, onPositionChange }) {
  const map = useMap();

  useEffect(() => {
    if (position && typeof position.lat === "number" && typeof position.lng === "number") {
      map.setView([position.lat, position.lng], map.getZoom(), { animate: true });
    }
  }, [position?.lat, position?.lng, map]);

  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    }
  });

  const markerRef = useRef(null);
  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latlng = marker.getLatLng();
          onPositionChange(latlng.lat, latlng.lng);
        }
      },
    }),
    [onPositionChange]
  );

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={[position.lat, position.lng]}
      ref={markerRef}
      icon={createCustomIcon("picker", "Critical", false, false, true, false)}
    >
      <Popup>
        <div style={{ textAlign: "center", color: "#0f172a", padding: "4px 6px", fontFamily: "sans-serif" }}>
          <strong style={{ color: "#ef4444", fontSize: "13px" }}>🎯 INCIDENT LOCATION</strong><br/>
          <span style={{ fontSize: "11px", color: "#475569" }}>Drag marker or click anywhere on map to reposition</span><br/>
          <div style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: "bold", marginTop: "4px", color: "#0f172a" }}>
            Lat: {position.lat.toFixed(5)}, Lng: {position.lng.toFixed(5)}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

// Component to auto-center bounds smoothly when coordinates update
function AutoBounds({ points }) {
  const map = useMap();
  const pointsKey = useMemo(() => JSON.stringify(points), [points]);

  useEffect(() => {
    if (!points || points.length === 0) return;
    try {
      const validPoints = points.filter(
        (p) => p && typeof p[0] === "number" && typeof p[1] === "number" && !isNaN(p[0]) && !isNaN(p[1])
      );
      if (validPoints.length === 1) {
        map.setView(validPoints[0], 14, { animate: false });
      } else if (validPoints.length > 1) {
        const bounds = L.latLngBounds(validPoints);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: false });
      }
    } catch (e) {
      console.warn("Error fitting bounds", e);
    }
  }, [pointsKey, map]);

  return null;
}

// Controller to smoothly focus and pan to selected coordinates only when needed
function FocusController({ targetCoords }) {
  const map = useMap();

  useEffect(() => {
    if (targetCoords && typeof targetCoords[0] === "number" && typeof targetCoords[1] === "number") {
      const targetLatLng = L.latLng(targetCoords[0], targetCoords[1]);
      const bounds = map.getBounds();

      // Only pan if target is outside or near edge of current viewport
      // Leaflet's Popup autoPan handles micro-adjustments for popup visibility
      if (!bounds.contains(targetLatLng)) {
        map.panTo(targetCoords, { animate: true, duration: 0.5 });
      }
    }
  }, [targetCoords, map]);

  return null;
}

// Custom Map Overlay Controls (Zoom In, Zoom Out, Center Reset)
function MapOverlayControls({ onRecenter, boundsPoints, defaultCenter, targetCoords }) {
  const map = useMap();

  const handleCenterClick = () => {
    if (onRecenter) {
      onRecenter();
    }
    if (targetCoords && typeof targetCoords[0] === "number") {
      map.flyTo(targetCoords, 15, { animate: true, duration: 0.8 });
    } else if (boundsPoints && boundsPoints.length > 0) {
      const validPoints = boundsPoints.filter(
        (p) => p && typeof p[0] === "number" && typeof p[1] === "number" && !isNaN(p[0]) && !isNaN(p[1])
      );
      if (validPoints.length === 1) {
        map.setView(validPoints[0], 14, { animate: true });
      } else if (validPoints.length > 1) {
        const bounds = L.latLngBounds(validPoints);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
      }
    } else {
      map.setView(defaultCenter || [17.3850, 78.4867], 13, { animate: true });
    }
  };

  return (
    <div style={{
      position: "absolute",
      top: "14px",
      right: "14px",
      zIndex: 1000,
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    }}>
      <button
        type="button"
        title="Zoom in"
        onClick={() => map.zoomIn()}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#f8fafc",
          border: "1px solid rgba(255,255,255,0.2)",
          fontWeight: "900",
          fontSize: "17px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 10px rgba(0,0,0,0.5)"
        }}
      >
        +
      </button>
      <button
        type="button"
        title="Zoom out"
        onClick={() => map.zoomOut()}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#f8fafc",
          border: "1px solid rgba(255,255,255,0.2)",
          fontWeight: "900",
          fontSize: "17px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 10px rgba(0,0,0,0.5)"
        }}
      >
        -
      </button>
      <button
        type="button"
        title="Reset View / Recenter Map"
        onClick={handleCenterClick}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#00e5ff",
          border: "1px solid rgba(0,229,255,0.4)",
          fontWeight: "900",
          fontSize: "13px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 10px rgba(0,0,0,0.5)"
        }}
      >
        📍
      </button>
    </div>
  );
}

export default function MapComponent({
  center = [17.3850, 78.4867],
  zoom = 13,
  height = "420px",
  incidents = [],
  responders = [],
  incidentLocation = null,
  incidentLabel = "Emergency Location",
  userLocation = null,
  responderLocation = null,
  responderType = "Ambulance",
  responderLabel = "Assigned Unit",
  routeCoordinates = [],
  pickerMode = false,
  pickerCoords = null,
  onPickerCoordsChange = null,
  additionalMarkers = [],
  showControls = true,
  showLegend = false,
  selectedIncidentId = null,
  onIncidentSelect = null,
  onOpenTracker = null
}) {
  const markerRefs = useRef({});

  // Auto-open popup when selectedIncidentId matches
  useEffect(() => {
    if (selectedIncidentId) {
      const timer = setTimeout(() => {
        if (markerRefs.current[selectedIncidentId]) {
          markerRefs.current[selectedIncidentId].openPopup();
        }
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [selectedIncidentId, incidents]);

  // Points for fitting bounds
  const boundsPoints = useMemo(() => {
    const pts = [];
    if (incidentLocation && typeof incidentLocation.lat === "number") {
      pts.push([incidentLocation.lat, incidentLocation.lng]);
    }
    if (userLocation && typeof userLocation.lat === "number") {
      pts.push([userLocation.lat, userLocation.lng]);
    }
    if (responderLocation && typeof responderLocation.lat === "number") {
      pts.push([responderLocation.lat, responderLocation.lng]);
    }
    if (pickerCoords && pickerMode && typeof pickerCoords.lat === "number") {
      pts.push([pickerCoords.lat, pickerCoords.lng]);
    }
    if (routeCoordinates && routeCoordinates.length > 0) {
      pts.push(...routeCoordinates);
    }
    if (incidents && incidents.length > 0) {
      incidents.forEach((i) => {
        if (i.lat != null && i.lng != null && !isNaN(Number(i.lat)) && !isNaN(Number(i.lng))) {
          pts.push([Number(i.lat), Number(i.lng)]);
        }
      });
    }
    return pts;
  }, [incidentLocation, userLocation, responderLocation, pickerCoords, pickerMode, routeCoordinates, incidents]);

  const mapCenter = useMemo(() => {
    if (pickerCoords && typeof pickerCoords.lat === "number") return [pickerCoords.lat, pickerCoords.lng];
    if (incidentLocation && typeof incidentLocation.lat === "number") return [incidentLocation.lat, incidentLocation.lng];
    if (userLocation && typeof userLocation.lat === "number") return [userLocation.lat, userLocation.lng];
    if (incidents && incidents.length > 0) {
      const firstValid = incidents.find((i) => i.lat != null && !isNaN(Number(i.lat)));
      if (firstValid) return [Number(firstValid.lat), Number(firstValid.lng)];
    }
    return center;
  }, [incidentLocation, pickerCoords, userLocation, center, incidents]);

  // Active target coords for FocusController
  const targetCoords = useMemo(() => {
    if (selectedIncidentId && incidents && incidents.length > 0) {
      const target = incidents.find((i) => i.id === selectedIncidentId);
      if (target && target.lat != null && target.lng != null) {
        return [Number(target.lat), Number(target.lng)];
      }
    }
    return null;
  }, [selectedIncidentId, incidents]);

  return (
    <div style={{ width: "100%", height, position: "relative", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <AutoBounds points={boundsPoints} />
        {targetCoords && <FocusController targetCoords={targetCoords} />}

        {/* Custom Map Controls */}
        {showControls && (
          <MapOverlayControls
            boundsPoints={boundsPoints}
            defaultCenter={mapCenter}
            targetCoords={targetCoords}
          />
        )}

        {/* 1. User Device GPS Marker */}
        {userLocation && typeof userLocation.lat === "number" && typeof userLocation.lng === "number" && (
          <>
            {userLocation.accuracy && (
              <Circle
                center={[userLocation.lat, userLocation.lng]}
                radius={userLocation.accuracy}
                pathOptions={{
                  color: "#0284c7",
                  fillColor: "#38bdf8",
                  fillOpacity: 0.15,
                  weight: 1.5,
                  dashArray: "4, 4"
                }}
              />
            )}
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={createCustomIcon("userLocation", "Low", false, true, false, false)}
            >
              <Tooltip direction="top" offset={[0, -18]}>
                <span>📱 Your Device Location</span>
              </Tooltip>
              <Popup>
                <div style={{ color: "#0f172a", padding: "6px", fontFamily: "sans-serif" }}>
                  <strong style={{ color: "#0284c7", fontSize: "13px" }}>📱 YOUR DEVICE LOCATION</strong>
                  <div style={{ fontSize: "11px", margin: "4px 0", fontFamily: "monospace" }}>
                    Lat: {userLocation.lat.toFixed(5)}, Lng: {userLocation.lng.toFixed(5)}
                  </div>
                  {userLocation.accuracy && (
                    <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                      Accuracy: ~{Math.round(userLocation.accuracy)}m
                    </div>
                  )}
                  {userLocation.capturedAt && (
                    <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
                      Captured: {new Date(userLocation.capturedAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {/* 2. Draggable Incident Location Picker */}
        {pickerMode && pickerCoords && onPickerCoordsChange && (
          <LocationPicker position={pickerCoords} onPositionChange={onPickerCoordsChange} />
        )}

        {/* 3. Single Incident Location (Direct prop) */}
        {incidentLocation && typeof incidentLocation.lat === "number" && (
          <Marker
            position={[Number(incidentLocation.lat), Number(incidentLocation.lng)]}
            icon={createCustomIcon(
              incidentLocation.emergency_type || "Fire",
              incidentLocation.severity || "Critical",
              false,
              false,
              false,
              selectedIncidentId === incidentLocation.id
            )}
            eventHandlers={{
              click: () => onIncidentSelect && onIncidentSelect(incidentLocation)
            }}
          >
            <Tooltip direction="top" offset={[0, -20]}>
              <span>🚨 {incidentLocation.emergency_type || incidentLabel} ({incidentLocation.id || ""})</span>
            </Tooltip>
            <Popup
              className="tactical-popup"
              autoPan={true}
              autoPanPadding={[50, 50]}
              autoPanPaddingTopLeft={[65, 50]}
              autoPanPaddingBottomRight={[50, 50]}
              keepInView={true}
              offset={[0, -14]}
              closeButton={false}
              eventHandlers={{
                remove: () => {
                  if (onIncidentSelect && selectedIncidentId === incidentLocation.id) {
                    onIncidentSelect(null);
                  }
                }
              }}
            >
              <IncidentMarkerPopup
                incident={incidentLocation}
                onOpenTracker={onOpenTracker}
                onClose={() => {
                  if (onIncidentSelect) {
                    onIncidentSelect(null);
                  }
                }}
              />
            </Popup>
          </Marker>
        )}

        {/* 4. Full Incidents List (Live Monitoring Map) */}
        {incidents && incidents.length > 0 && incidents.map((inc) => {
          if (inc.lat == null || inc.lng == null || isNaN(Number(inc.lat)) || isNaN(Number(inc.lng))) {
            return null;
          }
          const metrics = getIncidentResponderMetrics(inc);
          const isSelected = selectedIncidentId === inc.id;

          return (
            <Marker
              key={inc.id}
              position={[Number(inc.lat), Number(inc.lng)]}
              ref={(ref) => {
                if (ref) markerRefs.current[inc.id] = ref;
              }}
              icon={createCustomIcon(
                inc.emergency_type,
                inc.severity || "Medium",
                false,
                false,
                false,
                isSelected
              )}
              eventHandlers={{
                click: () => onIncidentSelect && onIncidentSelect(inc)
              }}
            >
              <Tooltip direction="top" offset={[0, -20]}>
                <span>{inc.emergency_type} Incident • {inc.id}</span>
              </Tooltip>

              <Popup
                className="tactical-popup"
                autoPan={true}
                autoPanPadding={[50, 50]}
                autoPanPaddingTopLeft={[65, 50]}
                autoPanPaddingBottomRight={[50, 50]}
                keepInView={true}
                offset={[0, -14]}
                closeButton={false}
                eventHandlers={{
                  remove: () => {
                    if (onIncidentSelect && selectedIncidentId === inc.id) {
                      onIncidentSelect(null);
                    }
                  }
                }}
              >
                <IncidentMarkerPopup
                  incident={inc}
                  onOpenTracker={onOpenTracker}
                  onClose={() => {
                    if (markerRefs.current[inc.id]) {
                      markerRefs.current[inc.id].closePopup();
                    }
                    if (onIncidentSelect) {
                      onIncidentSelect(null);
                    }
                  }}
                />
              </Popup>
            </Marker>
          );
        })}

        {/* 5. Full Responders List */}
        {responders && responders.length > 0 && responders.map((r) => {
          if (r.lat == null || r.lng == null || isNaN(Number(r.lat)) || isNaN(Number(r.lng))) {
            return null;
          }
          return (
            <Marker
              key={r.id || r.user_id}
              position={[Number(r.lat), Number(r.lng)]}
              icon={createCustomIcon(
                r.service_type || r.service || "Ambulance",
                "Medium",
                true,
                false,
                false,
                false
              )}
            >
              <Tooltip direction="top" offset={[0, -18]}>
                <span>🚑 {r.full_name || r.name} ({r.service_type || r.service})</span>
              </Tooltip>
              <Popup className="tactical-popup" autoPan={true} autoPanPadding={[40, 40]} offset={[0, -12]}>
                <div style={{ color: "#f8fafc", padding: "10px 12px", minWidth: "220px", maxWidth: "260px", fontFamily: "var(--font-body, sans-serif)", display: "flex", flexDirection: "column", gap: "5px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: "#38bdf8", fontSize: "0.85rem", fontWeight: "800" }}>
                      {r.full_name || r.name}
                    </strong>
                    <span style={{ fontSize: "0.68rem", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)", padding: "1px 6px", borderRadius: "4px", fontWeight: "700" }}>
                      {r.service_type || r.service}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                    <span style={{ color: "#64748b" }}>Vehicle:</span> {r.vehicle_number || "Active Emergency Unit"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                    <span style={{ color: "#64748b" }}>Org:</span> {r.organization_name || "Emergency Services"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: r.is_available ? "#00ff88" : "#fb923c", fontWeight: "700", marginTop: "2px" }}>
                    {r.is_available ? "● Available on Patrol" : "● Dispatched on Call"}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "#64748b", fontFamily: "var(--font-mono, monospace)" }}>
                    GPS: {Number(r.lat).toFixed(4)}, {Number(r.lng).toFixed(4)}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 6. Single Responder Marker (Direct prop) */}
        {responderLocation && typeof responderLocation.lat === "number" && (
          <Marker
            position={[Number(responderLocation.lat), Number(responderLocation.lng)]}
            icon={createCustomIcon(responderType, "Medium", true, false, false, false)}
          >
            <Tooltip direction="top" offset={[0, -18]}>
              <span>{responderLabel}</span>
            </Tooltip>
            <Popup>
              <div style={{ color: "#0f172a", padding: "4px 6px", fontFamily: "sans-serif" }}>
                <b style={{ color: "#0284c7" }}>{responderLabel} ({responderType})</b>
                <p style={{ fontSize: "11px", margin: "4px 0", color: "#475569" }}>Active Responder Unit</p>
                <div style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace" }}>
                  GPS: {Number(responderLocation.lat).toFixed(5)}, {Number(responderLocation.lng).toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 7. Additional Markers (Legacy compatibility) */}
        {additionalMarkers && additionalMarkers.map((m, idx) => {
          if (m.lat == null || m.lng == null || isNaN(Number(m.lat)) || isNaN(Number(m.lng))) return null;
          return (
            <Marker
              key={idx}
              position={[Number(m.lat), Number(m.lng)]}
              icon={createCustomIcon(m.type, m.severity || "Medium", m.type !== "incident", false, false, false)}
            >
              <Popup>
                <div style={{ color: "#0f172a", padding: "6px 8px", minWidth: "190px", maxWidth: "250px", fontFamily: "sans-serif" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <strong style={{ color: m.type === "incident" ? "#ef4444" : "#0284c7", fontSize: "13px" }}>
                      {m.title || m.label}
                    </strong>
                    {m.severity && (
                      <span style={{ fontSize: "10px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", padding: "1px 6px", borderRadius: "10px", fontWeight: "bold" }}>
                        {m.severity}
                      </span>
                    )}
                  </div>
                  {m.incidentId && (
                    <div style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace", fontWeight: "bold", marginBottom: "3px" }}>
                      ID: {m.incidentId}
                    </div>
                  )}
                  {m.status && (
                    <div style={{ fontSize: "11px", color: "#334155", margin: "2px 0" }}>
                      <strong>Status:</strong> {m.status}
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "#334155", margin: "2px 0" }}>
                    <strong>Location:</strong> {m.address || m.subtitle || `Lat ${Number(m.lat).toFixed(5)}, Lng ${Number(m.lng).toFixed(5)}`}
                  </div>
                  <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px", fontFamily: "monospace" }}>
                    GPS: {Number(m.lat).toFixed(5)}, {Number(m.lng).toFixed(5)}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 8. Route Polyline */}
        {routeCoordinates && routeCoordinates.length > 1 && (
          <Polyline
            positions={routeCoordinates}
            color="#0284c7"
            weight={6}
            opacity={0.85}
            dashArray="1, 8"
            lineCap="round"
          />
        )}
      </MapContainer>

      {/* 9. Map Legend (Unobtrusive floating card in bottom-left corner) */}
      {showLegend && (
        <div style={{
          position: "absolute",
          bottom: "14px",
          left: "14px",
          zIndex: 1000,
          background: "rgba(15, 23, 42, 0.94)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "10px",
          padding: "8px 12px",
          fontSize: "0.74rem",
          color: "#f8fafc",
          boxShadow: "0 4px 20px rgba(0,0,0,0.6)"
        }}>
          <div style={{ fontWeight: "800", fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
            Map Legend
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 6px #ef4444" }}></span>
              <span>Fire</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#3b82f6", boxShadow: "0 0 6px #3b82f6" }}></span>
              <span>Medical</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#f97316", boxShadow: "0 0 6px #f97316" }}></span>
              <span>Accident</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#a855f7", boxShadow: "0 0 6px #a855f7" }}></span>
              <span>Gas Leak</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#eab308", boxShadow: "0 0 6px #eab308" }}></span>
              <span>Security</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#0284c7", border: "1.5px solid white" }}></span>
              <span>Responder</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
