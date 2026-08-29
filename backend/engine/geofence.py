"""
AkashSetu - Geo-Fence Enforcer
Defines restricted zones, calculates 200m safety buffers, computes virtual merged zones
for nearby clusters, and evaluates geofence boundaries.
"""

import math
from typing import List, Tuple, Optional, Dict
from shapely.geometry import Point, Polygon, LineString
from shapely.ops import nearest_points
from models.drone import (
    RestrictedZone, ZoneType, Coordinate, DroneState,
    SystemLogEntry, Waypoint, VirtualMergedZone
)

# 200m yellow safety boundary around all restricted zones
SAFETY_BUFFER_M = 200.0

# Minimum clearance distance for path planning (zone radius + 200m buffer + 100m safe airway margin)
PATH_CLEARANCE_MARGIN_M = 300.0

# Threshold distance between zone perimeters to merge into a single virtual obstacle (in meters)
MERGE_CLUSTER_THRESHOLD_M = 600.0

# ─── Pre-defined restricted zones for Delhi NCR ─────────────────────────────

RESTRICTED_ZONES: List[RestrictedZone] = [
    RestrictedZone(
        id="ZONE-IGI",
        name="IGI Airport (Indira Gandhi International)",
        zone_type=ZoneType.RED,
        center=Coordinate(lat=28.5562, lng=77.1000),
        radius_m=4800,
        buffer_radius_m=SAFETY_BUFFER_M,
        description="Major international airport - Strict Red Zone",
        max_altitude=0,
    ),
    RestrictedZone(
        id="ZONE-RB",
        name="Rashtrapati Bhavan & Parliament",
        zone_type=ZoneType.RED,
        center=Coordinate(lat=28.6143, lng=77.1994),
        radius_m=1400,
        buffer_radius_m=SAFETY_BUFFER_M,
        description="VIP corridor & government complex",
        max_altitude=0,
    ),
    RestrictedZone(
        id="ZONE-IG",
        name="India Gate & Rajpath",
        zone_type=ZoneType.YELLOW,
        center=Coordinate(lat=28.6129, lng=77.2295),
        radius_m=800,
        buffer_radius_m=SAFETY_BUFFER_M,
        description="National monument restricted airspace",
        max_altitude=100,
    ),
    RestrictedZone(
        id="ZONE-CANT",
        name="Delhi Cantonment Military Area",
        zone_type=ZoneType.RED,
        center=Coordinate(lat=28.5870, lng=77.1650),
        radius_m=1800,
        buffer_radius_m=SAFETY_BUFFER_M,
        description="Defense military installation",
        max_altitude=0,
    ),
    RestrictedZone(
        id="ZONE-NSA",
        name="NSA Complex & Security Enclave",
        zone_type=ZoneType.RED,
        center=Coordinate(lat=28.6350, lng=77.2100),
        radius_m=650,
        buffer_radius_m=SAFETY_BUFFER_M,
        description="National security installation",
        max_altitude=0,
    ),
]


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points in meters."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = (math.sin(dphi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def meters_to_degrees_lat(meters: float) -> float:
    """Convert meters to degrees of latitude."""
    return meters / 111320.0


def meters_to_degrees_lng(meters: float, lat: float) -> float:
    """Convert meters to degrees of longitude at given latitude."""
    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) < 1e-6:
        cos_lat = 1.0
    return meters / (111320.0 * cos_lat)


def create_circle_polygon(center: Coordinate, radius_m: float, num_points: int = 48) -> Polygon:
    """Create a Shapely polygon for circle."""
    deg_lat = meters_to_degrees_lat(radius_m)
    deg_lng = meters_to_degrees_lng(radius_m, center.lat)

    points = []
    for i in range(num_points):
        angle = 2 * math.pi * i / num_points
        lat = center.lat + deg_lat * math.sin(angle)
        lng = center.lng + deg_lng * math.cos(angle)
        points.append((lng, lat))
    return Polygon(points)


# ─── Cluster & Virtual Enclosing Zone Computation ───────────────────────────

def compute_virtual_merged_zones() -> List[VirtualMergedZone]:
    """
    Finds pairs or clusters of restricted zones where the clearance gap between their
    boundaries is smaller than MERGE_CLUSTER_THRESHOLD_M.
    Computes a virtual bounding circle encompassing the cluster with 200m safety buffer.
    """
    n = len(RESTRICTED_ZONES)
    adj = {i: set() for i in range(n)}

    for i in range(n):
        for j in range(i + 1, n):
            z1 = RESTRICTED_ZONES[i]
            z2 = RESTRICTED_ZONES[j]
            dist_centers = haversine_distance(z1.center.lat, z1.center.lng, z2.center.lat, z2.center.lng)
            edge_to_edge_gap = dist_centers - (z1.radius_m + z2.radius_m)
            if edge_to_edge_gap < MERGE_CLUSTER_THRESHOLD_M:
                adj[i].add(j)
                adj[j].add(i)

    # Find connected components
    visited = set()
    clusters = []
    for i in range(n):
        if i not in visited:
            cluster = []
            queue = [i]
            visited.add(i)
            while queue:
                curr = queue.pop(0)
                cluster.append(curr)
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            if len(cluster) > 1:
                clusters.append(cluster)

    virtual_zones = []
    for idx, cluster_indices in enumerate(clusters):
        cluster_zones = [RESTRICTED_ZONES[k] for k in cluster_indices]
        # Calculate center as centroid of cluster centers
        avg_lat = sum(z.center.lat for z in cluster_zones) / len(cluster_zones)
        avg_lng = sum(z.center.lng for z in cluster_zones) / len(cluster_zones)
        center = Coordinate(lat=avg_lat, lng=avg_lng)

        # Enclosing radius covering every zone's edge
        max_reach = 0.0
        for z in cluster_zones:
            dist_to_center = haversine_distance(avg_lat, avg_lng, z.center.lat, z.center.lng)
            reach = dist_to_center + z.radius_m
            if reach > max_reach:
                max_reach = reach

        names = " + ".join(z.name.split()[0] for z in cluster_zones)
        virtual_zones.append(VirtualMergedZone(
            id=f"VIRTUAL-CLUSTER-{idx+1}",
            name=f"Merged Airspace Envelope ({names})",
            center=center,
            radius_m=max_reach,
            buffer_radius_m=SAFETY_BUFFER_M,
            child_zone_ids=[z.id for z in cluster_zones]
        ))

    return virtual_zones


VIRTUAL_MERGED_ZONES: List[VirtualMergedZone] = compute_virtual_merged_zones()


# ─── Verification & Boundary Checking ───────────────────────────────────────

def is_point_in_forbidden_zone(lat: float, lng: float, extra_margin_m: float = SAFETY_BUFFER_M) -> bool:
    """
    Checks if a point lies inside any Red/Yellow restricted zone OR within the safety margin.
    Returns True if forbidden (unsafe to spawn/land), False if in unrestricted fly zone.
    """
    for zone in RESTRICTED_ZONES:
        dist = haversine_distance(lat, lng, zone.center.lat, zone.center.lng)
        if dist <= (zone.radius_m + extra_margin_m):
            return True

    for vz in VIRTUAL_MERGED_ZONES:
        dist = haversine_distance(lat, lng, vz.center.lat, vz.center.lng)
        if dist <= (vz.radius_m + extra_margin_m):
            return True

    return False


def get_all_effective_obstacles() -> List[Dict]:
    """
    Returns list of effective obstacles to route around.
    If zones are in a virtual cluster, uses the merged virtual circle as a single obstacle;
    otherwise uses the standalone zone. All obstacles include safety buffer.
    """
    obstacles = []
    covered_zone_ids = set()

    for vz in VIRTUAL_MERGED_ZONES:
        obstacles.append({
            "id": vz.id,
            "name": vz.name,
            "center": vz.center,
            "radius_m": vz.radius_m + PATH_CLEARANCE_MARGIN_M,
            "is_virtual": True,
        })
        for zid in vz.child_zone_ids:
            covered_zone_ids.add(zid)

    for zone in RESTRICTED_ZONES:
        if zone.id not in covered_zone_ids:
            obstacles.append({
                "id": zone.id,
                "name": zone.name,
                "center": zone.center,
                "radius_m": zone.radius_m + PATH_CLEARANCE_MARGIN_M,
                "is_virtual": False,
            })

    return obstacles


def check_drone_geofence_status(drone: DroneState) -> Tuple[Optional[str], Optional[SystemLogEntry]]:
    """
    Evaluates drone's position against zones.
    Returns (status_type, log_entry):
      - 'VIOLATION': inside core restricted zone (Critical alert)
      - 'BUFFER_ENTRY': inside 200m yellow safety buffer (Proactive reroute log, NOT a violation)
      - None: safe
    """
    # 1. Check core violation first
    for zone in RESTRICTED_ZONES:
        dist = haversine_distance(drone.lat, drone.lng, zone.center.lat, zone.center.lng)
        if dist <= zone.radius_m:
            log = SystemLogEntry(
                level="CRITICAL",
                category="GEOFENCE",
                source_drone_id=drone.id,
                message=f"CRITICAL: Drone {drone.id} penetrated core restricted zone {zone.name} ({dist:.0f}m from center). Executing emergency egress.",
                metadata={"zone_id": zone.id, "zone_name": zone.name, "distance_m": round(dist, 1)}
            )
            return ("VIOLATION", log)

    # 2. Check 200m yellow safety buffer entry
    for zone in RESTRICTED_ZONES:
        dist = haversine_distance(drone.lat, drone.lng, zone.center.lat, zone.center.lng)
        if dist <= (zone.radius_m + SAFETY_BUFFER_M):
            margin = dist - zone.radius_m
            log = SystemLogEntry(
                level="CAUTION",
                category="GEOFENCE",
                source_drone_id=drone.id,
                message=f"CAUTION: Drone {drone.id} entered yellow safety buffer of {zone.name} ({margin:.0f}m clearance). Auto-rerouting outside buffer.",
                metadata={"zone_id": zone.id, "zone_name": zone.name, "clearance_m": round(margin, 1)}
            )
            return ("BUFFER_ENTRY", log)

    return (None, None)


def get_zones() -> List[RestrictedZone]:
    return RESTRICTED_ZONES


def get_virtual_zones() -> List[VirtualMergedZone]:
    return VIRTUAL_MERGED_ZONES
