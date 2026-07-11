import { useState, useEffect, useCallback } from 'react';
import { I18nProvider } from './i18n/i18nContext';
import db, { ensureDefaults } from './db';
import { checkAutoBackup } from './utils/backup';
import { getCurrentUser, logout as doLogout, canAccessPage, verifyPassword, logAudit } from './utils/auth';
import Sidebar from './components/ui/Sidebar';
import LoginScreen from './components/LoginScreen';
import PinDialog from './components/ui/PinDialog';
import Dashboard from './components/Dashboard';
import PurchaseEntry from './components/PurchaseEntry';
import FarmerMaster from './components/FarmerMaster';
import RateChart from './components/RateChart';
import Payments from './components/Payments';
import StoreSales from './components/StoreSales';
import Dispatches from './components/Dispatches';
import Settings from './components/Settings';
import Livestock from './components/Livestock';
import Loans from './components/Loans';

/**
 * App Shell — layout with persistent sidebar, hash-based routing,
 * offline authentication gate, and auto-backup timer.
 */
export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // PIN dialog state
  const [pinDialog, setPinDialog] = useState({ open: false, title: '', resolve: null, error: '' });

  // Initialize database defaults and auto-backup on mount
  useEffect(() => {
    async function init() {
      await ensureDefaults();
      // Load and apply theme
      const config = await db.dairyConfig.get(1);
      if (config?.theme === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
      // Check for existing session
      const session = getCurrentUser();
      if (session) {
        setCurrentUser(session);
      }
      setReady(true);
      // Check if auto-backup is due
      await checkAutoBackup();
    }
    init();
  }, []);

  // Apply printer size class to body dynamically
  useEffect(() => {
    if (!ready) return;
    async function applyPrinterClass() {
      const config = await db.dairyConfig.get(1);
      if (config?.printerSize) {
        document.body.classList.remove('printer-2inch', 'printer-3inch', 'printer-a4');
        document.body.classList.add(`printer-${config.printerSize}`);
      }
    }
    applyPrinterClass();
  }, [ready, activePage]);

  // Auto-backup interval (5 hours = 18,000,000 ms)
  useEffect(() => {
    if (!ready) return;
    const intervalId = setInterval(() => {
      checkAutoBackup();
    }, 5 * 60 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [ready]);

  // Hash-based navigation
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      setActivePage(hash);
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const navigate = useCallback((page) => {
    window.location.hash = page;
    setActivePage(page);
  }, []);

  // Handle successful login
  const handleLogin = useCallback((user) => {
    setCurrentUser({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    await logAudit('LOGOUT', `User ${currentUser?.username}`);
    doLogout();
    setCurrentUser(null);
  }, [currentUser]);

  /**
   * Request PIN confirmation for sensitive operations.
   * Returns a promise that resolves to true (PIN correct) or false (cancelled/wrong).
   * @param {string} title - Description of the operation
   * @returns {Promise<boolean>}
   */
  const requirePin = useCallback((title) => {
    return new Promise((resolve) => {
      setPinDialog({ open: true, title, resolve, error: '' });
    });
  }, []);

  const handlePinConfirm = useCallback(async (pin) => {
    if (!pinDialog.resolve) return;
    try {
      // Verify PIN against current user's stored PIN hash
      const user = await db.users.get(currentUser.id);
      if (!user) {
        setPinDialog(prev => ({ ...prev, error: 'User not found.' }));
        return;
      }
      const valid = await verifyPassword(pin, user.pinHash, user.pinSalt);
      if (valid) {
        setPinDialog({ open: false, title: '', resolve: null, error: '' });
        pinDialog.resolve(true);
      } else {
        setPinDialog(prev => ({ ...prev, error: 'Incorrect PIN. Try again.' }));
      }
    } catch {
      setPinDialog(prev => ({ ...prev, error: 'Verification failed.' }));
    }
  }, [currentUser, pinDialog]);

  const handlePinCancel = useCallback(() => {
    if (pinDialog.resolve) pinDialog.resolve(false);
    setPinDialog({ open: false, title: '', resolve: null, error: '' });
  }, [pinDialog]);

  // Loading state
  if (!ready) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-root)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
      }}>
        Loading...
      </div>
    );
  }

  // Auth gate — show login screen if no session
  if (!currentUser) {
    return (
      <I18nProvider>
        <LoginScreen onLogin={handleLogin} />
      </I18nProvider>
    );
  }

  // Role-based page access check
  const pageAccessible = canAccessPage(activePage);

  const renderPage = () => {
    if (!pageAccessible) {
      return (
        <div className="empty-state" style={{ marginTop: 'var(--space-2xl)' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-lg)',
            background: 'rgba(239,68,68,0.1)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-lg)',
          }}>
            <span style={{ fontSize: 28 }}>🔒</span>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-sm)' }}>
            Access Restricted
          </h3>
          <p className="empty-state-text">
            Your role ({currentUser.role}) does not have permission to access this page.
            <br />Contact your administrator for elevated access.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('dashboard')}>
            Go to Dashboard
          </button>
        </div>
      );
    }

    switch (activePage) {
      case 'dashboard': return <Dashboard onNavigate={navigate} />;
      case 'purchase': return <PurchaseEntry requirePin={requirePin} />;
      case 'farmers': return <FarmerMaster requirePin={requirePin} />;
      case 'rate-chart': return <RateChart requirePin={requirePin} />;
      case 'payments': return <Payments requirePin={requirePin} />;
      case 'store-sales': return <StoreSales requirePin={requirePin} />;
      case 'dispatches': return <Dispatches />;
      case 'settings': return <Settings requirePin={requirePin} currentUser={currentUser} />;
      case 'livestock': return <Livestock requirePin={requirePin} />;
      case 'loans': return <Loans requirePin={requirePin} />;
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <I18nProvider>
      <Sidebar activePage={activePage} onNavigate={navigate} currentUser={currentUser} onLogout={handleLogout} />
      <main className="main-content">
        <div className="page-container">
          {renderPage()}
        </div>
      </main>
      {/* Global PIN Dialog */}
      <PinDialog
        isOpen={pinDialog.open}
        title={pinDialog.title}
        onConfirm={handlePinConfirm}
        onCancel={handlePinCancel}
        error={pinDialog.error}
      />
    </I18nProvider>
  );
}
