import { useState } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'

// Admin credentials - change these to your own!
const ADMIN_USERNAME = 'fmac';
const ADMIN_PASSWORD = 'fmac2026';

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        onLogin();
      } else {
        setError('Incorrect username or password.');
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="login-overlay">
      <div className="login-card glass-panel animate-fade-in">
        <div className="login-logo">
          <img src="/fmac-logo.png" alt="FMAC Logo" />
        </div>
        <h2 className="login-title">Attendance System</h2>
        <p className="login-subtitle">Admin Access Only</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  if (!isLoggedIn) {
    return <LoginPage onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="app-container">
      <header className="glass-panel main-header animate-fade-in">
        <div className="logo">
          <div className="logo-icon">
            <img src="/fmac-logo.png" alt="FMAC Logo" />
          </div>
        </div>
        <div className="header-title">
          <h2>Attendance System</h2>
          <span>Fujairah Martial Arts Club</span>
        </div>
        <div className="header-right">
          <div className="date-display">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <button className="logout-btn" onClick={() => setIsLoggedIn(false)}>
            Sign Out
          </button>
        </div>
      </header>

      <main className="main-content">
        <Dashboard />
      </main>
    </div>
  )
}

export default App
