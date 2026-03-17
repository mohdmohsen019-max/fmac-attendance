import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import './AttendanceHistory.css';

export default function AttendanceHistory() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, "attendance_logs"),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(logsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching logs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-state">Loading history...</div>;
  }

  if (logs.length === 0) {
    return <div className="empty-state">No attendance logs found. Save a snapshot in the Dashboard to see it here.</div>;
  }

  return (
    <div className="history-container">
      <div className="history-sidebar glass-panel animate-fade-in">
        <h3 className="sidebar-title">Recent Logs</h3>
        <div className="logs-list">
          {logs.map(log => (
            <div 
              key={log.id} 
              className={`log-item ${selectedLog?.id === log.id ? 'active' : ''}`}
              onClick={() => setSelectedLog(log)}
            >
              <div className="log-date">{new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div className="log-meta">
                <span>{log.timing}</span>
                <span className="log-badge">{log.sport}</span>
              </div>
              <div className="log-stats">
                <span className="present">P: {log.presentCount}</span>
                <span className="absent">A: {log.absentCount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="history-detail glass-panel animate-fade-in">
        {selectedLog ? (
          <>
            <div className="detail-header">
              <div>
                <h2>{new Date(selectedLog.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
                <p className="detail-subtitle">{selectedLog.timing} • {selectedLog.sport}</p>
              </div>
              <div className="detail-stats">
                <div className="stat-circle">
                  <span className="val">{Math.round((selectedLog.presentCount / selectedLog.totalCount) * 100)}%</span>
                  <span className="lab">Rate</span>
                </div>
              </div>
            </div>

            <div className="detail-table-wrapper">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>ID</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLog.attendance.map((player, idx) => (
                    <tr key={idx} className={player.status}>
                      <td>{player.name}</td>
                      <td>{player.id}</td>
                      <td>
                        <span className={`status-pill ${player.status}`}>
                          {player.status.charAt(0).toUpperCase() + player.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="select-prompt">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <p>Select a log from the sidebar to view full details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
