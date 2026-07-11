import { useState, useEffect, useRef } from 'react';
import db from '../db';
import { hashPassword, verifyPassword, setCurrentUser, checkLockout, recordFailedAttempt, clearLockout, logAudit } from '../utils/auth';
import { Lock, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react';

/**
 * Full-screen offline login gate.
 * Renders before the main app shell when no session is active.
 */
export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockout, setLockout] = useState({ locked: false, remainingMs: 0 });
  const [dairyName, setDairyName] = useState('Smart Dairy');
  const usernameRef = useRef(null);

  // Load dairy name for branding
  useEffect(() => {
    (async () => {
      const config = await db.dairyConfig.get(1);
      if (config?.dairyName) setDairyName(config.dairyName);
    })();
    usernameRef.current?.focus();
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockout.locked) return;
    const interval = setInterval(() => {
      const status = checkLockout();
      setLockout(status);
      if (!status.locked) {
        setError('');
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockout.locked]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // Check lockout
    const lockStatus = checkLockout();
    if (lockStatus.locked) {
      setLockout(lockStatus);
      setError(`Too many attempts. Try again in ${Math.ceil(lockStatus.remainingMs / 1000)}s.`);
      return;
    }

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      // Find user in local database
      const user = await db.users.where('username').equals(username.trim().toLowerCase()).first();
      if (!user) {
        const result = recordFailedAttempt();
        if (result.locked) {
          setLockout({ locked: true, remainingMs: 30000 });
          setError('Account locked for 30 seconds due to too many failed attempts.');
        } else {
          setError(`Invalid credentials. ${result.attemptsLeft} attempts remaining.`);
        }
        setLoading(false);
        return;
      }

      if (!user.isActive) {
        setError('This account has been deactivated. Contact your administrator.');
        setLoading(false);
        return;
      }

      // Verify password using PBKDF2
      const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
      if (!valid) {
        const result = recordFailedAttempt();
        if (result.locked) {
          setLockout({ locked: true, remainingMs: 30000 });
          setError('Account locked for 30 seconds due to too many failed attempts.');
        } else {
          setError(`Invalid credentials. ${result.attemptsLeft} attempts remaining.`);
        }
        setLoading(false);
        return;
      }

      // Successful login
      clearLockout();
      setCurrentUser(user);
      await logAudit('LOGIN', `User ${user.username} (${user.role})`);
      onLogin(user);
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-root)',
      padding: 'var(--space-xl)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-default)',
        padding: 'var(--space-2xl)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-2xl)' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-emerald))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-lg)',
            boxShadow: '0 4px 16px rgba(6,182,212,0.3)',
          }}>
            <Shield size={32} color="#fff" />
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 var(--space-xs)',
            fontFamily: 'var(--font-sans)',
          }}>
            {dairyName}
          </h1>
          <p style={{
            fontSize: 13, color: 'var(--text-muted)',
            margin: 0,
          }}>
            Secure Offline Login
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="form-label">Username</label>
            <input
              ref={usernameRef}
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              disabled={lockout.locked}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={lockout.locked}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 4,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: 'var(--space-sm) var(--space-md)',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--accent-red)',
              fontSize: 13, marginBottom: 'var(--space-lg)',
            }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Lockout Timer */}
          {lockout.locked && (
            <div style={{
              textAlign: 'center',
              padding: 'var(--space-sm)',
              background: 'rgba(245,158,11,0.1)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--accent-amber)',
              fontSize: 13, fontWeight: 600,
              marginBottom: 'var(--space-lg)',
            }}>
              🔒 Locked — {Math.ceil(lockout.remainingMs / 1000)}s remaining
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginBottom: 'var(--space-lg)' }}
            disabled={loading || lockout.locked}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span className="spinner" style={{
                  width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                }} /> Authenticating...
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Lock size={16} /> Sign In
              </span>
            )}
          </button>
        </form>

        {/* First-time helper */}
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-md)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border-default)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>
            First time setup? Use default credentials:
          </p>
          <p style={{
            fontSize: 12, fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)', margin: 0,
          }}>
            Username: <strong>admin</strong> &nbsp;|&nbsp; Password: <strong>admin123</strong>
          </p>
          <p style={{
            fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0',
          }}>
            Security PIN: <strong>0000</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
