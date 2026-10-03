import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom SVG Icons for Emergency Services
const createCustomIcon = (type = "Ambulance", label = "") => {
  let color = "#ef4444";
  let iconSvg = "⚠️";
  
  if (type === "Ambulance" || type === "Medical") {
    color = "#00ff88";
    iconSvg = "🚑";
  } else if (type === "Police" || type === "Crime") {
    color = "#00e5ff";
    iconSvg = "🚓";
  } else if (type === "Fire") {
    color = "#ff334b";
    iconSvg = "🚒";
  } else if (type === "Rescue" || type === "Hazard") {
    color = "#eab308";
    iconSvg = "🛟";
  } else if (type === "citizen") {
    color = "#ff334b";
    iconSvg = "📍";
  } else if (type === "picker") {
    color = "#10b981";
    iconSvg = "🎯";
  }

  const html = `
    <div style="
      position: relative;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      font-size: 20px;
      cursor: pointer;
      transform: translate(-50%, -50%);
    ">
      <span>${iconSvg}</span>
      ${label ? `<div style="position:absolute; ${type === 'citizen' ? 'top:-24px;' : 'bottom:-24px;'} white-space:nowrap; background:#111827; color:#f8fafc; font-size:11px; font-weight:bold; padding:2px 8px; border-radius:10px; border:1px solid rgba(255,255,255,0.3); box-shadow:0 2px 10px rgba(0,0,0,0.8); pointer-events:none;">${label}</div>` : ''}
    </div>
  `;

  return L.divIcon({
    className: "custom-leaflet-marker",
    html: html,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
};

// Component to handle draggable map pin picker
function LocationPicker({ position, onPositionChange }) {
  const map = useMap();

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
      icon={createCustomIcon("picker", "Drag Pin to Incident")}
    >
      <Popup>
        <div style="text-align: center; color: #111;">
          <strong>Incident Location</strong><br/>
          Drag pin or click map to reposition
        </div>
      </Popup>
    </Marker>
  );
}

// Component to auto-center bounds smoothly when coordinates or route updates
function AutoBounds({ points }) {
  const map = useMap();
  const pointsKey = useMemo(() => JSON.stringify(points), [points]);

  useEffect(() => {
    if (!points || points.length === 0) return;
    try {
      const validPoints = points.filter(p => p && typeof p[0] === 'number' && typeof p[1] === 'number');
      if (validPoints.length === 1) {
        map.setView(validPoints[0], 14, { animate: false });
      } else if (validPoints.length > 1) {
        const bounds = L.latLngBounds(validPoints);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
      }
    } catch (e) {
      console.warn("Error fitting bounds", e);
    }
  }, [pointsKey, map]);

  return null;
}

export default function MapComponent({
  center = [12.9716, 77.5946],
  zoom = 14,
  height = "380px",
  incidentLocation = null,
  incidentLabel = "Emergency Location",
  responderLocation = null,
  responderType = "Ambulance",
  responderLabel = "Assigned Unit",
  routeCoordinates = [],
  pickerMode = false,
  pickerCoords = null,
  onPickerCoordsChange = null,
  additionalMarkers = []
}) {
  const boundsPoints = useMemo(() => {
    const pts = [];
    if (incidentLocation && !isNaN(Number(incidentLocation.lat)) && !isNaN(Number(incidentLocation.lng))) {
      pts.push([Number(incidentLocation.lat), Number(incidentLocation.lng)]);
    }
    if (responderLocation && !isNaN(Number(responderLocation.lat)) && !isNaN(Number(responderLocation.lng))) {
      pts.push([Number(responderLocation.lat), Number(responderLocation.lng)]);
    }
    if (pickerCoords && pickerMode && !isNaN(Number(pickerCoords.lat)) && !isNaN(Number(pickerCoords.lng))) {
      pts.push([Number(pickerCoords.lat), Number(pickerCoords.lng)]);
    }
    if (routeCoordinates && routeCoordinates.length > 0) {
      for (const rc of routeCoordinates) {
        if (Array.isArray(rc) && !isNaN(Number(rc[0])) && !isNaN(Number(rc[1]))) {
          pts.push([Number(rc[0]), Number(rc[1])]);
        }
      }
    }
    return pts;
  }, [incidentLocation, responderLocation, pickerCoords, pickerMode, routeCoordinates]);

  const mapCenter = useMemo(() => {
    if (incidentLocation && !isNaN(Number(incidentLocation.lat)) && !isNaN(Number(incidentLocation.lng))) {
      return [Number(incidentLocation.lat), Number(incidentLocation.lng)];
    }
    if (pickerCoords && !isNaN(Number(pickerCoords.lat)) && !isNaN(Number(pickerCoords.lng))) {
      return [Number(pickerCoords.lat), Number(pickerCoords.lng)];
    }
    if (Array.isArray(center) && !isNaN(Number(center[0])) && !isNaN(Number(center[1]))) {
      return [Number(center[0]), Number(center[1])];
    }
    return [17.5800, 78.4867];
  }, [incidentLocation, pickerCoords, center]);

  return (
    <div style={{ width: "100%", height, position: "relative", borderRadius: "14px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ width: "100%", height: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <AutoBounds points={boundsPoints} />

        {/* Picker mode */}
        {pickerMode && pickerCoords && onPickerCoordsChange && (
          <LocationPicker position={pickerCoords} onPositionChange={onPickerCoordsChange} />
        )}

        {/* Incident Marker */}
        {incidentLocation && !isNaN(Number(incidentLocation.lat)) && !isNaN(Number(incidentLocation.lng)) && (
          <Marker
            position={[Number(incidentLocation.lat), Number(incidentLocation.lng)]}
            icon={createCustomIcon("citizen", incidentLabel)}
          >
            <Popup>
              <div style={{ color: "#000", padding: "4px" }}>
                <b style={{ color: "#ef4444" }}>🚨 {incidentLabel}</b>
                <p style={{ fontSize: "11px", margin: "4px 0", color: "#16a34a", fontWeight: "bold" }}>● Emergency Incident Point</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Responder Marker */}
        {responderLocation && !isNaN(Number(responderLocation.lat)) && !isNaN(Number(responderLocation.lng)) && (
          <Marker
            position={[Number(responderLocation.lat), Number(responderLocation.lng)]}
            icon={createCustomIcon(responderType, responderLabel)}
          >
            <Popup>
              <div style={{ color: "#000", padding: "4px" }}>
                <b style={{ color: "#3b82f6" }}>{responderLabel} ({responderType})</b>
                <p style={{ fontSize: "11px", margin: "4px 0", color: "#2563eb", fontWeight: "bold" }}>● Active Emergency Unit</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Additional markers (e.g. for admin fleet overview) */}
        {additionalMarkers.map((m, idx) => (
          <Marker
            key={idx}
            position={[m.lat, m.lng]}
            icon={createCustomIcon(m.type, m.label)}
          >
            <Popup>
              <div style={{ color: "#000" }}>
                <strong>{m.title || m.label}</strong>
                <p style={{ fontSize: "11px" }}>{m.subtitle}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Route Polyline */}
        {routeCoordinates && routeCoordinates.length > 1 && (
          <Polyline
            positions={routeCoordinates}
            color="#3b82f6"
            weight={6}
            opacity={0.85}
            dashArray="1, 8"
            lineCap="round"
          />
        )}
      </MapContainer>
    </div>
  );
}
