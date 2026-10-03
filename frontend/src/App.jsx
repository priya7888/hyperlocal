import React, { useState, useEffect } from "react";
import LandingPage from "./components/LandingPage";
import AuthModal from "./components/AuthModal";
import SosModal from "./components/SosModal";
import CitizenDashboard from "./components/CitizenDashboard";
import ResponderDashboard from "./components/ResponderDashboard";
import { authApi, removeDuplicateData } from "./services/api";

import OfflineEmergencyScreen from "./components/OfflineEmergencyScreen";

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
        <CitizenDashboard
          currentUser={currentUser}
          initialIncident={submittedIncident}
          onOpenSos={() => setIsSosOpen(true)}
          onLogout={handleLogout}
        />
      ) : currentView === "responder-dashboard" && currentUser ? (
        <ResponderDashboard
          currentUser={currentUser}
          onLogout={handleLogout}
        />
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
