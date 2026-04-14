import React, { useState, useMemo, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { exportToExcel, exportToCSV } from '../utils/exportEngine';
import ConfirmModal from './ConfirmModal';
import { resetTransportationOnly } from '../utils/systemUtils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import './AttendanceTable.css';
import './TransportationModule.css';

export default function TransportationModule() {
  const [players, setPlayers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  const pdfRef = useRef(null);

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

  const generateRichPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const element = pdfRef.current;
      if (!element) return;
      
      // Briefly make it visible to rendering engine
      element.style.display = 'block';
      
      const canvas = await html2canvas(element, { 
        backgroundColor: '#ffffff',
        scale: 2, // High resolution
        useCORS: true
      });
      
      // Hide again
      element.style.display = 'none';

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // Support multi-page if content is super long, though usually we just let it scale.
      // A more robust way is to split it if height exceeds A4, but for now scaling is safest.
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`FMAC_Transport_Analytics_${startDate}_to_${endDate}.pdf`);
      
    } catch (e) {
      console.error(e);
      alert('Error generating PDF Layout');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

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
    if (type === 'pdf') generateRichPDF();
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
      
      {/* 🚀 TRUE BACKEND PDF EXPORT ENGINE 🚀 */}
      <div className="pdf-export-canvas" ref={pdfRef}>
        {/* 1. COVER HEADER */}
        <div className="pdf-c-header">
           <img src="/fmac-logo-new.png" alt="FMAC" className="pdf-c-logo" />
           <div className="pdf-c-header-text">
             <h1 className="pdf-c-title">Transportation Logistics Report</h1>
             <div className="pdf-c-meta">
               <span>Period: {startDate} to {endDate}</span>
               <span>Generated: {new Date().toLocaleString()}</span>
             </div>
           </div>
        </div>

        {/* 2. EXECUTIVE SUMMARY CARDS */}
        <div className="pdf-c-section">
          <h2 className="pdf-c-section-title">Executive Summary</h2>
          <div className="pdf-c-grid-4">
            <div className="pdf-c-card">
              <div className="c-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#200f07" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </div>
              <span className="c-card-lbl">Total Present Players</span>
              <span className="c-card-val">{stats.totalPresent}</span>
            </div>
            <div className="pdf-c-card">
              <div className="c-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C70017" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2l.64-2.54c.24-.95.36-1.92.36-2.9V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2.56c0 .98.12 1.95.36 2.9L4 17h2"></path><path d="M7 11V7"></path><path d="M17 11V7"></path><rect x="6" y="17" width="12" height="3" rx="1"></rect><circle cx="8" cy="18" r=".5"></circle><circle cx="16" cy="18" r=".5"></circle></svg>
              </div>
              <span className="c-card-lbl">Active Transport Users</span>
              <span className="c-card-val cherry">{stats.transportUsers}</span>
            </div>
            <div className="pdf-c-card">
              <div className="c-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#200f07" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
              </div>
              <span className="c-card-lbl">Utilization %</span>
              <span className="c-card-val">{stats.utilization}%</span>
            </div>
            <div className="pdf-c-card">
              <div className="c-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#200f07" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
              </div>
              <span className="c-card-lbl">Peak Load</span>
              <span className="c-card-val">{stats.peak?.count || 0}</span>
              <span className="c-card-sub">{stats.peak?.label || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* 3. VISUAL ANALYTICS */}
        <div className="pdf-c-section">
           <h2 className="pdf-c-section-title">Visual Analytics</h2>
           <div className="pdf-c-charts-grid">
              

              {/* Bar Chart */}
              <div className="pdf-c-chart-box">
                <h3>Transport Load by Time</h3>
                <div className="pdf-c-bars">
                  {Object.entries(transportData.load).sort((a,b) => b[1]-a[1]).map(([time, count], idx) => {
                    const isPeak = idx === 0;
                    return (
                    <div key={time} className="pdf-c-bar-item">
                      <div className="pdf-c-bar-info">
                        <span style={{fontWeight: isPeak?700:500}}>{time}</span>
                        <span style={{color: isPeak?'#C70017':'#333', fontWeight: 700}}>{count} users</span>
                      </div>
                      <div className="pdf-c-bar-track">
                        <div className="pdf-c-bar-fill" style={{ width: `${(count/Math.max(...Object.values(transportData.load),1))*100}%`, background: isPeak ? '#C70017' : '#DED2C1' }}></div>
                      </div>
                    </div>
                  )})}
                </div>
              </div>

              {/* Pseudo Donut (Methods) */}
              <div className="pdf-c-chart-box">
                <h3>Transport Distribution</h3>
                <div className="pdf-c-donut-standin">
                   {stats.methodSummary.map((m, i) => {
                     const perc = Math.round((m.count / Math.max(stats.transportUsers, 1)) * 100);
                     // Generate Greige/Neutral shades for distribution
                     const shade = i === 0 ? '#C70017' : `hsl(37, 24%, ${40 + (i * 10)}%)`; 
                     return (
                        <div key={m.method} className="pdf-c-donut-item">
                           <div className="pd-dot" style={{background: shade}}></div>
                           <span className="pd-lbl">{m.method}</span>
                           <span className="pd-val">{perc}%</span>
                        </div>
                     )
                   })}
                </div>
              </div>

           </div>
        </div>

        {/* 4. METHOD BREAKDOWN */}
        <div className="pdf-c-section">
           <h2 className="pdf-c-section-title">Transport Method Block Breakdown</h2>
           <div className="pdf-c-methods-grid">
              {stats.methodSummary.map(m => {
                 const perc = Math.round((m.count / Math.max(stats.transportUsers, 1)) * 100);
                 return (
                 <div key={m.method} className="pdf-c-m-card">
                   <div className="pdf-m-header">
                     <h3>{m.method}</h3>
                     <span className="pdf-m-perc">{perc}%</span>
                   </div>
                   <div className="pdf-m-stats">
                     <span><strong>Total Users:</strong> {m.count}</span>
                   </div>
                   <div className="pdf-m-mini-bar-track">
                      <div className="pdf-m-mini-bar-fill" style={{width: `${perc}%`}}></div>
                   </div>
                 </div>
               )})}
           </div>
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
          <button className="tm-btn primary" onClick={() => handleExport('pdf')} disabled={isGeneratingPDF}>
            {isGeneratingPDF ? "Generating PDF..." : "Export PDF"}
          </button>
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
      <div className="tm-bento-grid no-print">
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
      <div className="tm-analytics-shelf no-print">
        
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
      {/* DETAILED LOGS SECTION */}
      <div className="tm-table-card glass-panel no-print desktop-only">
        <table className="tm-agg-table">
          <thead>
            <tr>
              <th style={{ width: '12%' }}>Player ID</th>
              <th style={{ width: '25%' }}>Player Name</th>
              <th style={{ width: '20%' }}>Sport</th>
              <th style={{ width: '15%' }}>Class Timing</th>
              <th style={{ width: '13%' }} className="center-col">Date</th>
              <th style={{ width: '15%' }} className="center-col">Transportation Used</th>
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
                  <td className="inst-date center-col">{new Date(inst.date).toLocaleDateString('en-GB')}</td>
                  <td className="inst-method center-col">
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

      {/* Mobile Card View */}
      <div className="tm-mobile-list mobile-only no-print">
        {transportData.instances.length > 0 ? (
          transportData.instances.map((inst, idx) => (
            <div key={`${inst.id}-${idx}`} className="tm-mobile-card animate-fade-in" style={{ animationDelay: `${idx * 20}ms` }}>
              <div className="tm-m-card-header">
                <span className="tm-m-id">#{inst.id}</span>
                <span className="tm-m-date">{new Date(inst.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
              </div>
              <div className="tm-m-name">{inst.name}</div>
              <div className="tm-m-meta">
                <span>{inst.sport}</span>
                <span className="divider">•</span>
                <span>{inst.timing}</span>
              </div>
              <div className="tm-m-method-badge">{inst.transport}</div>
            </div>
          ))
        ) : (
          <div className="tm-empty">No results found.</div>
        )}
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
