import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { exportBackup, importBackup, getBackupHistory } from '../utils/backup';
import { formatDate, formatBytes } from '../utils/formatters';
import { CheckCircle, Download, Upload, Clock, Shield, Trash2, Sun, Moon, Usb, MessageCircle, Loader, WifiOff, Wifi } from 'lucide-react';
import UserManagement from './Settings/UserManagement';
import { initWhatsAppClient, onWhatsAppStatusChange, getWhatsAppStatus, connectWhatsApp, disconnectWhatsApp } from '../utils/whatsappClient';

export default function Settings({ requirePin, currentUser }) {
  const { t, locale, switchLanguage } = useTranslation();
  const [config, setConfig] = useState(null);
  const [toast, setToast] = useState(null);
  const [backupHistory, setBackupHistory] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  // WhatsApp connection state
  const [waStatus, setWaStatus] = useState({ state: 'disconnected', qrDataUrl: null, phoneNumber: null, serverAvailable: false });
  const [waLoading, setWaLoading] = useState(false);

  useEffect(() => {
    loadConfig();
    loadBackupHistory();

    // Initialize WhatsApp client and subscribe to status changes
    initWhatsAppClient();
    setWaStatus(getWhatsAppStatus());
    const unsub = onWhatsAppStatusChange((status) => {
      setWaStatus(status);
      setWaLoading(false);
    });
    return unsub;
  }, []);

  async function loadConfig() {
    const cfg = await db.dairyConfig.get(1);
    setConfig(cfg);
  }

  async function loadBackupHistory() {
    const history = await getBackupHistory();
    setBackupHistory(history);
  }

  const updateConfig = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const saveConfig = async () => {
    if (!config) return;
    await db.dairyConfig.update(1, config);
    showToast(t('settings.saved'));
  };

  const handleLanguageSwitch = (lang) => {
    switchLanguage(lang);
    updateConfig('language', lang);
  };

  const handleThemeSwitch = async (theme) => {
    updateConfig('theme', theme);
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    await db.dairyConfig.update(1, { theme });
  };

  const handleExportBackup = async () => {
    await exportBackup(false);
    await loadBackupHistory();
    showToast('Backup downloaded!');
  };

  const handleImportBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      'This will REPLACE all existing data with the backup. Are you sure?'
    );
    if (!confirmed) return;

    setImporting(true);
    const result = await importBackup(file);
    setImporting(false);

    if (result.success) {
      showToast('Backup restored successfully! Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showToast(result.error || 'Import failed', 'error');
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateConfig('logo', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div>
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle size={16} /> : null}
            {toast.message}
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">{t('settings.title')}</h1>
        <button className="btn btn-primary" onClick={saveConfig}>
          {t('settings.save')}
        </button>
      </div>

      <div className="settings-grid">
        {/* Left Column */}
        <div>
          {/* Dairy Profile */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="settings-section">
              <div className="settings-section-title">{t('settings.dairyProfile')}</div>
              <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="form-label">{t('settings.dairyName')}</label>
                <input className="form-input" value={config.dairyName || ''} onChange={(e) => updateConfig('dairyName', e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="form-label">{t('settings.address')}</label>
                <input className="form-input" value={config.address || ''} onChange={(e) => updateConfig('address', e.target.value)} />
              </div>
              <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="form-group">
                  <label className="form-label">{t('settings.phone')}</label>
                  <input className="form-input mono" value={config.phone || ''} onChange={(e) => updateConfig('phone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('settings.registrationNo')}</label>
                  <input className="form-input mono" value={config.registrationNo || ''} onChange={(e) => updateConfig('registrationNo', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.logo')}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  {config.logo && (
                    <img src={config.logo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', objectFit: 'cover', border: '1px solid var(--border-default)' }} />
                  )}
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={14} /> {t('settings.uploadLogo')}
                    <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  </label>
                  {config.logo && (
                    <button className="btn btn-ghost btn-sm" onClick={() => updateConfig('logo', null)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Collection Settings */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="settings-section">
              <div className="settings-section-title">{t('settings.collection')}</div>

              <div className="settings-row">
                <div>
                  <div className="settings-row-label">{t('settings.defaultMilkType')}</div>
                </div>
                <select className="form-select" style={{ width: 160 }} value={config.defaultMilkType} onChange={(e) => updateConfig('defaultMilkType', e.target.value)}>
                  <option value="cow">{t('purchase.cow')}</option>
                  <option value="buffalo">{t('purchase.buffalo')}</option>
                  <option value="mixed">{t('purchase.mixed')}</option>
                </select>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-row-label">{t('settings.snfMode')}</div>
                  <div className="settings-row-hint">
                    {config.snfMode === 'clr' ? t('settings.clrMode') : t('settings.snfDirect')}
                  </div>
                </div>
                <select className="form-select" style={{ width: 220 }} value={config.snfMode} onChange={(e) => updateConfig('snfMode', e.target.value)}>
                  <option value="clr">{t('settings.clrMode')}</option>
                  <option value="snf">{t('settings.snfDirect')}</option>
                </select>
              </div>

              <div className="settings-row">
                <div className="settings-row-label">{t('settings.decimalPrecision')}</div>
                <select className="form-select" style={{ width: 100 }} value={config.decimalPrecision} onChange={(e) => updateConfig('decimalPrecision', parseInt(e.target.value, 10))}>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>

              <div style={{ marginTop: 'var(--space-lg)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>{t('settings.shiftTimings')}</div>
                <div className="form-row form-row-4">
                  <div className="form-group">
                    <label className="form-label">{t('settings.morningStart')}</label>
                    <input type="time" className="form-input mono" value={config.shiftMorningStart} onChange={(e) => updateConfig('shiftMorningStart', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('settings.morningEnd')}</label>
                    <input type="time" className="form-input mono" value={config.shiftMorningEnd} onChange={(e) => updateConfig('shiftMorningEnd', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('settings.eveningStart')}</label>
                    <input type="time" className="form-input mono" value={config.shiftEveningStart} onChange={(e) => updateConfig('shiftEveningStart', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('settings.eveningEnd')}</label>
                    <input type="time" className="form-input mono" value={config.shiftEveningEnd} onChange={(e) => updateConfig('shiftEveningEnd', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div>
          {/* Print Settings */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="settings-section">
              <div className="settings-section-title">{t('settings.print')}</div>

              <div className="settings-row">
                <div className="settings-row-label">{t('settings.printerSize')}</div>
                <select className="form-select" style={{ width: 180 }} value={config.printerSize} onChange={(e) => updateConfig('printerSize', e.target.value)}>
                  <option value="2inch">{t('settings.2inch')}</option>
                  <option value="3inch">{t('settings.3inch')}</option>
                  <option value="a4">{t('settings.a4')}</option>
                </select>
              </div>

              <div className="settings-row">
                <div className="settings-row-label">{t('settings.autoPrint')}</div>
                <label className="toggle">
                  <input type="checkbox" checked={config.autoPrint || false} onChange={(e) => updateConfig('autoPrint', e.target.checked)} />
                  <span className="toggle-track" />
                </label>
              </div>
            </div>
          </div>

          {/* Hardware Config */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="settings-section">
              <div className="settings-section-title" style={{ color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Usb size={18} /> AMCU Hardware Link
              </div>

              <div className="settings-row">
                <div className="settings-row-label">Weighing Scale Baud Rate</div>
                <select className="form-select" style={{ width: 120 }} value={config.scaleBaudRate || 9600} onChange={(e) => updateConfig('scaleBaudRate', parseInt(e.target.value))}>
                  <option value="4800">4800</option>
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                </select>
              </div>

              <div className="settings-row">
                <div className="settings-row-label">Analyzer Baud Rate</div>
                <select className="form-select" style={{ width: 120 }} value={config.analyzerBaudRate || 9600} onChange={(e) => updateConfig('analyzerBaudRate', parseInt(e.target.value))}>
                  <option value="4800">4800</option>
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                </select>
              </div>
            </div>
          </div>

          {/* WhatsApp Connection */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="settings-section">
              <div className="settings-section-title" style={{ color: '#25D366', display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={18} /> WhatsApp Connection
              </div>

              {/* Status Indicator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                padding: 'var(--space-md) var(--space-lg)',
                background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)', marginBottom: 'var(--space-lg)',
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: waStatus.state === 'connected' ? '#25D366'
                    : waStatus.state === 'qr_pending' ? 'var(--accent-amber)'
                    : waStatus.state === 'connecting' ? 'var(--accent-cyan)'
                    : '#6b7280',
                  boxShadow: waStatus.state === 'connected' ? '0 0 8px #25D366' : 'none',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {waStatus.state === 'connected' ? `Connected — +${waStatus.phoneNumber}`
                      : waStatus.state === 'qr_pending' ? 'Scan QR Code'
                      : waStatus.state === 'connecting' ? 'Connecting...'
                      : 'Disconnected'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {waStatus.serverAvailable
                      ? 'Server running — messages send in background'
                      : 'Server not detected — using deep-link fallback'}
                  </div>
                </div>
                {waStatus.state === 'connected' ? <Wifi size={18} style={{ color: '#25D366' }} />
                  : <WifiOff size={18} style={{ color: 'var(--text-muted)' }} />}
              </div>

              {/* QR Code Display */}
              {waStatus.state === 'qr_pending' && waStatus.qrDataUrl && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)',
                  background: '#fff', borderRadius: 'var(--radius-lg)',
                  border: '2px solid #25D366',
                }}>
                  <img src={waStatus.qrDataUrl} alt="WhatsApp QR Code" style={{ width: 260, height: 260 }} />
                  <p style={{ fontSize: 12, color: '#333', marginTop: 'var(--space-md)', textAlign: 'center' }}>
                    Open WhatsApp on your phone → Linked Devices → Link a Device → Scan this QR
                  </p>
                </div>
              )}

              {/* Connect / Disconnect Button */}
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                {waStatus.state === 'disconnected' && (
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, gap: 6, background: '#25D366', borderColor: '#25D366' }}
                    disabled={waLoading || !waStatus.serverAvailable}
                    onClick={async () => {
                      setWaLoading(true);
                      await connectWhatsApp();
                    }}
                  >
                    {waLoading ? <Loader size={14} className="spin" /> : <MessageCircle size={14} />}
                    {waLoading ? 'Connecting...' : 'Connect WhatsApp'}
                  </button>
                )}
                {(waStatus.state === 'connected' || waStatus.state === 'qr_pending') && (
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, gap: 6 }}
                    disabled={waLoading}
                    onClick={async () => {
                      setWaLoading(true);
                      await disconnectWhatsApp();
                      setWaLoading(false);
                    }}
                  >
                    <WifiOff size={14} /> Disconnect
                  </button>
                )}
              </div>

              {!waStatus.serverAvailable && (
                <div style={{ marginTop: 'var(--space-md)', fontSize: 11, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠️ Start the server via the Desktop shortcut to enable WhatsApp. Deep-link fallback is active.
                </div>
              )}
            </div>
          </div>

          {/* Theme */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="settings-section">
              <div className="settings-section-title">{t('settings.theme')}</div>
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <button
                  type="button"
                  className={`btn ${config.theme !== 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleThemeSwitch('light')}
                  style={{ flex: 1, padding: 'var(--space-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Sun size={16} /> {t('settings.lightMode')}
                </button>
                <button
                  type="button"
                  className={`btn ${config.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleThemeSwitch('dark')}
                  style={{ flex: 1, padding: 'var(--space-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Moon size={16} /> {t('settings.darkMode')}
                </button>
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="settings-section">
              <div className="settings-section-title">{t('settings.language')}</div>
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <button
                  className={`btn ${locale === 'en' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleLanguageSwitch('en')}
                  style={{ flex: 1, padding: 'var(--space-lg)' }}
                >
                  🇬🇧 {t('settings.english')}
                </button>
                <button
                  className={`btn ${locale === 'hi' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleLanguageSwitch('hi')}
                  style={{ flex: 1, padding: 'var(--space-lg)' }}
                >
                  🇮🇳 {t('settings.hindi')}
                </button>
              </div>
            </div>
          </div>

          {/* Backup & Data */}
          <div className="card">
            <div className="settings-section">
              <div className="settings-section-title">
                <Shield size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {t('settings.backup')}
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-row-label">{t('settings.autoBackup')}</div>
                  <div className="settings-row-hint">Every {config.backupIntervalHrs || 5} hours</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={true} readOnly />
                  <span className="toggle-track" />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-md)', margin: 'var(--space-lg) 0' }}>
                <button className="btn btn-primary" onClick={handleExportBackup}>
                  <Download size={16} /> {t('settings.downloadBackup')}
                </button>
                <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
                  <Upload size={16} /> {importing ? 'Importing...' : t('settings.importBackup')}
                </button>
                <input ref={fileRef} type="file" accept=".json" onChange={handleImportBackup} style={{ display: 'none' }} />
              </div>

              {/* Backup History */}
              {backupHistory.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                    {t('settings.backupHistory')}
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {backupHistory.map((b) => (
                      <div key={b.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid var(--border-subtle)',
                        fontSize: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                          <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                          <span className="cell-mono">{new Date(b.timestamp).toLocaleString('en-IN')}</span>
                          {b.auto && <span className="badge badge-cyan">Auto</span>}
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {formatBytes(b.sizeBytes)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {currentUser?.role === 'admin' && (
         <UserManagement requirePin={requirePin} currentUser={currentUser} />
      )}
    </div>
  );
}
