"""
AkashSetu - Deconfliction Module
Real-time collision detection and resolution between drones.
"""

import math
from typing import List, Tuple, Dict
from models.drone import DroneState, SystemLogEntry, DroneStatus


HORIZONTAL_WARNING_M = 200       # Start tracking at 200m
HORIZONTAL_DANGER_M = 100        # Potential collision at 100m
VERTICAL_SAFE_SEPARATION_FT = 30 # Minimum vertical separation in feet
ALTITUDE_CHANGE_FT = 50          # How much to change altitude for avoidance
SPEED_REDUCTION_FACTOR = 0.7     # Moderate speed reduction
LATERAL_OFFSET_DEG = 0.0006      # Lateral offset in degrees (~60m)


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points in meters."""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = (math.sin(dphi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def compute_bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Compute bearing in degrees from point 1 to point 2."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlambda = math.radians(lng2 - lng1)

    x = math.sin(dlambda) * math.cos(phi2)
    y = (math.cos(phi1) * math.sin(phi2) -
         math.sin(phi1) * math.cos(phi2) * math.cos(dlambda))
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def detect_conflicts(drones: List[DroneState]) -> List[Tuple[DroneState, DroneState, float, float]]:
    """
    Check all pairs of active drones for potential conflicts.
    Returns list of (drone_a, drone_b, horizontal_dist_m, vertical_dist_ft).
    """
    conflicts = []
    active = [d for d in drones if d.status in (DroneStatus.IN_FLIGHT, DroneStatus.REROUTING)]

    for i in range(len(active)):
        for j in range(i + 1, len(active)):
            d1, d2 = active[i], active[j]
            h_dist = haversine_distance(d1.lat, d1.lng, d2.lat, d2.lng)
            v_dist = abs(d1.altitude - d2.altitude)

            if h_dist < HORIZONTAL_WARNING_M:
                conflicts.append((d1, d2, h_dist, v_dist))

    return conflicts


def resolve_conflicts(
    drones: Dict[str, DroneState],
    conflicts: List[Tuple[DroneState, DroneState, float, float]]
) -> List[SystemLogEntry]:
    """
    Resolve detected conflicts by modifying drone states.
    Uses priority-based resolution (earlier creation time = higher priority).
    Returns list of structured system log entries.
    """
    logs = []
    resolved_drones = set()

    for d1, d2, h_dist, v_dist in conflicts:
        if d1.id in resolved_drones and d2.id in resolved_drones:
            continue

        if d1.created_at <= d2.created_at:
            priority_drone = d1
            yield_drone = d2
        else:
            priority_drone = d2
            yield_drone = d1

        yield_state = drones.get(yield_drone.id)
        priority_state = drones.get(priority_drone.id)
        if not yield_state or not priority_state:
            continue

        if h_dist < HORIZONTAL_DANGER_M and v_dist < VERTICAL_SAFE_SEPARATION_FT:
            # CRITICAL: Collision avoidance
            old_alt = yield_state.altitude
            yield_state.altitude = min(390.0, yield_state.altitude + ALTITUDE_CHANGE_FT)
            yield_state.warning_level = 3

            # Speed adjustment
            old_speed = yield_state.speed
            yield_state.speed = max(30.0, yield_state.speed * SPEED_REDUCTION_FACTOR)

            # Lateral vector shift
            bearing = compute_bearing(yield_state.lat, yield_state.lng, priority_state.lat, priority_state.lng)
            perp_bearing = math.radians((bearing + 90) % 360)
            yield_state.lat += LATERAL_OFFSET_DEG * math.cos(perp_bearing)
            yield_state.lng += LATERAL_OFFSET_DEG * math.sin(perp_bearing)
            yield_state.status = DroneStatus.REROUTING

            logs.append(SystemLogEntry(
                level="WARNING",
                category="CONFLICT",
                source_drone_id=yield_state.id,
                target_drone_id=priority_state.id,
                message=f"COLLISION AVOIDANCE: Drone {yield_state.id} yielded to {priority_state.id} (Sep: {h_dist:.0f}m, Vert: {v_dist:.0f}ft). Alt adjusted: {old_alt:.0f}ft -> {yield_state.altitude:.0f}ft.",
                metadata={
                    "yield_drone": yield_state.id,
                    "priority_drone": priority_state.id,
                    "separation_m": round(h_dist, 1),
                    "old_altitude": old_alt,
                    "new_altitude": yield_state.altitude
                }
            ))

            resolved_drones.add(yield_state.id)

        elif h_dist < HORIZONTAL_WARNING_M:
            yield_state.warning_level = max(yield_state.warning_level, 1)
            priority_state.warning_level = max(priority_state.warning_level, 1)

            logs.append(SystemLogEntry(
                level="INFO",
                category="CONFLICT",
                source_drone_id=d1.id,
                target_drone_id=d2.id,
                message=f"PROXIMITY ALERT: Drones {d1.id} & {d2.id} within {h_dist:.0f}m (Vert: {v_dist:.0f}ft). Tracking vectors.",
                metadata={"drone_a": d1.id, "drone_b": d2.id, "distance_m": round(h_dist, 1)}
            ))

    return logs
