import React, { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import StatsBar from './components/StatsBar';
import MapView from './components/MapView';
import ControlPanel from './components/ControlPanel';
import SystemLogConsole from './components/SystemLogConsole';
import AddDroneModal from './components/AddDroneModal';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

export default function App() {
  const {
    isConnected,
    connectionStatus,
    telemetry,
    setSpeed: setWsSpeed,
    togglePause: toggleWsPause
  } = useWebSocket();

  const [selectedDrone, setSelectedDrone] = useState(null);
  const [showAllPaths, setShowAllPaths] = useState(false); // Toggle: All paths vs Selected drone only
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [pinSelectionMode, setPinSelectionMode] = useState(null); // 'source' | 'destination' | null
  const [pinnedSource, setPinnedSource] = useState(null);
  const [pinnedDest, setPinnedDest] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(10);
  const [isInitiating, setIsInitiating] = useState(false);

  const drones = telemetry?.drones || [];
  const zones = telemetry?.zones || [];
  const virtualZones = telemetry?.virtual_zones || [];
  const logs = telemetry?.logs || [];
  const stats = telemetry?.stats || {
    active_drones: drones.length,
    total_drones: drones.length,
    completed_drones: 0,
    collisions_averted: 0,
    geofence_violations: 0,
    safety_reroutes: 0,
    active_warnings: 0,
    uptime_seconds: 0
  };

  // Sync selected drone with updated telemetry; if landed/removed, clear selection
  useEffect(() => {
    if (selectedDrone) {
      const updated = drones.find((d) => d.id === selectedDrone.id);
      if (updated) {
        setSelectedDrone(updated);
      } else {
        setSelectedDrone(null); // Drone has landed and left airspace
      }
    }
  }, [drones]);

  // Initiate simulation flight (Spawns 10-14 drones)
  const handleInitiateFlight = async () => {
    try {
      setIsInitiating(true);
      const res = await fetch(`${API_BASE_URL}/api/initiate-flight`, {
        method: 'POST',
      });
      const data = await res.json();
      console.log('[App] Flight initiated:', data);
    } catch (err) {
      console.error('[App] Failed to initiate flight:', err);
    } finally {
      setIsInitiating(false);
    }
  };

  // Add custom drone mission
  const handleAddDrone = async (dronePayload) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/add-drone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dronePayload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        return { error: errorData.detail || 'Authorization failed. Coordinates in restricted airspace.' };
      }

      const data = await res.json();
      console.log('[App] Drone added:', data);
      setPinnedSource(null);
      setPinnedDest(null);
      return { success: true };
    } catch (err) {
      console.error('[App] Failed to add drone:', err);
      return { error: err.message || 'Network error connecting to airspace coordinator.' };
    }
  };

  // Toggle pause
  const handleTogglePause = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/pause`, { method: 'POST' });
      const data = await res.json();
      setIsPaused(data.paused);
      toggleWsPause();
    } catch (err) {
      console.error('[App] Failed to toggle pause:', err);
    }
  };

  // Change simulation speed
  const handleSpeedChange = async (multiplier) => {
    try {
      setCurrentSpeed(multiplier);
      await fetch(`${API_BASE_URL}/api/speed?multiplier=${multiplier}`, { method: 'POST' });
      setWsSpeed(multiplier);
    } catch (err) {
      console.error('[App] Failed to change speed:', err);
    }
  };

  // Reset simulation
  const handleReset = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/reset`, { method: 'POST' });
      setSelectedDrone(null);
    } catch (err) {
      console.error('[App] Failed to reset simulation:', err);
    }
  };

  // Map pin selection callback
  const handleMapPinSelected = (coords) => {
    if (pinSelectionMode === 'source') {
      setPinnedSource(coords);
    } else if (pinSelectionMode === 'destination') {
      setPinnedDest(coords);
    }
    setPinSelectionMode(null);
    setIsAddModalOpen(true);
  };

  const handleStartPinSelection = (mode) => {
    setPinSelectionMode(mode);
    setIsAddModalOpen(false);
  };

  return (
    <div className="app-container">
      {/* Top Stats Bar */}
      <StatsBar stats={stats} connectionStatus={connectionStatus} />

      {/* Main Map View */}
      <MapView
        drones={drones}
        zones={zones}
        virtualZones={virtualZones}
        selectedDrone={selectedDrone}
        onSelectDrone={setSelectedDrone}
        showAllPaths={showAllPaths}
        pinSelectionMode={pinSelectionMode}
        onMapPinSelected={handleMapPinSelected}
        previewPinSource={pinnedSource}
        previewPinDest={pinnedDest}
      />

      {/* Left Control Panel & Bottom-Left Floating Actions */}
      <ControlPanel
        drones={drones}
        selectedDrone={selectedDrone}
        onSelectDrone={setSelectedDrone}
        onInitiateFlight={handleInitiateFlight}
        onOpenAddDroneModal={() => setIsAddModalOpen(true)}
        onTogglePause={handleTogglePause}
        isPaused={isPaused}
        onSpeedChange={handleSpeedChange}
        currentSpeed={currentSpeed}
        onReset={handleReset}
        isInitiating={isInitiating}
        showAllPaths={showAllPaths}
        onToggleShowAllPaths={() => setShowAllPaths(!showAllPaths)}
      />

      {/* Right Real-time Monospace System Log Console */}
      <SystemLogConsole logs={logs} />

      {/* Add Drone Modal */}
      <AddDroneModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setPinSelectionMode(null);
        }}
        onSubmit={handleAddDrone}
        onStartPinSelection={handleStartPinSelection}
        pinSelectionMode={pinSelectionMode}
        pinnedSource={pinnedSource}
        pinnedDest={pinnedDest}
      />
    </div>
  );
}
