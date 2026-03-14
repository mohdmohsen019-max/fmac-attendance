import './AttendanceTable.css';

export default function AttendanceTable({ players, onToggleStatus }) {
  if (players.length === 0) {
    return (
      <div className="empty-state">
        <p>No players found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="attendance-table">
        <thead>
          <tr>
            <th>Player Name</th>
            <th>Sport</th>
            <th>Class Timing</th>
            <th>Coach</th>
            <th className="status-col">Attendance</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.id} className="table-row">
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
                <span className="badge badge-sport">{player.sport}</span>
              </td>
              <td className="timing-cell">{player.classTiming}</td>
              <td className="coach-cell">{player.coach}</td>
              <td className="status-col">
                <button 
                  className={`status-btn ${player.status === 'present' ? 'present' : 'absent'}`}
                  onClick={() => onToggleStatus(player.id)}
                >
                  <div className="status-indicator"></div>
                  <span className="status-text">
                    {player.status === 'present' ? 'Present' : 'Absent'}
                  </span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
