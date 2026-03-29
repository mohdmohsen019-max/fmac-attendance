import { useState, useEffect } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'
import AttendanceHistory from './components/AttendanceHistory'
import AnalyticsView from './components/AnalyticsView'
import { auth } from './firebase'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'


function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      await signInWithEmailAndPassword(auth, username, password);
    } catch (err) {
      console.error(err);
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
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
              placeholder="Enter email"
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
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth);
  };

  if (initializing) {
    return (
      <div className="initializing-overlay">
        <div className="loader"></div>
        <p>Initializing Secure Session...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'history':
        return <AttendanceHistory />;
      case 'analytics':
        return <AnalyticsView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <header className="main-header animate-fade-in">
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
          <button className="logout-btn" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      <main className="main-content">
        <nav className="tabs-nav animate-fade-in">
          <button 
            className={`tab-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Today's Attendance
          </button>
          <button 
            className={`tab-link ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History Logs
          </button>
          <button 
            className={`tab-link ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Player Analytics
          </button>
        </nav>
        {renderContent()}
      </main>
    </div>
  )
}

export default App
