import React from "react";
import { AlertOctagon, User, Shield, ArrowRight } from "lucide-react";

export default function LandingPage({
  onContinueAsGuest,
  onOpenCitizenLogin,
  onOpenCitizenRegister,
  onOpenResponderLogin,
  onOpenResponderRegister,
  onTriggerSos
}) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#070a12",
      color: "#f8fafc",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: "24px 16px"
    }}>
      
      {/* Top Navbar */}
      <header style={{
        maxWidth: "1200px",
        margin: "0 auto",
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: "16px",
        borderBottom: "1px solid rgba(255,255,255,0.1)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "#ff334b", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 0 16px rgba(255,51,75,0.6)" }}>
            <Shield size={22} />
          </div>
          <div>
            <div style={{ fontSize: "1.15rem", fontWeight: "900", color: "#f8fafc" }}>
              Hyperlocal Emergency Response Platform
            </div>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
              Fast • Hyperlocal • Direct Service Dispatch
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={onContinueAsGuest}
            className="btn-outline"
            style={{ padding: "8px 16px", fontSize: "0.85rem", color: "#00e5ff", borderColor: "rgba(0,229,255,0.4)" }}
          >
            🗺️ Live Incident Map
          </button>
          <button
            onClick={onTriggerSos}
            className="btn-emergency-main"
            style={{ padding: "10px 22px", borderRadius: "24px", fontSize: "0.95rem" }}
          >
            <AlertOctagon size={18} /> SOS EMERGENCY
          </button>
        </div>
      </header>

      {/* Main Hero & Portals */}
      <main style={{ maxWidth: "1100px", margin: "40px auto", width: "100%", textAlign: "center" }}>
        
        {/* Headline */}
        <div style={{ marginBottom: "36px" }}>
          <h1 style={{ fontSize: "2.6rem", fontWeight: "900", lineHeight: "1.2", marginBottom: "12px", color: "#f8fafc" }}>
            Immediate Hyperlocal Emergency Response
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "1.05rem", maxWidth: "680px", margin: "0 auto" }}>
            Submit an emergency SOS with mandatory danger checklist and automatic GPS detection. Nearby available responders (Ambulance, Police, Fire) are notified in real time.
          </p>
        </div>

        {/* Center Prominent SOS Button */}
        <div style={{ marginBottom: "48px" }}>
          <button
            onClick={onTriggerSos}
            className="sos-main-trigger"
            style={{ margin: "0 auto" }}
          >
            <AlertOctagon size={44} color="white" />
            <span style={{ fontWeight: "900", fontSize: "1.2rem", letterSpacing: "1px", marginTop: "4px" }}>
              SOS
            </span>
            <span style={{ fontSize: "0.68rem", opacity: 0.85, fontWeight: "700" }}>
              EMERGENCY
            </span>
          </button>
          <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "14px" }}>
            Click SOS to open emergency form • Automatic GPS detection • No login required
          </div>
        </div>

        {/* Exact Landing Page Actions Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "24px", textAlign: "left" }}>
          
          {/* Card 1: Guest Access & Citizen Portal */}
          <div className="tactical-glass-card" style={{ padding: "26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(0,229,255,0.15)", color: "#00e5ff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                <User size={24} />
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "800", color: "#f8fafc", marginBottom: "6px" }}>
                Citizen Portal
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: "1.5", marginBottom: "20px" }}>
                Submit emergency reports, track responder GPS live, and view assigned ambulance, police, or fire units.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* 1. Continue as Guest */}
              <button
                onClick={onContinueAsGuest}
                className="btn-primary-blue"
                style={{ width: "100%", padding: "11px", borderRadius: "8px", fontSize: "0.9rem" }}
              >
                Continue as Guest <ArrowRight size={16} />
              </button>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {/* 2. Citizen Login */}
                <button
                  onClick={onOpenCitizenLogin}
                  className="btn-outline"
                  style={{ padding: "10px", fontSize: "0.85rem" }}
                >
                  Citizen Login
                </button>
                {/* 3. Citizen Register */}
                <button
                  onClick={onOpenCitizenRegister}
                  className="btn-outline"
                  style={{ padding: "10px", fontSize: "0.85rem" }}
                >
                  Citizen Register
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Responder Portal (Ambulance, Police, Fire) */}
          <div className="tactical-glass-card" style={{ padding: "26px", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid rgba(0,255,136,0.3)" }}>
            <div>
              <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(0,255,136,0.15)", color: "#00ff88", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "14px" }}>
                <Shield size={24} />
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "800", color: "#f8fafc", marginBottom: "6px" }}>
                Responder Portal
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: "1.5", marginBottom: "20px" }}>
                For demo service responders (Ambulance, Police, Fire). Receive incoming nearby alerts, accept incidents, and view live turn-by-turn road route directions.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {/* 4. Responder Login */}
                <button
                  onClick={onOpenResponderLogin}
                  style={{ background: "#00ff88", color: "#070a12", border: "none", borderRadius: "8px", padding: "11px", fontWeight: "800", fontSize: "0.88rem", cursor: "pointer" }}
                >
                  Responder Login
                </button>
                {/* 5. Responder Register */}
                <button
                  onClick={onOpenResponderRegister}
                  className="btn-outline"
                  style={{ padding: "11px", fontSize: "0.85rem", borderColor: "rgba(0,255,136,0.4)", color: "#00ff88" }}
                >
                  Responder Register
                </button>
              </div>
            </div>
          </div>

        </div>

      </main>

    </div>
  );
}
