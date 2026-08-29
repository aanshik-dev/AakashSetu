import React, { useState, useEffect, useRef } from 'react';
import './AlertFeed.css';

export default function AlertFeed({ events = [] }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'warnings' | 'reroutes'
  const listEndRef = useRef(null);

  const filteredEvents = events.filter((ev) => {
    if (filter === 'warnings') return ev.severity >= 2 || ev.event_type.includes('warning') || ev.event_type.includes('violation');
    if (filter === 'reroutes') return ev.event_type.includes('reroute') || ev.event_type.includes('altitude');
    return true;
  });

  const getEventIcon = (type) => {
    switch (type) {
      case 'collision_warning': return '⚠️';
      case 'collision_averted': return '🛡️';
      case 'geofence_warning': return '⚡';
      case 'geofence_violation': return '🚫';
      case 'reroute': return '🔄';
      case 'altitude_change': return '🔺';
      case 'speed_change': return '🐌';
      case 'drone_added': return '➕';
      case 'drone_landed': return '🛬';
      case 'simulation_started': return '🚀';
      default: return '📡';
    }
  };

  const getEventBadgeClass = (severity, type) => {
    if (severity >= 3 || type.includes('violation')) return 'badge-red';
    if (severity >= 2 || type.includes('warning')) return 'badge-amber';
    if (type.includes('averted') || type.includes('landed')) return 'badge-green';
    return 'badge-cyan';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className={`alert-feed-container glass-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="alert-feed-header">
        <div className="header-title">
          <span className="live-dot animate-pulse"></span>
          <h4>Live Airspace Telemetry &amp; Alerts</h4>
          <span className="event-count-tag">{events.length}</span>
        </div>
        <button
          className="btn-collapse"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand Feed' : 'Collapse Feed'}
        >
          {isCollapsed ? '◀' : '▶'}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="alert-filter-bar">
            <button
              className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Events
            </button>
            <button
              className={`filter-pill ${filter === 'warnings' ? 'active' : ''}`}
              onClick={() => setFilter('warnings')}
            >
              ⚠️ Conflicts &amp; Zones
            </button>
            <button
              className={`filter-pill ${filter === 'reroutes' ? 'active' : ''}`}
              onClick={() => setFilter('reroutes')}
            >
              🔄 Reroutes
            </button>
          </div>

          <div className="alert-list-scroll">
            {filteredEvents.length === 0 ? (
              <div className="empty-alerts">
                <span>🛡️</span>
                <p>No active airspace warnings. Flights are executing on safe trajectories.</p>
              </div>
            ) : (
              filteredEvents.slice().reverse().map((ev) => (
                <div
                  key={ev.id}
                  className={`alert-card ${ev.severity >= 3 ? 'card-critical' : ev.severity >= 2 ? 'card-warning' : 'card-info'}`}
                >
                  <div className="alert-card-top">
                    <span className="alert-icon">{getEventIcon(ev.event_type)}</span>
                    <span className={`badge ${getEventBadgeClass(ev.severity, ev.event_type)}`}>
                      {ev.event_type.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="alert-time">{formatTime(ev.timestamp)}</span>
                  </div>

                  <div className="alert-msg">{ev.message}</div>

                  {ev.details && Object.keys(ev.details).length > 0 && (
                    <div className="alert-details-box">
                      {ev.details.horizontal_distance && (
                        <span>Separation: <strong>{ev.details.horizontal_distance}m</strong></span>
                      )}
                      {ev.details.new_altitude && (
                        <span>New Alt: <strong>{Math.round(ev.details.new_altitude)}ft</strong></span>
                      )}
                      {ev.details.zone_name && (
                        <span>Zone: <strong>{ev.details.zone_name}</strong></span>
                      )}
                      {ev.details.distance_m && (
                        <span>Distance to boundary: <strong>{ev.details.distance_m}m</strong></span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={listEndRef} />
          </div>
        </>
      )}
    </div>
  );
}
