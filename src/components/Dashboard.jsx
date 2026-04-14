import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { collection, onSnapshot, query, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import AttendanceTable from './AttendanceTable';
import ConfirmModal from './ConfirmModal';
import { resetDailyAttendanceStatus } from '../utils/systemUtils';
import './Dashboard.css';

export default function Dashboard() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSport, setFilterSport] = useState('All');
  const [filterTiming, setFilterTiming] = useState('All');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [missingTransportModal, setMissingTransportModal] = useState({ isOpen: false, players: [] });
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const handleDailyReset = async () => {
    setIsSaving(true);
    setSaveMessage('Resetting Attendance...');
    try {
      await resetDailyAttendanceStatus();
      setSaveMessage('✅ Attendance Reset Successfully!');
      setTimeout(() => setSaveMessage(''), 5000);
    } catch (e) {
      console.error(e);
      setSaveMessage('❌ Reset Failed');
    } finally {
      setIsSaving(false);
    }
  };

  // TEMP SCRIPT TO FORCE UPDATE CLASS TIMINGS FROM EXCEL
  const syncExcelDB = async () => {
    if (!window.confirm("WARNING: This will overwrite ALL class timings in the live players_v2 database matching the new Excel payload. Proceed?")) return;
    setIsSaving(true);
    setSaveMessage('Downloading schema...');
    try {
      const res = await fetch('/cleaned_players.json');
      const newPlayers = await res.json();
      setSaveMessage(`Loaded ${newPlayers.length} records. Syncing...`);
      
      let updatedCount = 0;
      for (const p of players) {
        const match = newPlayers.find(n => n['Name'] === p.name);
        if (match && match['Training From Time'] && match['Training To Time']) {
          const newTiming = `${match['Training From Time']} - ${match['Training To Time']}`;
          if (newTiming !== p.classTiming) {
            await updateDoc(doc(db, "players_v2", p.firestoreId), {
              classTiming: newTiming
            });
            updatedCount++;
          }
        }
      }
      setSaveMessage(`✅ Synchronized ${updatedCount} players!`);
      setTimeout(() => setSaveMessage(''), 5000);
    } catch (e) {
      console.error(e);
      setSaveMessage('Error Syncing DB');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    console.log("Dashboard: Initializing Firebase listener for players_v2...");
    setLoading(true);

    const qNew = query(collection(db, "players_v2"));
    const unsubscribeNew = onSnapshot(qNew, (querySnapshot) => {
      const playersData = [];
      const today = new Date().toLocaleDateString('en-CA');
      
      querySnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        let status = data.status || 'absent';
        
        if (status === 'present' && data.lastActionDate !== today) {
          status = 'absent';
          updateDoc(docSnapshot.ref, { status: 'absent' }).catch(console.error);
        }
        
        playersData.push({ 
          ...data, 
          firestoreId: docSnapshot.id, 
          status, 
          source: 'v2' 
        });
      });
      
      console.log(`Dashboard: Fetched ${playersData.length} active players from players_v2.`);
      setPlayers(playersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching players_v2:", error);
      setLoading(false);
    });

    return () => unsubscribeNew();
  }, []);

  const handleToggleStatus = async (firestoreId) => {
    const player = players.find(p => p.firestoreId === firestoreId);
    if (!player) return;

    const newStatus = player.status === 'present' ? 'absent' : 'present';
    const playerRef = doc(db, "players_v2", firestoreId);
    const today = new Date().toLocaleDateString('en-CA');
    const newTransport = newStatus === 'absent' ? '' : (player.transportation || '');
    
    try {
      await updateDoc(playerRef, { 
        status: newStatus, 
        transportation: newTransport,
        lastActionDate: today 
      });
    } catch (error) {
      console.error("Error updating player status:", error);
      alert("Failed to update status. Please check your internet connection.");
    }
  };

  const handleChangeTransport = async (firestoreId, newTransport) => {
    const playerRef = doc(db, "players_v2", firestoreId);
    try {
      await updateDoc(playerRef, { transportation: newTransport });
    } catch (error) {
      console.error("Error updating transport:", error);
    }
  };

  const handleSaveAttendance = async () => {
    if (filteredPlayers.length === 0) {
      alert("No players to save.");
      return;
    }

    const invalidPlayers = filteredPlayers.filter(p => p.status === 'present' && !p.transportation);
    if (invalidPlayers.length > 0) {
      setMissingTransportModal({ isOpen: true, players: invalidPlayers });
      return;
    }

    setIsSaving(true);
    setSaveMessage('Saving Snapshot...');

    try {
      await addDoc(collection(db, "attendance_logs"), {
        date: new Date().toLocaleDateString('en-CA'),
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        timing: filterTiming === 'All' ? 'Custom Filter' : filterTiming,
        sport: filterSport,
        presentCount: stats.present,
        absentCount: stats.absent,
        totalCount: stats.total,
        attendance: filteredPlayers.map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          transportation: p.transportation || ''
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
      if (p.sports && p.sports.length > 0) {
        p.sports.forEach(s => allSports.add(s));
      } else if (p.sport && p.sport !== 'N/A') {
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
      } else if (p.sports && p.sports.length > 0) {
        matchesSport = p.sports.map(s => s.toLowerCase()).includes(filterSport.toLowerCase());
      }
      
      const matchesTiming = filterTiming === 'All' || p.classTiming?.trim() === filterTiming;

      return matchesSearch && matchesSport && matchesTiming;
    });
  }, [players, searchQuery, filterSport, filterTiming]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterSport, filterTiming]);

  const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage);
  const paginatedPlayers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPlayers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPlayers, currentPage]);

  const stats = useMemo(() => {
    const total = players.length;
    const present = players.filter(p => p.status === 'present').length;
    const rate = total === 0 ? 0 : Math.round((present / total) * 100);
    return { total, present, absent: total - present, rate };
  }, [players]);  const presentPct = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
  const absentPct = stats.total > 0 ? (stats.absent / stats.total) * 100 : 0;

  return (
    <div className="dashboard-container">
      <div className="dashboard-top">
        <div className="stats-bento">
        <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.1s'}}>
          <div className="stat-header">
            <h3>Total Active</h3>
          </div>
          <div className="stat-value">{stats.total}</div>
          <p className="stat-label">Registered Players</p>
        </div>
        
        <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.2s'}}>
          <div className="stat-header">
            <h3>Present</h3>
          </div>
          <div className="stat-value text-present">{stats.present}</div>
          <p className="stat-label">Checked in</p>
        </div>

        <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.3s'}}>
          <div className="stat-header">
            <h3>Absent</h3>
          </div>
          <div className="stat-value text-absent">{stats.absent}</div>
          <p className="stat-label">Not arrived</p>
        </div>

        <div className="stat-card glass-panel animate-fade-in" style={{animationDelay: '0.4s'}}>
          <div className="stat-header">
            <h3>Attendance Rate</h3>
          </div>
          <div className="stat-value">{stats.rate}%</div>
          <p className="stat-label">Overall Completion</p>
        </div>
      </div>

      <div className="chart-bento glass-panel animate-fade-in" style={{animationDelay: '0.5s'}}>
        <h3 className="chart-title">Overview</h3>
        <div className="nested-chart-container">
          <svg viewBox="0 0 100 100" className="nested-chart">
            {/* Total Ring */}
            <circle cx="50" cy="50" r="38" fill="none" stroke="var(--glass-border)" strokeWidth="6" />
            <circle cx="50" cy="50" r="38" fill="none" stroke="var(--button-bg)" strokeWidth="6" 
                    strokeLinecap="round" strokeDasharray="238.7 238.7" 
                    transform="rotate(-90 50 50)" />
            
            {/* Present Ring */}
            <circle cx="50" cy="50" r="29" fill="none" stroke="var(--status-present-bg)" strokeWidth="6" />
            <circle cx="50" cy="50" r="29" fill="none" stroke="var(--status-present)" strokeWidth="6" 
                    strokeLinecap="round" strokeDasharray={`${(presentPct/100) * 182.2} 182.2`} 
                    transform="rotate(-90 50 50)" />
                    
            {/* Absent Ring */}
            <circle cx="50" cy="50" r="20" fill="none" stroke="var(--status-absent-bg)" strokeWidth="6" />
            <circle cx="50" cy="50" r="20" fill="none" stroke="var(--status-absent)" strokeWidth="6" 
                    strokeLinecap="round" strokeDasharray={`${(absentPct/100) * 125.6} 125.6`} 
                    transform="rotate(-90 50 50)" />
                    
            {/* Rate Inner Ring */}
            <circle cx="50" cy="50" r="11" fill="none" stroke="#F4F4F0" strokeWidth="6" />
            <circle cx="50" cy="50" r="11" fill="none" stroke="var(--accent-color)" strokeWidth="6" 
                    strokeLinecap="round" strokeDasharray={`${(stats.rate/100) * 69.1} 69.1`} 
                    transform="rotate(-90 50 50)" />
          </svg>
          <div className="chart-labels">
            <div className="chart-label"><span className="dot" style={{background: 'var(--button-bg)'}}></span> Total</div>
            <div className="chart-label"><span className="dot" style={{background: 'var(--status-present)'}}></span> Present</div>
            <div className="chart-label"><span className="dot" style={{background: 'var(--status-absent)'}}></span> Absent</div>
            <div className="chart-label"><span className="dot" style={{background: 'var(--accent-color)'}}></span> Rate</div>
          </div>
        </div>
      </div>
    </div>

    <div className="master-sticky-header">
      <div className="controls-panel">
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
            {isSaving ? 'Saving...' : `Save Attendance (${filteredPlayers.length})`}
          </button>
          <button 
            className="save-btn" 
            onClick={syncExcelDB} 
            disabled={isSaving}
            style={{ backgroundColor: '#1A1A1A' }}
          >
            Sync XLSX to DB
          </button>
          <button 
            className="save-btn" 
            onClick={() => setResetModalOpen(true)}
            disabled={isSaving}
            style={{ backgroundColor: '#DC2626' }}
            title="Reset all arrival statuses for today"
          >
            Reset Daily List
          </button>
          {saveMessage && <span className="save-msg">{saveMessage}</span>}
        </div>
      </div>

      {/* MASTER STANDALONE TABLE HEADER */}
      <div className="standalone-table-header desktop-only">
        <table className="attendance-table" style={{ marginBottom: 0, borderSpacing: 0, width: '100%' }}>
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '17%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Player Name</th>
              <th>Sport</th>
              <th>Class Timing</th>
              <th>Coach</th>
              <th className="status-col">Attendance</th>
              <th className="action-col">Transport</th>
            </tr>
          </thead>
        </table>
      </div>
    </div>

      <div className="table-container">
        {loading ? (
          <div className="jumping-logo-container">
            <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
            <span className="jumping-text">Syncing data...</span>
          </div>
        ) : (
          <>
            <AttendanceTable 
              players={paginatedPlayers} 
              onToggleStatus={handleToggleStatus} 
              onChangeTransport={handleChangeTransport}
            />
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button 
                  className="pagination-btn"
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  ← Previous
                </button>
                <div className="pagination-info">
                  Page <span className="highlight-page">{currentPage}</span> of {totalPages}
                </div>
                <button 
                  className="pagination-btn"
                  disabled={currentPage === totalPages} 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* MISSING TRANSPORT MODAL */}
      {missingTransportModal.isOpen && createPortal(
        <div className="custom-modal-overlay animate-fade-in">
          <div className="custom-modal glass-panel animate-pop-in">
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="modal-icon">!!!</span>
                <h3>Action Required</h3>
              </div>
              <button 
                className="close-modal-btn" 
                onClick={() => setMissingTransportModal({ isOpen: false, players: [] })}
              >
                ✕
              </button>
            </div>
            
            <div className="modal-body">
              <p className="modal-desc">
                Cannot save attendance. The following <strong>{missingTransportModal.players.length}</strong> present player(s) have no transportation specified:
              </p>
              
              <ul className="modal-player-list">
                {missingTransportModal.players.map(p => (
                  <li key={p.firestoreId} className="modal-player-item">
                    <div className="modal-avatar">{p.name.charAt(0)}</div>
                    <div className="modal-player-info">
                      <span className="modal-player-name">{p.name}</span>
                      <span className="modal-player-coach">Coach: {p.coach}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="modal-footer">
              <button 
                className="modal-primary-btn" 
                onClick={() => setMissingTransportModal({ isOpen: false, players: [] })}
              >
                I'll fix it
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* DAILY RESET CONFIRMATION MODAL */}
      <ConfirmModal 
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleDailyReset}
        isDanger={true}
        title="Reset Today's Attendance?"
        message="This will reset all player statuses to 'Absent' for today. Previous history logs will NOT be affected."
        confirmText="Yes, Reset Daily List"
        requiredPasscode="Fm@c.2020"
      />
    </div>
  );
}
