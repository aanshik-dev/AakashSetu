import React, { useState } from 'react';
import './ControlPanel.css';

export default function ControlPanel({
  drones = [],
  selectedDrone,
  onSelectDrone,
  onInitiateFlight,
  onOpenAddDroneModal,
  onTogglePause,
  isPaused,
  onSpeedChange,
  currentSpeed = 10,
  onReset,
  isInitiating,
  showAllPaths = false,
  onToggleShowAllPaths
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('drones');

  return (
    <>
      {/* ─── Bottom-Left Floating Actions ─── */}
      <div className="bottom-left-action-container">
        {/* Toggle Path Visibility Button */}
        <button
          className={`btn-path-toggle glass-panel ${showAllPaths ? 'active' : ''}`}
          onClick={onToggleShowAllPaths}
          title="Toggle trajectory lines and pins visibility"
        >
          <span className="toggle-icon">{showAllPaths ? '👁️' : '🕶️'}</span>
          <span>{showAllPaths ? 'Paths: ALL VISIBLE' : 'Paths: SELECTED ONLY'}</span>
        </button>

        {/* Primary Initiate Flight Button */}
        <button
          className={`btn-initiate-flight-primary ${isInitiating ? 'loading' : ''}`}
          onClick={onInitiateFlight}
          disabled={isInitiating}
          title="Deploy autonomous multi-operator drone fleet"
        >
          <div className="initiate-btn-glow"></div>
          <div className="initiate-btn-content">
            <span className="btn-icon">⚡</span>
            <div className="btn-text-group">
              <span className="btn-title">{drones.length === 0 ? 'DEPLOY FLEET' : 'REDEPLOY FLEET'}</span>
              <span className="btn-subtitle">{drones.length === 0 ? 'Launch 6-12 Drones' : 'Reset & Spawn New Drones'}</span>
            </div>
          </div>
        </button>

        {/* Add Drone Button */}
        <button
          className="btn-add-drone-floating glass-panel"
          onClick={onOpenAddDroneModal}
          title="Register a custom drone mission"
        >
          <span>➕ Add Custom Drone</span>
        </button>
      </div>

      {/* ─── Left Sidebar Dashboard ─── */}
      <div className={`control-panel-sidebar glass-panel ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-title">
            <span className="icon">🛰️</span>
            <h3>Airspace Control</h3>
          </div>
          <button
            className="btn-collapse"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
          >
            {isCollapsed ? '▶' : '◀'}
          </button>
        </div>

        {!isCollapsed && (
          <div className="sidebar-body">
            {/* Tab Navigation */}
            <div className="tab-switcher">
              <button
                className={`tab-btn ${activeTab === 'drones' ? 'active' : ''}`}
                onClick={() => setActiveTab('drones')}
              >
                Active Fleet ({drones.length})
              </button>
              <button
                className={`tab-btn ${activeTab === 'controls' ? 'active' : ''}`}
                onClick={() => setActiveTab('controls')}
              >
                Simulation
              </button>
            </div>

            {/* TAB: ACTIVE FLEET LIST */}
            {activeTab === 'drones' && (
              <div className="drone-list-section">
                {drones.length === 0 ? (
                  <div className="empty-fleet-state">
                    <div className="empty-icon">🛸</div>
                    <h4>Airspace is Clear</h4>
                    <p>No active drones airborne. Click "Initiate Flight" below to deploy autonomous missions.</p>
                  </div>
                ) : (
                  <div className="drone-scroll-list">
                    {drones.map((drone) => {
                      const isSelected = selectedDrone?.id === drone.id;
                      const isWarning = drone.warning_level >= 2;

                      return (
                        <div
                          key={drone.id}
                          className={`drone-list-item ${isSelected ? 'selected' : ''} ${isWarning ? 'warning-item' : ''}`}
                          onClick={() => onSelectDrone(drone)}
                        >
                          <div className="item-header">
                            <span className="drone-id" style={{ color: drone.operator_color }}>
                              {drone.id}
                            </span>
                            <span className={`status-pill pill-${drone.status}`}>
                              {drone.status.replace('_', ' ')}
                            </span>
                          </div>

                          <div className="item-operator">{drone.operator}</div>

                          <div className="item-stats">
                            <span>Alt: <strong>{Math.round(drone.altitude)}ft</strong></span>
                            <span>Speed: <strong>{Math.round(drone.speed)}km/h</strong></span>
                            <span>Prog: <strong>{Math.round((drone.progress || 0) * 100)}%</strong></span>
                          </div>

                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.round((drone.progress || 0) * 100)}%`,
                                backgroundColor: isWarning ? 'var(--accent-red)' : (drone.operator_color || 'var(--accent-cyan)'),
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: SIMULATION CONTROLS */}
            {activeTab === 'controls' && (
              <div className="simulation-controls-section">
                <div className="control-group">
                  <label className="control-label">Trajectory Display Mode</label>
                  <button
                    className={`btn-ctrl ${showAllPaths ? 'btn-primary-action' : 'btn-reset'}`}
                    onClick={onToggleShowAllPaths}
                  >
                    {showAllPaths ? '👁️ All Flight Corridors Visible' : '🕶️ Focused (Selected Only)'}
                  </button>
                </div>

                <div className="control-group">
                  <label className="control-label">Playback State</label>
                  <div className="btn-row">
                    <button
                      className={`btn-ctrl ${isPaused ? 'btn-resume' : 'btn-pause'}`}
                      onClick={onTogglePause}
                    >
                      {isPaused ? '▶ Resume Sim' : '⏸ Pause Sim'}
                    </button>
                    <button className="btn-ctrl btn-reset" onClick={onReset}>
                      🔄 Clear Sky
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">Simulation Speed Multiplier</label>
                  <div className="speed-buttons-grid">
                    {[1, 2, 5, 10, 20].map((s) => (
                      <button
                        key={s}
                        className={`speed-btn ${currentSpeed === s ? 'active' : ''}`}
                        onClick={() => onSpeedChange(s)}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">Safety &amp; Geo-Fencing Standards</label>
                  <div className="feature-status-card">
                    <div className="feature-row">
                      <span>Yellow Safety Buffer Region</span>
                      <strong style={{ color: '#ffe600' }}>200 m (Active)</strong>
                    </div>
                    <div className="feature-row">
                      <span>Multi-Zone Cluster Merging</span>
                      <strong style={{ color: '#a855f7' }}>Convex Envelope</strong>
                    </div>
                    <div className="feature-row">
                      <span>Collision Range (Horizontal)</span>
                      <strong>100 m</strong>
                    </div>
                    <div className="feature-row">
                      <span>Vertical Safe Separation</span>
                      <strong>30 ft</strong>
                    </div>
                  </div>
                </div>

                <div className="control-group">
                  <button className="btn-ctrl btn-primary-action" onClick={onOpenAddDroneModal}>
                    ➕ Register Custom Drone Mission
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
