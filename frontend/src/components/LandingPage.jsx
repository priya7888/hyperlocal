import React from "react";
import { AlertOctagon, User, Shield, LogIn, UserPlus, ArrowRight, Volume2, VolumeX } from "lucide-react";
import { sounds } from "../services/soundEffects";

export default function LandingPage({
  onContinueAsGuest,
  onOpenCitizenLogin,
  onOpenCitizenRegister,
  onOpenResponderLogin,
  onOpenResponderRegister,
  onTriggerSos
}) {
  const [isMuted, setIsMuted] = React.useState(sounds.isMuted());

  const handleSos = () => {
    sounds.playAlertSiren();
    onTriggerSos();
  };

  const handleAction = (cb) => {
    sounds.playTap();
    if (cb) cb();
  };

  const handleToggleAudio = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070a12",
      color: "#f8fafc",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      padding: "20px 16px"
    }}>
      
      {/* Main Container */}
      <main style={{ maxWidth: "560px", width: "100%", textAlign: "center", margin: "auto" }}>
        
        {/* Title */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255, 51, 75, 0.12)",
            color: "#ff4d67",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: "700",
            marginBottom: "12px",
            border: "1px solid rgba(255, 51, 75, 0.3)"
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ff334b", display: "inline-block", boxShadow: "0 0 6px #ff334b" }}></span>
            HYPERLOCAL FIRST RESPONDER NETWORK
          </div>
          <h1 style={{ fontSize: "2.1rem", fontWeight: "900", lineHeight: "1.2", marginBottom: "8px", color: "#f8fafc" }}>
            Immediate Emergency Response
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "0.92rem", lineHeight: "1.5", margin: "0 auto", maxWidth: "440px" }}>
            Press SOS for immediate dispatch of nearby Ambulance, Police, or Fire rescue units.
          </p>
        </div>

        {/* Center Prominent SOS Button */}
        <div style={{ marginBottom: "32px", position: "relative", display: "inline-block" }}>
          <button
            onClick={handleSos}
            className="sos-main-trigger"
            style={{ margin: "0 auto" }}
          >
            <AlertOctagon size={46} color="white" />
            <span style={{ fontWeight: "900", fontSize: "1.25rem", letterSpacing: "1px", marginTop: "2px" }}>
              SOS
            </span>
            <span style={{ fontSize: "0.7rem", opacity: 0.9, fontWeight: "800" }}>
              EMERGENCY
            </span>
          </button>
          <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "12px", fontWeight: "600" }}>
            📍 Tap SOS to open emergency form • Automatic GPS detection
          </div>
        </div>

        {/* Compact Clean 2 Buttons: Login & Register */}
        <div style={{
          background: "rgba(30, 41, 59, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          backdropFilter: "blur(12px)"
        }}>
          
          <div style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Citizen & Responder Access
          </div>

          {/* 2 Primary Buttons: Login & Register */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button
              onClick={() => handleAction(onOpenCitizenLogin)}
              style={{
                background: "linear-gradient(135deg, #00e5ff, #0284c7)",
                color: "#070a12",
                border: "none",
                borderRadius: "10px",
                padding: "12px",
                fontWeight: "800",
                fontSize: "0.92rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                boxShadow: "0 4px 16px rgba(0, 229, 255, 0.25)",
                transition: "all 0.2s ease"
              }}
            >
              <LogIn size={17} /> Login
            </button>

            <button
              onClick={() => handleAction(onOpenCitizenRegister)}
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                color: "#f8fafc",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "10px",
                padding: "12px",
                fontWeight: "800",
                fontSize: "0.92rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                transition: "all 0.2s ease"
              }}
            >
              <UserPlus size={17} /> Register
            </button>
          </div>

          {/* Guest Citizen Link */}
          <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => handleAction(onContinueAsGuest)}
              style={{
                background: "transparent",
                border: "none",
                color: "#00e5ff",
                fontSize: "0.82rem",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 0"
              }}
            >
              Continue as Guest <ArrowRight size={14} />
            </button>

            <button
              onClick={() => handleAction(onOpenResponderLogin)}
              style={{
                background: "transparent",
                border: "none",
                color: "#00ff88",
                fontSize: "0.8rem",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 0"
              }}
            >
              <Shield size={13} /> Responder Console
            </button>
          </div>

        </div>

      </main>

    </div>
  );
}
