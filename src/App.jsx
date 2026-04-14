import { useState, useEffect } from 'react'
import './App.css'
import Dashboard from './components/Dashboard'
import AttendanceHistory from './components/AttendanceHistory'
import AnalyticsView from './components/AnalyticsView'
import TransportationModule from './components/TransportationModule'
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
          <img src="/fmac-logo-new.png" alt="FMAC Logo" />
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
  const [displayedTab, setDisplayedTab] = useState('dashboard');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setInitializing(false);
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  const handleLogout = () => {
    signOut(auth);
  };

  const handleTabChange = (tabId) => {
    if (tabId === activeTab || isTransitioning) return;
    setActiveTab(tabId);
    setIsTransitioning(true);
    
    // Simulate navigation/loading for 600ms to show the jumping logo
    setTimeout(() => {
      setDisplayedTab(tabId);
      setIsTransitioning(false);
    }, 600);
  };

  if (initializing) {
    return (
      <div className="initializing-overlay">
        <div className="jumping-logo-container">
          <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
          <span className="jumping-text">Initializing Secure Session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderContent = () => {
    switch (displayedTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'history':
        return <AttendanceHistory />;
      case 'analytics':
        return <AnalyticsView />;
      case 'transportation':
        return <TransportationModule />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container sidebar-layout">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar animate-fade-in">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <img src="/fmac-logo-new.png" alt="FMAC Logo" />
          </div>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleTabChange('dashboard')}
          >
            📋 Today's Attendance
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => handleTabChange('history')}
          >
            📜 History Logs
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => handleTabChange('analytics')}
          >
            📊 Player Analytics
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'transportation' ? 'active' : ''}`}
            onClick={() => handleTabChange('transportation')}
          >
            🚍 Transportation
          </button>
        </nav>
        
        <div className="sidebar-bottom">
           <button className="logout-btn sidebar-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="main-layout">
        <header className="main-header animate-fade-in">
          <div className="header-left">
            <h2>{activeTab === 'dashboard' ? "Today's Attendance" : activeTab === 'history' ? "History Logs" : activeTab === 'analytics' ? "Player Analytics" : "Transportation Overview"}</h2>
          </div>
          <div className="header-right">
            <div className="date-display">
              <span className="current-date">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              <span className="time-divider">|</span>
              <span className="current-time">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
            </div>
          </div>
        </header>

        <main className="main-content">
          {isTransitioning ? (
            <div className="jumping-logo-container animate-fade-in" style={{ height: '70vh' }}>
              <img src="/fmac-logo-new.png" alt="Loading" className="jumping-logo" />
              <span className="jumping-text">Loading...</span>
            </div>
          ) : (
            <div key={displayedTab} className="view-transition-wrapper animate-fade-in">
              {renderContent()}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
