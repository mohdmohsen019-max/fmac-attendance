import './App.css'
import Dashboard from './components/Dashboard'

function App() {
  return (
    <div className="app-container">
      <header className="glass-panel main-header animate-fade-in">
        <div className="logo">
          <div className="logo-icon">
             <img src="/fmac-logo.png" alt="FMAC Logo" />
          </div>
        </div>
        <div className="date-display">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </header>
      
      <main className="main-content">
        <Dashboard />
      </main>
    </div>
  )
}

export default App
