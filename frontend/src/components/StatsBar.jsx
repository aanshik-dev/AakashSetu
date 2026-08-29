/**
 * AkashSetu - Stats Bar
 * Top horizontal bar showing live simulation statistics.
 */

import { useEffect, useState } from 'react';
import './StatsBar.css';

function AnimatedCounter({ value, label, icon, color }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  return (
    <div className="stat-item" style={{ '--stat-color': color }}>
      <span className="stat-icon">{icon}</span>
      <div className="stat-content">
        <span className={`stat-value ${displayValue !== value ? 'stat-tick' : ''}`}>
          {typeof displayValue === 'number' && displayValue % 1 !== 0
            ? displayValue.toFixed(1)
            : displayValue}
        </span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
}

export default function StatsBar({ stats, connectionStatus }) {
  const formatUptime = (seconds) => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="stats-bar glass-panel">
      <div className="stats-left">
        <div className="brand">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" 
                stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">AkashSetu</span>
            <span className="brand-sub">Airspace Coordination</span>
          </div>
        </div>
        <div className={`connection-status ${connectionStatus}`}>
          <span className="connection-dot"></span>
          <span className="connection-text">
            {connectionStatus === 'connected' ? 'LIVE' : connectionStatus.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="stats-center">
        <AnimatedCounter
          value={stats?.active_drones || 0}
          label="Active"
          icon="🛸"
          color="var(--accent-cyan)"
        />
        <div className="stat-divider" />
        <AnimatedCounter
          value={stats?.completed_drones || 0}
          label="Completed"
          icon="🛬"
          color="var(--accent-green)"
        />
        <div className="stat-divider" />
        <AnimatedCounter
          value={stats?.collisions_averted || 0}
          label="Averted"
          icon="🛡️"
          color="var(--accent-cyan)"
        />
        <div className="stat-divider" />
        <AnimatedCounter
          value={stats?.safety_reroutes || 0}
          label="Safe Reroutes"
          icon="🔄"
          color="#ffe600"
        />
        <div className="stat-divider" />
        <AnimatedCounter
          value={stats?.geofence_violations || 0}
          label="Violations"
          icon="🚫"
          color="var(--accent-red)"
        />
      </div>

      <div className="stats-right">
        <div className="uptime">
          <span className="uptime-icon">⏱</span>
          <span className="uptime-value">{formatUptime(stats?.uptime_seconds)}</span>
        </div>
      </div>
    </div>
  );
}
