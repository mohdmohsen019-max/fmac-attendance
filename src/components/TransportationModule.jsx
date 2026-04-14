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

  // Main Filter Logic
  // 📊 DATA AGGREGATION & FILTERING ENGINE
  const aggregatedPlayers = useMemo(() => {
    const playerMap = {};
    
    // Sort logs by date to ensure chronological history
    const sortedLogs = [...logs].sort((a,b) => (a.date || '').localeCompare(b.date || ''));

    sortedLogs.forEach(log => {
      // Check if log falls within range
      if (!log.date || log.date < startDate || log.date > endDate) return;
      if (!log.attendance || !Array.isArray(log.attendance)) return;

      log.attendance.forEach(record => {
        const pId = record.id;
        if (!pId) return;
        
        if (!playerMap[pId]) {
          // Find master info from players_v2
          const master = players.find(p => p.id === pId) || {};
          playerMap[pId] = {
            id: pId,
            name: record.name,
            sport: master.sports?.join(', ') || master.sport || 'N/A',
            coach: master.coach || 'N/A',
            timing: master.classTiming || 'N/A',
            attendedDays: 0,
            totalDays: 0,
            transportCountMap: {}, // To track frequency of different transport types
            history: []
          };
        }

        const pData = playerMap[pId];
        pData.totalDays++;
        if (record.status === 'present') pData.attendedDays++;
        
        // Track transport frequency
        const tType = record.transportation || 'None';
        if (tType && tType !== 'None') {
          pData.transportCountMap[tType] = (pData.transportCountMap[tType] || 0) + (record.status === 'present' ? 1 : 0);
        }

        pData.history.push({
          date: log.date,
          status: record.status,
          transport: record.transportation
        });
      });
    });

    // Final calculations & filtering
    return Object.values(playerMap).map(p => {
      // Determine "Main Transport" (most used)
      const topTransport = Object.entries(p.transportCountMap)
        .sort((a,b) => b[1] - a[1])[0];
        
      const transportSummary = topTransport 
        ? `${topTransport[0]} (${topTransport[1]} days)` 
        : "N/A";

      return {
        ...p,
        attendanceRate: p.totalDays > 0 ? Math.round((p.attendedDays / p.totalDays) * 100) : 0,
        transportSummary
      };
    }).filter(p => {
       const matchesSport = filterSport === 'All' || p.sport.includes(filterSport);
       const matchesCoach = filterCoach === 'All' || p.coach === filterCoach;
       const matchesTiming = filterTiming === 'All' || p.timing === filterTiming;
       
       let matchesAttendance = true;
       if (filterAttendance === 'attended') matchesAttendance = p.attendedDays > 0;
       if (filterAttendance === 'absent_only') matchesAttendance = p.attendedDays === 0;

       let matchesTransport = true;
       if (filterTransport === 'Yes') matchesTransport = p.transportSummary !== 'N/A';
       if (filterTransport === 'No') matchesTransport = p.transportSummary === 'N/A';

       return matchesSport && matchesCoach && matchesTiming && matchesAttendance && matchesTransport;
    });
  }, [logs, players, startDate, endDate, filterSport, filterCoach, filterTiming, filterTransport]);

  // Metrics Extraction
  const stats = useMemo(() => {
    const total = aggregatedPlayers.length;
    const avgAttendance = total > 0 
      ? Math.round(aggregatedPlayers.reduce((acc, p) => acc + p.attendanceRate, 0) / total) 
      : 0;
    const transportUsers = aggregatedPlayers.filter(p => p.transportSummary !== 'N/A').length;
    return { total, avgAttendance, transportUsers };
  }, [aggregatedPlayers]);

  const handleExport = (type) => {
    const exportFormat = aggregatedPlayers.map(p => ({
      "Player Name": p.name,
      "Sport": p.sport,
      "Class Timing": p.timing,
      "Coach": p.coach,
      "Days Attended": `${p.attendedDays} / ${p.totalDays}`,
      "Attendance %": `${p.attendanceRate}%`,
      "Transport Usage": p.transportSummary
    }));

    if (type === 'excel') exportToExcel(exportFormat, `FMAC_Transport_Aggregated_${startDate}_to_${endDate}`);
    if (type === 'csv') exportToCSV(exportFormat, `FMAC_Transport_Aggregated_${startDate}_to_${endDate}`);
    if (type === 'pdf') printToPDF();
  };

  if (loading) {
    return (
      <div className="jumping-logo-container animate-fade-in" style={{ height: '70vh' }}>
        <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
        <span className="jumping-text">Analyzing History...</span>
      </div>
    );
  }

  return (
    <div className="tm-container animate-fade-in">
      
      {/* Header Area */}
      <div className="tm-header-row">
        <div>
          <h2 className="tm-title">Transportation Intelligence</h2>
          <p className="tm-subtitle">Historical usage & attendance aggregation</p>
        </div>
        <div className="tm-export-bar">
          <button className="tm-btn" onClick={() => handleExport('csv')}>Export CSV</button>
          <button className="tm-btn" onClick={() => handleExport('excel')}>Export Excel</button>
          <button className="tm-btn primary" onClick={() => handleExport('pdf')}>Print PDF</button>
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

      {/* Date & Filters Layer */}
      <div className="tm-controls-card glass-panel">
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
          <select value={filterAttendance} onChange={(e) => setFilterAttendance(e.target.value)}>
            <option value="All">All Attendance</option>
            <option value="attended">Has Presence</option>
            <option value="absent_only">No Presence (Absent Only)</option>
          </select>
          <select value={filterTransport} onChange={(e) => setFilterTransport(e.target.value)}>
            <option value="All">All Transport Status</option>
            <option value="Yes">Using Transport</option>
            <option value="No">No Transport</option>
          </select>
        </div>
      </div>

      {/* Summary Stats Grid */}
      <div className="tm-bento-grid">
        <div className="tm-metric-card">
          <span className="tm-metric-label">Total Players</span>
          <span className="tm-metric-value">{stats.total}</span>
        </div>
        <div className="tm-metric-card">
          <span className="tm-metric-label">Transport Users</span>
          <span className="tm-metric-value accent">{stats.transportUsers}</span>
        </div>
        <div className="tm-metric-card">
          <span className="tm-metric-label">Avg Attendance</span>
          <div className="tm-stat-with-bar">
            <span className="tm-metric-value">{stats.avgAttendance}%</span>
            <div className="mini-progress-track">
              <div className="mini-progress-fill" style={{ width: `${stats.avgAttendance}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* AGGREGATED TABLE */}
      <div className="tm-table-card glass-panel">
        <table className="tm-agg-table">
          <thead>
            <tr>
              <th width="40"></th>
              <th>Player Name</th>
              <th>Sport / Timing</th>
              <th>Coach</th>
              <th>Days Attended</th>
              <th>Transport Usage</th>
              <th width="150">Attendance %</th>
            </tr>
          </thead>
          <tbody>
            {aggregatedPlayers.length > 0 ? (
              aggregatedPlayers.map(player => (
                <React.Fragment key={player.id}>
                  <tr className={`tm-row ${expandedPlayerId === player.id ? 'active' : ''}`} onClick={() => setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)}>
                    <td className="expand-cell">
                      <svg className={`chevron ${expandedPlayerId === player.id ? 'rotated' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </td>
                    <td>
                      <div className="p-name-main">{player.name}</div>
                      <div className="p-id-sub">ID: #{player.id}</div>
                    </td>
                    <td>
                      <div className="p-sport-tag">{player.sport}</div>
                      <div className="p-timing-sub">{player.timing}</div>
                    </td>
                    <td className="p-coach-cell">{player.coach}</td>
                    <td className="p-days-cell">
                      <span className="days-val">{player.attendedDays}</span>
                      <span className="days-total">/ {player.totalDays}</span>
                    </td>
                    <td>
                      <span className={`tm-transport-pill ${player.transportSummary !== 'N/A' ? 'active' : ''}`}>
                        {player.transportSummary}
                      </span>
                    </td>
                    <td>
                      <div className="tm-rate-wrapper">
                        <div className="tm-rate-bar-bg">
                          <div className={`tm-rate-bar-fill ${player.attendanceRate >= 80 ? 'good' : player.attendanceRate >= 50 ? 'avg' : 'poor'}`} style={{ width: `${player.attendanceRate}%` }}></div>
                        </div>
                        <span className="tm-rate-text">{player.attendanceRate}%</span>
                      </div>
                    </td>
                  </tr>
                  
                  {expandedPlayerId === player.id && (
                    <tr className="tm-detail-row">
                      <td colSpan="7">
                        <div className="tm-detail-container animate-slide-down">
                          <h4 className="detail-title">Daily Breakdown</h4>
                          <div className="detail-grid">
                            {player.history.map((day, idx) => (
                              <div key={idx} className="detail-card">
                                <div className="detail-date">{new Date(day.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                                <div className={`detail-status ${day.status}`}>{day.status}</div>
                                <div className="detail-transport">{day.transport || 'No Transport'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="tm-empty">No data found for this range. Try adjusting the dates.</td>
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
