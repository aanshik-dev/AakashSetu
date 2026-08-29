import React, { useState, useEffect, useRef } from 'react';
import './SystemLogConsole.css';

export default function SystemLogConsole({ logs = [] }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [levelFilter, setLevelFilter] = useState('ALL'); // 'ALL' | 'CRITICAL' | 'WARNING' | 'CAUTION' | 'INFO'
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef(null);

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== 'ALL' && log.level !== levelFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        (log.source_drone_id && log.source_drone_id.toLowerCase().includes(q)) ||
        (log.category && log.category.toLowerCase().includes(q))
      );
    }
    return true;
  });

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const formatTimestamp = (ts) => {
    if (!ts) return '--:--:--';
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 1 });
  };

  const getLevelBadgeClass = (lvl) => {
    switch (lvl) {
      case 'CRITICAL': return 'lvl-critical';
      case 'WARNING': return 'lvl-warning';
      case 'CAUTION': return 'lvl-caution';
      case 'SUCCESS': return 'lvl-success';
      default: return 'lvl-info';
    }
  };

  return (
    <div className={`syslog-console glass-panel ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Console Title Bar */}
      <div className="console-header">
        <div className="header-left">
          <span className="console-status-dot"></span>
          <span className="console-title">SYSTEM TELEMETRY LOGS</span>
          <span className="log-counter">{filteredLogs.length} / {logs.length}</span>
        </div>
        <div className="header-actions">
          <button
            className={`btn-autoscroll ${autoScroll ? 'active' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Toggle Auto-scroll"
          >
            {autoScroll ? '⬇ Auto' : '⏸ Scroll'}
          </button>
          <button
            className="btn-collapse"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand Log Console' : 'Collapse Log Console'}
          >
            {isCollapsed ? '◀' : '▶'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Controls & Search */}
          <div className="console-toolbar">
            <div className="level-filters">
              {['ALL', 'CRITICAL', 'WARNING', 'CAUTION', 'INFO'].map((lvl) => (
                <button
                  key={lvl}
                  className={`filter-btn ${levelFilter === lvl ? 'active' : ''} lvl-${lvl.toLowerCase()}`}
                  onClick={() => setLevelFilter(lvl)}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <div className="search-box">
              <input
                type="text"
                placeholder="Filter logs by drone ID or keyword..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="console-search-input"
              />
              {searchTerm && (
                <button className="btn-clear-search" onClick={() => setSearchTerm('')}>✕</button>
              )}
            </div>
          </div>

          {/* Monospace Fast-Render Log Stream */}
          <div className="console-stream">
            {filteredLogs.length === 0 ? (
              <div className="stream-empty">
                <span>⚡</span>
                <p>No log records matching filter. System operational.</p>
              </div>
            ) : (
              filteredLogs.map((entry) => (
                <div key={entry.id} className={`log-row ${getLevelBadgeClass(entry.level)}`}>
                  <span className="log-time">{formatTimestamp(entry.timestamp)}</span>
                  <span className={`log-badge ${getLevelBadgeClass(entry.level)}`}>
                    {entry.level}
                  </span>
                  <span className="log-cat">[{entry.category || 'SYS'}]</span>
                  <span className="log-text">{entry.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </>
      )}
    </div>
  );
}
