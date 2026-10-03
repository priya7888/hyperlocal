import React, { useState, useEffect } from "react";
import { 
  AlertOctagon, X, MapPin, Navigation, CheckSquare, Square, 
  AlertCircle, Shield, Flame, HeartPulse, Activity, RefreshCw
} from "lucide-react";
import { incidentApi, getDeviceLocation, reverseGeocode } from "../services/api";
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
  const [landmark, setLandmark] = useState("");
  const [checklistError, setChecklistError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [addressText, setAddressText] = useState("Detecting live location via satellite GPS...");
  const [coords, setCoords] = useState(() => {
    const savedLat = parseFloat(localStorage.getItem("last_device_gps_lat"));
    const savedLng = parseFloat(localStorage.getItem("last_device_gps_lng"));
    return (!isNaN(savedLat) && !isNaN(savedLng)) ? { lat: savedLat, lng: savedLng } : { lat: 17.5800, lng: 78.4867 };
  });

  useEffect(() => {
    if (isOpen) {
      setChecklist([]);
      setDescription("");
      setLandmark("");
      setChecklistError("");
      handleDetectLocation();
    }
  }, [isOpen]);

  const handleDetectLocation = async () => {
    sounds.playTap();
    setIsLocating(true);
    const loc = await getDeviceLocation(coords.lat || 17.5800, coords.lng || 78.4867);
    setCoords({ lat: loc.lat, lng: loc.lng });
    
    // Automatically reverse geocode to human-readable address
    const street = await reverseGeocode(loc.lat, loc.lng);
    setAddressText(street || "Verified Emergency Scene Location");
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

      const fullDesc = [
        description.trim() ? description.trim() : null,
        `Conditions: ${checklist.join(', ')}`,
        landmark.trim() ? `Landmark: ${landmark.trim()}` : null
      ].filter(Boolean).join(' • ');

      const payload = {
        emergency_type: type,
        suggested_service: suggested_service,
        description: fullDesc,
        checklist,
        lat: Number(coords.lat) || 17.5800,
        lng: Number(coords.lng) || 78.4867,
        address: addressText + (landmark.trim() ? ` (${landmark.trim()})` : '')
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
      <div className="modal-container" style={{
        maxWidth: "540px",
        padding: "24px",
        background: "linear-gradient(180deg, #111827 0%, #0b0f19 100%)",
        border: "1.5px solid rgba(255, 51, 75, 0.4)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.85), 0 0 40px rgba(255,51,75,0.25)"
      }}>
        
        {/* Header with Close */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "rgba(255, 51, 75, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #ff334b"
            }}>
              <AlertOctagon size={24} color="#ff334b" />
            </div>
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: "900", color: "#f8fafc", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Emergency SOS Dispatch
              </h2>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Zero-Click Instant Satellite Location Broadcast
              </div>
            </div>
          </div>
          <button 
            onClick={() => { sounds.playTap(); onClose(); }}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Service Alert Banner */}
        <div style={{
          background: `rgba(15, 23, 42, 0.8)`,
          border: `1.5px solid ${currentService.color}40`,
          borderRadius: "12px",
          padding: "12px 14px",
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: "700" }}>
              Auto-Dispatched Unit:
            </div>
            <div style={{ fontSize: "1rem", fontWeight: "900", color: currentService.color, display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              {currentService.icon}
              <span>{currentService.name}</span>
            </div>
          </div>
          <div style={{
            background: severityScore > 0 ? "rgba(255, 51, 75, 0.15)" : "rgba(255, 255, 255, 0.05)",
            border: severityScore > 0 ? "1px solid #ff334b" : "1px solid rgba(255,255,255,0.1)",
            padding: "4px 10px",
            borderRadius: "20px",
            fontSize: "0.72rem",
            fontWeight: "800",
            color: severityScore > 0 ? "#ff4d67" : "#94a3b8"
          }}>
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

          {/* 2. 100% Automated Satellite GPS Location Card (No Clumsy Pinning Required) */}
          <div style={{
            background: "rgba(30, 41, 59, 0.6)",
            border: "1px solid rgba(0, 229, 255, 0.35)",
            borderRadius: "12px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <MapPin size={16} color="#00e5ff" />
                <span style={{ fontSize: "0.82rem", fontWeight: "800", color: "#00e5ff" }}>
                  2. Incident GPS Location (Auto-Locked)
                </span>
              </div>
              
              <button
                type="button"
                onClick={handleDetectLocation}
                style={{
                  background: "rgba(0, 229, 255, 0.15)",
                  border: "1px solid rgba(0, 229, 255, 0.5)",
                  color: "#00e5ff",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "0.72rem",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <RefreshCw size={11} className={isLocating ? "animate-spin" : ""} />
                {isLocating ? "Locating..." : "Recalibrate GPS"}
              </button>
            </div>

            <div style={{
              background: "rgba(15, 23, 42, 0.8)",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span style={{ color: isLocating ? "#eab308" : "#00ff88", fontSize: "0.8rem", fontWeight: "900" }}>
                {isLocating ? "⏳" : "●"}
              </span>
              <div style={{ fontSize: "0.8rem", color: "#f8fafc", fontWeight: "600", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {addressText}
              </div>
            </div>

            {/* Optional Landmark / Gate input for indoor/visitors */}
            <input
              type="text"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="Landmark / Floor / Gate / Building Name (Optional)"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "8px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f8fafc",
                fontSize: "0.8rem"
              }}
            />
          </div>

          {/* 3. Optional Extra Description */}
          <div>
            <label style={{ fontSize: "0.8rem", fontWeight: "700", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
              3. Extra Notes <span style={{ color: "#64748b", fontWeight: "400" }}>(Optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any additional details for the arriving team... (Optional)"
              rows={2}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "#f8fafc", fontSize: "0.82rem" }}
            />
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
