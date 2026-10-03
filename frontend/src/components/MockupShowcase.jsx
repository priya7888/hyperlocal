import React, { useState } from "react";
import { 
  Shield, User, Radio, Phone, MapPin, Navigation, CheckCircle2, 
  Clock, AlertTriangle, FileText, Flame, Activity, HeartPulse, 
  CheckSquare, Square, Mic, CloudOff, RefreshCw, BarChart3, Users, 
  ArrowRight, Check, Eye, EyeOff, AlertOctagon, PhoneCall, Layers,
  ExternalLink, Sparkles, ChevronRight
} from "lucide-react";
import MapComponent from "./MapComponent";

export default function MockupShowcase({ onSwitchToLiveView, onSelectRole }) {
  const [selectedScreen, setSelectedScreen] = useState(null); // null = overview grid, 1..14 = individual view

  const screens = [
    { id: 1, title: "1. Login / Register", desc: "Split layout authentication with emergency branding" },
    { id: 2, title: "2. Role Selection", desc: "Citizen vs Responder selection portal" },
    { id: 3, title: "3. Citizen Dashboard", desc: "Incident stats, emergency CTA & quick access" },
    { id: 4, title: "4. Report Emergency (Form)", desc: "Emergency type tiles, description & checklist" },
    { id: 5, title: "5. Location Capture", desc: "Leaflet/OSM map with auto-detected GPS pin" },
    { id: 6, title: "6. Voice Input & Translation", desc: "Audio waveform & Telugu-to-English translation" },
    { id: 7, title: "7. Submit Confirmation", desc: "Incident ID INC-2025-001 & dispatch notification" },
    { id: 8, title: "8. Responder Dashboard", desc: "Nearby incident triage with Accept/Reject" },
    { id: 9, title: "9. Route Navigation (Responder)", desc: "OSRM turn-by-turn routing with distance & ETA" },
    { id: 10, title: "10. Citizen Tracking View", desc: "Live stage timeline & moving responder map" },
    { id: 11, title: "11. Emergency Contacts (Offline)", desc: "112 SOS directory & categorized services" },
    { id: 12, title: "12. Offline Report Storage", desc: "IndexedDB offline queue & sync" },
    { id: 13, title: "13. Resolved Incident", desc: "Completion summary with timestamp & details" },
    { id: 14, title: "14. Admin Dashboard (Optional)", desc: "EOC fleet overview, stats & dispatch audit" }
  ];

  return (
    <div style={{ maxWidth: "1600px", margin: "0 auto", padding: "16px 20px" }}>
      
      {/* Top Banner Matching Mockup */}
      <div style={{
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "16px 24px",
        marginBottom: "20px",
        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "16px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* Blue Shield Logo with Medical Cross */}
          <div style={{
            width: "46px",
            height: "46px",
            borderRadius: "12px",
            background: "#2563eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.35)",
            position: "relative"
          }}>
            <Shield size={28} fill="#2563eb" color="white" />
            <span style={{
              position: "absolute",
              fontWeight: "900",
              fontSize: "20px",
              color: "white",
              lineHeight: 1,
              marginTop: "-1px"
            }}>+</span>
          </div>

          <div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: "800", color: "#0f172a", letterSpacing: "-0.02em" }}>
              Hyperlocal Emergency Response Platform
            </h1>
            <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: "600" }}>
              Report • Connect • Respond • Save Lives
            </div>
          </div>
        </div>

        {/* Right Tagline */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "#334155" }}>
            Safer Communities | Faster Response | Stronger Together
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "6px", justifyContent: "flex-end" }}>
            <button
              onClick={() => setSelectedScreen(null)}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: selectedScreen === null ? "#2563eb" : "#ffffff",
                color: selectedScreen === null ? "#ffffff" : "#475569",
                fontSize: "0.78rem",
                fontWeight: "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <Layers size={14} /> 14-Screen Overview Grid
            </button>
            <button
              onClick={onSwitchToLiveView}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                border: "none",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "white",
                fontSize: "0.78rem",
                fontWeight: "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)"
              }}
            >
              <Sparkles size={14} /> Launch Live Interactive App
            </button>
          </div>
        </div>
      </div>

      {/* Screen Quick Selector Pills */}
      <div style={{
        display: "flex",
        gap: "6px",
        overflowX: "auto",
        paddingBottom: "10px",
        marginBottom: "20px"
      }}>
        <button
          onClick={() => setSelectedScreen(null)}
          style={{
            padding: "6px 12px",
            borderRadius: "20px",
            border: selectedScreen === null ? "2px solid #2563eb" : "1px solid #cbd5e1",
            background: selectedScreen === null ? "#eff6ff" : "#ffffff",
            color: selectedScreen === null ? "#1d4ed8" : "#64748b",
            fontSize: "0.75rem",
            fontWeight: "700",
            whiteSpace: "nowrap",
            cursor: "pointer"
          }}
        >
          All 14 Screens Grid
        </button>
        {screens.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedScreen(s.id)}
            style={{
              padding: "6px 12px",
              borderRadius: "20px",
              border: selectedScreen === s.id ? "2px solid #2563eb" : "1px solid #e2e8f0",
              background: selectedScreen === s.id ? "#2563eb" : "#ffffff",
              color: selectedScreen === s.id ? "#ffffff" : "#475569",
              fontSize: "0.75rem",
              fontWeight: "600",
              whiteSpace: "nowrap",
              cursor: "pointer"
            }}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/* RENDER VIEW: OVERVIEW GRID OR SINGLE SCREEN */}
      {selectedScreen === null ? (
        /* 14-Screen Storyboard Grid */
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "20px"
        }}>
          {screens.map(s => (
            <div
              key={s.id}
              className="story-card"
              style={{
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                border: "1px solid #cbd5e1",
                background: "#ffffff"
              }}
            >
              {/* Card Header */}
              <div style={{
                padding: "10px 14px",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: "800", color: "#0f172a" }}>
                    {s.title}
                  </h3>
                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{s.desc}</div>
                </div>
                <button
                  onClick={() => setSelectedScreen(s.id)}
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#2563eb",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "0.7rem",
                    fontWeight: "700",
                    cursor: "pointer"
                  }}
                >
                  Expand ↗
                </button>
              </div>

              {/* Screen Preview Body */}
              <div style={{ padding: "14px", flex: 1, minHeight: "360px", background: "#f0f4f8", display: "flex", flexDirection: "column" }}>
                <ScreenRenderer id={s.id} onSelectRole={onSelectRole} onSwitchToLiveView={onSwitchToLiveView} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Single Expanded Screen View */
        <div className="story-card" style={{ padding: "24px", background: "#ffffff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid #e2e8f0", paddingBottom: "14px" }}>
            <div>
              <h2 style={{ fontSize: "1.4rem", fontWeight: "800", color: "#0f172a" }}>
                {screens.find(s => s.id === selectedScreen)?.title}
              </h2>
              <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
                {screens.find(s => s.id === selectedScreen)?.desc}
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setSelectedScreen(prev => (prev > 1 ? prev - 1 : 14))}
                className="btn-outline"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
              >
                ← Previous Screen
              </button>
              <button
                onClick={() => setSelectedScreen(prev => (prev < 14 ? prev + 1 : 1))}
                className="btn-outline"
                style={{ padding: "6px 12px", fontSize: "0.8rem" }}
              >
                Next Screen →
              </button>
              <button
                onClick={() => setSelectedScreen(null)}
                className="btn-primary-blue"
                style={{ padding: "6px 14px", fontSize: "0.8rem" }}
              >
                View Grid
              </button>
            </div>
          </div>

          <div style={{ background: "#f0f4f8", padding: "20px", borderRadius: "12px", minHeight: "500px" }}>
            <ScreenRenderer id={selectedScreen} onSelectRole={onSelectRole} onSwitchToLiveView={onSwitchToLiveView} isFullView={true} />
          </div>
        </div>
      )}

      {/* Bottom Features & Tech Stack Footer Bar Matching Mockup */}
      <div style={{
        marginTop: "30px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "18px 24px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "20px",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)"
      }}>
        {/* Core Features */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#2563eb", fontWeight: "800", fontSize: "0.85rem", marginBottom: "6px" }}>
            <CheckCircle2 size={16} /> Core Features (Round 1)
          </div>
          <ul style={{ listStyle: "none", fontSize: "0.78rem", color: "#475569", lineHeight: "1.6" }}>
            <li>• Login & Role-Based Dashboards</li>
            <li>• Emergency Reporting & Location Capture</li>
            <li>• Nearby Responder Matching & Accept/Reject</li>
            <li>• Map & Route Navigation with Status Tracking</li>
          </ul>
        </div>

        {/* Optional Features */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#059669", fontWeight: "800", fontSize: "0.85rem", marginBottom: "6px" }}>
            <Sparkles size={16} /> Optional Features (Included)
          </div>
          <ul style={{ listStyle: "none", fontSize: "0.78rem", color: "#475569", lineHeight: "1.6" }}>
            <li>• Voice Input & Multilingual Speech Translation</li>
            <li>• Emergency Danger Checklist & Smart Triage</li>
            <li>• Offline 112 Contacts & IndexedDB Report Sync</li>
            <li>• Live Location Updates & Admin EOC Dashboard</li>
          </ul>
        </div>

        {/* Tech Stack */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#7c3aed", fontWeight: "800", fontSize: "0.85rem", marginBottom: "6px" }}>
            <Layers size={16} /> Tech Stack
          </div>
          <div style={{ fontSize: "0.78rem", color: "#475569", lineHeight: "1.6" }}>
            React + Vite + Tailwind • Leaflet + OpenStreetMap • OSRM Routing • SQLite + WebSockets • IndexedDB (Offline) • Speech & Translation APIs
          </div>
        </div>

        {/* Demo Accounts */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#0f172a", fontWeight: "800", fontSize: "0.85rem", marginBottom: "6px" }}>
            <User size={16} /> Demo Credentials
          </div>
          <div style={{ fontSize: "0.78rem", color: "#475569", lineHeight: "1.6" }}>
            <div>🧑 <strong>Citizen:</strong> <code>citizen@demo.com</code> / <code>123456</code></div>
            <div>🚑 <strong>Responder:</strong> <code>responder@demo.com</code> / <code>123456</code></div>
            <div>🛡️ <strong>Admin:</strong> <code>admin@demo.com</code> / <code>123456</code></div>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ================= COMPONENT: SCREEN RENDERER ================= */
function ScreenRenderer({ id, onSelectRole, onSwitchToLiveView, isFullView }) {
  switch (id) {
    case 1:
      return <Screen1Login />;
    case 2:
      return <Screen2RoleSelect onSelectRole={onSelectRole} />;
    case 3:
      return <Screen3CitizenDashboard />;
    case 4:
      return <Screen4ReportForm />;
    case 5:
      return <Screen5LocationCapture />;
    case 6:
      return <Screen6VoiceTranslation />;
    case 7:
      return <Screen7SubmitConfirmation />;
    case 8:
      return <Screen8ResponderDashboard />;
    case 9:
      return <Screen9RouteNavigation />;
    case 10:
      return <Screen10CitizenTracking />;
    case 11:
      return <Screen11EmergencyContacts />;
    case 12:
      return <Screen12OfflineStorage />;
    case 13:
      return <Screen13ResolvedIncident />;
    case 14:
      return <Screen14AdminDashboard />;
    default:
      return <div>Screen not found</div>;
  }
}

/* ================= 1. LOGIN / REGISTER SCREEN ================= */
function Screen1Login() {
  const [tab, setTab] = useState("login");
  return (
    <div style={{
      background: "#ffffff",
      borderRadius: "12px",
      overflow: "hidden",
      border: "1px solid #e2e8f0",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      minHeight: "340px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
    }}>
      {/* Left dark image panel */}
      <div style={{
        background: "linear-gradient(135deg, #090e1a 0%, #172554 100%)",
        color: "white",
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative"
      }}>
        <div>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            background: "#2563eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            marginBottom: "14px",
            position: "relative"
          }}>
            <Shield size={22} fill="#2563eb" color="white" />
            <span style={{ position: "absolute", fontWeight: "900", fontSize: "16px" }}>+</span>
          </div>
          <div style={{ fontSize: "1rem", fontWeight: "800", lineHeight: "1.2", marginBottom: "6px" }}>
            Hyperlocal Emergency Response Platform
          </div>
          <div style={{ fontSize: "0.75rem", color: "#93c5fd" }}>
            Your safety, our priority.
          </div>
        </div>

        {/* Emergency ambulance art mockup */}
        <div style={{
          background: "rgba(255,255,255,0.06)",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.1)",
          fontSize: "0.7rem",
          color: "#cbd5e1"
        }}>
          🚨 24/7 Rapid Medical, Fire & Police Coordination
        </div>
      </div>

      {/* Right form */}
      <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", marginBottom: "14px" }}>
          <button
            onClick={() => setTab("login")}
            style={{
              flex: 1,
              padding: "4px",
              border: "none",
              borderRadius: "6px",
              fontWeight: "700",
              fontSize: "0.75rem",
              background: tab === "login" ? "#ffffff" : "transparent",
              color: tab === "login" ? "#0f172a" : "#64748b",
              boxShadow: tab === "login" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              cursor: "pointer"
            }}
          >
            Login
          </button>
          <button
            onClick={() => setTab("register")}
            style={{
              flex: 1,
              padding: "4px",
              border: "none",
              borderRadius: "6px",
              fontWeight: "700",
              fontSize: "0.75rem",
              background: tab === "register" ? "#ffffff" : "transparent",
              color: tab === "register" ? "#0f172a" : "#64748b",
              boxShadow: tab === "register" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              cursor: "pointer"
            }}
          >
            Register
          </button>
        </div>

        <div style={{ fontSize: "1.1rem", fontWeight: "800", color: "#0f172a", marginBottom: "2px" }}>
          Welcome Back!
        </div>
        <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "12px" }}>
          Sign in to continue
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
          <input
            type="email"
            defaultValue="priya@example.com"
            style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem" }}
          />
          <input
            type="password"
            defaultValue="password123"
            style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "#64748b", marginBottom: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input type="checkbox" defaultChecked /> Remember me
          </label>
          <span style={{ color: "#2563eb", fontWeight: "600", cursor: "pointer" }}>Forgot password?</span>
        </div>

        <button className="btn-primary-blue" style={{ width: "100%", padding: "8px", fontSize: "0.85rem", borderRadius: "6px" }}>
          Login
        </button>

        <div style={{ textAlign: "center", fontSize: "0.72rem", color: "#64748b", marginTop: "10px" }}>
          New here? <span style={{ color: "#2563eb", fontWeight: "700", cursor: "pointer" }}>Create an account</span>
        </div>
      </div>
    </div>
  );
}

/* ================= 2. ROLE SELECTION SCREEN ================= */
function Screen2RoleSelect({ onSelectRole }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 0" }}>
      <h3 style={{ fontSize: "1.2rem", fontWeight: "800", color: "#0f172a", marginBottom: "4px" }}>
        Select Your Role
      </h3>
      <p style={{ color: "#64748b", fontSize: "0.78rem", marginBottom: "16px" }}>
        Choose how you want to use the platform
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {/* Citizen Card */}
        <div style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "16px 12px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between"
        }}>
          <div>
            <div style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "#eff6ff",
              color: "#2563eb",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "10px"
            }}>
              <User size={22} />
            </div>
            <div style={{ fontSize: "1rem", fontWeight: "800", color: "#0f172a", marginBottom: "4px" }}>
              Citizen
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b", lineHeight: "1.4", marginBottom: "14px" }}>
              Report emergencies, track incidents and access emergency contacts.
            </div>
          </div>
          <button
            onClick={() => onSelectRole && onSelectRole("citizen")}
            className="btn-primary-blue"
            style={{ width: "100%", padding: "8px", fontSize: "0.8rem", borderRadius: "6px" }}
          >
            Continue
          </button>
        </div>

        {/* Responder Card */}
        <div style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "16px 12px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between"
        }}>
          <div>
            <div style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "#ecfdf5",
              color: "#059669",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "10px"
            }}>
              <Shield size={22} />
            </div>
            <div style={{ fontSize: "1rem", fontWeight: "800", color: "#0f172a", marginBottom: "4px" }}>
              Responder
            </div>
            <div style={{ fontSize: "0.72rem", color: "#64748b", lineHeight: "1.4", marginBottom: "14px" }}>
              View and accept incidents, update status and navigate to locations.
            </div>
          </div>
          <button
            onClick={() => onSelectRole && onSelectRole("ambulance")}
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "0.8rem",
              borderRadius: "6px",
              background: "#16a34a",
              color: "white",
              border: "none",
              fontWeight: "700",
              cursor: "pointer"
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= 3. CITIZEN DASHBOARD ================= */
function Screen3CitizenDashboard() {
  return (
    <div style={{ display: "flex", gap: "10px", height: "100%" }}>
      {/* Mini Sidebar */}
      <div style={{ width: "100px", background: "#0f172a", borderRadius: "8px", padding: "10px 8px", color: "white", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "0.68rem", fontWeight: "800", color: "#60a5fa", marginBottom: "12px", lineHeight: "1.1" }}>
            + Hyperlocal Emergency
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.65rem", color: "#94a3b8" }}>
            <div style={{ background: "#2563eb", color: "white", padding: "4px 6px", borderRadius: "4px" }}>Home</div>
            <div style={{ color: "#f87171" }}>Report</div>
            <div>Incidents</div>
            <div>Contacts</div>
            <div>Offline</div>
            <div>Profile</div>
          </div>
        </div>
        <div style={{ fontSize: "0.65rem", color: "#64748b" }}>Logout</div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Top greeting */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: "800", color: "#0f172a" }}>Hello, Priya! 👋</div>
            <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Stay safe. We are here to help.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", fontWeight: "700", color: "#334155" }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>P</div>
            <span>Priya</span>
          </div>
        </div>

        {/* 3 Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
          <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: "800", color: "#ef4444" }}>1</div>
            <div style={{ fontSize: "0.65rem", color: "#64748b" }}>Active Incident</div>
          </div>
          <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: "800", color: "#2563eb" }}>3</div>
            <div style={{ fontSize: "0.65rem", color: "#64748b" }}>Past Incidents</div>
          </div>
          <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: "800", color: "#f97316" }}>0</div>
            <div style={{ fontSize: "0.65rem", color: "#64748b" }}>Offline Reports</div>
          </div>
        </div>

        {/* Big Red Button */}
        <button className="btn-emergency-main" style={{ padding: "8px", fontSize: "0.85rem", width: "100%", borderRadius: "6px" }}>
          + Report Emergency
        </button>

        {/* Recent Incidents */}
        <div style={{ background: "#ffffff", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", fontWeight: "700", color: "#0f172a", marginBottom: "6px" }}>
            <span>Recent Incidents</span>
            <span style={{ color: "#2563eb", cursor: "pointer" }}>View All ›</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "6px 8px", borderRadius: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <MapPin size={14} color="#ef4444" />
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#0f172a" }}>INC-2025-001</div>
                <div style={{ fontSize: "0.65rem", color: "#64748b" }}>Road Accident • 2 mins ago</div>
              </div>
            </div>
            <span className="badge-status badge-assigned" style={{ fontSize: "0.65rem" }}>Assigned</span>
          </div>
        </div>

        {/* Quick Access */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
          <div style={{ background: "#ffffff", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.7rem" }}>
            <div style={{ fontWeight: "700", color: "#0f172a" }}>Emergency Contacts</div>
            <div style={{ color: "#2563eb", fontSize: "0.65rem" }}>View Contacts</div>
          </div>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "8px", borderRadius: "6px", fontSize: "0.7rem", color: "#b91c1c" }}>
            <div style={{ fontWeight: "800" }}>Emergency Call 112</div>
            <div style={{ fontSize: "0.65rem" }}>India Unified SOS</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= 4. REPORT EMERGENCY FORM ================= */
function Screen4ReportForm() {
  const [selectedType, setSelectedType] = useState("Medical Emergency");
  const types = [
    { label: "Medical Emergency", icon: HeartPulse },
    { label: "Road Accident", icon: Activity },
    { label: "Fire", icon: Flame },
    { label: "Crime / Safety", icon: Shield },
    { label: "Other", icon: AlertTriangle }
  ];

  return (
    <div style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div>
        <div style={{ fontSize: "1rem", fontWeight: "800", color: "#0f172a" }}>Report an Emergency</div>
        <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Fill in the details below. You can also use voice input.</div>
      </div>

      <div>
        <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>Emergency Type</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "4px" }}>
          {types.map(t => {
            const Icon = t.icon;
            const isSel = selectedType === t.label;
            return (
              <button
                key={t.label}
                onClick={() => setSelectedType(t.label)}
                style={{
                  padding: "6px 2px",
                  borderRadius: "6px",
                  border: isSel ? "2px solid #2563eb" : "1px solid #e2e8f0",
                  background: isSel ? "#eff6ff" : "#ffffff",
                  fontSize: "0.62rem",
                  fontWeight: "700",
                  color: isSel ? "#1d4ed8" : "#475569",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "2px",
                  cursor: "pointer"
                }}
              >
                <Icon size={14} color={isSel ? "#2563eb" : "#64748b"} />
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>{t.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>Description</div>
        <div style={{ position: "relative" }}>
          <textarea
            placeholder="Describe what happened..."
            rows={2}
            defaultValue="A road accident occurred. Two people are injured."
            style={{ width: "100%", padding: "6px 32px 6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.75rem" }}
          />
          <button style={{ position: "absolute", right: "6px", top: "8px", background: "#2563eb", border: "none", borderRadius: "4px", padding: "4px", color: "white", cursor: "pointer" }}>
            <Mic size={12} />
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: "0.72rem", fontWeight: "700", color: "#64748b", marginBottom: "4px" }}>Checklist (optional)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "0.68rem", color: "#475569" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}><input type="checkbox" defaultChecked /> Injuries reported</label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}><input type="checkbox" /> Fire or smoke</label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}><input type="checkbox" defaultChecked /> Person unconscious</label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}><input type="checkbox" /> Person trapped</label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}><input type="checkbox" defaultChecked /> Vehicle accident</label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}><input type="checkbox" /> Immediate danger</label>
        </div>
      </div>

      <div style={{ textAlign: "right", marginTop: "4px" }}>
        <button className="btn-primary-blue" style={{ padding: "6px 14px", fontSize: "0.78rem" }}>
          Next: Location ›
        </button>
      </div>
    </div>
  );
}

/* ================= 5. LOCATION CAPTURE ================= */
function Screen5LocationCapture() {
  return (
    <div style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "1rem", fontWeight: "800", color: "#0f172a" }}>Incident Location</div>
          <div style={{ fontSize: "0.72rem", color: "#64748b" }}>GPS coordinates captured</div>
        </div>
        <button className="btn-outline" style={{ padding: "4px 8px", fontSize: "0.7rem" }}>
          Change Location
        </button>
      </div>

      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "6px 10px", borderRadius: "6px", fontSize: "0.72rem", color: "#166534" }}>
        <strong>Location detected:</strong> Lat: 17.3850, Lng: 78.4867
      </div>

      {/* Map visual preview */}
      <div style={{ height: "160px", borderRadius: "6px", overflow: "hidden", border: "1px solid #cbd5e1" }}>
        <MapComponent height="160px" center={[17.3850, 78.4867]} zoom={14} incidentLocation={{ lat: 17.3850, lng: 78.4867 }} incidentLabel="Incident Pin" />
      </div>

      <div>
        <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "2px" }}>Address (optional)</div>
        <input
          type="text"
          defaultValue="SRKR Engineering College, Bhimavaram"
          style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.75rem" }}
        />
      </div>

      <div style={{ textAlign: "right" }}>
        <button className="btn-primary-blue" style={{ padding: "6px 14px", fontSize: "0.78rem" }}>
          Next ›
        </button>
      </div>
    </div>
  );
}

/* ================= 6. VOICE INPUT & TRANSLATION ================= */
function Screen6VoiceTranslation() {
  return (
    <div style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: "1rem", fontWeight: "800", color: "#0f172a", marginBottom: "12px" }}>
        Voice Input
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
        {/* Left waveform animation */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "4px", height: "40px", marginBottom: "8px" }}>
            <div className="wave-bar" style={{ height: "24px", animationDelay: "0s" }} />
            <div className="wave-bar" style={{ height: "36px", animationDelay: "0.2s" }} />
            <div className="wave-bar" style={{ height: "28px", animationDelay: "0.4s" }} />
            <div className="wave-bar" style={{ height: "32px", animationDelay: "0.1s" }} />
            <div className="wave-bar" style={{ height: "20px", animationDelay: "0.3s" }} />
          </div>
          <div style={{ fontSize: "0.8rem", fontWeight: "700", color: "#2563eb" }}>Listening...</div>
          <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Detecting language...</div>
        </div>

        {/* Right translation card */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "8px", borderRadius: "6px" }}>
            <div style={{ fontSize: "0.68rem", fontWeight: "700", color: "#1d4ed8" }}>Detected: Telugu</div>
            <div style={{ fontSize: "0.68rem", color: "#64748b" }}>Original (Telugu):</div>
            <div style={{ fontSize: "0.78rem", fontWeight: "600", color: "#0f172a" }}>
              రోడ్డు ప్రమాదం జరిగింది. ఇద్దరికీ గాయాలయ్యాయి.
            </div>
          </div>

          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "8px", borderRadius: "6px" }}>
            <div style={{ fontSize: "0.68rem", fontWeight: "700", color: "#166534" }}>Translated (English):</div>
            <div style={{ fontSize: "0.78rem", fontWeight: "600", color: "#0f172a" }}>
              A road accident occurred. Two people are injured.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
        <button className="btn-outline" style={{ padding: "6px 10px", fontSize: "0.75rem" }}>Cancel</button>
        <button className="btn-primary-blue" style={{ padding: "6px 12px", fontSize: "0.75rem" }}>Use Translation</button>
      </div>
    </div>
  );
}

/* ================= 7. SUBMIT CONFIRMATION ================= */
function Screen7SubmitConfirmation() {
  return (
    <div style={{ background: "#ffffff", padding: "20px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
      <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "10px" }}>
        <CheckCircle2 size={30} />
      </div>

      <div style={{ fontSize: "1.1rem", fontWeight: "800", color: "#0f172a", marginBottom: "4px" }}>
        Emergency Reported Successfully!
      </div>
      <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "16px" }}>
        Incident ID: <strong>INC-2025-001</strong>
      </div>

      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px", textAlign: "left", marginBottom: "16px", fontSize: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
          <span style={{ color: "#64748b" }}>Type:</span>
          <span style={{ fontWeight: "700" }}>Road Accident</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#64748b" }}>Status:</span>
          <span className="badge-status badge-reported" style={{ fontSize: "0.68rem" }}>Reported</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <button className="btn-primary-blue" style={{ padding: "8px", fontSize: "0.8rem", width: "100%" }}>
          View My Incident
        </button>
        <button className="btn-outline" style={{ padding: "6px", fontSize: "0.75rem", width: "100%", border: "none", color: "#64748b" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

/* ================= 8. RESPONDER DASHBOARD ================= */
function Screen8ResponderDashboard() {
  const nearby = [
    { id: "INC-2025-001", type: "Road Accident", dist: "2.1 km • 5 mins" },
    { id: "INC-2025-005", type: "Medical Emergency", dist: "3.4 km • 8 mins" },
    { id: "INC-2025-006", type: "Fire", dist: "5.2 km • 12 mins" }
  ];

  return (
    <div style={{ display: "flex", gap: "10px", height: "100%" }}>
      {/* Mini Sidebar */}
      <div style={{ width: "90px", background: "#0f172a", borderRadius: "8px", padding: "10px 6px", color: "white", display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: "0.65rem" }}>
        <div>
          <div style={{ fontSize: "0.68rem", fontWeight: "800", color: "#60a5fa", marginBottom: "10px" }}>+ Hyperlocal</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", color: "#94a3b8" }}>
            <div style={{ background: "#2563eb", color: "white", padding: "3px 4px", borderRadius: "4px" }}>Home</div>
            <div>Incidents</div>
            <div>Duties</div>
            <div>Profile</div>
          </div>
        </div>
        <div style={{ color: "#64748b" }}>Logout</div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "0.95rem", fontWeight: "800", color: "#0f172a" }}>Nearby Incidents</div>
          <div style={{ fontSize: "0.7rem", fontWeight: "700", color: "#334155" }}>Ravi Responder</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {nearby.map(n => (
            <div key={n.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "#2563eb", fontFamily: "monospace" }}>{n.id}</span>
                <span style={{ fontSize: "0.68rem", color: "#64748b" }}>{n.dist}</span>
              </div>
              <div style={{ fontSize: "0.8rem", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
                {n.type}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button style={{ flex: 1, padding: "6px", background: "#ef4444", color: "white", border: "none", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "700", cursor: "pointer" }}>
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= 9. ROUTE NAVIGATION (RESPONDER) ================= */
function Screen9RouteNavigation() {
  return (
    <div style={{ background: "#ffffff", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Incident Details Card */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: "800", color: "#2563eb", fontFamily: "monospace" }}>INC-2025-001</span>
          <span className="badge-status badge-assigned" style={{ fontSize: "0.65rem" }}>En Route</span>
        </div>
        <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "#0f172a" }}>Road Accident</div>
        <div style={{ fontSize: "0.7rem", color: "#64748b" }}>SRKR Engineering College, Bhimavaram</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid #e2e8f0", fontSize: "0.72rem" }}>
          <span>Distance: <strong>2.1 km</strong></span>
          <span>ETA: <strong>5 mins</strong></span>
        </div>
      </div>

      <button className="btn-primary-blue" style={{ width: "100%", padding: "8px", fontSize: "0.8rem" }}>
        <Navigation size={14} /> Start Navigation
      </button>

      {/* Route Map */}
      <div style={{ height: "160px", borderRadius: "6px", overflow: "hidden", border: "1px solid #cbd5e1" }}>
        <MapComponent
          height="160px"
          center={[17.3850, 78.4867]}
          incidentLocation={{ lat: 17.3850, lng: 78.4867 }}
          responderLocation={{ lat: 17.3950, lng: 78.4950 }}
          routeCoordinates={[[17.3950, 78.4950], [17.3900, 78.4900], [17.3850, 78.4867]]}
        />
      </div>
    </div>
  );
}

/* ================= 10. CITIZEN TRACKING VIEW ================= */
function Screen10CitizenTracking() {
  const steps = [
    { label: "Reported", time: "10:34 AM", done: true },
    { label: "Assigned", time: "10:36 AM", done: true },
    { label: "Acknowledged", time: "10:38 AM", done: true },
    { label: "En Route", time: "10:39 AM", active: true },
    { label: "On Scene", time: "Pending" },
    { label: "Resolved", time: "Pending" }
  ];

  return (
    <div style={{ background: "#ffffff", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      {/* Left Timeline */}
      <div>
        <div style={{ fontSize: "0.85rem", fontWeight: "800", color: "#0f172a", marginBottom: "2px" }}>Incident Status</div>
        <div style={{ fontSize: "0.72rem", color: "#2563eb", fontFamily: "monospace", marginBottom: "8px" }}>INC-2025-001 • Road Accident</div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {steps.map((s, idx) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.7rem" }}>
              <div style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                background: s.done ? "#16a34a" : s.active ? "#2563eb" : "#e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "9px"
              }}>
                {s.done ? "✓" : ""}
              </div>
              <span style={{ fontWeight: s.active ? "800" : "500", color: s.active ? "#2563eb" : "#334155" }}>{s.label}</span>
              <span style={{ color: "#94a3b8", marginLeft: "auto", fontSize: "0.65rem" }}>{s.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Map & Unit Details */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ height: "130px", borderRadius: "6px", overflow: "hidden", border: "1px solid #cbd5e1" }}>
          <MapComponent
            height="130px"
            center={[17.3850, 78.4867]}
            incidentLocation={{ lat: 17.3850, lng: 78.4867 }}
            responderLocation={{ lat: 17.3910, lng: 78.4910 }}
            routeCoordinates={[[17.3910, 78.4910], [17.3880, 78.4890], [17.3850, 78.4867]]}
          />
        </div>

        <div style={{ background: "#f8fafc", padding: "6px 8px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.68rem" }}>
          <div style={{ fontWeight: "700", color: "#0f172a" }}>Responder: Ambulance KA-01-AB-1234</div>
          <div style={{ color: "#2563eb", fontWeight: "600" }}>ETA: ~5 mins</div>
        </div>
      </div>
    </div>
  );
}

/* ================= 11. EMERGENCY CONTACTS (OFFLINE) ================= */
function Screen11EmergencyContacts() {
  const contacts = [
    { title: "SRKR Hospital Ambulance", phone: "+91 98765 43210", dist: "1.2 km" },
    { title: "Bhimavaram Police Station", phone: "+91 98480 12345", dist: "2.8 km" },
    { title: "Fire Station", phone: "+91 94400 67890", dist: "3.5 km" }
  ];

  return (
    <div style={{ background: "#ffffff", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "0.95rem", fontWeight: "800", color: "#0f172a" }}>Emergency Contacts</div>
          <div style={{ fontSize: "0.65rem", color: "#64748b" }}>Last updated: 10 Nov 2025, 10:00 AM</div>
        </div>
        <span style={{ background: "#fef3c7", color: "#b45309", fontSize: "0.65rem", fontWeight: "700", padding: "2px 6px", borderRadius: "4px" }}>
          Offline Mode
        </span>
      </div>

      {/* Red 112 Banner */}
      <div style={{ background: "#ef4444", color: "white", padding: "8px 12px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "0.65rem", opacity: 0.9 }}>Unified Hotline</div>
          <div style={{ fontSize: "1.1rem", fontWeight: "900" }}>112 Emergency Call</div>
        </div>
        <PhoneCall size={20} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {contacts.map((c, i) => (
          <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "6px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#0f172a" }}>{c.title}</div>
              <div style={{ fontSize: "0.68rem", color: "#2563eb" }}>{c.phone} • {c.dist}</div>
            </div>
            <a href={`tel:${c.phone}`} style={{ background: "#16a34a", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "0.68rem", fontWeight: "700", textDecoration: "none" }}>
              Call
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= 12. OFFLINE REPORT STORAGE ================= */
function Screen12OfflineStorage() {
  return (
    <div style={{ background: "#ffffff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
      <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#eff6ff", color: "#2563eb", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
        <CloudOff size={24} />
      </div>

      <div style={{ fontSize: "1rem", fontWeight: "800", color: "#0f172a", marginBottom: "2px" }}>
        You are offline
      </div>
      <div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "12px", lineHeight: "1.3" }}>
        Your report has been saved locally and will be sent when you're back online.
      </div>

      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 10px", textAlign: "left", marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: "800", color: "#2563eb", fontFamily: "monospace" }}>INC-LOCAL-002</span>
          <span className="badge-status badge-en-route" style={{ fontSize: "0.65rem" }}>Pending</span>
        </div>
        <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "#0f172a" }}>Medical Emergency</div>
        <div style={{ fontSize: "0.65rem", color: "#64748b" }}>10 Nov 2025, 11:20 AM</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem" }}>
        <span style={{ color: "#64748b", fontWeight: "600" }}>Pending Reports (1)</span>
        <button className="btn-primary-blue" style={{ padding: "6px 12px", fontSize: "0.75rem" }}>
          Go Online to Sync
        </button>
      </div>
    </div>
  );
}

/* ================= 13. RESOLVED INCIDENT ================= */
function Screen13ResolvedIncident() {
  return (
    <div style={{ background: "#ffffff", padding: "18px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
      <div style={{ width: "46px", height: "46px", borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
        <CheckCircle2 size={28} />
      </div>

      <div style={{ fontSize: "1.1rem", fontWeight: "800", color: "#0f172a", marginBottom: "2px" }}>
        Incident Resolved!
      </div>
      <div style={{ fontSize: "0.8rem", fontWeight: "800", color: "#2563eb", fontFamily: "monospace" }}>
        INC-2025-001
      </div>
      <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "#334155" }}>
        Road Accident
      </div>
      <div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "14px" }}>
        Resolved at 11:42 AM
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <button className="btn-primary-blue" style={{ padding: "6px", fontSize: "0.75rem", width: "100%" }}>
          View Details
        </button>
        <button className="btn-outline" style={{ padding: "6px", fontSize: "0.72rem", width: "100%", border: "none", color: "#64748b" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

/* ================= 14. ADMIN DASHBOARD ================= */
function Screen14AdminDashboard() {
  const incidents = [
    { id: "INC-2025-001", type: "Road Accident", status: "En Route", time: "10:34 AM" },
    { id: "INC-2025-002", type: "Medical", status: "Assigned", time: "10:12 AM" },
    { id: "INC-2025-003", type: "Fire", status: "Reported", time: "09:45 AM" },
    { id: "INC-2025-004", type: "Crime", status: "Resolved", time: "08:30 AM" },
    { id: "INC-2025-005", type: "Medical", status: "Resolved", time: "07:15 AM" }
  ];

  return (
    <div style={{ display: "flex", gap: "8px", height: "100%" }}>
      {/* Sidebar */}
      <div style={{ width: "90px", background: "#0f172a", borderRadius: "8px", padding: "8px 6px", color: "white", display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: "0.62rem" }}>
        <div>
          <div style={{ fontSize: "0.68rem", fontWeight: "800", color: "#60a5fa", marginBottom: "8px" }}>+ Hyperlocal</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", color: "#94a3b8" }}>
            <div style={{ background: "#2563eb", color: "white", padding: "2px 4px", borderRadius: "4px" }}>Dashboard</div>
            <div>Incidents</div>
            <div>Responders</div>
            <div>Users</div>
            <div>Reports</div>
          </div>
        </div>
        <div style={{ color: "#64748b" }}>Logout</div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "800", color: "#0f172a" }}>Incident Overview</div>
          <div style={{ fontSize: "0.68rem", fontWeight: "700", color: "#334155" }}>Admin</div>
        </div>

        {/* 3 KPI Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "1rem", fontWeight: "800", color: "#2563eb" }}>5</div>
            <div style={{ fontSize: "0.6rem", color: "#64748b" }}>Total Incidents</div>
          </div>
          <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "1rem", fontWeight: "800", color: "#f97316" }}>3</div>
            <div style={{ fontSize: "0.6rem", color: "#64748b" }}>Ongoing</div>
          </div>
          <div style={{ background: "#ffffff", padding: "6px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "1rem", fontWeight: "800", color: "#16a34a" }}>2</div>
            <div style={{ fontSize: "0.6rem", color: "#64748b" }}>Resolved</div>
          </div>
        </div>

        {/* Mini Table */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "6px", fontSize: "0.65rem", overflowX: "auto" }}>
          <div style={{ fontWeight: "700", marginBottom: "4px", color: "#0f172a" }}>Recent Incidents</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ textAlign: "left", padding: "2px" }}>ID</th>
                <th style={{ textAlign: "left", padding: "2px" }}>Type</th>
                <th style={{ textAlign: "left", padding: "2px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "2px" }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(i => (
                <tr key={i.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "3px 2px", fontFamily: "monospace", color: "#2563eb", fontWeight: "700" }}>{i.id}</td>
                  <td style={{ padding: "3px 2px" }}>{i.type}</td>
                  <td style={{ padding: "3px 2px" }}>
                    <span style={{
                      padding: "1px 4px",
                      borderRadius: "4px",
                      fontSize: "0.6rem",
                      fontWeight: "700",
                      background: i.status === "Resolved" ? "#dcfce7" : i.status === "Assigned" ? "#dbeafe" : "#fef3c7",
                      color: i.status === "Resolved" ? "#15803d" : i.status === "Assigned" ? "#1d4ed8" : "#b45309"
                    }}>
                      {i.status}
                    </span>
                  </td>
                  <td style={{ padding: "3px 2px", color: "#64748b" }}>{i.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
