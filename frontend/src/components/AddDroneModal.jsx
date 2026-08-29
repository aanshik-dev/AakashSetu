import React, { useState } from 'react';
import './AddDroneModal.css';

export default function AddDroneModal({
  isOpen,
  onClose,
  onSubmit,
  onStartPinSelection,
  pinSelectionMode,
  pinnedSource,
  pinnedDest,
}) {
  const [droneId, setDroneId] = useState(`DRN-${Math.floor(1000 + Math.random() * 9000)}`);
  const [operator, setOperator] = useState('SwiftDeliver Logistics');
  const [sourceLat, setSourceLat] = useState('28.6300');
  const [sourceLng, setSourceLng] = useState('77.1800');
  const [destLat, setDestLat] = useState('28.5200');
  const [destLng, setDestLng] = useState('77.2600');
  const [altitude, setAltitude] = useState(150);
  const [speed, setSpeed] = useState(55);
  const [errorMsg, setErrorMsg] = useState('');

  // Update fields when user pins coordinates on map
  React.useEffect(() => {
    if (pinnedSource) {
      setSourceLat(pinnedSource.lat.toString());
      setSourceLng(pinnedSource.lng.toString());
    }
  }, [pinnedSource]);

  React.useEffect(() => {
    if (pinnedDest) {
      setDestLat(pinnedDest.lat.toString());
      setDestLng(pinnedDest.lng.toString());
    }
  }, [pinnedDest]);

  if (!isOpen && !pinSelectionMode) return null;

  const generateRandomCallsign = () => {
    const prefixes = ['AKASH', 'GARUDA', 'VARUNA', 'VAYU', 'AGNI', 'SURYA', 'TRISHUL'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(100 + Math.random() * 900);
    setDroneId(`${prefix}-${num}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const sLat = parseFloat(sourceLat);
    const sLng = parseFloat(sourceLng);
    const dLat = parseFloat(destLat);
    const dLng = parseFloat(destLng);

    if (isNaN(sLat) || isNaN(sLng) || isNaN(dLat) || isNaN(dLng)) {
      setErrorMsg('Please enter valid numeric latitude and longitude coordinates.');
      return;
    }

    if (sLat === dLat && sLng === dLng) {
      setErrorMsg('Source and destination coordinates cannot be identical.');
      return;
    }

    try {
      const res = await onSubmit({
        id: droneId.trim() || undefined,
        operator: operator.trim() || 'Autonomous UAV',
        source_lat: sLat,
        source_lng: sLng,
        dest_lat: dLat,
        dest_lng: dLng,
        altitude: Number(altitude),
        speed: Number(speed),
      });

      if (res && res.error) {
        setErrorMsg(res.error);
        return;
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to authorize flight plan in restricted space.');
    }
  };

  // If in pin selection mode, show a floating helper card instead of blocking modal
  if (pinSelectionMode) {
    return (
      <div className="pin-selection-floating-card glass-panel">
        <div className="pin-card-header">
          <span>📍 Pinning {pinSelectionMode.toUpperCase()} on Map</span>
          <button className="btn-cancel-pin" onClick={() => onStartPinSelection(null)}>
            ✕ Cancel
          </button>
        </div>
        <p>Click anywhere on the interactive map to select the {pinSelectionMode} location.</p>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="add-drone-modal-content glass-panel animate-scale-up">
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-icon">🛸</span>
            <h3>Register Mission Drone</h3>
          </div>
          <button className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {errorMsg && <div className="modal-error-banner">{errorMsg}</div>}

          {/* Callsign / Drone ID */}
          <div className="form-group">
            <label className="form-label">Drone ID / Callsign</label>
            <div className="input-with-action">
              <input
                type="text"
                value={droneId}
                onChange={(e) => setDroneId(e.target.value)}
                placeholder="e.g. AKASH-101"
                required
                className="form-input"
              />
              <button
                type="button"
                className="btn-action-small"
                onClick={generateRandomCallsign}
                title="Generate Indian aerospace callsign"
              >
                🎲 Random
              </button>
            </div>
          </div>

          {/* Operator */}
          <div className="form-group">
            <label className="form-label">Fleet Operator</label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="form-select"
            >
              <option value="AgriSprayer Corp">AgriSprayer Corp (Agricultural UAV)</option>
              <option value="SwiftDeliver Logistics">SwiftDeliver Logistics (Express Cargo)</option>
              <option value="SurveyMasters India">SurveyMasters India (LIDAR / Mapping)</option>
              <option value="MediDrop Emergency">MediDrop Emergency (Medical Transit)</option>
              <option value="GreenField Agri-Tech">GreenField Agri-Tech (Precision Farming)</option>
              <option value="CityLogistics Pro">CityLogistics Pro (Urban Courier)</option>
              <option value="Autonomous Research UAV">Autonomous Research UAV (Experimental)</option>
            </select>
          </div>

          {/* Source Coordinates */}
          <div className="coords-section">
            <div className="coords-header">
              <span className="badge badge-green">STARTING POINT (SOURCE)</span>
              <button
                type="button"
                className="btn-pin-map"
                onClick={() => onStartPinSelection('source')}
              >
                📍 Pin on Map
              </button>
            </div>
            <div className="lat-lng-row">
              <div className="field-half">
                <label>Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={sourceLat}
                  onChange={(e) => setSourceLat(e.target.value)}
                  required
                  className="form-input"
                />
              </div>
              <div className="field-half">
                <label>Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={sourceLng}
                  onChange={(e) => setSourceLng(e.target.value)}
                  required
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Destination Coordinates */}
          <div className="coords-section">
            <div className="coords-header">
              <span className="badge badge-red">DESTINATION</span>
              <button
                type="button"
                className="btn-pin-map"
                onClick={() => onStartPinSelection('destination')}
              >
                📍 Pin on Map
              </button>
            </div>
            <div className="lat-lng-row">
              <div className="field-half">
                <label>Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={destLat}
                  onChange={(e) => setDestLat(e.target.value)}
                  required
                  className="form-input"
                />
              </div>
              <div className="field-half">
                <label>Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={destLng}
                  onChange={(e) => setDestLng(e.target.value)}
                  required
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Altitude & Speed sliders */}
          <div className="sliders-grid">
            <div className="slider-box">
              <div className="slider-label-row">
                <span>Cruising Altitude</span>
                <strong>{altitude} ft</strong>
              </div>
              <input
                type="range"
                min="50"
                max="400"
                step="10"
                value={altitude}
                onChange={(e) => setAltitude(e.target.value)}
                className="form-range"
              />
              <div className="range-hints">
                <span>50ft</span>
                <span style={{ color: 'var(--accent-cyan)' }}>DGCA Limit: 400ft</span>
              </div>
            </div>

            <div className="slider-box">
              <div className="slider-label-row">
                <span>Flight Speed</span>
                <strong>{speed} km/h</strong>
              </div>
              <input
                type="range"
                min="30"
                max="80"
                step="5"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                className="form-range"
              />
              <div className="range-hints">
                <span>30 km/h</span>
                <span>80 km/h</span>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-modal-submit">
              🚀 Launch Drone Mission
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
