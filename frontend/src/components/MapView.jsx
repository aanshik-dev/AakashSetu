import React from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MapView.css";

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Map click handler component for pinning coordinates
function MapClickHandler({ pinSelectionMode, onMapPinSelected }) {
  useMapEvents({
    click(e) {
      if (pinSelectionMode) {
        onMapPinSelected({
          lat: Number(e.latlng.lat.toFixed(5)),
          lng: Number(e.latlng.lng.toFixed(5)),
        });
      }
    },
  });
  return null;
}

// Custom SVG Drone Icon generator
function createDroneIcon(drone) {
  const altitude = drone.altitude || 100;
  // Size relative to altitude (30ft -> ~32px, 400ft -> ~66px)
  const baseSize = Math.max(30, Math.min(68, 28 + (altitude / 400) * 38));
  const heading = drone.heading || 0;

  let statusClass = "normal";
  if (drone.warning_level >= 3 || drone.status === "emergency") {
    statusClass = "critical";
  } else if (drone.warning_level >= 2 || drone.status === "rerouting") {
    statusClass = "warning";
  } else if (drone.warning_level === 1) {
    statusClass = "caution";
  }

  const html = `
    <div class="drone-marker-wrapper ${statusClass}" style="width: ${baseSize}px; height: ${baseSize}px;">
      <div class="drone-pulse-ring"></div>
      <div class="drone-svg-container" style="transform: rotate(${heading}deg);">
        <img src="/drone.svg" alt="Drone ${drone.id}" class="drone-svg-img" />
      </div>
      <div class="drone-alt-badge" style="border-color: ${drone.operator_color || "#00e5ff"};">
        <span>${Math.round(altitude)}ft</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html: html,
    className: "custom-drone-leaflet-icon",
    iconSize: [baseSize, baseSize],
    iconAnchor: [baseSize / 2, baseSize / 2],
    popupAnchor: [0, -baseSize / 2],
  });
}

// Pin icon generator for source and destination
function createPinIcon(type, color = "#00e5ff") {
  const isSource = type === "source";
  const label = isSource ? "SRC" : "DEST";
  const bg = isSource ? "#00c853" : "#ff3158";

  const html = `
    <div class="pin-marker-wrapper" style="--pin-color: ${bg}">
      <div class="pin-inner">
        <span>${label}</span>
      </div>
      <div class="pin-point"></div>
    </div>
  `;

  return L.divIcon({
    html: html,
    className: "custom-pin-leaflet-icon",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

export default function MapView({
  drones = [],
  zones = [],
  virtualZones = [],
  selectedDrone,
  onSelectDrone,
  showAllPaths = false,
  pinSelectionMode,
  onMapPinSelected,
  previewPinSource,
  previewPinDest,
}) {
  const mapCenter = [28.6139, 77.209]; // Delhi NCR

  return (
    <div
      className={`map-view-container ${pinSelectionMode ? "pin-mode-active" : ""}`}
    >
      {pinSelectionMode && (
        <div className="pin-mode-banner glass-panel">
          <span className="pin-mode-indicator animate-pulse">📍</span>
          <span>
            Click anywhere in open fly zone to set{" "}
            <strong>{pinSelectionMode.toUpperCase()}</strong>
          </span>
        </div>
      )}

      <MapContainer
        center={mapCenter}
        zoom={12}
        minZoom={10}
        maxZoom={18}
        scrollWheelZoom={true}
        className="leaflet-map-root"
      >
        {/* Clean dark map tiles without watermark */}
        <TileLayer
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>, DeLorme, NAVTEQ'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />

        <MapClickHandler
          pinSelectionMode={pinSelectionMode}
          onMapPinSelected={onMapPinSelected}
        />

        {/* ─── Virtual Merged Zones (Enclosing Clusters) ─── */}
        {virtualZones.map((vz) => (
          <Circle
            key={vz.id}
            center={[vz.center.lat, vz.center.lng]}
            radius={vz.radius_m + 200}
            pathOptions={{
              color: "rgba(168, 85, 247, 0.7)",
              weight: 1.5,
              dashArray: "8, 8",
              fillColor: "rgba(168, 85, 247, 0.05)",
              fillOpacity: 0.1,
            }}
          >
            <Popup>
              <div className="zone-popup-card">
                <div
                  className="zone-badge"
                  style={{ backgroundColor: "#a855f7" }}
                >
                  MERGED VIRTUAL ENVELOPE
                </div>
                <h3>{vz.name}</h3>
                <p>
                  Narrow clearance between zones detected. Pathfinding treats
                  this cluster as a unified convex obstacle.
                </p>
                <div className="zone-details">
                  <span>
                    <strong>Radius:</strong> {Math.round(vz.radius_m)}m
                  </span>
                  <span>
                    <strong>Safety Margin:</strong> 200m Yellow Buffer Included
                  </span>
                </div>
              </div>
            </Popup>
          </Circle>
        ))}

        {/* ─── Restricted Core Zones & 200m Yellow Safety Region ─── */}
        {zones.map((zone) => {
          const isRed = zone.zone_type === "red";
          const coreColor = isRed ? "#ff3158" : "#ffb800";

          if (zone.radius_m && zone.center) {
            return (
              <React.Fragment key={zone.id}>
                {/* 200m Yellow Safety Boundary Line */}
                <Circle
                  center={[zone.center.lat, zone.center.lng]}
                  radius={zone.radius_m + (zone.buffer_radius_m || 200)}
                  pathOptions={{
                    color: "#ffe600",
                    weight: 1.8,
                    dashArray: "6, 6",
                    fillColor: "rgba(255, 230, 0, 0.07)",
                    fillOpacity: 0.1,
                    className: "safety-buffer-line",
                  }}
                >
                  <Popup>
                    <div className="zone-popup-card">
                      <div
                        className="zone-badge"
                        style={{ backgroundColor: "#ffe600", color: "#000" }}
                      >
                        200M YELLOW SAFETY BUFFER
                      </div>
                      <h3>{zone.name} — Safety Margin</h3>
                      <p>
                        Drones automatically veer clear of this 200m buffer to
                        prevent perimeter clipping.
                      </p>
                    </div>
                  </Popup>
                </Circle>

                {/* Core Restricted Zone */}
                <Circle
                  center={[zone.center.lat, zone.center.lng]}
                  radius={zone.radius_m}
                  pathOptions={{
                    color: coreColor,
                    weight: 2,
                    fillColor: coreColor,
                    fillOpacity: 0.28,
                    className: "restricted-zone-pulse",
                  }}
                >
                  <Popup className="zone-popup">
                    <div className="zone-popup-card">
                      <div
                        className="zone-badge"
                        style={{ backgroundColor: coreColor }}
                      >
                        {zone.zone_type.toUpperCase()} RESTRICTED ZONE
                      </div>
                      <h3>{zone.name}</h3>
                      <p>{zone.description}</p>
                      <div className="zone-details">
                        <span>
                          <strong>Core Radius:</strong> {zone.radius_m}m
                        </span>
                        <span>
                          <strong>Yellow Safety Buffer:</strong> 200m
                        </span>
                      </div>
                    </div>
                  </Popup>
                </Circle>
              </React.Fragment>
            );
          }
          return null;
        })}

        {/* ─── Drone Trajectories (Polylines) & Pins ─── */}
        {drones.map((drone) => {
          if (!drone.trajectory || drone.trajectory.length < 2) return null;
          const isSelected = selectedDrone?.id === drone.id;

          // Trajectory Visibility Logic: Show all if showAllPaths is true, or only selected drone
          const shouldShowPath = showAllPaths || isSelected;
          if (!shouldShowPath) return null;

          const positions = drone.trajectory.map((wp) => [wp.lat, wp.lng]);
          const isWarning = drone.warning_level >= 2;

          return (
            <React.Fragment key={`traj-${drone.id}`}>
              <Polyline
                positions={positions}
                pathOptions={{
                  color: isWarning
                    ? "#ff3158"
                    : drone.operator_color || "#00e5ff",
                  weight: isSelected ? 3.5 : 2,
                  dashArray: drone.status === "rerouting" ? "4, 6" : "6, 6",
                  opacity: isSelected ? 0.95 : 0.65,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />

              {/* Source Pin */}
              {drone.source && (
                <Marker
                  position={[drone.source.lat, drone.source.lng]}
                  icon={createPinIcon("source", drone.operator_color)}
                >
                  <Popup>
                    <div className="point-popup">
                      <strong>Source: {drone.id}</strong>
                      <div>{drone.operator}</div>
                      <div>
                        [{drone.source.lat.toFixed(4)},{" "}
                        {drone.source.lng.toFixed(4)}]
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Destination Pin */}
              {drone.destination && (
                <Marker
                  position={[drone.destination.lat, drone.destination.lng]}
                  icon={createPinIcon("dest", drone.operator_color)}
                >
                  <Popup>
                    <div className="point-popup">
                      <strong>Destination: {drone.id}</strong>
                      <div>{drone.operator}</div>
                      <div>
                        [{drone.destination.lat.toFixed(4)},{" "}
                        {drone.destination.lng.toFixed(4)}]
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}
            </React.Fragment>
          );
        })}

        {/* ─── Preview Pins during Add Drone Modal ─── */}
        {previewPinSource && (
          <Marker
            position={[previewPinSource.lat, previewPinSource.lng]}
            icon={createPinIcon("source", "#00e5ff")}
          />
        )}
        {previewPinDest && (
          <Marker
            position={[previewPinDest.lat, previewPinDest.lng]}
            icon={createPinIcon("dest", "#ff3158")}
          />
        )}

        {/* ─── Drone Markers with Animated SVG (Scaling by Altitude) ─── */}
        {drones.map((drone) => {
          if (drone.lat == null || drone.lng == null) return null;

          return (
            <Marker
              key={`drone-${drone.id}`}
              position={[drone.lat, drone.lng]}
              icon={createDroneIcon(drone)}
              eventHandlers={{
                click: () => onSelectDrone?.(drone),
              }}
            >
              <Popup className="drone-popup">
                <div className="drone-popup-card">
                  <div className="drone-popup-header">
                    <span className="drone-id-tag">{drone.id}</span>
                    <span
                      className={`status-badge badge-${drone.status === "rerouting" ? "amber" : "cyan"}`}
                    >
                      {drone.status.replace("_", " ").toUpperCase()}
                    </span>
                  </div>
                  <div
                    className="drone-op-name"
                    style={{ color: drone.operator_color }}
                  >
                    🏢 {drone.operator}
                  </div>
                  <div className="drone-metrics-grid">
                    <div className="metric-box">
                      <span className="lbl">Altitude</span>
                      <span className="val">
                        {Math.round(drone.altitude)} ft
                      </span>
                    </div>
                    <div className="metric-box">
                      <span className="lbl">Speed</span>
                      <span className="val">
                        {Math.round(drone.speed)} km/h
                      </span>
                    </div>
                    <div className="metric-box">
                      <span className="lbl">Heading</span>
                      <span className="val">{Math.round(drone.heading)}°</span>
                    </div>
                    <div className="metric-box">
                      <span className="lbl">Progress</span>
                      <span className="val">
                        {Math.round((drone.progress || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                  {drone.warning_level > 0 && (
                    <div className="drone-popup-warning">
                      ⚠️ Active Deconfliction / Yellow Safety Buffer Reroute
                    </div>
                  )}
                  <div className="drone-coords">
                    Lat: {drone.lat.toFixed(4)} | Lng: {drone.lng.toFixed(4)}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
