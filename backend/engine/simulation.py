"""
AkashSetu - Core Simulation Engine
Manages the simulation loop, active drone lifecycle, automated deconfliction,
geo-fence safety buffer enforcement, and structured system logging.
"""

import math
import random
import time
from typing import Dict, List, Optional
from models.drone import (
    DroneState, DroneStatus, Coordinate, Waypoint,
    SystemLogEntry, SimulationStats, TelemetryMessage,
    AddDroneRequest, RestrictedZone, VirtualMergedZone
)
from engine.geofence import (
    get_zones, get_virtual_zones, is_point_in_forbidden_zone,
    check_drone_geofence_status, haversine_distance, SAFETY_BUFFER_M
)
from engine.deconfliction import detect_conflicts, resolve_conflicts
from engine.pathfinding import plan_safe_route, emergency_reroute_out_of_zone


OPERATORS = [
    {"name": "AgriSprayer Corp", "color": "#00E5FF"},
    {"name": "SwiftDeliver Drones", "color": "#FF6B35"},
    {"name": "SurveyMasters India", "color": "#7B2FFF"},
    {"name": "MediDrop Emergency", "color": "#FF3158"},
    {"name": "GreenField Agri-Tech", "color": "#00C853"},
    {"name": "CityLogistics Pro", "color": "#FFB800"},
    {"name": "InfraScan Drones", "color": "#E040FB"},
    {"name": "VayuRakshak Logistics", "color": "#38EF7D"},
]

DELHI_BOUNDS = {
    "min_lat": 28.46,
    "max_lat": 28.74,
    "min_lng": 76.96,
    "max_lng": 77.34,
}


def _compute_drone_scale(altitude: float) -> float:
    min_alt, max_alt = 30.0, 400.0
    min_scale, max_scale = 0.5, 1.5
    normalized = (altitude - min_alt) / (max_alt - min_alt)
    normalized = max(0.0, min(1.0, normalized))
    return min_scale + normalized * (max_scale - min_scale)


def _compute_heading(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlambda = math.radians(lng2 - lng1)
    x = math.sin(dlambda) * math.cos(phi2)
    y = (math.cos(phi1) * math.sin(phi2) -
         math.sin(phi1) * math.cos(phi2) * math.cos(dlambda))
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _generate_guaranteed_safe_point() -> Coordinate:
    """Generates a random coordinate strictly outside all restricted zones and 200m+ buffers."""
    for _ in range(250):
        lat = random.uniform(DELHI_BOUNDS["min_lat"], DELHI_BOUNDS["max_lat"])
        lng = random.uniform(DELHI_BOUNDS["min_lng"], DELHI_BOUNDS["max_lng"])
        if not is_point_in_forbidden_zone(lat, lng, extra_margin_m=350.0):
            return Coordinate(lat=lat, lng=lng)

    # Safe fallback far from central restricted zones
    return Coordinate(lat=28.7000, lng=77.1000)


class SimulationEngine:
    """Core simulation engine managing active multi-operator drones."""

    def __init__(self):
        self.drones: Dict[str, DroneState] = {}
        self.logs: List[SystemLogEntry] = []
        self.stats = SimulationStats()
        self.running = False
        self.paused = False
        self.speed_multiplier = 10.0
        self.start_time = 0.0
        self._max_logs = 150

    def add_log(self, entry: SystemLogEntry):
        self.logs.append(entry)
        if len(self.logs) > self._max_logs:
            self.logs.pop(0)

    def _create_random_drone(self) -> DroneState:
        operator = random.choice(OPERATORS)
        source = _generate_guaranteed_safe_point()
        destination = _generate_guaranteed_safe_point()

        attempts = 0
        while haversine_distance(source.lat, source.lng, destination.lat, destination.lng) < 3000 and attempts < 40:
            destination = _generate_guaranteed_safe_point()
            attempts += 1

        altitude = random.uniform(80, 360)
        speed = random.uniform(40, 75)

        drone = DroneState(
            operator=operator["name"],
            operator_color=operator["color"],
            lat=source.lat,
            lng=source.lng,
            altitude=altitude,
            speed=speed,
            source=source,
            destination=destination,
            status=DroneStatus.IN_FLIGHT,
            scale=_compute_drone_scale(altitude),
        )

        trajectory = plan_safe_route(source, destination, altitude)
        drone.trajectory = trajectory
        drone.original_trajectory = trajectory.copy()

        if len(trajectory) > 1:
            drone.heading = _compute_heading(
                source.lat, source.lng,
                trajectory[1].lat, trajectory[1].lng
            )

        return drone

    def initiate_flight(self) -> List[DroneState]:
        """Reset simulation, clear logs, and spawn 6-12 fresh drones in safe fly zones."""
        self.reset()
        num_drones = random.randint(6, 12)
        new_drones = []

        for _ in range(num_drones):
            drone = self._create_random_drone()
            self.drones[drone.id] = drone
            new_drones.append(drone)

        self.start_time = time.time()
        self.running = True
        self.paused = False

        self.add_log(SystemLogEntry(
            level="SUCCESS",
            category="SYSTEM",
            message=f"AIRSPACE INITIALIZED: {num_drones} fresh multi-operator missions launched across safe fly zones.",
            metadata={"num_drones": num_drones}
        ))

        return new_drones

    def add_drone(self, request: AddDroneRequest) -> DroneState:
        """Adds a custom drone mission with pre-flight validation."""
        # Strictly validate source and destination
        if is_point_in_forbidden_zone(request.source_lat, request.source_lng, extra_margin_m=SAFETY_BUFFER_M):
            raise ValueError(f"Source coordinate ({request.source_lat:.4f}, {request.source_lng:.4f}) is inside or too close to a restricted zone. Must be in open fly zone.")

        if is_point_in_forbidden_zone(request.dest_lat, request.dest_lng, extra_margin_m=SAFETY_BUFFER_M):
            raise ValueError(f"Destination coordinate ({request.dest_lat:.4f}, {request.dest_lng:.4f}) is inside or too close to a restricted zone. Must be in open fly zone.")

        operator_data = random.choice(OPERATORS)
        source = Coordinate(lat=request.source_lat, lng=request.source_lng)
        destination = Coordinate(lat=request.dest_lat, lng=request.dest_lng)

        drone = DroneState(
            id=request.id or None,
            operator=request.operator or operator_data["name"],
            operator_color=operator_data["color"],
            lat=source.lat,
            lng=source.lng,
            altitude=request.altitude,
            speed=request.speed,
            source=source,
            destination=destination,
            status=DroneStatus.IN_FLIGHT,
            scale=_compute_drone_scale(request.altitude),
        )

        trajectory = plan_safe_route(source, destination, request.altitude)
        drone.trajectory = trajectory
        drone.original_trajectory = trajectory.copy()

        if len(trajectory) > 1:
            drone.heading = _compute_heading(
                source.lat, source.lng,
                trajectory[1].lat, trajectory[1].lng
            )

        self.drones[drone.id] = drone

        self.add_log(SystemLogEntry(
            level="INFO",
            category="FLIGHT",
            source_drone_id=drone.id,
            message=f"MISSION REGISTERED: Drone {drone.id} ({drone.operator}) flight plan authorized. Cruising alt: {drone.altitude:.0f}ft.",
            metadata={"operator": drone.operator, "altitude": drone.altitude}
        ))

        if not self.running:
            self.running = True
            self.start_time = time.time()

        return drone

    def tick(self, dt: float):
        """Advances active drone positions and evaluates safety buffers."""
        if not self.running or self.paused:
            return

        sim_dt = dt * self.speed_multiplier
        drones_to_remove = []

        # ─── 1. Move Drones & Handle Journey Completion ──────────────
        for drone_id, drone in list(self.drones.items()):
            if drone.status not in (DroneStatus.IN_FLIGHT, DroneStatus.REROUTING):
                continue

            # Check if drone reached the final waypoint
            if drone.current_waypoint_idx >= len(drone.trajectory) - 1:
                # Journey complete! Mark for removal so map is clean
                drones_to_remove.append(drone_id)
                self.stats.completed_drones += 1

                self.add_log(SystemLogEntry(
                    level="SUCCESS",
                    category="FLIGHT",
                    source_drone_id=drone.id,
                    message=f"MISSION COMPLETED: Drone {drone.id} landed safely at destination [{drone.destination.lat:.4f}, {drone.destination.lng:.4f}]. Airspace slot released.",
                    metadata={"drone_id": drone.id, "operator": drone.operator}
                ))
                continue

            target_wp = drone.trajectory[drone.current_waypoint_idx + 1]
            dist_to_wp = haversine_distance(drone.lat, drone.lng, target_wp.lat, target_wp.lng)

            speed_ms = drone.speed * 1000.0 / 3600.0
            travel_dist = speed_ms * sim_dt

            if travel_dist >= dist_to_wp:
                drone.lat = target_wp.lat
                drone.lng = target_wp.lng
                drone.altitude = target_wp.altitude
                drone.current_waypoint_idx += 1

                if drone.status == DroneStatus.REROUTING:
                    drone.status = DroneStatus.IN_FLIGHT
                    drone.warning_level = max(0, drone.warning_level - 1)
            else:
                frac = travel_dist / dist_to_wp if dist_to_wp > 0 else 0
                drone.lat += frac * (target_wp.lat - drone.lat)
                drone.lng += frac * (target_wp.lng - drone.lng)
                drone.altitude += (target_wp.altitude - drone.altitude) * frac

            if drone.current_waypoint_idx < len(drone.trajectory) - 1:
                next_wp = drone.trajectory[drone.current_waypoint_idx + 1]
                drone.heading = _compute_heading(drone.lat, drone.lng, next_wp.lat, next_wp.lng)

            drone.scale = _compute_drone_scale(drone.altitude)

            total_dist = haversine_distance(drone.source.lat, drone.source.lng, drone.destination.lat, drone.destination.lng)
            current_dist = haversine_distance(drone.lat, drone.lng, drone.destination.lat, drone.destination.lng)
            drone.progress = max(0.0, min(1.0, 1.0 - (current_dist / total_dist))) if total_dist > 0 else 1.0

            if drone.warning_level > 0 and random.random() < 0.03:
                drone.warning_level = max(0, drone.warning_level - 1)

        # Remove completed drones completely from active state
        for did in drones_to_remove:
            self.drones.pop(did, None)

        # ─── 2. Evaluate Geofence & Yellow Safety Buffer ─────────────
        for drone_id, drone in self.drones.items():
            if drone.status not in (DroneStatus.IN_FLIGHT, DroneStatus.REROUTING):
                continue

            status_type, log_entry = check_drone_geofence_status(drone)
            if log_entry:
                self.add_log(log_entry)

                if status_type == "VIOLATION":
                    self.stats.geofence_violations += 1
                    drone.warning_level = 3
                    drone.status = DroneStatus.REROUTING
                    new_wps = emergency_reroute_out_of_zone(drone.lat, drone.lng, drone.destination.lat, drone.destination.lng, drone.altitude)
                    drone.trajectory = [Waypoint(lat=drone.lat, lng=drone.lng, altitude=drone.altitude)] + new_wps
                    drone.current_waypoint_idx = 0

                elif status_type == "BUFFER_ENTRY" and drone.status != DroneStatus.REROUTING:
                    self.stats.safety_reroutes += 1
                    drone.warning_level = 1
                    drone.status = DroneStatus.REROUTING
                    new_wps = emergency_reroute_out_of_zone(drone.lat, drone.lng, drone.destination.lat, drone.destination.lng, drone.altitude)
                    drone.trajectory = [Waypoint(lat=drone.lat, lng=drone.lng, altitude=drone.altitude)] + new_wps
                    drone.current_waypoint_idx = 0

        # ─── 3. Collision Avoidance ──────────────────────────────────
        active_drones = [d for d in self.drones.values() if d.status in (DroneStatus.IN_FLIGHT, DroneStatus.REROUTING)]
        conflicts = detect_conflicts(active_drones)
        if conflicts:
            conflict_logs = resolve_conflicts(self.drones, conflicts)
            for l in conflict_logs:
                self.add_log(l)
                if l.level == "WARNING":
                    self.stats.collisions_averted += 1

        # ─── 4. Stats Update ─────────────────────────────────────────
        self.stats.active_drones = len(self.drones)
        self.stats.total_drones = len(self.drones) + self.stats.completed_drones
        self.stats.active_warnings = len([d for d in self.drones.values() if d.warning_level > 0])
        self.stats.uptime_seconds = time.time() - self.start_time if self.start_time > 0 else 0.0

    def get_telemetry(self) -> TelemetryMessage:
        return TelemetryMessage(
            type="telemetry",
            drones=list(self.drones.values()),
            logs=list(self.logs),
            stats=self.stats,
            zones=get_zones(),
            virtual_zones=get_virtual_zones(),
        )

    def set_speed(self, multiplier: float):
        self.speed_multiplier = max(1.0, min(25.0, multiplier))

    def toggle_pause(self):
        self.paused = not self.paused
        return self.paused

    def reset(self):
        self.drones.clear()
        self.logs.clear()
        self.stats = SimulationStats()
        self.running = False
        self.paused = False
