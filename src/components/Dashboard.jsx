import { useState, useMemo } from 'react';
import { mockPlayers } from '../dataMock';
import AttendanceTable from './AttendanceTable';
import './Dashboard.css';

export default function Dashboard() {
  const [players, setPlayers] = useState(
    mockPlayers.map(p => ({ ...p, status: 'absent' }))
  );
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSport, setFilterSport] = useState('All');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // This will be replaced by the user's actual Google Apps Script Web App URL
  const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxSkY3FqoCymbjcV9umDZXziLLG1iX_gfiYM-YUIrs-TtJq2ii5cbLCAKSJ1KdQ-hvtcg/exec';

  const handleToggleStatus = (id) => {
    setPlayers(players.map(p => {
      if (p.id === id) {
        return { ...p, status: p.status === 'present' ? 'absent' : 'present' };
      }
      return p;
    }));
  };

  const handleSaveAttendance = async () => {
    if (GOOGLE_SCRIPT_URL === 'INSERT_YOUR_WEB_APP_URL_HERE') {
      alert("Please configure your Google Script URL first.");
      return;
    }

    setIsSaving(true);
    setSaveMessage('Saving...');

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(players),
      });
      
      const result = await response.json();
      if (result.result === 'success') {
        setSaveMessage('Attendance Saved!');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        throw new Error(result.error || "Unknown error occurred.");
      }
    } catch (error) {
      console.error(error);
      setSaveMessage('Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const sports = useMemo(() => {
    const allSports = new Set();
    mockPlayers.forEach(p => {
      if (p.sport && p.sport !== 'N/A') {
        const parts = p.sport.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        parts.forEach(s => allSports.add(s));
      }
    });
    return ['All', ...Array.from(allSports).sort()];
  }, []);

  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.coach.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesSport = false;
      if (filterSport === 'All') {
        matchesSport = true;
      } else if (p.sport) {
        const playerSports = p.sport.split(/[,\n]/).map(s => s.trim().toLowerCase());
        matchesSport = playerSports.includes(filterSport.toLowerCase());
      }
      
      return matchesSearch && matchesSport;
    });
  }, [players, searchQuery, filterSport]);

  const stats = useMemo(() => {
    const total = players.length;
    const present = players.filter(p => p.status === 'present').length;
    const rate = total === 0 ? 0 : Math.round((present / total) * 100);
    return { total, present, absent: total - present, rate };
  }, [players]);

  return (
    <div className="dashboard-container">
      <div className="stats-grid">
        <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.1s'}}>
          <h3>Total Active</h3>
          <div className="stat-value">{stats.total}</div>
          <p className="stat-label">Registered Players</p>
        </div>
        <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.2s'}}>
          <h3>Present Today</h3>
          <div className="stat-value text-present">{stats.present}</div>
          <p className="stat-label">Checked in</p>
        </div>
        <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.3s'}}>
          <h3>Absent</h3>
          <div className="stat-value text-absent">{stats.absent}</div>
          <p className="stat-label">Not arrived</p>
        </div>
        <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.4s'}}>
          <h3>Attendance Rate</h3>
          <div className="stat-value">{stats.rate}%</div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{width: `${stats.rate}%`}}></div>
          </div>
        </div>
      </div>

      <div className="controls-panel glass-panel animate-fade-in" style={{animationDelay: '0.5s'}}>
        <div className="search-box">
           <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="text" 
            placeholder="Search by name or coach..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-actions">
          <select 
            value={filterSport} 
            onChange={(e) => setFilterSport(e.target.value)}
            className="sport-select"
          >
            {sports.map(sport => (
              <option key={sport} value={sport}>{sport}</option>
            ))}
          </select>
          <button 
            className="save-btn" 
            onClick={handleSaveAttendance} 
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : '💾 Save Attendance'}
          </button>
          {saveMessage && <span className="save-msg">{saveMessage}</span>}
        </div>
      </div>

      <div className="table-container glass-panel animate-fade-in" style={{animationDelay: '0.6s'}}>
        <AttendanceTable 
          players={filteredPlayers} 
          onToggleStatus={handleToggleStatus} 
        />
      </div>
    </div>
  );
}
