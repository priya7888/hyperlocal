import React, { useState } from "react";
import { X, User, Shield, Lock, Phone, Mail, ArrowRight, HeartPulse, Flame, ShieldAlert } from "lucide-react";
import { authApi } from "../services/api";

export default function AuthModal({ isOpen, onClose, initialMode = "citizen-login", onAuthSuccess }) {
  // mode: 'citizen-login', 'citizen-register', 'responder-login'
  const [mode, setMode] = useState(initialMode === "responder-register" ? "responder-login" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    const validMode = initialMode === "responder-register" ? "responder-login" : initialMode;
    setMode(validMode);
    setErrorMsg("");

    // Default demo credentials
    if (validMode === "citizen-login") {
      setEmail("citizen@demo.com");
      setPassword("123456");
    } else if (validMode === "responder-login") {
      setEmail("ambulance1@demo.com");
      setPassword("password123");
    } else {
      setEmail("");
      setPassword("");
    }
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const selectDemoResponder = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMsg("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    try {
      if (mode === "citizen-login" || mode === "responder-login") {
        const res = await authApi.login(email, password);
        onAuthSuccess(res.user);
        onClose();
      } else if (mode === "citizen-register") {
        const res = await authApi.register({
          email,
          password,
          full_name: fullName,
          phone,
          role: "citizen"
        });
        onAuthSuccess(res.user);
        onClose();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || "Authentication failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const isRegister = mode === "citizen-register";
  const isResponder = mode === "responder-login";

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: "480px", padding: "26px", background: "#0e1424", border: isResponder ? "1px solid rgba(0, 255, 136, 0.4)" : "1px solid rgba(56,189,248,0.3)" }}>
        
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: "18px", right: "18px", background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            {isResponder ? (
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(0,255,136,0.15)", color: "#00ff88", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={18} />
              </div>
            ) : (
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(0,229,255,0.15)", color: "#00e5ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={18} />
              </div>
            )}
            <h2 style={{ fontSize: "1.3rem", fontWeight: "900", color: "#f8fafc", margin: 0 }}>
              {mode === "citizen-login" && "Citizen Sign In"}
              {mode === "citizen-register" && "Citizen Registration"}
              {mode === "responder-login" && "Authorized Responder Login"}
            </h2>
          </div>
          <div style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
            {isResponder
              ? "Official emergency responder access (Ambulance, Police, Fire)."
              : isRegister
              ? "Create your personal emergency profile."
              : "Sign in to view your reports and live GPS responder tracking."}
          </div>
        </div>

        {/* Role / Mode Quick Switcher Bar */}
        <div style={{ display: "grid", gridTemplateColumns: isResponder ? "1fr 1fr" : "1fr 1fr", gap: "6px", background: "rgba(15, 23, 42, 0.6)", padding: "4px", borderRadius: "10px", marginBottom: "16px" }}>
          {!isResponder ? (
            <>
              <button
                type="button"
                onClick={() => setMode("citizen-login")}
                style={{
                  padding: "8px",
                  borderRadius: "8px",
                  border: "none",
                  background: mode === "citizen-login" ? "rgba(0, 229, 255, 0.2)" : "transparent",
                  color: mode === "citizen-login" ? "#00e5ff" : "#94a3b8",
                  fontWeight: "700",
                  fontSize: "0.82rem",
                  cursor: "pointer"
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode("citizen-register")}
                style={{
                  padding: "8px",
                  borderRadius: "8px",
                  border: "none",
                  background: mode === "citizen-register" ? "rgba(0, 229, 255, 0.2)" : "transparent",
                  color: mode === "citizen-register" ? "#00e5ff" : "#94a3b8",
                  fontWeight: "700",
                  fontSize: "0.82rem",
                  cursor: "pointer"
                }}
              >
                Register
              </button>
            </>
          ) : (
            <div style={{ gridColumn: "1 / -1", padding: "6px 10px", fontSize: "0.75rem", color: "#00ff88", textAlign: "center", fontWeight: "700" }}>
              🔒 Authorized Responder Portal • Admin Pre-Assigned Units
            </div>
          )}
        </div>

        {/* Demo Fast-Select for Responders */}
        {isResponder && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: "700", marginBottom: "6px", textTransform: "uppercase" }}>
              Quick Select Official Unit:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
              <button
                type="button"
                onClick={() => selectDemoResponder("ambulance1@demo.com", "password123")}
                style={{
                  padding: "8px 4px",
                  borderRadius: "8px",
                  border: email === "ambulance1@demo.com" ? "1.5px solid #00ff88" : "1px solid rgba(255,255,255,0.1)",
                  background: email === "ambulance1@demo.com" ? "rgba(0,255,136,0.15)" : "rgba(30,41,59,0.5)",
                  color: "#f8fafc",
                  fontSize: "0.74rem",
                  fontWeight: "700",
                  cursor: "pointer"
                }}
              >
                🚑 Ambulance
              </button>
              <button
                type="button"
                onClick={() => selectDemoResponder("police1@demo.com", "password123")}
                style={{
                  padding: "8px 4px",
                  borderRadius: "8px",
                  border: email === "police1@demo.com" ? "1.5px solid #00e5ff" : "1px solid rgba(255,255,255,0.1)",
                  background: email === "police1@demo.com" ? "rgba(0,229,255,0.15)" : "rgba(30,41,59,0.5)",
                  color: "#f8fafc",
                  fontSize: "0.74rem",
                  fontWeight: "700",
                  cursor: "pointer"
                }}
              >
                🚓 Police
              </button>
              <button
                type="button"
                onClick={() => selectDemoResponder("fire1@demo.com", "password123")}
                style={{
                  padding: "8px 4px",
                  borderRadius: "8px",
                  border: email === "fire1@demo.com" ? "1.5px solid #ff334b" : "1px solid rgba(255,255,255,0.1)",
                  background: email === "fire1@demo.com" ? "rgba(255,51,75,0.15)" : "rgba(30,41,59,0.5)",
                  color: "#f8fafc",
                  fontSize: "0.74rem",
                  fontWeight: "700",
                  cursor: "pointer"
                }}
              >
                🚒 Fire
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div style={{ background: "rgba(255, 51, 75, 0.2)", border: "1px solid rgba(255, 51, 75, 0.4)", color: "#ff4d67", padding: "8px 12px", borderRadius: "8px", fontSize: "0.82rem", marginBottom: "14px" }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {isRegister && (
            <>
              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: "700", color: "#cbd5e1", display: "block", marginBottom: "4px" }}>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "#f8fafc", fontSize: "0.88rem" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: "700", color: "#cbd5e1", display: "block", marginBottom: "4px" }}>Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "#f8fafc", fontSize: "0.88rem" }}
                />
              </div>
            </>
          )}

          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: "700", color: "#cbd5e1", display: "block", marginBottom: "4px" }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@demo.com"
              required
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "#f8fafc", fontSize: "0.88rem" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: "700", color: "#cbd5e1", display: "block", marginBottom: "4px" }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(255,255,255,0.15)", color: "#f8fafc", fontSize: "0.88rem" }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={isResponder ? "btn-emergency-main" : "btn-primary-blue"}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "0.95rem",
              marginTop: "8px",
              background: isResponder ? "linear-gradient(135deg, #00ff88, #059669)" : undefined,
              color: isResponder ? "#070a12" : undefined
            }}
          >
            {isLoading ? "Authenticating..." : isRegister ? "Create Citizen Account" : isResponder ? "Enter Responder Console" : "Sign In"}
          </button>

        </form>

        {/* Bottom Switcher */}
        <div style={{ marginTop: "16px", textAlign: "center", fontSize: "0.78rem", color: "#94a3b8" }}>
          {isResponder ? (
            <span>Citizen user? <button onClick={() => setMode("citizen-login")} style={{ background: "transparent", border: "none", color: "#00e5ff", fontWeight: "700", cursor: "pointer" }}>Go to Citizen Sign In</button></span>
          ) : (
            <span>Official First Responder? <button onClick={() => setMode("responder-login")} style={{ background: "transparent", border: "none", color: "#00ff88", fontWeight: "700", cursor: "pointer" }}>Responder Login</button></span>
          )}
        </div>

      </div>
    </div>
  );
}
