import { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { exportToExcel, exportToCSV, printToPDF } from '../utils/exportEngine';
import './AttendanceTable.css';
import './TransportationModule.css';

export default function TransportationModule() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterSport, setFilterSport] = useState('All');
  const [filterCoach, setFilterCoach] = useState('All');
  const [filterTiming, setFilterTiming] = useState('All');
  const [filterAttendance, setFilterAttendance] = useState('All'); // 'All', 'present', 'absent'
  const [filterTransport, setFilterTransport] = useState('All'); // 'All', 'Yes', 'No'

  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    const q = query(collection(db, "players_v2"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const playersList = querySnapshot.docs.map(doc => ({
        firestoreId: doc.id,
        ...doc.data()
      }));
      setPlayers(playersList);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching players:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Helpers
  const isUsingTransport = (p) => !!p.transportation && p.transportation.trim() !== '' && p.transportation !== 'Own Transportation';

  // Derived filter options
  const sports = useMemo(() => Array.from(new Set(players.flatMap(p => p.sports || (p.sport ? p.sport.split(',').map(s=>s.trim()) : [])))).filter(Boolean).sort(), [players]);
  const coaches = useMemo(() => Array.from(new Set(players.map(p => p.coach || 'Unassigned'))).filter(Boolean).sort(), [players]);
  const timings = useMemo(() => Array.from(new Set(players.map(p => p.classTiming?.trim()))).filter(Boolean).sort(), [players]);

  // Main Filter Logic
  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      const pSports = p.sports || (p.sport ? p.sport.split(',').map(s=>s.trim()) : []);
      const matchesSport = filterSport === 'All' || pSports.includes(filterSport);
      const matchesCoach = filterCoach === 'All' || p.coach === filterCoach;
      const matchesTiming = filterTiming === 'All' || p.classTiming === filterTiming;
      const matchesAttendance = filterAttendance === 'All' || p.status === filterAttendance;
      
      let matchesTransport = true;
      if (filterTransport === 'Yes') matchesTransport = isUsingTransport(p);
      if (filterTransport === 'No') matchesTransport = !isUsingTransport(p);

      return matchesSport && matchesCoach && matchesTiming && matchesAttendance && matchesTransport;
    });
  }, [players, filterSport, filterCoach, filterTiming, filterAttendance, filterTransport]);

  // Grouped logic
  const groupedData = useMemo(() => {
    const groups = {};
    filteredPlayers.forEach(p => {
      const timingKey = p.classTiming || 'Unscheduled';
      if (!groups[timingKey]) groups[timingKey] = [];
      groups[timingKey].push(p);
    });
    return Object.fromEntries(Object.entries(groups).sort());
  }, [filteredPlayers]);

  const toggleGroup = (timing) => {
    setExpandedGroups(prev => ({ ...prev, [timing]: !prev[timing] }));
  };

  // Metrics Extraction
  const totalPlayers = filteredPlayers.length;
  const transportUsers = filteredPlayers.filter(isUsingTransport).length;
  const nonTransportUsers = totalPlayers - transportUsers;
  const utilizationRate = totalPlayers > 0 ? Math.round((transportUsers / totalPlayers) * 100) : 0;

  // Chart 1: Bar Chart (Players per slot)
  const slotStats = useMemo(() => {
    return Object.keys(groupedData).map(slot => {
      const count = groupedData[slot].length;
      return { slot, count };
    });
  }, [groupedData]);
  const maxSlotCount = Math.max(...slotStats.map(s => s.count), 1);
  const peakSlotObj = slotStats.reduce((max, obj) => obj.count > max.count ? obj : max, { slot: 'N/A', count: 0 });
  const peakSlotName = peakSlotObj.count > 0 ? peakSlotObj.slot : "N/A";

  // Chart 2: Stacked Bar (Sport vs Transport)
  const sportStats = useMemo(() => {
    const sMap = {};
    filteredPlayers.forEach(p => {
      const sArr = p.sports || (p.sport ? p.sport.split(',').map(s=>s.trim()) : ['Unassigned']);
      const isTrans = isUsingTransport(p);
      sArr.forEach(s => {
        if (!sMap[s]) sMap[s] = { yes: 0, no: 0, total: 0 };
        isTrans ? sMap[s].yes++ : sMap[s].no++;
        sMap[s].total++;
      });
    });
    return Object.entries(sMap)
      .map(([sport, counts]) => ({ sport, ...counts }))
      .sort((a,b) => b.total - a.total)
      .slice(0, 5); // top 5 sports
  }, [filteredPlayers]);

  const handleExport = (type) => {
    const exportFormat = filteredPlayers.map(p => ({
      "Player Name": p.name,
      "Sport": (p.sports || [p.sport]).join(', '),
      "Class Timing": p.classTiming || '',
      "Coach": p.coach || '',
      "Attendance Status": p.status || '',
      "Transportation": p.transportation || 'None',
      "Using FMAC Transport": isUsingTransport(p) ? 'Yes' : 'No'
    }));

    if (type === 'excel') exportToExcel(exportFormat, `FMAC_Transport_Report_${new Date().getTime()}`);
    if (type === 'csv') exportToCSV(exportFormat, `FMAC_Transport_Report_${new Date().getTime()}`);
    if (type === 'pdf') printToPDF();
  };

  if (loading) {
    return (
      <div className="jumping-logo-container animate-fade-in" style={{ height: '70vh' }}>
        <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
        <span className="jumping-text">Syncing Routes...</span>
      </div>
    );
  }

  return (
    <div className="tm-container animate-fade-in">
      
      {/* Header Area */}
      <div className="tm-header-row">
        <h2 className="tm-title">Transportation Overview</h2>
        <div className="tm-export-bar">
          <button className="tm-btn" onClick={() => handleExport('csv')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            Export CSV
          </button>
          <button className="tm-btn" onClick={() => handleExport('excel')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><rect x="8" y="12" width="8" height="6"></rect></svg>
            Export Excel
          </button>
          <button className="tm-btn primary" onClick={() => handleExport('pdf')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Print PDF
          </button>
        </div>
      </div>

      {/* Primary Filtering Layer */}
      <div className="controls-panel filter-bar">
        <select value={filterTiming} onChange={(e) => setFilterTiming(e.target.value)} className="sport-select">
          <option value="All">All Timings</option>
          {timings.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterSport} onChange={(e) => setFilterSport(e.target.value)} className="sport-select">
          <option value="All">All Sports</option>
          {sports.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterCoach} onChange={(e) => setFilterCoach(e.target.value)} className="sport-select">
          <option value="All">All Coaches</option>
          {coaches.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterAttendance} onChange={(e) => setFilterAttendance(e.target.value)} className="sport-select">
          <option value="All">All Attendance</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
        </select>
        <select value={filterTransport} onChange={(e) => setFilterTransport(e.target.value)} className="sport-select">
          <option value="All">All Transport Status</option>
          <option value="Yes">Using Transport</option>
          <option value="No">No Transport</option>
        </select>
      </div>

      {/* Summary Stats Grid */}
      <div className="tm-bento-grid">
        <div className="tm-metric-card">
          <span className="tm-metric-label">Using Transport</span>
          <span className="tm-metric-value accent">{transportUsers}</span>
        </div>
        <div className="tm-metric-card">
          <span className="tm-metric-label">Without Transport</span>
          <span className="tm-metric-value">{nonTransportUsers}</span>
        </div>
        <div className="tm-metric-card">
          <span className="tm-metric-label">Utilization Rate</span>
          <span className="tm-metric-value">{utilizationRate}%</span>
        </div>
        <div className="tm-metric-card">
          <span className="tm-metric-label">Peak Time Slot</span>
          <span className="tm-metric-value" style={{fontSize: '1.2rem'}}>{peakSlotName}</span>
        </div>
      </div>

      {/* Visual Analytics Matrix */}
      <div className="tm-charts-matrix">
        
        {/* Timing Bar Chart Node */}
        <div className="tm-chart-card">
          <h3 className="tm-chart-title">Players per Time Slot</h3>
          <div className="tm-bar-chart">
            {slotStats.map((slot, idx) => {
              const pct = (slot.count / maxSlotCount) * 100;
              return (
                <div key={idx} className="tm-bar-col">
                  <div className="tm-bar-tooltip">{slot.count} Players</div>
                  <div className="tm-bar-col-inner" style={{ height: `${pct}%` }}></div>
                  <span className="tm-bar-label">{slot.slot.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transport Split Donut Node */}
        <div className="tm-chart-card">
          <h3 className="tm-chart-title">Transport Distribution</h3>
          <div className="tm-donut-wrapper">
             <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" fill="none" stroke="var(--primary-bg)" strokeWidth="16" />
                <circle cx="80" cy="80" r="70" fill="none" stroke="var(--accent-color)" strokeWidth="16" 
                        strokeLinecap="round" strokeDasharray={`${(utilizationRate/100) * 439.8} 439.8`} 
                        transform="rotate(-90 80 80)" style={{transition: 'all var(--dur-med)'}} />
             </svg>
             <div className="tm-donut-center">
               <strong>{utilizationRate}%</strong>
               <span>Using</span>
             </div>
          </div>
        </div>

        {/* Top 5 Sports Matrix */}
        <div className="tm-chart-card">
          <h3 className="tm-chart-title">Transport By Sport</h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {sportStats.map((stat, idx) => {
              const total = stat.total || 1;
              const yesPct = (stat.yes / total) * 100;
              const noPct = (stat.no / total) * 100;
              return (
                <div key={idx} className="tm-stacked-row">
                  <div className="tm-stacked-label">{stat.sport}</div>
                  <div className="tm-stacked-track">
                    <div className="tm-stacked-fill-yes" style={{ width: `${yesPct}%` }}></div>
                    <div className="tm-stacked-fill-no" style={{ width: `${noPct}%` }}></div>
                  </div>
                  <div className="tm-stacked-val">{stat.yes} / {total}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Data Groups */}
      <h3 className="tm-title" style={{ marginTop: '16px' }}>Slot Distributions</h3>
      <div className="tm-groups-container">
        {Object.entries(groupedData).map(([slot, playersGroup]) => {
          const isOpen = expandedGroups[slot];
          const groupUsing = playersGroup.filter(isUsingTransport).length;
          
          return (
            <div key={slot} className={`tm-group-card ${isOpen ? 'open' : ''}`}>
              <div className="tm-group-header" onClick={() => toggleGroup(slot)}>
                <div className="tm-group-title">
                  <svg className="tm-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  {slot}
                </div>
                <div className="tm-group-stats">
                  <div className="tm-group-stat">
                    <span className="tm-gstat-val">{playersGroup.length}</span>
                    <span className="tm-gstat-lbl">Total</span>
                  </div>
                  <div className="tm-group-stat">
                    <span className="tm-gstat-val" style={{color: 'var(--accent-color)'}}>{groupUsing}</span>
                    <span className="tm-gstat-lbl">Transport</span>
                  </div>
                </div>
              </div>
              
              <div className="tm-group-body">
                <table className="tm-table">
                  <thead>
                    <tr>
                      <th>Player Name</th>
                      <th>Sport</th>
                      <th>Coach</th>
                      <th>Attendance</th>
                      <th>Transport config</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playersGroup.map(p => (
                      <tr key={p.firestoreId}>
                        <td>{p.name}</td>
                        <td>{
                            (p.sports || (p.sport ? [p.sport] : [])).map((s,i) => <span key={i} className="badge" style={{marginRight: '4px', opacity: 1, animation: 'none'}}>{s}</span>)
                          }
                        </td>
                        <td style={{color: 'var(--text-muted)'}}>{p.coach || 'N/A'}</td>
                        <td>
                          <span className={`status-pill ${p.status === 'present' ? 'present' : 'absent'}`} style={{width: 'auto', padding: '4px 8px'}}>
                            <span className="status-indicator"></span> {p.status}
                          </span>
                        </td>
                        <td>
                          <span className={`tm-status-pill ${isUsingTransport(p) ? 'yes' : 'no'}`}>
                            {p.transportation || 'None'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {Object.keys(groupedData).length === 0 && (
          <div className="empty-state">No transport requirements found for the selected filters.</div>
        )}
      </div>

    </div>
  );
}
