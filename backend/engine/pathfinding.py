"""
AkashSetu - Smart Pathfinding & Convex Arc Rerouting Module
Plans smooth flight corridors around standalone zones and merged virtual clusters,
ensuring drones maintain at least 200m+ clearance from all restricted boundaries.
"""

import math
from typing import List, Tuple, Dict, Optional
from models.drone import Waypoint, Coordinate
from engine.geofence import (
    haversine_distance, meters_to_degrees_lat, meters_to_degrees_lng,
    get_all_effective_obstacles, is_point_in_forbidden_zone, SAFETY_BUFFER_M
)


def point_to_segment_distance(
    px: float, py: float,
    ax: float, ay: float,
    bx: float, by: float
) -> float:
    """Calculates perpendicular distance in meters from point (px,py) to segment (ax,ay)-(bx,by)."""
    # Convert lat/lng to approximate local meters
    cos_lat = math.cos(math.radians(py))
    dx = (bx - ax) * 111320.0 * cos_lat
    dy = (by - ay) * 111320.0
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq < 1e-6:
        return haversine_distance(py, px, ay, ax)

    # Vector from a to p
    dpx = (px - ax) * 111320.0 * cos_lat
    dpy = (py - ay) * 111320.0

    t = max(0.0, min(1.0, (dpx * dx + dpy * dy) / seg_len_sq))

    # Nearest point on segment
    nx = ax + t * (bx - ax)
    ny = ay + t * (by - ay)

    return haversine_distance(py, px, ny, nx)


def segment_intersects_obstacle(
    start: Waypoint,
    end: Waypoint,
    obs: Dict
) -> bool:
    """Checks if straight segment from start to end intersects the obstacle clearance circle."""
    center = obs["center"]
    dist_m = point_to_segment_distance(
        center.lng, center.lat,
        start.lng, start.lat,
        end.lng, end.lat
    )
    return dist_m < obs["radius_m"]


def compute_tangent_arc_waypoints(
    start: Waypoint,
    dest: Waypoint,
    obs: Dict,
    altitude: float
) -> List[Waypoint]:
    """
    Computes a smooth convex arc around an obstacle (or virtual merged cluster).
    Generates intermediate waypoints along the safe perimeter of the obstacle.
    """
    center = obs["center"]
    safe_radius_m = obs["radius_m"] + 50.0  # extra 50m buffer for trajectory safety

    # Angles from obstacle center to start and destination
    angle_start = math.atan2(start.lng - center.lng, start.lat - center.lat)
    angle_dest = math.atan2(dest.lng - center.lng, dest.lat - center.lat)

    # Two possible arc directions: Clockwise or Counter-Clockwise
    # Direction 1: Positive diff
    diff_pos = (angle_dest - angle_start) % (2 * math.pi)
    # Direction 2: Negative diff
    diff_neg = (angle_start - angle_dest) % (2 * math.pi)

    chosen_diff = diff_pos if diff_pos <= diff_neg else -diff_neg

    # Number of arc waypoints
    num_points = max(4, int(abs(chosen_diff) / (math.pi / 6)))

    deg_lat = meters_to_degrees_lat(safe_radius_m)
    deg_lng = meters_to_degrees_lng(safe_radius_m, center.lat)

    arc_wps = []
    for i in range(1, num_points + 1):
        frac = i / (num_points + 1)
        ang = angle_start + frac * chosen_diff
        lat = center.lat + deg_lat * math.cos(ang)
        lng = center.lng + deg_lng * math.sin(ang)
        arc_wps.append(Waypoint(lat=lat, lng=lng, altitude=altitude))

    return arc_wps


def plan_safe_route(
    source: Coordinate,
    destination: Coordinate,
    altitude: float = 100.0
) -> List[Waypoint]:
    """
    Plans a smooth corridor route from source to destination that routes around
    all obstacles (including virtual merged clusters and 200m safety boundaries).
    """
    obstacles = get_all_effective_obstacles()

    start_wp = Waypoint(lat=source.lat, lng=source.lng, altitude=altitude)
    end_wp = Waypoint(lat=destination.lat, lng=destination.lng, altitude=altitude)

    waypoints = [start_wp, end_wp]

    # Iteratively resolve intersecting obstacles
    max_passes = 6
    for _ in range(max_passes):
        resolved = True
        new_wps = []

        for i in range(len(waypoints) - 1):
            curr_wp = waypoints[i]
            next_wp = waypoints[i + 1]
            new_wps.append(curr_wp)

            # Find closest intersecting obstacle on this segment
            intersecting_obs = None
            min_dist_to_start = float('inf')

            for obs in obstacles:
                if segment_intersects_obstacle(curr_wp, next_wp, obs):
                    d = haversine_distance(curr_wp.lat, curr_wp.lng, obs["center"].lat, obs["center"].lng)
                    if d < min_dist_to_start:
                        min_dist_to_start = d
                        intersecting_obs = obs

            if intersecting_obs:
                resolved = False
                arc_points = compute_tangent_arc_waypoints(
                    curr_wp, next_wp, intersecting_obs, altitude
                )
                new_wps.extend(arc_points)

        new_wps.append(waypoints[-1])
        waypoints = new_wps

        if resolved:
            break

    return waypoints


def emergency_reroute_out_of_zone(
    drone_lat: float,
    drone_lng: float,
    dest_lat: float,
    dest_lng: float,
    altitude: float = 120.0
) -> List[Waypoint]:
    """
    Called when a drone is inside or near a restricted area / yellow buffer.
    Computes an immediate outward exit vector away from the obstacle center,
    followed by a smooth planned corridor to the final destination.
    """
    obstacles = get_all_effective_obstacles()

    # Find the obstacle closest to drone
    nearest_obs = None
    min_dist = float('inf')
    for obs in obstacles:
        d = haversine_distance(drone_lat, drone_lng, obs["center"].lat, obs["center"].lng)
        if d < min_dist:
            min_dist = d
            nearest_obs = obs

    if not nearest_obs:
        return plan_safe_route(Coordinate(lat=drone_lat, lng=drone_lng), Coordinate(lat=dest_lat, lng=dest_lng), altitude)

    center = nearest_obs["center"]
    safe_exit_radius_m = nearest_obs["radius_m"] + 100.0

    # Vector directly away from obstacle center
    outward_angle = math.atan2(drone_lng - center.lng, drone_lat - center.lat)

    deg_lat = meters_to_degrees_lat(safe_exit_radius_m)
    deg_lng = meters_to_degrees_lng(safe_exit_radius_m, center.lat)

    exit_lat = center.lat + deg_lat * math.cos(outward_angle)
    exit_lng = center.lng + deg_lng * math.sin(outward_angle)

    exit_wp = Waypoint(lat=exit_lat, lng=exit_lng, altitude=altitude + 40)

    # Continue from exit waypoint to destination
    remaining_wps = plan_safe_route(
        Coordinate(lat=exit_lat, lng=exit_lng),
        Coordinate(lat=dest_lat, lng=dest_lng),
        altitude
    )

    return [exit_wp] + (remaining_wps[1:] if len(remaining_wps) > 1 else remaining_wps)
