from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import random
from datetime import datetime

from database import engine, get_db, Base
import models
import schemas
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_role
)
from rule_engine import (
    calculate_haversine_distance, estimate_travel_time,
    classify_emergency, fetch_osrm_route
)
from translation import translate_to_english
from seed_data import seed_database

app = FastAPI(
    title="Hyperlocal Emergency Response Platform API",
    description="Emergency dispatch coordination, responder matching, and route tracking backend",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    seed_database()

# ================= AUTH ENDPOINTS =================

@app.post("/api/auth/register", response_model=schemas.Token)
def register(user_in: schemas.UserRegister, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = models.User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name,
        phone=user_in.phone,
        role=user_in.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    responder_id = None
    if user_in.role == "responder":
        service_type = user_in.service_type or "Ambulance"
        # Initial random simulated coord in city center
        profile = models.ResponderProfile(
            user_id=new_user.id,
            service_type=service_type,
            is_available=True,
            latitude=12.9716 + random.uniform(-0.015, 0.015),
            longitude=77.5946 + random.uniform(-0.015, 0.015),
            vehicle_number=f"DEMO-{random.randint(100, 999)}",
            badge_number=f"UNIT-{random.randint(10, 99)}"
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        responder_id = profile.id

    token = create_access_token({"sub": new_user.id})
    user_out = schemas.UserOut(
        id=new_user.id,
        email=new_user.email,
        full_name=new_user.full_name,
        phone=new_user.phone,
        role=new_user.role,
        service_type=user_in.service_type if user_in.role == "responder" else None,
        responder_id=responder_id
    )
    return {"access_token": token, "token_type": "bearer", "user": user_out}

@app.post("/api/auth/login", response_model=schemas.Token)
def login(login_in: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == login_in.email).first()
    if not user or not verify_password(login_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    responder_id = None
    service_type = None
    if user.role == "responder" and user.responder_profile:
        responder_id = user.responder_profile.id
        service_type = user.responder_profile.service_type

    token = create_access_token({"sub": user.id})
    user_out = schemas.UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role,
        service_type=service_type,
        responder_id=responder_id
    )
    return {"access_token": token, "token_type": "bearer", "user": user_out}

@app.get("/api/auth/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    responder_id = None
    service_type = None
    if current_user.role == "responder" and current_user.responder_profile:
        responder_id = current_user.responder_profile.id
        service_type = current_user.responder_profile.service_type
        
    return schemas.UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        phone=current_user.phone,
        role=current_user.role,
        service_type=service_type,
        responder_id=responder_id
    )

@app.post("/api/auth/demo-switch", response_model=schemas.Token)
def demo_switch(role: str = Query(..., description="Role to switch into: citizen, ambulance, police, fire, admin"), db: Session = Depends(get_db)):
    email_map = {
        "citizen": "citizen@demo.com",
        "ambulance": "ambulance@demo.com",
        "police": "police@demo.com",
        "fire": "fire@demo.com",
        "admin": "admin@demo.com"
    }
    target_email = email_map.get(role.lower())
    if not target_email:
        raise HTTPException(status_code=400, detail="Invalid demo role")
    
    user = db.query(models.User).filter(models.User.email == target_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Demo account not found")
    
    responder_id = None
    service_type = None
    if user.role == "responder" and user.responder_profile:
        responder_id = user.responder_profile.id
        service_type = user.responder_profile.service_type

    token = create_access_token({"sub": user.id})
    user_out = schemas.UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role,
        service_type=service_type,
        responder_id=responder_id
    )
    return {"access_token": token, "token_type": "bearer", "user": user_out}

# ================= INCIDENT ENDPOINTS =================

def format_incident(inc: models.Incident, current_responder_profile: Optional[models.ResponderProfile] = None) -> dict:
    assigned_summary = None
    dist = None
    eta = None
    
    if inc.assigned_responder:
        resp = inc.assigned_responder
        dist = calculate_haversine_distance(inc.latitude, inc.longitude, resp.latitude, resp.longitude)
        eta = estimate_travel_time(dist)
        assigned_summary = {
            "id": resp.id,
            "user_id": resp.user_id,
            "name": resp.user.full_name if resp.user else "Emergency Unit",
            "service_type": resp.service_type,
            "vehicle_number": resp.vehicle_number,
            "organization_name": resp.organization_name,
            "latitude": resp.latitude,
            "longitude": resp.longitude,
            "distance_km": dist,
            "eta_minutes": eta
        }
    elif current_responder_profile:
        # Distance relative to viewing responder
        dist = calculate_haversine_distance(inc.latitude, inc.longitude, current_responder_profile.latitude, current_responder_profile.longitude)
        eta = estimate_travel_time(dist)

    return {
        "id": inc.id,
        "citizen_id": inc.citizen_id,
        "citizen_name": inc.citizen_name,
        "citizen_phone": inc.citizen_phone,
        "emergency_type": inc.emergency_type,
        "suggested_responder_type": inc.suggested_responder_type,
        "urgency_level": inc.urgency_level,
        "description": inc.description,
        "original_voice_transcript": inc.original_voice_transcript,
        "checklist": inc.checklist or [],
        "latitude": inc.latitude,
        "longitude": inc.longitude,
        "lat": inc.latitude,
        "lng": inc.longitude,
        "address_text": inc.address_text,
        "address": inc.address_text,
        "location_accuracy": inc.location_accuracy,
        "location_captured_at": inc.location_captured_at,
        "status": inc.status,
        "assigned_responder_id": inc.assigned_responder_id,
        "assigned_responder": assigned_summary,
        "distance_km": dist,
        "eta_minutes": eta,
        "created_at": inc.created_at,
        "updated_at": inc.updated_at,
        "updates": [
            {
                "id": u.id,
                "status": u.status,
                "note": u.note,
                "updated_by_name": u.updated_by_name,
                "responder_lat": u.responder_lat,
                "responder_lng": u.responder_lng,
                "timestamp": u.timestamp
            } for u in inc.updates
        ]
    }

@app.post("/api/incidents", response_model=schemas.IncidentOut)
def create_incident(
    inc_in: schemas.IncidentCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Coordinate resolution & validation
    raw_lat = inc_in.latitude if inc_in.latitude is not None else (inc_in.lat if inc_in.lat is not None else inc_in.incidentLatitude)
    raw_lng = inc_in.longitude if inc_in.longitude is not None else (inc_in.lng if inc_in.lng is not None else inc_in.incidentLongitude)

    if raw_lat is None or raw_lng is None:
        raise HTTPException(status_code=400, detail="Valid incident latitude and longitude are required")
    if raw_lat < -90 or raw_lat > 90 or raw_lng < -180 or raw_lng > 180:
        raise HTTPException(status_code=400, detail="Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180")

    address = inc_in.address or inc_in.address_text or "Location verified via coordinates"
    accuracy = inc_in.location_accuracy if inc_in.location_accuracy is not None else inc_in.locationAccuracy
    captured_at = inc_in.location_captured_at or inc_in.locationCapturedAt or datetime.utcnow()

    # Rule engine classification
    suggested_type, urgency, rule_reason = classify_emergency(
        inc_in.emergency_type,
        inc_in.description,
        inc_in.checklist
    )
    
    # Generate unique ID e.g. INC-2026-XXXX
    incident_id = f"INC-2026-{random.randint(1000, 9999)}"
    
    incident = models.Incident(
        id=incident_id,
        citizen_id=current_user.id,
        citizen_name=current_user.full_name,
        citizen_phone=current_user.phone,
        emergency_type=inc_in.emergency_type,
        suggested_responder_type=suggested_type,
        urgency_level=urgency,
        description=inc_in.description,
        original_voice_transcript=inc_in.original_voice_transcript,
        checklist=inc_in.checklist,
        latitude=raw_lat,
        longitude=raw_lng,
        address_text=address,
        location_accuracy=accuracy,
        location_captured_at=captured_at,
        status="Reported"
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    # Initial timeline log
    log = models.IncidentUpdate(
        incident_id=incident.id,
        status="Reported",
        note=f"Emergency reported ({urgency} priority). Matched to {suggested_type} service. {rule_reason}",
        updated_by_name=current_user.full_name
    )
    db.add(log)
    db.commit()
    db.refresh(incident)

    return format_incident(incident)

@app.get("/api/incidents")
def list_incidents(
    status_filter: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Incident)
    
    if current_user.role == "citizen":
        # Citizens only see their own incidents
        query = query.filter(models.Incident.citizen_id == current_user.id)
    elif current_user.role == "responder":
        resp_profile = current_user.responder_profile
        if not resp_profile:
            return []
        
        # Responders see:
        # 1. Incidents currently assigned to them (any status)
        # 2. Unassigned 'Reported' incidents matching their service type
        query = query.filter(
            (models.Incident.assigned_responder_id == resp_profile.id) |
            ((models.Incident.status == "Reported") & (models.Incident.suggested_responder_type == resp_profile.service_type))
        )
    # Admin sees all
    
    if status_filter:
        query = query.filter(models.Incident.status == status_filter)
        
    incidents = query.order_by(models.Incident.created_at.desc()).all()
    resp_profile = current_user.responder_profile if current_user.role == "responder" else None
    return [format_incident(inc, resp_profile) for inc in incidents]

@app.get("/api/incidents/{incident_id}")
def get_incident(
    incident_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    # Check permissions
    if current_user.role == "citizen" and incident.citizen_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this incident")
    
    resp_profile = current_user.responder_profile if current_user.role == "responder" else None
    return format_incident(incident, resp_profile)

@app.post("/api/incidents/{incident_id}/assign")
def assign_incident(
    incident_id: str,
    action: str = Query(..., description="accept or reject"),
    current_user: models.User = Depends(require_role(["responder"])),
    db: Session = Depends(get_db)
):
    responder = current_user.responder_profile
    if not responder:
        raise HTTPException(status_code=400, detail="Responder profile missing")
    
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).with_for_update().first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if action == "accept":
        # Prevent race condition: ensure incident is still Reported/Unassigned
        if incident.assigned_responder_id is not None and incident.assigned_responder_id != responder.id:
            raise HTTPException(
                status_code=409,
                detail="Conflict: This incident has already been accepted by another responder"
            )
        
        incident.assigned_responder_id = responder.id
        incident.status = "Assigned"
        incident.updated_at = datetime.utcnow()
        
        # Log update
        db.add(models.IncidentUpdate(
            incident_id=incident.id,
            status="Assigned",
            note=f"Accepted by {responder.user.full_name} ({responder.organization_name}). Vehicle: {responder.vehicle_number}",
            updated_by_name=responder.user.full_name,
            responder_lat=responder.latitude,
            responder_lng=responder.longitude
        ))
        db.commit()
        db.refresh(incident)
        return {"message": "Incident accepted successfully", "incident": format_incident(incident, responder)}

    elif action == "reject":
        # If currently assigned to this responder, unassign
        if incident.assigned_responder_id == responder.id:
            incident.assigned_responder_id = None
            incident.status = "Reported"
            incident.updated_at = datetime.utcnow()
            
            db.add(models.IncidentUpdate(
                incident_id=incident.id,
                status="Reported",
                note=f"Assignment declined by {responder.user.full_name}. Returned to discovery pool.",
                updated_by_name=responder.user.full_name
            ))
            db.commit()
            db.refresh(incident)
            return {"message": "Incident rejected and returned to pool", "incident": format_incident(incident, responder)}
        else:
            return {"message": "Incident skipped", "incident_id": incident.id}
    else:
        raise HTTPException(status_code=400, detail="Action must be 'accept' or 'reject'")

@app.post("/api/incidents/{incident_id}/status")
def update_incident_status(
    incident_id: str,
    status_update: schemas.IncidentUpdateStatus,
    current_user: models.User = Depends(require_role(["responder", "admin"])),
    db: Session = Depends(get_db)
):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    valid_statuses = ["Reported", "Assigned", "Acknowledged", "En Route", "On Scene", "Resolved", "Cancelled"]
    new_status = status_update.status
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")
    
    responder = current_user.responder_profile
    if current_user.role == "responder" and incident.assigned_responder_id != responder.id:
        raise HTTPException(status_code=403, detail="You can only update incidents assigned to you")
    
    # Update responder coords if provided
    r_lat = status_update.responder_lat or (responder.latitude if responder else None)
    r_lng = status_update.responder_lng or (responder.longitude if responder else None)
    if responder and status_update.responder_lat and status_update.responder_lng:
        responder.latitude = status_update.responder_lat
        responder.longitude = status_update.responder_lng
        responder.last_ping = datetime.utcnow()
    
    incident.status = new_status
    incident.updated_at = datetime.utcnow()

    note_text = status_update.note or f"Status updated to {new_status}"
    db.add(models.IncidentUpdate(
        incident_id=incident.id,
        status=new_status,
        note=note_text,
        updated_by_name=current_user.full_name,
        responder_lat=r_lat,
        responder_lng=r_lng
    ))
    db.commit()
    db.refresh(incident)
    return format_incident(incident, responder)

# ================= RESPONDER LOCATION & AVAILABILITY =================

@app.post("/api/responders/location")
def update_location(
    loc: schemas.ResponderLocationUpdate,
    current_user: models.User = Depends(require_role(["responder"])),
    db: Session = Depends(get_db)
):
    profile = current_user.responder_profile
    if not profile:
        raise HTTPException(status_code=400, detail="Responder profile missing")
    
    profile.latitude = loc.latitude
    profile.longitude = loc.longitude
    profile.last_ping = datetime.utcnow()
    db.commit()
    return {"message": "Location updated", "latitude": profile.latitude, "longitude": profile.longitude}

@app.post("/api/responders/availability")
def toggle_availability(
    avail: schemas.ResponderAvailabilityUpdate,
    current_user: models.User = Depends(require_role(["responder"])),
    db: Session = Depends(get_db)
):
    profile = current_user.responder_profile
    if not profile:
        raise HTTPException(status_code=400, detail="Responder profile missing")
    
    profile.is_available = avail.is_available
    db.commit()
    return {"message": "Availability updated", "is_available": profile.is_available}

@app.get("/api/responders/all")
def get_all_responders(
    current_user: models.User = Depends(require_role(["admin", "responder"])),
    db: Session = Depends(get_db)
):
    responders = db.query(models.ResponderProfile).all()
    return [
        {
            "id": r.id,
            "name": r.user.full_name if r.user else "Unit",
            "email": r.user.email if r.user else "",
            "phone": r.user.phone if r.user else "",
            "service_type": r.service_type,
            "is_available": r.is_available,
            "vehicle_number": r.vehicle_number,
            "badge_number": r.badge_number,
            "organization_name": r.organization_name,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "last_ping": r.last_ping
        } for r in responders
    ]

# ================= ROUTE & NAVIGATION =================

@app.get("/api/route")
async def get_route(
    start_lat: float = Query(...),
    start_lng: float = Query(...),
    end_lat: float = Query(...),
    end_lng: float = Query(...)
):
    route_data = await fetch_osrm_route(start_lat, start_lng, end_lat, end_lng)
    return route_data

# ================= REVERSE GEOCODING =================

@app.get("/api/geocode/reverse")
def reverse_geocode(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180)
):
    import urllib.request
    import json
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=18&addressdetails=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'HyperlocalEmergencyResponsePlatform/1.0'})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return {"success": True, "address": data.get("display_name", f"Lat: {lat:.5f}, Lng: {lng:.5f}"), "lat": lat, "lng": lng}
    except Exception:
        return {"success": True, "address": f"Incident Pin: Lat {lat:.5f}, Lng {lng:.5f}", "lat": lat, "lng": lng, "fallback": True}

# ================= EMERGENCY CONTACTS (OFFLINE READY) =================

@app.get("/api/contacts", response_model=List[schemas.EmergencyContactOut])
def get_emergency_contacts(db: Session = Depends(get_db)):
    contacts = db.query(models.EmergencyContact).all()
    return contacts

# ================= TRANSLATION =================

@app.post("/api/translate", response_model=schemas.TranslationResponse)
def translate_text(req: schemas.TranslationRequest):
    result = translate_to_english(req.text, req.source_language)
    return result

# ================= ADMIN DASHBOARD STATS =================

@app.get("/api/admin/stats")
def get_admin_stats(
    current_user: models.User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    total_incidents = db.query(models.Incident).count()
    active_incidents = db.query(models.Incident).filter(models.Incident.status.notin_(["Resolved", "Cancelled"])).count()
    resolved_incidents = db.query(models.Incident).filter(models.Incident.status == "Resolved").count()
    
    total_responders = db.query(models.ResponderProfile).count()
    available_responders = db.query(models.ResponderProfile).filter(models.ResponderProfile.is_available == True).count()

    return {
        "total_incidents": total_incidents,
        "active_incidents": active_incidents,
        "resolved_incidents": resolved_incidents,
        "total_responders": total_responders,
        "available_responders": available_responders,
        "system_status": "Operational (Simulated Demo Environment)",
        "national_emergency_hotline": "112"
    }
