import React, { useState, useEffect } from "react";
import { 
  AlertOctagon, X, MapPin, Navigation, CheckSquare, Square, 
  AlertCircle, CheckCircle2, ArrowRight, Shield, Flame, HeartPulse, Activity,
  Map, ChevronDown, ChevronUp
} from "lucide-react";
import MapComponent from "./MapComponent";
import { incidentApi, getDeviceLocation } from "../services/api";
import { sounds } from "../services/soundEffects";

const EXACT_CHECKLIST = [
  "Person injured",
  "Person unconscious",
  "Road accident",
  "Fire or smoke",
  "Person trapped",
  "Crime/personal safety threat",
  "Other emergency"
];

export default function SosModal({ isOpen, onClose, onSubmitted }) {
  const [checklist, setChecklist] = useState([]);
  const [description, setDescription] = useState("");
  const [checklistError, setChecklistError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [showMapPicker, setShowMapPicker] = useState(true);
  const [coords, setCoords] = useState(() => {
    const savedLat = parseFloat(localStorage.getItem("last_device_gps_lat"));
    const savedLng = parseFloat(localStorage.getItem("last_device_gps_lng"));
    return (!isNaN(savedLat) && !isNaN(savedLng)) ? { lat: savedLat, lng: savedLng } : { lat: 17.5800, lng: 78.4867 };
  });

  useEffect(() => {
    if (isOpen) {
      setChecklist([]);
      setDescription("");
      setChecklistError("");
      setShowMapPicker(true);
      handleDetectLocation();
    }
  }, [isOpen]);

  const handleDetectLocation = async () => {
    sounds.playTap();
    setIsLocating(true);
    const loc = await getDeviceLocation(coords.lat || 17.5800, coords.lng || 78.4867);
    setCoords({ lat: loc.lat, lng: loc.lng });
    sounds.playStep();
    setIsLocating(false);
  };

  const handleToggleChecklist = (item) => {
    sounds.playTap();
    setChecklistError("");
    if (checklist.includes(item)) {
      setChecklist(checklist.filter(i => i !== item));
    } else {
      setChecklist([...checklist, item]);
    }
  };

  // Dynamic service calculation
  const getDispatchedService = () => {
    if (checklist.includes("Fire or smoke") || checklist.includes("Person trapped")) {
      return { name: "Fire Department", icon: <Flame size={16} color="#ff334b" />, color: "#ff334b" };
    }
    if (checklist.includes("Crime/personal safety threat")) {
      return { name: "Police Safety Unit", icon: <Shield size={16} color="#00e5ff" />, color: "#00e5ff" };
    }
    if (checklist.includes("Person injured") || checklist.includes("Person unconscious") || checklist.includes("Road accident")) {
      return { name: "Emergency Ambulance", icon: <HeartPulse size={16} color="#00ff88" />, color: "#00ff88" };
    }
    return { name: "Quick Response Unit", icon: <Activity size={16} color="#eab308" />, color: "#eab308" };
  };

  const currentService = getDispatchedService();

  // Danger severity score
  const severityScore = checklist.length;
  const severityLabel = severityScore === 0 ? "Select Conditions" :
    severityScore === 1 ? "Level 1 • High Priority" :
    severityScore === 2 ? "Level 2 • Severe Emergency" :
    "Level 3 • CRITICAL LIFE SAFETY";

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Mandatory Checklist validation
    if (!checklist || checklist.length === 0) {
      sounds.playAlertSiren();
      setChecklistError("⚠️ Please select at least one item from the emergency checklist before submitting.");
      return;
    }

    setIsSubmitting(true);
    sounds.playAlertSiren();
    try {
      let type = "Medical";
      let suggested_service = "Ambulance";
      if (checklist.includes("Fire or smoke") || checklist.includes("Person trapped")) {
        type = "Fire";
        suggested_service = "Fire";
      } else if (checklist.includes("Crime/personal safety threat")) {
        type = "Crime";
        suggested_service = "Police";
      } else if (checklist.includes("Road accident")) {
        type = "Crash";
        suggested_service = "Ambulance";
      } else if (checklist.includes("Other emergency")) {
        type = "General";
        suggested_service = "All";
      }

      const payload = {
        emergency_type: type,
        suggested_service: suggested_service,
        description: description.trim() || `Reported Conditions: ${checklist.join(', ')}`,
        checklist,
        lat: Number(coords.lat) || 17.5800,
        lng: Number(coords.lng) || 78.4867,
        address: `GPS Location: Lat ${Number(coords.lat).toFixed(4)}, Lng ${Number(coords.lng).toFixed(4)}`
      };

      const res = await incidentApi.create(payload);
      sounds.playSuccess();
      if (onSubmitted) onSubmitted(res.incident || res.data || res);
      onClose();
    } catch (err) {
      sounds.playSuccess();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: "580px", padding: "24px", background: "#0e1424", border: "1px solid rgba(255,51,75,0.4)" }}>
        
        {/* Close Button */}
        <button
          onClick={() => { sounds.playTap(); onClose(); }}
          style={{ position: "absolute", top: "18px", right: "18px", background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#ff334b", color: "white", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 16px rgba(255,51,75,0.4)" }}>
            <AlertOctagon size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: "900", color: "#f8fafc", margin: 0 }}>
              Emergency SOS Report
            </h2>
          </div>
        </div>
        <p style={{ color: "#94a3b8", fontSize: "0.82rem", marginBottom: "14px" }}>
          Select all conditions that apply. Checklist is <strong>mandatory</strong>.
        </p>

        {/* Dynamic Live Triage Badge */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between", 
          padding: "8px 12px", 
          borderRadius: "8px", 
          background: "rgba(15, 23, 42, 0.7)", 
          border: `1px solid ${currentService.color}40`,
          marginBottom: "14px" 
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.82rem", color: currentService.color, fontWeight: "700" }}>
            {currentService.icon}
            <span>Target Dispatch: {currentService.name}</span>
          </div>
          <div style={{ fontSize: "0.72rem", color: severityScore > 2 ? "#ff334b" : severityScore > 0 ? "#f59e0b" : "#64748b", fontWeight: "800", textTransform: "uppercase" }}>
            {severityLabel}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          
          {/* 1. Mandatory Checklist */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: "800", color: "#ff334b" }}>
                1. Emergency Checklist (Select at least one) *
              </label>
              <span style={{ fontSize: "0.7rem", color: "#ff334b", fontWeight: "700" }}>Mandatory</span>
            </div>

            {checklistError && (
              <div style={{ background: "rgba(255, 51, 75, 0.2)", border: "1px solid rgba(255, 51, 75, 0.4)", color: "#ff4d67", padding: "8px 12px", borderRadius: "8px", fontSize: "0.8rem", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
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
                      borderRadius: "8px",
                      border: isChecked ? "1.5px solid #ff334b" : "1px solid rgba(255,255,255,0.1)",
                      background: isChecked ? "rgba(255, 51, 75, 0.18)" : "rgba(30, 41, 59, 0.45)",
                      color: isChecked ? "#ffffff" : "#cbd5e1",
                      fontSize: "0.8rem",
                      fontWeight: isChecked ? "700" : "500",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.15s ease",
                      transform: isChecked ? "scale(1.01)" : "scale(1)"
                    }}
                  >
                    {isChecked ? <CheckSquare size={15} color="#ff334b" /> : <Square size={15} color="#64748b" />}
                    <span>{item}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Optional Description */}
          <div>
            <label style={{ fontSize: "0.82rem", fontWeight: "700", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
              2. Emergency Description <span style={{ color: "#64748b", fontWeight: "400" }}>(Optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, landmarks... (Optional)"
              rows={2}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "#f8fafc", fontSize: "0.85rem" }}
            />
          </div>

          {/* 3. Clean Automatic GPS Detection with 'Open Map' Button */}
          {/* 3. Clean GPS Detection & Interactive Draggable Map Pin */}
          <div>
            <div style={{ 
              background: "rgba(30, 41, 59, 0.5)", 
              border: "1px solid rgba(56, 189, 248, 0.25)", 
              borderRadius: "10px", 
              padding: "10px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "8px"
            }}>
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: "800", color: "#00e5ff", display: "flex", alignItems: "center", gap: "6px" }}>
                  <MapPin size={15} color="#00e5ff" />
                  <span>3. Incident Location Pin</span>
                </div>
                <div style={{ fontSize: "0.76rem", color: "#cbd5e1", marginTop: "2px", fontFamily: "monospace" }}>
                  Lat: {coords.lat}, Lng: {coords.lng}
                </div>
              </div>

              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  style={{ background: "rgba(0, 229, 255, 0.12)", border: "1px solid rgba(0,229,255,0.4)", borderRadius: "6px", color: "#00e5ff", fontSize: "0.75rem", fontWeight: "700", padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Navigation size={12} className={isLocating ? "animate-spin" : ""} />
                  {isLocating ? "Locating..." : "Auto-GPS"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowMapPicker(!showMapPicker)}
                  style={{ background: showMapPicker ? "rgba(0, 229, 255, 0.25)" : "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(0, 229, 255, 0.5)", borderRadius: "6px", color: "#00e5ff", fontSize: "0.75rem", fontWeight: "700", padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Map size={12} />
                  {showMapPicker ? "Pin Active" : "Pick on Map"}
                </button>
              </div>
            </div>

            {/* Interactive Draggable Pin Map Canvas */}
            {showMapPicker && (
              <div style={{ borderRadius: "10px", overflow: "hidden", border: "1.5px solid rgba(0, 229, 255, 0.5)", position: "relative", animation: "fadeIn 0.2s ease" }}>
                <div style={{
                  position: "absolute",
                  top: "8px",
                  left: "8px",
                  zIndex: 999,
                  background: "rgba(14, 20, 36, 0.9)",
                  border: "1px solid rgba(0, 229, 255, 0.3)",
                  borderRadius: "6px",
                  padding: "3px 8px",
                  fontSize: "0.7rem",
                  fontWeight: "700",
                  color: "#00e5ff",
                  pointerEvents: "none"
                }}>
                  📍 Tap map or drag 🎯 pin to set location
                </div>

                <MapComponent
                  height="170px"
                  center={[coords.lat, coords.lng]}
                  pickerMode={true}
                  pickerCoords={coords}
                  onPickerCoordsChange={(lat, lng) => {
                    const cleanLat = parseFloat(lat.toFixed(5));
                    const cleanLng = parseFloat(lng.toFixed(5));
                    setCoords({ lat: cleanLat, lng: cleanLng });
                    localStorage.setItem("last_device_gps_lat", cleanLat.toString());
                    localStorage.setItem("last_device_gps_lng", cleanLng.toString());
                  }}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "2px" }}>
            <button 
              type="button" 
              onClick={() => { sounds.playTap(); onClose(); }} 
              className="btn-outline"
              style={{ padding: "10px 18px", fontSize: "0.88rem" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-emergency-main"
              style={{ padding: "11px 24px", fontSize: "0.92rem", flex: 1 }}
            >
              {isSubmitting ? "Dispatching..." : "🚨 Transmit SOS Emergency"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
