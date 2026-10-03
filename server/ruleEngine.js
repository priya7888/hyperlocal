const axios = require('axios');
const { dbAll, dbGet } = require('./db');

// Haversine Distance Calculation (km & meters)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;
  return {
    km: parseFloat(distanceKm.toFixed(2)),
    meters: Math.round(distanceKm * 1000)
  };
}

// Travel Time Estimation (Average 35 km/h urban emergency speed + 1.5 min dispatch)
function estimateTravelTime(distanceKm) {
  if (distanceKm <= 0.1) return { minutes: 1, seconds: 60 };
  const mins = (distanceKm / 35.0) * 60 + 1.5;
  return {
    minutes: Math.max(1, Math.round(mins)),
    seconds: Math.max(60, Math.round(mins * 60))
  };
}

// OSRM Road Routing
async function fetchOsrmRoute(startLat, startLng, endLat, endLng) {
  const straightLine = calculateHaversineDistance(startLat, startLng, endLat, endLng);
  
  // If responder and incident are within 50 meters, they have arrived (no route needed)
  if (straightLine.km < 0.05) {
    return {
      coordinates: [],
      distance_km: 0,
      duration_minutes: 0,
      source: 'On Scene (Same Location)'
    };
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
  try {
    const res = await axios.get(url, { timeout: 3500 });
    if (res.data && res.data.code === 'Ok' && res.data.routes && res.data.routes.length > 0) {
      const route = res.data.routes[0];
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // [lat, lng]
      const distKm = parseFloat((route.distance / 1000).toFixed(2));
      const durMin = Math.max(1, Math.round(route.duration / 60));
      return {
        coordinates: coords,
        distance_km: distKm,
        duration_minutes: durMin,
        source: 'OSRM Live Road Engine'
      };
    }
  } catch (err) {
    // Fallback to interpolated waypoints
  }

  // Fallback straight-line interpolated waypoints (only if actual distance exists)
  const steps = 8;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    coords.push([
      parseFloat((startLat + (endLat - startLat) * ratio).toFixed(6)),
      parseFloat((startLng + (endLng - startLng) * ratio).toFixed(6))
    ]);
  }

  return {
    coordinates: coords,
    distance_km: parseFloat(straightLine.km.toFixed(2)),
    duration_minutes: Math.max(1, Math.round(straightLine.km / 35 * 60)),
    source: 'Direct Vector Corridor'
  };
}

// Duplicate Detection & Merge Logic (200m radius and 10 minutes)
async function checkDuplicateIncident(emergencyType, lat, lng, timeWindowSec = 600, radiusMeters = 200) {
  const recentIncidents = await dbAll(
    `SELECT * FROM incidents 
     WHERE emergency_type = ? 
       AND status NOT IN ('Resolved', 'Cancelled', 'Merged')
       AND created_at >= datetime('now', '-' || ? || ' seconds')`,
    [emergencyType, timeWindowSec]
  );

  for (const incident of recentIncidents) {
    const dist = calculateHaversineDistance(lat, lng, incident.lat, incident.lng);
    if (dist.meters <= radiusMeters) {
      return {
        isDuplicate: true,
        parentIncident: incident,
        distanceMeters: dist.meters
      };
    }
  }

  return { isDuplicate: false, parentIncident: null };
}

// Rule-Based Classification and Severity Determination based on the 7 exact checklist items
function classifyEmergencyAndSeverity(emergencyType, description = '', checklist = []) {
  const descLower = description.toLowerCase();
  const checklistLower = checklist.map(c => c.toLowerCase());

  let suggested_service = 'Ambulance';
  let severity = 'Medium';
  let reasons = [];

  // Service Mapping per exact checklist items:
  // 1. Fire or smoke -> Fire
  // 2. Crime/personal safety threat -> Police
  // 3. Person injured, Person unconscious, Road accident, Other emergency -> Ambulance
  // 4. Person trapped -> Fire/Rescue
  const hasFire = checklistLower.some(c => c.includes('fire') || c.includes('smoke')) || emergencyType === 'Fire' || descLower.includes('fire');
  const hasCrime = checklistLower.some(c => c.includes('crime') || c.includes('safety') || c.includes('threat')) || emergencyType === 'Crime' || descLower.includes('robbery') || descLower.includes('weapon');
  const hasTrapped = checklistLower.some(c => c.includes('trapped'));
  const hasMedical = checklistLower.some(c => c.includes('injured') || c.includes('unconscious') || c.includes('accident') || c.includes('other')) || emergencyType === 'Medical' || emergencyType === 'Crash';

  if (hasFire) {
    suggested_service = 'Fire';
    reasons.push('Hazard indicators match Fire Service');
  } else if (hasCrime) {
    suggested_service = 'Police';
    reasons.push('Threat indicators match Police Department');
  } else if (hasTrapped) {
    suggested_service = 'Fire';
    reasons.push('Trapped victim indicators match Fire & Rescue Service');
  } else {
    suggested_service = 'Ambulance';
    reasons.push('Medical or injury indicators match Ambulance Emergency Service');
  }

  // Severity Rules
  const hasCritical = checklistLower.some(c => c.includes('unconscious') || c.includes('trapped') || c.includes('fire') || c.includes('threat')) || descLower.includes('critical');

  if (hasCritical) {
    severity = 'Critical';
    reasons.push('Critical urgency priority');
  } else {
    severity = 'Medium';
  }

  return {
    suggested_service,
    severity,
    reason: reasons.join('; ')
  };
}

// Find Ranked Responders based on Service and ETA
async function findRankedResponders(serviceType, incidentLat, incidentLng, maxRadiusKm = 150.0) {
  let responders = [];
  try {
    if (serviceType && serviceType !== 'All') {
      // Query verified and available responders of requested service
      const matched = await dbAll(
        `SELECT r.*, u.full_name, u.phone, u.email
         FROM responders r
         JOIN users u ON r.user_id = u.id
         WHERE r.service_type = ? 
           AND r.is_available = 1 
           AND r.is_verified = 1`,
        [serviceType]
      );
      
      const others = await dbAll(
        `SELECT r.*, u.full_name, u.phone, u.email
         FROM responders r
         JOIN users u ON r.user_id = u.id
         WHERE r.service_type != ? 
           AND r.is_available = 1 
           AND r.is_verified = 1`,
        [serviceType]
      );
      responders = [...matched, ...others];
    } else {
      responders = await dbAll(
        `SELECT r.*, u.full_name, u.phone, u.email
         FROM responders r
         JOIN users u ON r.user_id = u.id
         WHERE r.is_available = 1 
           AND r.is_verified = 1`
      );
    }
  } catch (err) {
    console.warn('Error querying responders:', err.message);
  }

  const ranked = [];
  for (const resp of responders) {
    const respLat = resp.lat || incidentLat || 17.5950;
    const respLng = resp.lng || incidentLng || 78.4950;
    const dist = calculateHaversineDistance(incidentLat, incidentLng, respLat, respLng);
    
    // Calculate realistic road ETA
    const eta = estimateTravelTime(dist.km);
    ranked.push({
      ...resp,
      distance_km: dist.km,
      distance_meters: dist.meters,
      eta_minutes: eta.minutes,
      eta_seconds: eta.seconds,
      is_exact_service: resp.service_type === serviceType
    });
  }

  // Sort: matching service track first, then ascending by distance
  ranked.sort((a, b) => {
    if (a.is_exact_service && !b.is_exact_service) return -1;
    if (!a.is_exact_service && b.is_exact_service) return 1;
    return a.distance_km - b.distance_km;
  });

  return ranked;
}

module.exports = {
  calculateHaversineDistance,
  estimateTravelTime,
  fetchOsrmRoute,
  checkDuplicateIncident,
  classifyEmergencyAndSeverity,
  findRankedResponders
};
