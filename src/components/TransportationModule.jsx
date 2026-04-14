import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { exportToExcel, exportToCSV, printToPDF } from '../utils/exportEngine';
import ConfirmModal from './ConfirmModal';
import { resetTransportationOnly } from '../utils/systemUtils';
import './AttendanceTable.css';
import './TransportationModule.css';

export default function TransportationModule() {
  const [players, setPlayers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Date Range Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Table expansion state
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetTransportationOnly();
    } catch (e) {
      alert("Reset failed.");
    } finally {
      setIsResetting(false);
    }
  };

  // Filters
  const [filterSport, setFilterSport] = useState('All');
  const [filterCoach, setFilterCoach] = useState('All');
  const [filterTiming, setFilterTiming] = useState('All');
  const [filterAttendance, setFilterAttendance] = useState('All'); // 'All', 'attended', 'absent_only'
  const [filterTransport, setFilterTransport] = useState('All'); // 'All', 'Yes', 'No'

  useEffect(() => {
    setLoading(true);
    
    // 1. Fetch Master Players List (v2)
    const qPlayers = query(collection(db, "players_v2"));
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const pList = snapshot.docs.map(doc => ({
        firestoreId: doc.id,
        ...doc.data()
      }));
      setPlayers(pList);
    });

    // 2. Fetch Historical Logs
    const qLogs = query(collection(db, "attendance_logs"));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const lList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(lList);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching logs:", error);
      setLoading(false);
    });

    return () => {
      unsubPlayers();
      unsubLogs();
    };
  }, []);

  // Helpers
  const isUsingTransport = (p) => !!p.transportation && p.transportation.trim() !== '' && p.transportation !== 'Own Transportation';

  // Derived filter options
  const sports = useMemo(() => Array.from(new Set(players.flatMap(p => p.sports || (p.sport ? p.sport.split(',').map(s=>s.trim()) : [])))).filter(Boolean).sort(), [players]);
  const coaches = useMemo(() => Array.from(new Set(players.map(p => p.coach || 'Unassigned'))).filter(Boolean).sort(), [players]);
  const timings = useMemo(() => Array.from(new Set(players.map(p => p.classTiming?.trim()))).filter(Boolean).sort(), [players]);

  // 📊 DATA INTELLIGENCE ENGINE (Phase 2: Instance-Based)
  const transportData = useMemo(() => {
    const instances = [];
    const distMap = {}; // Distribution for Donut
    const loadMap = {}; // Timing load for Bar
    const trendMap = {}; // Daily trend for Line
    const peakMap = {}; // For Peak Load detection
    
    // Sort logs by date correctly
    const sortedLogs = [...logs].sort((a,b) => (a.date || '').localeCompare(b.date || ''));

    sortedLogs.forEach(log => {
      if (!log.date || log.date < startDate || log.date > endDate) return;
      if (!log.attendance || !Array.isArray(log.attendance)) return;

      log.attendance.forEach(record => {
        // 🚫 STRICT FILTER: Only present players with transport assigned
        const isPresent = record.status === 'present';
        const hasTransport = record.transportation && record.transportation !== 'None' && record.transportation !== 'Own Transportation';
        
        if (!isPresent) return; // Skip absent players entirely

        const master = players.find(p => p.id === record.id) || {};
        const timing = master.classTiming || log.timing || 'N/A';
        const sport = master.sports?.join(', ') || master.sport || log.sport || 'N/A';
        const transport = record.transportation || 'N/A';

        // Add to main table data
        instances.push({
          id: record.id,
          name: record.name,
          sport,
          timing,
          date: log.date,
          transport
        });

        // Skip metrics for "Own Transport" if filtering strictly for FMAC Usage
        // (Though the user said "exclude empty/irrelevant", usually "Own" is excluded)
        if (transport === 'Own Transportation' || transport === 'N/A') return;

        // Analytics Processing
        distMap[transport] = (distMap[transport] || 0) + 1;
        loadMap[timing] = (loadMap[timing] || 0) + 1;
        trendMap[log.date] = (trendMap[log.date] || 0) + 1;
        
        const peakKey = `${log.date} @ ${timing}`;
        peakMap[peakKey] = (peakMap[peakKey] || 0) + 1;
      });
    });

    // Determine Peak Load
    const peakEntry = Object.entries(peakMap).sort((a,b) => b[1] - a[1])[0];
    const peakLoad = peakEntry ? { label: peakEntry[0], count: peakEntry[1] } : null;

    // Filter instances based on UI filters
    const filteredInstances = instances.filter(inst => {
      const matchesSport = filterSport === 'All' || inst.sport.includes(filterSport);
      const matchesTiming = filterTiming === 'All' || inst.timing === filterTiming;
      const matchesTransport = filterTransport === 'All' || inst.transport === filterTransport;
      return matchesSport && matchesTiming && matchesTransport;
    });

    return {
      instances: filteredInstances,
      dist: distMap,
      load: loadMap,
      trend: trendMap,
      peak: peakLoad
    };
  }, [logs, players, startDate, endDate, filterSport, filterTiming, filterTransport]);

  // Extract unique transport methods for filtering
  const transportMethods = useMemo(() => {
    const methods = new Set();
    logs.forEach(log => log.attendance?.forEach(r => {
      if (r.transportation && r.transportation !== 'None') methods.add(r.transportation);
    }));
    return Array.from(methods).sort();
  }, [logs]);

  // Metrics Extraction
  const stats = useMemo(() => {
    const totalPresent = transportData.instances.length;
    const transportUsers = transportData.instances.filter(i => i.transport !== 'Own Transportation' && i.transport !== 'N/A').length;
    const utilization = totalPresent > 0 ? Math.round((transportUsers / totalPresent) * 100) : 0;
    
    // Summary of transport methods
    const methodSummary = Object.entries(transportData.dist)
      .sort((a,b) => b[1] - a[1])
      .map(([method, count]) => ({ method, count }));

    return { totalPresent, transportUsers, utilization, methodSummary, peak: transportData.peak };
  }, [transportData]);

  const handleExport = (type) => {
    const exportFormat = transportData.instances.map(inst => ({
      "Player ID": inst.id,
      "Player Name": inst.name,
      "Sport": inst.sport,
      "Class Timing": inst.timing,
      "Date": inst.date,
      "Transportation Method": inst.transport
    }));

    if (type === 'excel') exportToExcel(exportFormat, `FMAC_Transport_Log_${startDate}_to_${endDate}`);
    if (type === 'csv') exportToCSV(exportFormat, `FMAC_Transport_Log_${startDate}_to_${endDate}`);
    if (type === 'pdf') printToPDF();
  };

  if (loading) {
    return (
      <div className="jumping-logo-container animate-fade-in" style={{ height: '70vh' }}>
        <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
        <span className="jumping-text">Calculating Demand...</span>
      </div>
    );
  }

  return (
    <div className="tm-container animate-fade-in">
      
      {/* 📄 PRINT ONLY HEADER (Structured Report) */}
      <div className="tm-print-header">
        <h1 className="report-title">FMAC Transportation Intelligence Report</h1>
        <div className="report-meta">
          <span>Period: {startDate} to {endDate}</span>
          <span>Generated: {new Date().toLocaleString()}</span>
        </div>
      </div>

      {/* Header Area (UI) */}
      <div className="tm-header-row no-print">
        <div>
          <h2 className="tm-title">Transport Demand & Log</h2>
          <p className="tm-subtitle">Actual usage by present players (excludes absences)</p>
        </div>
        <div className="tm-export-bar">
          <button className="tm-btn" onClick={() => handleExport('csv')}>Export CSV</button>
          <button className="tm-btn" onClick={() => handleExport('excel')}>Export Excel</button>
          <button className="tm-btn primary" onClick={() => handleExport('pdf')}>Print Report</button>
          <button 
            className="tm-btn danger" 
            onClick={() => setResetModalOpen(true)}
            disabled={isResetting}
            title="Clear all current transportation assignments"
          >
            {isResetting ? "..." : "Reset Data"}
          </button>
        </div>
      </div>

      {/* Date & Filters Layer (UI) */}
      <div className="tm-controls-card glass-panel no-print">
        <div className="tm-date-range">
          <div className="date-input-group">
            <label>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="date-input-group">
            <label>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        
        <div className="tm-quick-filters">
          <select value={filterTiming} onChange={(e) => setFilterTiming(e.target.value)}>
            <option value="All">All Timings</option>
            {timings.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterSport} onChange={(e) => setFilterSport(e.target.value)}>
            <option value="All">All Sports</option>
            {sports.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterTransport} onChange={(e) => setFilterTransport(e.target.value)}>
            <option value="All">All Transport Methods</option>
            {transportMethods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Stats Grid (Report Friendly) */}
      <div className="tm-bento-grid">
        <div className="tm-metric-card">
          <span className="tm-metric-label">Total Present Players</span>
          <span className="tm-metric-value">{stats.totalPresent}</span>
        </div>
        <div className="tm-metric-card">
          <span className="tm-metric-label">Active Transport Users</span>
          <span className="tm-metric-value accent">{stats.transportUsers}</span>
        </div>
        <div className="tm-metric-card">
          <span className="tm-metric-label">Peak Usage</span>
          <div className="p-peak-info">
            <span className="p-peak-lbl">{stats.peak?.label || 'N/A'}</span>
            <span className="p-peak-val">{stats.peak?.count || 0} users</span>
          </div>
        </div>
        <div className="tm-metric-card">
          <span className="tm-metric-label">Utilization Rate</span>
          <div className="tm-stat-with-bar">
            <span className="tm-metric-value">{stats.utilization}%</span>
            <div className="mini-progress-track">
              <div className="mini-progress-fill" style={{ width: `${stats.utilization}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* 📊 ANALYTICS MATRIX */}
      <div className="tm-analytics-shelf">
        
        {/* Daily Trend Load (Line Chart) */}
        <div className="tm-chart-card line-card">
          <h3 className="tm-chart-title">Daily Transport Demand</h3>
          <div className="tm-line-chart">
            <svg width="100%" height="150" viewBox="0 0 500 150" preserveAspectRatio="none">
              {/* Grid Lines */}
              <line x1="0" y1="125" x2="500" y2="125" stroke="#EEE" strokeWidth="1" />
              <line x1="0" y1="75" x2="500" y2="75" stroke="#EEE" strokeDasharray="4 4" />
              <line x1="0" y1="25" x2="500" y2="25" stroke="#EEE" strokeDasharray="4 4" />
              
              {/* Line Generation */}
              {(() => {
                const dates = Object.keys(transportData.trend).sort();
                if (dates.length < 2) return null;
                const maxVal = Math.max(...Object.values(transportData.trend), 1);
                const points = dates.map((d, i) => {
                  const x = (i / (dates.length - 1)) * 500;
                  const y = 125 - (transportData.trend[d] / maxVal) * 100;
                  return `${x},${y}`;
                }).join(' ');
                
                return (
                  <>
                    <path d={`M ${points.split(' ')[0]} L ${points}`} fill="none" stroke="var(--accent-color)" strokeWidth="3" strokeLinecap="round" />
                    {dates.map((d, i) => {
                      const x = (i / (dates.length - 1)) * 500;
                      const y = 125 - (transportData.trend[d] / maxVal) * 100;
                      return <circle key={i} cx={x} cy={y} r="4" fill="white" stroke="var(--accent-color)" strokeWidth="2" />;
                    })}
                  </>
                );
              })()}
            </svg>
            <div className="tm-line-labels">
               <span>{startDate}</span>
               <span>{endDate}</span>
            </div>
          </div>
        </div>

        {/* Load per time slot (Bar Chart) */}
        <div className="tm-chart-card">
          <h3 className="tm-chart-title">Load per Time Slot</h3>
          <div className="tm-simple-bar-list">
             {Object.entries(transportData.load).sort((a,b) => b[1]-a[1]).map(([time, count]) => (
               <div key={time} className="tm-bar-item">
                 <div className="bar-info">
                   <span className="bar-lbl">{time}</span>
                   <span className="bar-val">{count} users</span>
                 </div>
                 <div className="bar-track">
                   <div className="bar-fill" style={{ width: `${(count/Math.max(...Object.values(transportData.load),1))*100}%` }}></div>
                 </div>
               </div>
             ))}
          </div>
        </div>

        {/* Transport Breakdown (Method View) */}
        <div className="tm-chart-card print-full">
          <h3 className="tm-chart-title">Transport Methods Breakown</h3>
          <div className="tm-method-grid">
            {stats.methodSummary.map(m => (
              <div key={m.method} className="method-pill">
                <span className="m-name">{m.method}</span>
                <span className="m-count">{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DETAILED TABLE */}
      <div className="tm-table-card glass-panel">
        <table className="tm-agg-table">
          <thead>
            <tr>
              <th>Player ID</th>
              <th>Player Name</th>
              <th>Sport</th>
              <th>Class Timing</th>
              <th>Date</th>
              <th>Transportation Used</th>
            </tr>
          </thead>
          <tbody>
            {transportData.instances.length > 0 ? (
              transportData.instances.map((inst, idx) => (
                <tr key={`${inst.id}-${idx}`} className="tm-row-instance">
                  <td className="inst-id">#{inst.id}</td>
                  <td className="inst-name">{inst.name}</td>
                  <td className="inst-sport">{inst.sport}</td>
                  <td className="inst-timing">{inst.timing}</td>
                  <td className="inst-date">{new Date(inst.date).toLocaleDateString('en-GB')}</td>
                  <td className="inst-method">
                    <span className={`tm-transport-pill active`}>
                      {inst.transport}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="tm-empty">No transport usage found for present players in this range.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal 
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleReset}
        isDanger={true}
        title="Reset Transport List?"
        message="This will clear all current transportation assignments for players. Arrival status (Present/Absent) and History logs will NOT be affected."
        confirmText="Yes, Reset Transport"
        requiredPasscode="Fm@c.2020"
      />
    </div>
  );
}
