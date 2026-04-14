import { useState, useMemo, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import ConfirmModal from './ConfirmModal';
import { performGlobalReset } from '../utils/systemUtils';
import './AnalyticsView.css';

export default function AnalyticsView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await performGlobalReset();
    } catch (e) {
      alert("Reset failed.");
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    // Fetch all logs to calculate analytics
    // In a production app, you might want to filter this by year at the query level
    const q = query(collection(db, "attendance_logs"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => doc.data());
      setLogs(logsData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const years = useMemo(() => {
    const yearsSet = new Set([new Date().getFullYear()]);
    logs.forEach(log => {
      const year = new Date(log.date).getFullYear();
      if (year) yearsSet.add(year);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [logs]);

  const monthlyReport = useMemo(() => {
    const playerStats = {};

    // Filter logs for the selected month and year
    const filteredLogs = logs.filter(log => {
      const d = new Date(log.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    filteredLogs.forEach(log => {
      log.attendance.forEach(record => {
        if (!playerStats[record.id]) {
          playerStats[record.id] = { 
            name: record.name, 
            present: 0, 
            total: 0 
          };
        }
        playerStats[record.id].total += 1;
        if (record.status === 'present') {
          playerStats[record.id].present += 1;
        }
      });
    });

    return Object.entries(playerStats)
      .map(([id, stats]) => ({
        id,
        ...stats,
        rate: Math.round((stats.present / stats.total) * 100)
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [logs, selectedMonth, selectedYear]);

  if (loading) {
    return <div className="loading-state">Generating reports...</div>;
  }

  return (
    <div className="analytics-container glass-panel animate-fade-in">
      <div className="analytics-header">
        <h2>Attendance Analytics</h2>
        <div className="analytics-filters">
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="analytics-select"
          >
            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="analytics-select"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button 
            className="analytics-reset-btn" 
            onClick={() => setResetModalOpen(true)}
            disabled={isResetting}
            title="Wipe data and start fresh"
          >
            {isResetting ? "..." : "Reset System"}
          </button>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-card main-stat">
          <span className="label">Average Participation</span>
          <span className="value">
            {monthlyReport.length > 0 
              ? Math.round(monthlyReport.reduce((acc, curr) => acc + curr.rate, 0) / monthlyReport.length) 
              : 0}%
          </span>
          <p className="subtext">Based on {monthlyReport.length} active players this month.</p>
        </div>
      </div>

      <div className="analytics-table-wrapper">
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Classes Attended</th>
              <th>Attendance %</th>
              <th>Performance</th>
            </tr>
          </thead>
          <tbody>
            {monthlyReport.length > 0 ? (
              monthlyReport.map(player => (
                <tr key={player.id}>
                  <td>
                    <div className="player-cell">
                      <span className="p-name">{player.name}</span>
                      <span className="p-id">#{player.id}</span>
                    </div>
                  </td>
                  <td>{player.present} / {player.total}</td>
                  <td>
                    <div className="rate-container">
                      <div className="rate-bar" style={{ width: `${player.rate}%` }}></div>
                      <span className="rate-text">{player.rate}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={`performance-badge ${player.rate >= 90 ? 'excellent' : player.rate >= 75 ? 'good' : 'warning'}`}>
                      {player.rate >= 90 ? 'Excellent' : player.rate >= 75 ? 'Good' : 'Needs Review'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="empty-row">No attendance records found for this month.</td>
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
        title="Wipe Analytics History?"
        message="This will delete all historical data. Analytics will be reset to zero."
        confirmText="Yes, Wipe Data"
        requiredPasscode="Fm@c.2020"
      />
    </div>
  );
}
