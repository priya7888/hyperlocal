import React, { useState, useEffect } from "react";
import LandingPage from "./components/LandingPage";
import AuthModal from "./components/AuthModal";
import SosModal from "./components/SosModal";
import CitizenDashboard from "./components/CitizenDashboard";
import ResponderDashboard from "./components/ResponderDashboard";
import { authApi, removeDuplicateData } from "./services/api";

import OfflineEmergencyScreen from "./components/OfflineEmergencyScreen";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Dashboard Error caught:", error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem("aegis_user");
    localStorage.removeItem("emergency_user");
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          background: "#070a12",
          color: "#f8fafc",
          textAlign: "center"
        }}>
          <div style={{
            maxWidth: "480px",
            background: "rgba(30, 41, 59, 0.7)",
            border: "1px solid rgba(255, 51, 75, 0.4)",
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.6)"
          }}>
            <h2 style={{ fontSize: "1.3rem", fontWeight: "900", color: "#ff4d67", marginBottom: "8px" }}>
              Session Recovery Notice
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "16px" }}>
              The dashboard encountered a temporary render issue. Tap below to reset and return to the home screen.
            </p>
            <button
              onClick={this.handleReset}
              style={{
                background: "linear-gradient(135deg, #00e5ff, #0284c7)",
                color: "#070a12",
                border: "none",
                borderRadius: "10px",
                padding: "12px 24px",
                fontWeight: "900",
                fontSize: "0.92rem",
                cursor: "pointer"
              }}
            >
              🔄 Reset & Return to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // Navigation views: 'landing' | 'citizen-dashboard' | 'responder-dashboard'
  const [currentView, setCurrentView] = useState("landing");
  
  // Network online/offline state
  const [isOffline, setIsOffline] = useState(false);
  
  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("citizen-login");

  // SOS Modal state
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [submittedIncident, setSubmittedIncident] = useState(null);

  useEffect(() => {
    // Online / offline event listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 1. Proactively purge any duplicate entries across localStorage on mount
    removeDuplicateData();

    // 2. Check if previously logged in user token exists
    const storedUser = localStorage.getItem("aegis_user") || localStorage.getItem("emergency_user");
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user && user.role) {
          setCurrentUser(user);
          if (user.role === "citizen") setCurrentView("citizen-dashboard");
          else if (user.role === "responder") setCurrentView("responder-dashboard");
          else setCurrentView("landing");
        }
      } catch (e) {
        localStorage.removeItem("aegis_user");
        localStorage.removeItem("emergency_user");
        setCurrentView("landing");
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleOpenAuth = (mode) => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    localStorage.setItem("aegis_user", JSON.stringify(user));
    if (user.role === "citizen") {
      setCurrentView("citizen-dashboard");
    } else if (user.role === "responder") {
      setCurrentView("responder-dashboard");
    } else {
      setCurrentView("landing");
    }
  };

  const handleContinueAsGuest = () => {
    const guestUser = {
      id: "guest_" + Date.now().toString(36),
      full_name: "Guest Citizen",
      role: "citizen",
      isGuest: true
    };
    setCurrentUser(guestUser);
    setCurrentView("citizen-dashboard");
  };

  const handleLogout = () => {
    authApi.logout();
    localStorage.removeItem("aegis_user");
    localStorage.removeItem("emergency_user");
    setCurrentUser(null);
    setSubmittedIncident(null);
    setCurrentView("landing");
  };

  const handleSosSubmitted = (incident) => {
    if (!currentUser) {
      const guestUser = {
        id: "guest_" + Date.now().toString(36),
        full_name: "Guest Citizen",
        role: "citizen",
        isGuest: true
      };
      setCurrentUser(guestUser);
    }
    setSubmittedIncident(incident);
    setCurrentView("citizen-dashboard");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#070a12", color: "#f8fafc" }}>
      
      {/* 0. Dedicated Offline Emergency Mode Screen when disconnected */}
      {isOffline ? (
        <OfflineEmergencyScreen
          onReconnect={() => setIsOffline(false)}
          onOpenOfflineReport={() => setIsSosOpen(true)}
        />
      ) : currentView === "citizen-dashboard" && currentUser ? (
        <ErrorBoundary onReset={handleLogout}>
          <CitizenDashboard
            currentUser={currentUser}
            initialIncident={submittedIncident}
            onOpenSos={() => setIsSosOpen(true)}
            onLogout={handleLogout}
          />
        </ErrorBoundary>
      ) : currentView === "responder-dashboard" && currentUser ? (
        <ErrorBoundary onReset={handleLogout}>
          <ResponderDashboard
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        </ErrorBoundary>
      ) : (
        /* Default Fallback View: Always render LandingPage */
        <LandingPage
          onContinueAsGuest={handleContinueAsGuest}
          onOpenCitizenLogin={() => handleOpenAuth("citizen-login")}
          onOpenCitizenRegister={() => handleOpenAuth("citizen-register")}
          onOpenResponderLogin={() => handleOpenAuth("responder-login")}
          onOpenResponderRegister={() => handleOpenAuth("responder-register")}
          onTriggerSos={() => setIsSosOpen(true)}
        />
      )}

      {/* Global Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Global SOS Emergency Form Modal (Requirement 2 & 3) */}
      <SosModal
        isOpen={isSosOpen}
        onClose={() => setIsSosOpen(false)}
        onSubmitted={handleSosSubmitted}
      />

    </div>
  );
}
