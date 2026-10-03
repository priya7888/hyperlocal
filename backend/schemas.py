from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

class UserRegister(BaseModel):
    email: str
    password: str
    full_name: str
    phone: Optional[str] = None
    role: str = "citizen"  # "citizen", "responder", "admin"
    service_type: Optional[str] = None  # for responders: "Ambulance", "Police", "Fire"

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str]
    role: str
    service_type: Optional[str] = None
    responder_id: Optional[int] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class IncidentCreate(BaseModel):
    emergency_type: str  # "Medical", "Road Accident", "Fire", "Crime/Personal Safety", "Other"
    description: str
    checklist: List[str] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    incidentLatitude: Optional[float] = None
    incidentLongitude: Optional[float] = None
    location_accuracy: Optional[float] = None
    locationAccuracy: Optional[float] = None
    location_captured_at: Optional[datetime] = None
    locationCapturedAt: Optional[datetime] = None
    address: Optional[str] = None
    address_text: Optional[str] = None
    original_voice_transcript: Optional[str] = None

class IncidentUpdateStatus(BaseModel):
    status: str
    note: Optional[str] = None
    responder_lat: Optional[float] = None
    responder_lng: Optional[float] = None

class ResponderLocationUpdate(BaseModel):
    latitude: float
    longitude: float

class ResponderAvailabilityUpdate(BaseModel):
    is_available: bool

class IncidentUpdateOut(BaseModel):
    id: int
    status: str
    note: Optional[str]
    updated_by_name: Optional[str]
    responder_lat: Optional[float]
    responder_lng: Optional[float]
    timestamp: datetime

    class Config:
        from_attributes = True

class ResponderSummary(BaseModel):
    id: int
    user_id: int
    name: str
    service_type: str
    vehicle_number: Optional[str]
    organization_name: str
    latitude: float
    longitude: float
    distance_km: Optional[float] = None
    eta_minutes: Optional[int] = None

class IncidentOut(BaseModel):
    id: str
    citizen_id: int
    citizen_name: str
    citizen_phone: Optional[str]
    emergency_type: str
    suggested_responder_type: str
    urgency_level: str
    description: str
    original_voice_transcript: Optional[str]
    checklist: List[str]
    latitude: float
    longitude: float
    lat: Optional[float] = None
    lng: Optional[float] = None
    address_text: Optional[str] = None
    address: Optional[str] = None
    location_accuracy: Optional[float] = None
    location_captured_at: Optional[datetime] = None
    status: str
    assigned_responder_id: Optional[int]
    assigned_responder: Optional[ResponderSummary] = None
    distance_km: Optional[float] = None
    eta_minutes: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    updates: List[IncidentUpdateOut] = []

    class Config:
        from_attributes = True

class EmergencyContactOut(BaseModel):
    id: int
    service_type: str
    name: str
    phone: str
    address: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    area: Optional[str]
    is_verified: bool
    last_updated: datetime

    class Config:
        from_attributes = True

class TranslationRequest(BaseModel):
    text: str
    source_language: Optional[str] = "auto"

class TranslationResponse(BaseModel):
    original_text: str
    translated_text: str
    detected_language: str
