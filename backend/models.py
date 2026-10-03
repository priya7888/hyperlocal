from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    role = Column(String, default="citizen")  # "citizen", "responder", "admin"
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    responder_profile = relationship("ResponderProfile", back_populates="user", uselist=False)
    incidents = relationship("Incident", back_populates="citizen", foreign_keys="Incident.citizen_id")

class ResponderProfile(Base):
    __tablename__ = "responder_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    service_type = Column(String, nullable=False)  # "Ambulance", "Police", "Fire"
    is_available = Column(Boolean, default=True)
    latitude = Column(Float, nullable=False, default=12.9716)
    longitude = Column(Float, nullable=False, default=77.5946)
    vehicle_number = Column(String, nullable=True)
    badge_number = Column(String, nullable=True)
    organization_name = Column(String, default="City Emergency Services (Simulated)")
    last_ping = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="responder_profile")
    assigned_incidents = relationship("Incident", back_populates="assigned_responder", foreign_keys="Incident.assigned_responder_id")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, index=True)  # e.g., INC-2026-9812
    citizen_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    citizen_name = Column(String, nullable=False)
    citizen_phone = Column(String, nullable=True)
    
    emergency_type = Column(String, nullable=False)  # "Medical", "Road Accident", "Fire", "Crime/Personal Safety", "Other"
    suggested_responder_type = Column(String, nullable=False)  # "Ambulance", "Police", "Fire"
    urgency_level = Column(String, default="High")  # "Critical", "High", "Moderate"
    
    description = Column(Text, nullable=False)
    original_voice_transcript = Column(Text, nullable=True)
    checklist = Column(JSON, default=list)  # list of strings e.g. ["Injuries reported", "Person unconscious"]
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address_text = Column(String, nullable=True)
    location_accuracy = Column(Float, nullable=True)
    location_captured_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    
    status = Column(String, default="Reported")  # "Reported", "Assigned", "Acknowledged", "En Route", "On Scene", "Resolved", "Cancelled"
    assigned_responder_id = Column(Integer, ForeignKey("responder_profiles.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    citizen = relationship("User", back_populates="incidents", foreign_keys=[citizen_id])
    assigned_responder = relationship("ResponderProfile", back_populates="assigned_incidents", foreign_keys=[assigned_responder_id])
    updates = relationship("IncidentUpdate", back_populates="incident", cascade="all, delete-orphan", order_by="IncidentUpdate.timestamp.asc()")

class IncidentUpdate(Base):
    __tablename__ = "incident_updates"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    status = Column(String, nullable=False)
    note = Column(String, nullable=True)
    updated_by_name = Column(String, nullable=True)
    responder_lat = Column(Float, nullable=True)
    responder_lng = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    incident = relationship("Incident", back_populates="updates")

class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"

    id = Column(Integer, primary_key=True, index=True)
    service_type = Column(String, nullable=False)  # "Ambulance", "Police", "Fire", "Disaster", "General"
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    address = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    area = Column(String, nullable=True)
    is_verified = Column(Boolean, default=True)
    last_updated = Column(DateTime, default=datetime.utcnow)
