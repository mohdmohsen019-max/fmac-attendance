import { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import AttendanceTable from './AttendanceTable';
import './Dashboard.css';

export default function Dashboard() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSport, setFilterSport] = useState('All');
  const [filterTiming, setFilterTiming] = useState('All');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const q = query(collection(db, "players"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const playersData = [];
      const today = new Date().toLocaleDateString('en-CA');
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        let status = data.status || 'absent';
        
        if (status === 'present' && data.lastActionDate !== today) {
          status = 'absent';
          // Clean up stale 'present' status in background
          updateDoc(docSnapshot.ref, { status: 'absent' }).catch(console.error);
        }
        
        playersData.push({ ...data, firestoreId: docSnapshot.id, status });
      });
      setPlayers(playersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching players:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);


  const handleToggleStatus = async (firestoreId) => {
    const player = players.find(p => p.firestoreId === firestoreId);
    if (!player) return;

    const newStatus = player.status === 'present' ? 'absent' : 'present';
    const playerRef = doc(db, "players", firestoreId);
    const today = new Date().toLocaleDateString('en-CA');
    
    try {
      await updateDoc(playerRef, { status: newStatus, lastActionDate: today });
    } catch (error) {
      console.error("Error updating player status:", error);
      alert("Failed to update status. Please check your internet connection.");
    }
  };

  const handleSaveAttendance = async () => {
    if (filteredPlayers.length === 0) {
      alert("No players to save.");
      return;
    }

    setIsSaving(true);
    setSaveMessage('Saving Snapshot...');

    try {
      // Save a historical snapshot
      await addDoc(collection(db, "attendance_logs"), {
        date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        timing: filterTiming === 'All' ? 'Custom Filter' : filterTiming,
        sport: filterSport,
        presentCount: stats.present,
        absentCount: stats.absent,
        totalCount: stats.total,
        attendance: filteredPlayers.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status
        })),
        timestamp: serverTimestamp()
      });
      
      setSaveMessage(`✅ Logged ${stats.present} present!`);
      setTimeout(() => setSaveMessage(''), 4000);
    } catch (error) {
      console.error("Error saving log:", error);
      setSaveMessage('Failed to log.');
    } finally {
      setIsSaving(false);
    }
  };

  const sports = useMemo(() => {
    const allSports = new Set();
    players.forEach(p => {
      if (p.sport && p.sport !== 'N/A') {
        const parts = p.sport.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        parts.forEach(s => allSports.add(s));
      }
    });
    return ['All', ...Array.from(allSports).sort()];
  }, [players]);

  const timings = useMemo(() => {
    const allTimings = new Set();
    players.forEach(p => {
      if (p.classTiming && p.classTiming !== 'N/A') {
        allTimings.add(p.classTiming.trim());
      }
    });
    return ['All', ...Array.from(allTimings).sort()];
  }, [players]);

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
      
      const matchesTiming = filterTiming === 'All' || p.classTiming?.trim() === filterTiming;

      return matchesSearch && matchesSport && matchesTiming;
    });
  }, [players, searchQuery, filterSport, filterTiming]);

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
          <select
            value={filterTiming}
            onChange={(e) => setFilterTiming(e.target.value)}
            className="sport-select"
          >
            {timings.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button 
            className="save-btn" 
            onClick={handleSaveAttendance} 
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : `💾 Save (${filteredPlayers.length})`}
          </button>
          {saveMessage && <span className="save-msg">{saveMessage}</span>}
        </div>
      </div>

      <div className="table-container glass-panel animate-fade-in" style={{animationDelay: '0.6s'}}>
        {loading ? (
          <div className="loading-state">
            <p>Connection to Firebase...</p>
          </div>
        ) : (
          <AttendanceTable 
            players={filteredPlayers} 
            onToggleStatus={handleToggleStatus} 
          />
        )}
      </div>
    </div>
  );
}
