import React, { useState, useEffect, memo } from 'react';
import './AttendanceTable.css';

const TRANSPORT_OPTIONS = [
  "",
  "Bus 1", "Bus 2", "Bus 3", "Bus 4", 
  "Bus 5", "Bus 6", "Bus 7", "Bus 8", 
  "Own Transportation"
];

// Custom Swipe Hook
function useSwipe(onSwipeRight, onSwipeLeft) {
  const [touchStartX, setTouchStartX] = useState(null);

  const onTouchStart = (e) => setTouchStartX(e.targetTouches[0].clientX);
  
  const onTouchEnd = (e) => {
    if (!touchStartX) return;
    const touchEndX = e.changedTouches[0].clientX;
    const distance = touchStartX - touchEndX;

    if (distance > 60 && onSwipeLeft) onSwipeLeft();
    if (distance < -60 && onSwipeRight) onSwipeRight();
    setTouchStartX(null);
  };

  return { onTouchStart, onTouchEnd };
}

// Memoized Desktop Row
const PlayerRow = memo(({ player, onToggleStatus, onChangeTransport, index }) => {
  // Stagger animation based on index
  const delay = Math.min(index * 20, 400);

  return (
    <tr className="table-row animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <td>
        <div className="player-info">
          <div className="avatar">{player.name.charAt(0)}</div>
          <div className="name-id">
            <span className="player-name">{player.name}</span>
            <span className="player-id">{player.id}</span>
          </div>
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {player.sports && player.sports.length > 0 
            ? player.sports.map((s, idx) => (
               <span key={idx} className={`badge badge-sport animate-fade-in ${player.sports.length > 1 ? 'multi-glow' : ''}`} style={{ animationDelay: `${delay + (idx * 50)}ms` }}>{s}</span>
              ))
            : <span className="badge badge-sport">{player.sport}</span>
          }
        </div>
      </td>
      <td className="timing-cell">
        <div className="stacked-text">{player.classTiming}</div>
      </td>
      <td className="coach-cell">
        <div className="stacked-text muted-text">{player.coach}</div>
      </td>
      <td className="status-col">
        <button 
          className={`status-pill ${player.status === 'present' ? 'present ripple-btn' : 'absent'}`}
          onClick={() => onToggleStatus(player.firestoreId)}
        >
          <div className="status-indicator"></div>
          <span className="status-text">{player.status === 'present' ? 'Present' : 'Absent'}</span>
        </button>
      </td>
      <td className="action-col">
        <div className="action-wrapper">
          {player.status === 'present' && (
            <select 
              className="transport-select animate-pop-in" 
              value={player.transportation || ''} 
              onChange={e => onChangeTransport(player.firestoreId, e.target.value)}
            >
              <option value="" disabled>Select Transport</option>
              {TRANSPORT_OPTIONS.filter(o => o !== "").map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      </td>
    </tr>
  );
});

// Memoized Mobile Card
const MobilePlayerCard = memo(({ player, onToggleStatus, onChangeTransport, index }) => {
  const [expanded, setExpanded] = useState(false);
  const delay = Math.min(index * 20, 400);
  
  // Swipe to mark: Right = Present, Left = Absent
  const handlers = useSwipe(
    () => { if (player.status !== 'present') onToggleStatus(player.firestoreId) },
    () => { if (player.status === 'present') onToggleStatus(player.firestoreId) }
  );

  return (
    <div 
      className={`player-card animate-fade-in ${expanded ? 'expanded' : ''} ${player.status === 'present' ? 'card-present-glow' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      {...handlers}
    >
      <div className="player-card-top" onClick={() => setExpanded(!expanded)}>
        <div className="player-info">
          <div className="avatar">{player.name.charAt(0)}</div>
          <div className="name-id">
            <span className="player-name">{player.name}</span>
            <span className="player-id">#{player.id}</span>
          </div>
        </div>
        <button
          className={`status-btn ${player.status === 'present' ? 'present' : 'absent'}`}
          onClick={(e) => { 
            e.stopPropagation(); 
            const isMarkingPresent = player.status !== 'present';
            onToggleStatus(player.firestoreId); 
            if (isMarkingPresent) setExpanded(true);
          }}
        >
          <div className="status-indicator"></div>
          <span className="status-text">{player.status === 'present' ? 'Present' : 'Absent'}</span>
        </button>
        <span className={`card-chevron ${expanded ? 'rotated' : ''}`}>▼</span>
      </div>
      
      {/* Expanded Accordion Details */}
      <div className="player-card-details">
        <div className="mobile-action-row">
          {player.status === 'present' && (
            <div className={`mobile-select-group ${!player.transportation ? 'selection-required' : ''}`}>
               <label className="mobile-select-label">Choose Transportation Method:</label>
               <select 
                className="transport-select mobile-select animate-pop-in" 
                value={player.transportation || ''} 
                onChange={e => onChangeTransport(player.firestoreId, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="" disabled>Select Transport</option>
                {TRANSPORT_OPTIONS.filter(o => o !== "").map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {player.sports && player.sports.length > 0
            ? player.sports.map((s, idx) => <span key={idx} className="badge badge-sport">{s}</span>)
            : <span className="badge badge-sport">{player.sport}</span>
          }
        </div>
        <div className="details-row">
          <span className="card-detail">Timing: {player.classTiming}</span>
          <span className="card-detail">Coach: {player.coach}</span>
        </div>
      </div>
    </div>
  );
});

export default function AttendanceTable({ players, onToggleStatus, onChangeTransport, loading }) {
  if (loading) {
    return (
      <div className="table-wrapper">
        <div className="skeleton-container">
           {[...Array(6)].map((_, i) => (
             <div key={i} className="skeleton-row skeleton"></div>
           ))}
        </div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="empty-state animate-fade-in">
        <p>No players found matching your criteria.</p>
      </div>
    );
  }

  // Render mapped array directly since pagination manages limits externally
  const renderedPlayers = players;

  const renderColGroup = () => (
    <colgroup>
      <col style={{ width: '25%' }} />
      <col style={{ width: '16%' }} />
      <col style={{ width: '15%' }} />
      <col style={{ width: '15%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '17%' }} />
    </colgroup>
  );

  return (
    <div className="table-wrapper">
      
      {/* 🧾 SCROLLABLE TABLE BODY */}
      <div className="scrollable-table-content desktop-only">
        <table className="attendance-table" style={{ marginTop: 0 }}>
          {renderColGroup()}
          <tbody>
            {renderedPlayers.map((player, index) => (
              <PlayerRow 
                key={player.firestoreId} 
                player={player} 
                index={index} 
                onToggleStatus={onToggleStatus} 
                onChangeTransport={onChangeTransport} 
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="mobile-card-list mobile-only">
        {renderedPlayers.map((player, index) => (
          <MobilePlayerCard 
            key={player.firestoreId} 
            player={player} 
            index={index}
            onToggleStatus={onToggleStatus} 
            onChangeTransport={onChangeTransport} 
          />
        ))}
      </div>
    </div>
  );
}
