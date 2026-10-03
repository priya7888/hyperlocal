import React, { useState, useEffect, useRef } from "react";
import { 
  AlertOctagon, X, MapPin, Navigation, CheckSquare, Square, 
  AlertCircle, CheckCircle2, ArrowRight, RefreshCw, Crosshair,
  Compass, Map, Info, Check, ShieldAlert, HeartPulse, Activity, Flame
} from "lucide-react";
import MapComponent from "./MapComponent";
import { incidentApi, geocodingApi } from "../services/api";

const EMERGENCY_TYPES = [
  { id: "Medical", label: "Medical Emergency", icon: HeartPulse, color: "#3b82f6" },
  { id: "Road Accident", label: "Accident / Crash", icon: Activity, color: "#f97316" },
  { id: "Fire", label: "Fire / Smoke", icon: Flame, color: "#ef4444" },
  { id: "Gas Leak", label: "Gas Leak", icon: AlertOctagon, color: "#a855f7" },
  { id: "Crime", label: "Security / Crime", icon: ShieldAlert, color: "#eab308" },
  { id: "Other", label: "Other / Hazard", icon: AlertOctagon, color: "#8b5cf6" }
];

const SEVERITY_LEVELS = [
  { id: "Critical", label: "Critical Priority", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.4)" },
  { id: "High", label: "High Priority", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)", border: "rgba(249, 115, 22, 0.4)" },
  { id: "Medium", label: "Medium Priority", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.4)" },
  { id: "Low", label: "Low Priority", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)", border: "rgba(16, 185, 129, 0.4)" }
];

const EXACT_CHECKLIST = [
  "Person injured",
  "Person unconscious",
  "Road accident",
  "Fire or smoke",
  "Person trapped",
  "Crime/personal safety threat",
  "Other emergency"
];

// Fallback default coordinates (Hyderabad Central) if geolocation unavailable
const DEFAULT_COORDS = { lat: 17.3850, lng: 78.4867 };

export default function SosModal({ isOpen, onClose, onSubmitted }) {
  // Step 1: Incident Form Fields
  const [emergencyType, setEmergencyType] = useState("Medical");
  const [severity, setSeverity] = useState("Critical");
  const [checklist, setChecklist] = useState(["Person injured"]);
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [checklistError, setChecklistError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 2: Automatic Device Location Capture
  const [userDeviceLocation, setUserDeviceLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle"); // 'idle' | 'locating' | 'success' | 'denied' | 'unavailable' | 'timeout' | 'unsupported'
  const [locationError, setLocationError] = useState("");

  // Step 3 & 4: Incident Location Map & Confirmation
  const [incidentCoords, setIncidentCoords] = useState(DEFAULT_COORDS);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [locationCapturedAt, setLocationCapturedAt] = useState(null);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const [isLocationAdjusted, setIsLocationAdjusted] = useState(false);

  // Reverse Geocoded Address
  const [incidentAddress, setIncidentAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);

  const geocodeTimeoutRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setEmergencyType("Medical");
      setSeverity("Critical");
      setChecklist(["Person injured"]);
      setDescription("");
      setChecklistError("");
      setIsLocationConfirmed(false);
      setIsLocationAdjusted(false);
      handleGetCurrentLocation();
    }
  }, [isOpen]);

  // Reverse geocode whenever incident coordinates change
  useEffect(() => {
    if (!isOpen || !incidentCoords) return;

    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }

    setIsGeocoding(true);
    geocodeTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await geocodingApi.reverse(incidentCoords.lat, incidentCoords.lng);
        if (result && result.address) {
          setIncidentAddress(result.address);
        } else {
          setIncidentAddress(`Lat: ${incidentCoords.lat.toFixed(5)}, Lng: ${incidentCoords.lng.toFixed(5)}`);
        }
      } catch (err) {
        setIncidentAddress(`Lat: ${incidentCoords.lat.toFixed(5)}, Lng: ${incidentCoords.lng.toFixed(5)}`);
      } finally {
        setIsGeocoding(false);
      }
    }, 350);

    return () => {
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    };
  }, [incidentCoords.lat, incidentCoords.lng, isOpen]);

  // ACTION: "Get Current Location" (Browser Geolocation API)
  const handleGetCurrentLocation = () => {
    setLocationStatus("locating");
    setLocationError("");

    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      setLocationError("Browser does not support geolocation. Please select your incident location directly on the map.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(5));
        const lng = parseFloat(position.coords.longitude.toFixed(5));
        const accuracy = position.coords.accuracy ? Math.round(position.coords.accuracy) : null;
        const capturedAt = new Date(position.timestamp || Date.now()).toISOString();

        const deviceLoc = { lat, lng, accuracy, capturedAt };
        setUserDeviceLocation(deviceLoc);
        setLocationAccuracy(accuracy);
        setLocationCapturedAt(capturedAt);
        setLocationStatus("success");
        setLocationError("");

        // Set as default incident location
        setIncidentCoords({ lat, lng });
        setIsLocationAdjusted(false);
        setIsLocationConfirmed(true); // Auto-confirmed initially; user can still adjust and re-confirm
      },
      (error) => {
        let msg = "Could not obtain device location. Please manually select the incident location on the map.";
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("denied");
          msg = "Location permission denied. Automatic location could not be obtained. Please click or drag the marker on the map to set the emergency location.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationStatus("unavailable");
          msg = "Position unavailable. Please select the incident location on the map.";
        } else if (error.code === error.TIMEOUT) {
          setLocationStatus("timeout");
          msg = "Location request timed out. Please select the incident location on the map or click Get Current Location again.";
        } else {
          setLocationStatus("unavailable");
        }
        setLocationError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000
      }
    );
  };

  // Adjust incident location (user moves marker or clicks map)
  const handlePickerPositionChange = (lat, lng) => {
    const formattedLat = parseFloat(lat.toFixed(5));
    const formattedLng = parseFloat(lng.toFixed(5));
    setIncidentCoords({ lat: formattedLat, lng: formattedLng });
    setIsLocationAdjusted(true);
    setIsLocationConfirmed(false); // User must confirm the newly adjusted location
  };

  // User explicitly clicks "CONFIRM LOCATION"
  const handleConfirmLocation = () => {
    setIsLocationConfirmed(true);
  };

  const handleToggleChecklist = (item) => {
    setChecklistError("");
    if (checklist.includes(item)) {
      setChecklist(checklist.filter(i => i !== item));
    } else {
      setChecklist([...checklist, item]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. Mandatory Checklist validation
    if (!checklist || checklist.length === 0) {
      setChecklistError("⚠️ Please select at least one item from the emergency checklist before submitting.");
      return;
    }

    // 2. Mandatory Description validation
    if (!description || !description.trim()) {
      setDescriptionError("⚠️ Description is required. Please provide incident details.");
      return;
    }

    // 3. Validate Incident Location
    if (!incidentCoords || typeof incidentCoords.lat !== "number" || typeof incidentCoords.lng !== "number") {
      setLocationError("A valid incident location is required. Please select and confirm the location on the map.");
      return;
    }

    if (incidentCoords.lat < -90 || incidentCoords.lat > 90 || incidentCoords.lng < -180 || incidentCoords.lng > 180) {
      setLocationError("Invalid incident coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.");
      return;
    }

    // 4. Validate Location has been Confirmed
    if (!isLocationConfirmed) {
      setLocationError("⚠️ Please confirm the incident location by clicking the 'CONFIRM LOCATION' button.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        emergency_type: emergencyType,
        severity: severity,
        description: description.trim(),
        checklist,
        // Incident location fields
        lat: incidentCoords.lat,
        lng: incidentCoords.lng,
        latitude: incidentCoords.lat,
        longitude: incidentCoords.lng,
        incidentLatitude: incidentCoords.lat,
        incidentLongitude: incidentCoords.lng,
        location_accuracy: locationAccuracy,
        locationAccuracy: locationAccuracy,
        location_captured_at: locationCapturedAt || new Date().toISOString(),
        locationCapturedAt: locationCapturedAt || new Date().toISOString(),
        address: incidentAddress || `Incident Lat ${incidentCoords.lat}, Lng ${incidentCoords.lng}`
      };

      const res = await incidentApi.create(payload);
      if (onSubmitted) onSubmitted(res.incident || res.data);
      onClose();
    } catch (err) {
      console.error("Submission error:", err);
      alert(err.response?.data?.error || "Emergency SOS report submitted.");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: "700px", padding: "26px", background: "#0e1424", border: "1px solid rgba(255,51,75,0.4)", maxHeight: "92vh", overflowY: "auto" }}>
        
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: "18px", right: "18px", background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#ff334b", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertOctagon size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: "900", color: "#f8fafc" }}>
              Emergency SOS Report
            </h2>
            <div style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
              Hyperlocal Emergency Response • Direct Service Dispatch
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
          
          {/* STEP 1: Incident Information */}
          
          {/* 1A. Emergency Type */}
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
              1. Incident Type *
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: "6px" }}>
              {EMERGENCY_TYPES.map((t) => {
                const Icon = t.icon;
                const isSel = emergencyType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEmergencyType(t.id)}
                    style={{
                      padding: "8px 6px",
                      borderRadius: "8px",
                      border: isSel ? "1.5px solid #ff334b" : "1px solid rgba(255,255,255,0.1)",
                      background: isSel ? "rgba(255, 51, 75, 0.18)" : "rgba(30, 41, 59, 0.5)",
                      color: isSel ? "#ffffff" : "#cbd5e1",
                      fontWeight: isSel ? "800" : "600",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <Icon size={16} color={isSel ? "#ff334b" : t.color} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1B. Severity Level */}
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "#cbd5e1", display: "block", marginBottom: "6px" }}>
              2. Severity Level *
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
              {SEVERITY_LEVELS.map((s) => {
                const isSel = severity === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeverity(s.id)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: isSel ? `1.5px solid ${s.color}` : "1px solid rgba(255,255,255,0.1)",
                      background: isSel ? s.bg : "rgba(30, 41, 59, 0.4)",
                      color: isSel ? s.color : "#94a3b8",
                      fontWeight: isSel ? "800" : "600",
                      fontSize: "0.76rem",
                      cursor: "pointer",
                      textAlign: "center"
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1C. Mandatory Checklist */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: "800", color: "#ff334b" }}>
                3. Danger Checklist (Select at least one) *
              </label>
              <span style={{ fontSize: "0.7rem", color: "#ff334b", fontWeight: "700" }}>Mandatory</span>
            </div>

            {checklistError && (
              <div style={{ background: "rgba(255, 51, 75, 0.2)", border: "1px solid rgba(255, 51, 75, 0.4)", color: "#ff4d67", padding: "6px 10px", borderRadius: "6px", fontSize: "0.78rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertCircle size={15} />
                <span>{checklistError}</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {EXACT_CHECKLIST.map((item) => {
                const isChecked = checklist.includes(item);
                return (
                  <div
                    key={item}
                    onClick={() => handleToggleChecklist(item)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: isChecked ? "1.5px solid #ff334b" : "1px solid rgba(255,255,255,0.1)",
                      background: isChecked ? "rgba(255, 51, 75, 0.15)" : "rgba(30, 41, 59, 0.45)",
                      color: isChecked ? "#ffffff" : "#cbd5e1",
                      fontSize: "0.8rem",
                      fontWeight: isChecked ? "700" : "500",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {isChecked ? <CheckSquare size={15} color="#ff334b" /> : <Square size={15} color="#64748b" />}
                    <span>{item}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 1D. Description */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "#cbd5e1" }}>
                4. Description *
              </label>
              <span style={{ fontSize: "0.7rem", color: "#ff334b", fontWeight: "700" }}>Mandatory</span>
            </div>

            {descriptionError && (
              <div style={{ background: "rgba(255, 51, 75, 0.2)", border: "1px solid rgba(255, 51, 75, 0.4)", color: "#ff4d67", padding: "6px 10px", borderRadius: "6px", fontSize: "0.78rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertCircle size={15} />
                <span>{descriptionError}</span>
              </div>
            )}

            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (e.target.value.trim()) setDescriptionError("");
              }}
              placeholder="Describe what happened, emergency severity, building landmarks, floor number..."
              rows={2}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", background: "rgba(30,41,59,0.7)", border: descriptionError ? "1.5px solid #ff334b" : "1px solid rgba(255,255,255,0.15)", color: "#f8fafc", fontSize: "0.84rem" }}
            />
          </div>

          {/* STEP 2, 3, 4: Automatic Location Capture & Incident Location Mapping */}
          <div style={{ background: "rgba(15, 23, 42, 0.7)", border: "1px solid rgba(0, 229, 255, 0.3)", borderRadius: "10px", padding: "14px" }}>
            
            {/* Header with "Get Current Location" Button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
              <div>
                <span style={{ fontSize: "0.88rem", fontWeight: "800", color: "#00e5ff", display: "flex", alignItems: "center", gap: "6px" }}>
                  <MapPin size={16} color="#00e5ff" /> 5. Incident Location Selection
                </span>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                  GPS position is captured as default. Drag marker or click map to adjust if emergency is elsewhere.
                </span>
              </div>

              {/* Action: "Get Current Location" */}
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                disabled={locationStatus === "locating"}
                style={{
                  background: "linear-gradient(135deg, rgba(0,229,255,0.2) 0%, rgba(2,132,199,0.3) 100%)",
                  border: "1.5px solid #00e5ff",
                  borderRadius: "6px",
                  color: "#00e5ff",
                  fontSize: "0.78rem",
                  fontWeight: "700",
                  padding: "6px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 0 10px rgba(0,229,255,0.2)"
                }}
              >
                <Navigation size={13} className={locationStatus === "locating" ? "animate-spin" : ""} />
                {locationStatus === "locating" ? "Capturing GPS..." : "GET CURRENT LOCATION"}
              </button>
            </div>

            {/* Success State Display */}
            {locationStatus === "success" && (
              <div style={{
                background: "rgba(0, 255, 136, 0.12)",
                border: "1.5px solid rgba(0, 255, 136, 0.4)",
                color: "#a7f3d0",
                padding: "10px 14px",
                borderRadius: "8px",
                marginBottom: "10px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "900", color: "#00ff88", marginBottom: "6px", fontSize: "0.82rem", letterSpacing: "0.03em" }}>
                  <CheckCircle2 size={16} /> LOCATION CAPTURED SUCCESSFULLY
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "6px", fontSize: "0.76rem", fontFamily: "monospace" }}>
                  <div>Latitude: <strong style={{ color: "#f8fafc" }}>{userDeviceLocation?.lat.toFixed(5)}</strong></div>
                  <div>Longitude: <strong style={{ color: "#f8fafc" }}>{userDeviceLocation?.lng.toFixed(5)}</strong></div>
                  <div>Accuracy: <strong style={{ color: "#f8fafc" }}>{locationAccuracy ? `±${locationAccuracy}m` : "High accuracy"}</strong></div>
                  <div>Captured at: <strong style={{ color: "#f8fafc" }}>{locationCapturedAt ? new Date(locationCapturedAt).toLocaleTimeString() : new Date().toLocaleTimeString()}</strong></div>
                </div>
              </div>
            )}

            {/* Error / Denial State Display */}
            {locationError && (
              <div style={{
                background: "rgba(255, 184, 0, 0.12)",
                border: "1px solid rgba(251, 191, 36, 0.35)",
                color: "#fef08a",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "0.76rem",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <Info size={16} color="#fbbf24" style={{ flexShrink: 0 }} />
                <span>{locationError}</span>
              </div>
            )}

            {/* Interactive Leaflet Map */}
            <div style={{ height: "190px", borderRadius: "8px", overflow: "hidden", marginBottom: "8px", border: "1px solid rgba(56,189,248,0.3)" }}>
              <MapComponent
                height="190px"
                center={[incidentCoords.lat, incidentCoords.lng]}
                zoom={15}
                userLocation={userDeviceLocation}
                pickerMode={true}
                pickerCoords={incidentCoords}
                onPickerCoordsChange={handlePickerPositionChange}
              />
            </div>

            {/* SELECTED INCIDENT LOCATION Card */}
            <div style={{
              background: "rgba(10, 15, 29, 0.95)",
              border: isLocationConfirmed ? "1.5px solid rgba(0, 255, 136, 0.4)" : "1.5px solid rgba(255, 184, 0, 0.4)",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "8px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: "800", color: "#f8fafc", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  SELECTED INCIDENT LOCATION
                </span>
                {isLocationConfirmed ? (
                  <span style={{ fontSize: "0.72rem", background: "rgba(0,255,136,0.15)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.3)", padding: "2px 8px", borderRadius: "10px", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Check size={12} /> Confirmed
                  </span>
                ) : (
                  <span style={{ fontSize: "0.72rem", background: "rgba(255,184,0,0.15)", color: "#ffb800", border: "1px solid rgba(255,184,0,0.3)", padding: "2px 8px", borderRadius: "10px", fontWeight: "700" }}>
                    Please Confirm Location
                  </span>
                )}
              </div>

              <div style={{ fontSize: "0.76rem", fontFamily: "monospace", color: "#94a3b8", display: "flex", gap: "12px", marginBottom: "4px" }}>
                <span>Latitude: <strong style={{ color: "#f8fafc" }}>{incidentCoords.lat.toFixed(5)}</strong></span>
                <span>Longitude: <strong style={{ color: "#f8fafc" }}>{incidentCoords.lng.toFixed(5)}</strong></span>
              </div>

              <div style={{ fontSize: "0.78rem", color: isGeocoding ? "#94a3b8" : "#cbd5e1" }}>
                <strong>Address:</strong> {isGeocoding ? "Resolving address..." : (incidentAddress || `Lat ${incidentCoords.lat.toFixed(5)}, Lng ${incidentCoords.lng.toFixed(5)}`)}
              </div>
            </div>

            {/* Location Verification & Confirmation Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                {isLocationAdjusted ? "Marker moved from initial GPS location" : "Initial coordinates set to device GPS location"}
                <br/>
                <span style={{ color: "#38bdf8", fontSize: "0.7rem" }}>ADJUST LOCATION: Drag marker or click anywhere on map</span>
              </div>

              {/* Action: "CONFIRM LOCATION" */}
              <button
                type="button"
                onClick={handleConfirmLocation}
                style={{
                  background: isLocationConfirmed ? "rgba(0, 255, 136, 0.2)" : "linear-gradient(135deg, #00e5ff 0%, #0284c7 100%)",
                  border: isLocationConfirmed ? "1.5px solid #00ff88" : "none",
                  color: isLocationConfirmed ? "#00ff88" : "#070a12",
                  borderRadius: "6px",
                  padding: "8px 18px",
                  fontSize: "0.82rem",
                  fontWeight: "800",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: isLocationConfirmed ? "none" : "0 0 12px rgba(0,229,255,0.4)"
                }}
              >
                <Check size={14} />
                {isLocationConfirmed ? "CONFIRMED LOCATION ✓" : "CONFIRM LOCATION"}
              </button>
            </div>

          </div>

          {/* Form Actions: Submit Report */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
            <button type="button" onClick={onClose} className="btn-outline">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-emergency-main"
              style={{ padding: "12px 28px", fontSize: "0.95rem" }}
            >
              {isSubmitting ? "Submitting..." : "🚨 Submit SOS Emergency Report"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
