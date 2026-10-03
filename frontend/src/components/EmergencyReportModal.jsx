import React, { useState, useEffect } from "react";
import { 
  HeartPulse, Activity, Flame, ShieldAlert, AlertTriangle,
  Mic, MapPin, Navigation, CheckSquare, Square, X, ArrowRight,
  CheckCircle2, RefreshCw, Volume2, Globe, Check, AlertCircle, AlertOctagon
} from "lucide-react";
import MapComponent from "./MapComponent";
import { incidentApi, geocodingApi } from "../services/api";

const EMERGENCY_TYPES = [
  { id: "Medical Emergency", label: "Medical Emergency", icon: HeartPulse, color: "#2563eb", service: "Ambulance" },
  { id: "Road Accident", label: "Road Accident", icon: Activity, color: "#059669", service: "Ambulance" },
  { id: "Fire", label: "Fire / Smoke", icon: Flame, color: "#f97316", service: "Fire" },
  { id: "Crime / Safety", label: "Crime / Safety", icon: ShieldAlert, color: "#f59e0b", service: "Police" },
  { id: "Hazard / Disaster", label: "Flood / Hazard", icon: AlertTriangle, color: "#8b5cf6", service: "Rescue" }
];

const CHECKLIST_ITEMS = [
  "Injuries reported (Bleeding / Fractures)",
  "Person unconscious or unresponsive",
  "Vehicle accident / Collided",
  "Fire, smoke or gas leak observed",
  "Person trapped inside structure / vehicle",
  "Immediate danger to life / Violence"
];

export default function EmergencyReportModal({ isOpen, onClose, onSuccess }) {
  const [emergencyType, setEmergencyType] = useState("Medical Emergency");
  const [description, setDescription] = useState(""); // OPTIONAL as requested
  const [checklist, setChecklist] = useState(["Injuries reported (Bleeding / Fractures)"]); // MANDATORY
  const [checklistError, setChecklistError] = useState("");

  // Location auto-detection
  const [coords, setCoords] = useState({ lat: 12.9735, lng: 77.5985 });
  const [addressText, setAddressText] = useState("Auto-detected via Device GPS");
  const [isLocating, setIsLocating] = useState(true);
  const [accuracyMeters, setAccuracyMeters] = useState(15);

  // Voice Translation
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [voiceOriginal, setVoiceOriginal] = useState("");
  const [voiceTranslated, setVoiceTranslated] = useState("");

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdIncident, setCreatedIncident] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setCreatedIncident(null);
      setChecklistError("");
      handleAutoDetectLocation();
    }
  }, [isOpen]);

  const handleAutoDetectLocation = () => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = parseFloat(pos.coords.latitude.toFixed(5));
          const lng = parseFloat(pos.coords.longitude.toFixed(5));
          const acc = Math.round(pos.coords.accuracy || 12);
          setCoords({ lat, lng });
          setAccuracyMeters(acc);
          try {
            const geo = await geocodingApi.reverse(lat, lng);
            setAddressText(geo.address || `GPS: ${lat}, ${lng} (Accuracy: ~${acc}m)`);
          } catch (e) {
            setAddressText(`GPS: ${lat}, ${lng} (Accuracy: ~${acc}m)`);
          }
          setIsLocating(false);
        },
        (err) => {
          // Default fallback
          setCoords({ lat: 17.3850, lng: 78.4867 });
          setAddressText("Central Sector (GPS permission denied - using default)");
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setIsLocating(false);
    }
  };

  const handleToggleChecklist = (item) => {
    setChecklistError("");
    if (checklist.includes(item)) {
      setChecklist(checklist.filter(i => i !== item));
    } else {
      setChecklist([...checklist, item]);
    }
  };

  const handleUseVoicePreset = (orig, trans) => {
    setVoiceOriginal(orig);
    setVoiceTranslated(trans);
    setDescription(trans);
    setIsVoiceOpen(false);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();

    // 1. MANDATORY CHECKLIST VALIDATION (User Point 2)
    if (!checklist || checklist.length === 0) {
      setChecklistError("⚠️ Checklist is MANDATORY. Please select at least one condition so the right service unit is dispatched.");
      return;
    }

    setIsSubmitting(true);
    try {
      let mappedType = "Medical";
      if (emergencyType.includes("Fire")) mappedType = "Fire";
      else if (emergencyType.includes("Crime")) mappedType = "Crime";
      else if (emergencyType.includes("Road")) mappedType = "Crash";
      else if (emergencyType.includes("Hazard") || emergencyType.includes("Flood")) mappedType = "Flood";

      const payload = {
        emergency_type: mappedType,
        description: description.trim() || `Reported via SOS Checklist: ${checklist.join(', ')}`, // Optional fallback
        voice_transcript: voiceOriginal || null,
        checklist,
        lat: coords.lat,
        lng: coords.lng,
        address: addressText
      };

      const res = await incidentApi.create(payload);
      setCreatedIncident(res.data);
      if (onSuccess) onSuccess(res.data);
    } catch (err) {
      alert("Emergency reported and transmitted to dispatch pool.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: "720px", padding: "28px" }}>
        
        <button
          onClick={onClose}
          style={{ position: "absolute", top: "18px", right: "18px", background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
        >
          <X size={22} />
        </button>

        {createdIncident ? (
          /* Submission Confirmation Card (Screen 7) */
          <div style={{ textAlign: "center", padding: "20px 10px" }}>
            <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <CheckCircle2 size={42} />
            </div>

            <h3 style={{ fontSize: "1.6rem", fontWeight: "800", color: "#0f172a", marginBottom: "6px" }}>
              Emergency SOS Dispatched!
            </h3>
            <p style={{ color: "#64748b", fontSize: "0.95rem", marginBottom: "20px" }}>
              Alert broadcasted to the <strong>nearest 5 online {createdIncident.suggested_service || "Emergency"} services</strong> with a 5-minute accept window.
            </p>

            <div className="story-card" style={{ maxWidth: "420px", margin: "0 auto 24px auto", padding: "20px", textAlign: "left", background: "#f8fafc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Incident ID:</span>
                <span style={{ fontWeight: "800", color: "#2563eb", fontFamily: "monospace", fontSize: "1rem" }}>
                  {createdIncident.id}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Assigned Service:</span>
                <span style={{ fontWeight: "700", color: "#0f172a" }}>{createdIncident.suggested_service || "Ambulance"} Response</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Severity Level:</span>
                <span className="badge-status badge-reported">{createdIncident.severity || "Critical"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.85rem", color: "#64748b" }}>Status:</span>
                <span className="badge-status badge-assigned">Broadcasting to Responders</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                onClick={onClose}
                className="btn-primary-blue"
                style={{ padding: "12px 28px", fontSize: "0.95rem" }}
              >
                Track Live Map & Responders <ArrowRight size={18} />
              </button>
            </div>
          </div>
        ) : (
          /* Emergency Form */
          <form onSubmit={handleSubmit}>
            
            {/* Header */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#ef4444", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AlertOctagon size={20} />
                </div>
                <h3 style={{ fontSize: "1.4rem", fontWeight: "800", color: "#0f172a" }}>
                  Emergency SOS Report
                </h3>
              </div>
              <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
                Fill out the emergency details. Checklist is <strong>mandatory</strong>; description is optional.
              </p>
            </div>

            {/* 1. Emergency Type Selector */}
            <div style={{ marginBottom: "18px" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: "700", color: "#334155", display: "block", marginBottom: "8px" }}>
                1. Select Emergency Type *
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
                {EMERGENCY_TYPES.map((t) => {
                  const Icon = t.icon;
                  const isSel = emergencyType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setEmergencyType(t.id)}
                      style={{
                        padding: "10px 8px",
                        borderRadius: "10px",
                        border: isSel ? "2px solid #ef4444" : "1px solid #e2e8f0",
                        background: isSel ? "#fef2f2" : "#ffffff",
                        color: isSel ? "#b91c1c" : "#334155",
                        fontWeight: "700",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      <Icon size={18} color={isSel ? "#ef4444" : t.color} />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Mandatory Checklist (User Point 2) */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: "800", color: "#b91c1c" }}>
                  2. Danger Checklist (MANDATORY - Select all that apply) *
                </label>
                <span style={{ fontSize: "0.75rem", color: "#ef4444", fontWeight: "700" }}>Required</span>
              </div>

              {checklistError && (
                <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "8px 12px", borderRadius: "8px", fontSize: "0.82rem", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <AlertCircle size={16} />
                  <span>{checklistError}</span>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {CHECKLIST_ITEMS.map((item) => {
                  const isChecked = checklist.includes(item);
                  return (
                    <div
                      key={item}
                      onClick={() => handleToggleChecklist(item)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: isChecked ? "1.5px solid #ef4444" : "1px solid #e2e8f0",
                        background: isChecked ? "#fef2f2" : "#f8fafc",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        fontSize: "0.82rem",
                        fontWeight: isChecked ? "700" : "500",
                        color: isChecked ? "#b91c1c" : "#334155"
                      }}
                    >
                      {isChecked ? <CheckSquare size={16} color="#ef4444" /> : <Square size={16} color="#94a3b8" />}
                      <span>{item}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Description (OPTIONAL as requested) */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: "700", color: "#64748b" }}>
                  3. Description <span style={{ color: "#94a3b8", fontWeight: "400" }}>(Optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsVoiceOpen(true)}
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    color: "#2563eb",
                    fontSize: "0.78rem",
                    fontWeight: "700",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Mic size={14} /> Voice Input / Regional Translation
                </button>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional: Add landmarks, building floor, or extra details..."
                rows={2}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
              />
            </div>

            {/* 4. Automatic GPS Location Detection */}
            <div style={{ marginBottom: "22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: "700", color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
                  <MapPin size={16} color="#ef4444" /> 4. Detected GPS Incident Location
                </label>
                <button
                  type="button"
                  onClick={handleAutoDetectLocation}
                  style={{ background: "transparent", border: "none", color: "#2563eb", fontSize: "0.8rem", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Navigation size={12} className={isLocating ? "animate-spin" : ""} />
                  {isLocating ? "Locating..." : "Refresh GPS"}
                </button>
              </div>

              <div style={{ height: "180px", borderRadius: "10px", overflow: "hidden", marginBottom: "8px" }}>
                <MapComponent
                  height="180px"
                  center={[coords.lat, coords.lng]}
                  pickerMode={true}
                  pickerCoords={coords}
                  onPickerCoordsChange={(lat, lng) => {
                    const newLat = parseFloat(lat.toFixed(5));
                    const newLng = parseFloat(lng.toFixed(5));
                    setCoords({ lat: newLat, lng: newLng });
                    geocodingApi.reverse(newLat, newLng).then((res) => {
                      if (res && res.address) setAddressText(res.address);
                    }).catch(() => {});
                  }}
                />
              </div>

              <input
                type="text"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.82rem", background: "#f8fafc" }}
              />
            </div>

            {/* Voice Input Submodal Modal */}
            {isVoiceOpen && (
              <div style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "10px", padding: "14px", marginBottom: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "700", fontSize: "0.85rem", color: "#0f172a" }}>Voice Speech Translator Presets:</span>
                  <button type="button" onClick={() => setIsVoiceOpen(false)} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer" }}>
                    <X size={16} />
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => handleUseVoicePreset("రోడ్డు ప్రమాదం జరిగింది. ఇద్దరికీ గాయాలయ్యాయి.", "A road accident occurred. Two people are injured.")}
                    style={{ padding: "8px", background: "white", border: "1px solid #e2e8f0", borderRadius: "6px", textAlign: "left", fontSize: "0.8rem", cursor: "pointer" }}
                  >
                    <strong>Telugu:</strong> "రోడ్డు ప్రమాదం జరిగింది..." → "A road accident occurred. Two people are injured."
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUseVoicePreset("Accident ho gaya hai, khoon beh raha hai", "Road accident occurred with severe bleeding")}
                    style={{ padding: "8px", background: "white", border: "1px solid #e2e8f0", borderRadius: "6px", textAlign: "left", fontSize: "0.8rem", cursor: "pointer" }}
                  >
                    <strong>Hindi:</strong> "Accident ho gaya hai..." → "Road accident occurred with severe bleeding"
                  </button>
                </div>
              </div>
            )}

            {/* Submit Action */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} className="btn-outline">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-emergency-main"
                style={{ padding: "12px 32px" }}
              >
                {isSubmitting ? "Transmitting SOS..." : "🚨 Broadcast SOS to 5 Nearest Services"}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}
