import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { calcSnfFromClr, lookupRate } from '../utils/rateCalc';
import { formatCurrency, formatNumber, todayISO, getCurrentShift } from '../utils/formatters';
import { isSerialSupported, connectDevice, parseSerialData } from '../utils/serialPort';
import { buildMilkEntryMessage, sendViaWhatsApp, sendViaSms } from '../utils/messaging';
import { Printer, Trash2, AlertCircle, CheckCircle, ShoppingCart, Activity, Heart, Info, Usb, Unplug, MessageCircle, Smartphone, AlertTriangle, Zap } from 'lucide-react';

export default function PurchaseEntry({ requirePin }) {
  const { t } = useTranslation();

  // Config
  const [config, setConfig] = useState(null);
  const [activeCharts, setActiveCharts] = useState({ cow: null, buffalo: null, mixed: null });

  // Form state
  const [date, setDate] = useState(todayISO());
  const [shift, setShift] = useState('morning');
  const [farmerCode, setFarmerCode] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [farmerFound, setFarmerFound] = useState(null); // null = not searched, true/false
  const [milkType, setMilkType] = useState('cow');
  const [qty, setQty] = useState('');
  const [fat, setFat] = useState('');
  const [clr, setClr] = useState('');
  const [snf, setSnf] = useState('');
  const [rate, setRate] = useState(0);
  const [amount, setAmount] = useState(0);

  // Entries list
  const [entries, setEntries] = useState([]);
  // Last saved entry (for messaging)
  const [lastSavedEntry, setLastSavedEntry] = useState(null);
  const [farmerMobile, setFarmerMobile] = useState('');

  // Hardware connection state
  const [scaleConnected, setScaleConnected] = useState(false);
  const [analyzerConnected, setAnalyzerConnected] = useState(false);
  const scaleControllerRef = useRef(null);
  const analyzerControllerRef = useRef(null);
  const serialSupported = isSerialSupported();
  const [toast, setToast] = useState(null);

  // Refs for keyboard navigation
  const farmerCodeRef = useRef(null);
  const milkTypeRef = useRef(null);
  const qtyRef = useRef(null);
  const fatRef = useRef(null);
  const clrRef = useRef(null);
  const snfRef = useRef(null);

  // Load config and active chart on mount
  useEffect(() => {
    async function loadConfig() {
      const cfg = await db.dairyConfig.get(1);
      setConfig(cfg);
      setShift(getCurrentShift(cfg));

      // Load active rate charts
      const charts = await db.rateCharts.where('isActive').equals(1).toArray();
      const chartMap = { cow: null, buffalo: null, mixed: null };
      charts.forEach((c) => {
        chartMap[c.milkType] = c;
      });
      setActiveCharts(chartMap);
    }
    loadConfig();
  }, []);

  // Load entries for current date+shift
  useEffect(() => {
    loadEntries();
  }, [date, shift]);

  async function loadEntries() {
    const all = await db.purchases
      .where('[date+shift]')
      .equals([date, shift])
      .toArray();
    setEntries(all.sort((a, b) => b.id - a.id));
  }

  // Auto-calculate SNF from CLR when CLR changes
  useEffect(() => {
    if (config?.snfMode === 'clr' && clr && fat) {
      const calculatedSnf = calcSnfFromClr(
        parseFloat(clr),
        parseFloat(fat),
        config?.decimalPrecision || 2
      );
      setSnf(String(calculatedSnf));
    }
  }, [clr, fat, config]);

  // Auto-calculate rate and amount when fat/snf/qty changes
  // Applies rateBonusPercent from config as a multiplier
  useEffect(() => {
    const currentChart = activeCharts[milkType];
    if (currentChart && fat && snf && qty) {
      let r = lookupRate(currentChart, parseFloat(fat), parseFloat(snf));
      const bonus = config?.rateBonusPercent || 0;
      if (bonus !== 0) {
        r = Number((r * (1 + bonus / 100)).toFixed(config?.decimalPrecision || 2));
      }
      setRate(r);
      setAmount(Number((r * parseFloat(qty)).toFixed(2)));
    } else {
      setRate(0);
      setAmount(0);
    }
  }, [fat, snf, qty, milkType, activeCharts, config]);

  // Lookup farmer by code
  const lookupFarmer = useCallback(async (code) => {
    if (!code) {
      setFarmerName('');
      setFarmerFound(null);
      setFarmerMobile('');
      return;
    }
    const farmer = await db.farmers.where('code').equals(parseInt(code, 10)).first();
    if (farmer) {
      setFarmerName(farmer.name);
      setFarmerFound(true);
      setFarmerMobile(farmer.mobile || '');
      setMilkType(farmer.milkType !== 'any' ? farmer.milkType : config?.defaultMilkType || 'cow');
    } else {
      setFarmerName('');
      setFarmerFound(false);
      setFarmerMobile('');
    }
  }, [config]);

  // Keyboard-first navigation: Enter advances to next field
  const handleKeyDown = (e, nextRef, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (action) action();
      if (nextRef?.current) {
        nextRef.current.focus();
      }
    }
  };

  // Save entry
  const saveEntry = async () => {
    if (!farmerFound || !qty || !fat || !snf) return;

    const currentChart = activeCharts[milkType];
    const entry = {
      date,
      shift,
      farmerCode: parseInt(farmerCode, 10),
      farmerName,
      milkType,
      qty: parseFloat(qty),
      fat: parseFloat(fat),
      clr: clr ? parseFloat(clr) : null,
      snf: parseFloat(snf),
      rate,
      amount,
      rateChartId: currentChart?.id || null,
      createdAt: new Date().toISOString(),
    };

    await db.purchases.add(entry);

    // Save for messaging panel
    setLastSavedEntry(entry);

    // Show toast
    showToast(t('purchase.saved'), 'success');

    // Auto-print if enabled
    if (config?.autoPrint) {
      setTimeout(() => window.print(), 200);
    }

    // Reset form and refocus on farmer code
    resetForm();
    await loadEntries();
    farmerCodeRef.current?.focus();
  };

  const resetForm = () => {
    setFarmerCode('');
    setFarmerName('');
    setFarmerFound(null);
    setMilkType(config?.defaultMilkType || 'cow');
    setQty('');
    setFat('');
    setClr('');
    setSnf('');
    setRate(0);
    setAmount(0);
  };

  const deleteEntry = async (id) => {
    if (window.confirm(t('purchase.confirmDelete'))) {
      await db.purchases.delete(id);
      await loadEntries();
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Toggle shift
  const toggleShift = () => {
    setShift((prev) => (prev === 'morning' ? 'evening' : 'morning'));
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        toggleShift();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        resetForm();
        farmerCodeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [config]);

  // Focus farmer code on mount
  useEffect(() => {
    farmerCodeRef.current?.focus();
  }, []);

  // Summary calculations
  const totalQty = entries.reduce((s, e) => s + (e.qty || 0), 0);
  const totalAmt = entries.reduce((s, e) => s + (e.amount || 0), 0);

  const isClrMode = config?.snfMode === 'clr';

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            <CheckCircle size={16} />
            {toast.message}
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">{t('purchase.title')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <span className="kbd">F1</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Toggle Shift</span>
          <span className="kbd">Esc</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reset</span>
        </div>
      </div>

      {/* Rate Bonus Banner */}
      {config?.rateBonusPercent !== 0 && config?.rateBonusPercent != null && (
        <div className={`rate-bonus-banner ${config.rateBonusPercent > 0 ? 'positive' : 'negative'}`}>
          <Zap size={14} />
          {config.rateBonusPercent > 0 ? '⬆' : '⬇'} Rate {config.rateBonusPercent > 0 ? 'bonus' : 'penalty'} {config.rateBonusPercent > 0 ? '+' : ''}{config.rateBonusPercent}% active on all entries
        </div>
      )}

      {/* Quality Threshold Warning */}
      {fat && config?.minFatThreshold > 0 && parseFloat(fat) < config.minFatThreshold && (
        <div className="threshold-warning" style={{ marginBottom: 'var(--space-md)' }}>
          <AlertTriangle size={14} />
          FAT {parseFloat(fat).toFixed(1)}% is below minimum threshold ({config.minFatThreshold}%)
        </div>
      )}
      {snf && config?.minSnfThreshold > 0 && parseFloat(snf) < config.minSnfThreshold && (
        <div className="threshold-warning" style={{ marginBottom: 'var(--space-md)' }}>
          <AlertTriangle size={14} />
          SNF {parseFloat(snf).toFixed(1)}% is below minimum threshold ({config.minSnfThreshold}%)
        </div>
      )}

      {/* Entry Form Card */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        {/* Date and Shift Row */}
        <div className="form-row form-row-3" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('purchase.date')}</label>
            <input
              type="date"
              className="form-input mono"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('purchase.shift')}</label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                className={`btn ${shift === 'morning' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShift('morning')}
                style={{ flex: 1 }}
              >
                ☀️ {t('purchase.morning')}
              </button>
              <button
                className={`btn ${shift === 'evening' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShift('evening')}
                style={{ flex: 1 }}
              >
                🌙 {t('purchase.evening')}
              </button>
            </div>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            {!activeCharts[milkType] && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--accent-red)', fontSize: 12 }}>
                <AlertCircle size={14} />
                No active rate chart for {t(`purchase.${milkType}`)}. Create one first.
              </div>
            )}
            {activeCharts[milkType] && (
              <div style={{ fontSize: 12, color: 'var(--accent-emerald)' }}>
                ✓ Rate Chart: <strong>{activeCharts[milkType].name}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Main Entry Row */}
        <div className="purchase-grid">
          {/* Farmer Code */}
          <div className="form-group">
            <label className="form-label">{t('purchase.farmerCode')}</label>
            <input
              ref={farmerCodeRef}
              type="number"
              className="form-input mono large"
              value={farmerCode}
              onChange={(e) => setFarmerCode(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, qtyRef, () => lookupFarmer(e.target.value))}
              placeholder="001"
              autoFocus
            />
          </div>

          {/* Farmer Name (auto-filled) */}
          <div className="form-group">
            <label className="form-label">{t('purchase.farmerName')}</label>
            <div style={{
              padding: 'var(--space-md) var(--space-lg)',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${farmerFound === false ? 'var(--accent-red)' : 'var(--border-default)'}`,
              fontSize: 16,
              fontWeight: 500,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              color: farmerFound === false ? 'var(--accent-red)' : 'var(--text-primary)',
            }}>
              {farmerFound === false ? t('purchase.farmerNotFound') : farmerName || '—'}
            </div>
          </div>

          {/* Milk Type */}
          <div className="form-group">
            <label className="form-label">{t('purchase.milkType')}</label>
            <select
              ref={milkTypeRef}
              className="form-select"
              value={milkType}
              onChange={(e) => setMilkType(e.target.value)}
            >
              <option value="cow">{t('purchase.cow')}</option>
              <option value="buffalo">{t('purchase.buffalo')}</option>
              <option value="mixed">{t('purchase.mixed')}</option>
            </select>
          </div>

          {/* Weight */}
          <div className="form-group">
            <label className="form-label">{t('purchase.weight')}</label>
            <input
              ref={qtyRef}
              type="number"
              step="0.1"
              className="form-input mono large"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, fatRef)}
              placeholder="0.0"
            />
          </div>

          {/* FAT */}
          <div className="form-group">
            <label className="form-label">{t('purchase.fat')}</label>
            <input
              ref={fatRef}
              type="number"
              step="0.1"
              className="form-input mono large"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, isClrMode ? clrRef : snfRef)}
              placeholder="0.0"
            />
          </div>

          {/* CLR or SNF */}
          {isClrMode ? (
            <div className="form-group">
              <label className="form-label">{t('purchase.clr')}</label>
              <input
                ref={clrRef}
                type="number"
                step="0.1"
                className="form-input mono large"
                value={clr}
                onChange={(e) => setClr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEntry();
                  }
                }}
                placeholder="0.0"
              />
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">{t('purchase.snf')}</label>
              <input
                ref={snfRef}
                type="number"
                step="0.1"
                className="form-input mono large"
                value={snf}
                onChange={(e) => setSnf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEntry();
                  }
                }}
                placeholder="0.0"
              />
            </div>
          )}

          {/* Rate (auto) */}
          <div className="form-group">
            <label className="form-label">{t('purchase.rate')}</label>
            <div style={{
              padding: 'var(--space-md) var(--space-lg)',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--accent-cyan)',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
            }}>
              {rate > 0 ? `₹${formatNumber(rate, 2)}` : '—'}
            </div>
          </div>

          {/* Amount (auto) */}
          <div className="form-group">
            <label className="form-label">{t('purchase.amount')}</label>
            <div style={{
              padding: 'var(--space-md) var(--space-lg)',
              background: amount > 0 ? 'var(--accent-emerald-dim)' : 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${amount > 0 ? 'rgba(16,185,129,0.3)' : 'var(--border-default)'}`,
              fontFamily: 'var(--font-mono)',
              fontSize: 18,
              fontWeight: 700,
              color: amount > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
            }}>
              {amount > 0 ? formatCurrency(amount) : '—'}
            </div>
          </div>
        </div>

        {/* Auto-calculated SNF display when in CLR mode */}
        {isClrMode && snf && (
          <div style={{ marginTop: 'var(--space-md)', fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('purchase.snf')}: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-cyan)' }}>{snf}%</span>
            <span style={{ marginLeft: 'var(--space-md)', fontSize: 11, color: 'var(--text-muted)' }}>
              (Auto-calculated from CLR {clr})
            </span>
          </div>
        )}

        {/* Save Button */}
        <div style={{ marginTop: 'var(--space-lg)', display: 'flex', gap: 'var(--space-md)' }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={saveEntry}
            disabled={!farmerFound || !qty || !fat || (!snf && !clr)}
          >
            {t('purchase.save')} <span className="kbd" style={{ marginLeft: 4, background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(0,0,0,0.3)' }}>Enter</span>
          </button>
          <button className="btn btn-secondary" onClick={resetForm}>
            {t('common.cancel')}
          </button>
        </div>
      </div>

      {/* AMCU Hardware Connection & Messaging Panel */}
      <div className="dashboard-split-grid" style={{ marginBottom: 'var(--space-xl)' }}>
        {/* Card 1: Hardware Connection / Simulator */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="settings-section-title" style={{ color: 'var(--accent-amber)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
            <Activity size={18} /> AMCU Machine Integration
          </div>

          {/* Connection status indicators */}
          <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: scaleConnected ? '#10b981' : '#6b7280', borderRadius: '50%', boxShadow: scaleConnected ? '0 0 6px #10b981' : 'none' }}></span>
              Weighing Scale {scaleConnected ? '(Live)' : '(Off)'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: analyzerConnected ? '#10b981' : '#6b7280', borderRadius: '50%', boxShadow: analyzerConnected ? '0 0 6px #10b981' : 'none' }}></span>
              Milk Analyzer {analyzerConnected ? '(Live)' : '(Off)'}
            </span>
          </div>

          {/* Hardware connect buttons or fallback simulator */}
          {serialSupported ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button
                  type="button"
                  className={`btn ${scaleConnected ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ flex: 1, gap: 6 }}
                  onClick={async () => {
                    if (scaleConnected) {
                      await scaleControllerRef.current?.disconnect();
                      scaleControllerRef.current = null;
                      setScaleConnected(false);
                      setToast({ message: 'Scale disconnected.', type: 'success' });
                      setTimeout(() => setToast(null), 2000);
                      return;
                    }
                    try {
                      const ctrl = await connectDevice({
                        baudRate: config?.scaleBaudRate || 9600,
                        onData: (line) => {
                          const parsed = parseSerialData(line);
                          if (parsed?.weight) setQty(String(parsed.weight));
                        },
                        onDisconnect: () => { setScaleConnected(false); scaleControllerRef.current = null; },
                        onError: () => { setScaleConnected(false); },
                      });
                      scaleControllerRef.current = ctrl;
                      setScaleConnected(true);
                      setToast({ message: 'Weighing scale connected!', type: 'success' });
                      setTimeout(() => setToast(null), 2000);
                    } catch (err) {
                      if (err.name !== 'NotFoundError') {
                        setToast({ message: `Scale error: ${err.message}`, type: 'error' });
                        setTimeout(() => setToast(null), 4000);
                      }
                    }
                  }}
                >
                  {scaleConnected ? <><Unplug size={14} /> Disconnect Scale</> : <><Usb size={14} /> Connect Scale</>}
                </button>
                <button
                  type="button"
                  className={`btn ${analyzerConnected ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ flex: 1, gap: 6 }}
                  onClick={async () => {
                    if (analyzerConnected) {
                      await analyzerControllerRef.current?.disconnect();
                      analyzerControllerRef.current = null;
                      setAnalyzerConnected(false);
                      setToast({ message: 'Analyzer disconnected.', type: 'success' });
                      setTimeout(() => setToast(null), 2000);
                      return;
                    }
                    try {
                      const ctrl = await connectDevice({
                        baudRate: config?.analyzerBaudRate || 9600,
                        onData: (line) => {
                          const parsed = parseSerialData(line);
                          if (parsed?.fat) setFat(String(parsed.fat));
                          if (parsed?.snf) setSnf(String(parsed.snf));
                          if (parsed?.clr) setClr(String(parsed.clr));
                        },
                        onDisconnect: () => { setAnalyzerConnected(false); analyzerControllerRef.current = null; },
                        onError: () => { setAnalyzerConnected(false); },
                      });
                      analyzerControllerRef.current = ctrl;
                      setAnalyzerConnected(true);
                      setToast({ message: 'Milk analyzer connected!', type: 'success' });
                      setTimeout(() => setToast(null), 2000);
                    } catch (err) {
                      if (err.name !== 'NotFoundError') {
                        setToast({ message: `Analyzer error: ${err.message}`, type: 'error' });
                        setTimeout(() => setToast(null), 4000);
                      }
                    }
                  }}
                >
                  {analyzerConnected ? <><Unplug size={14} /> Disconnect Analyzer</> : <><Usb size={14} /> Connect Analyzer</>}
                </button>
              </div>
              {/* Simulator fallback button */}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', fontSize: 11 }}
                onClick={() => {
                  const simulatedQty = (Math.random() * (22.5 - 4.5) + 4.5).toFixed(1);
                  const simulatedFat = (Math.random() * (8.5 - 3.5) + 3.5).toFixed(1);
                  setQty(simulatedQty);
                  setFat(simulatedFat);
                  if (isClrMode) {
                    setClr(String(Math.floor(Math.random() * (32 - 26) + 26)));
                  } else {
                    setSnf((Math.random() * (9.3 - 8.2) + 8.2).toFixed(1));
                  }
                  setToast({ message: 'Simulated AMCU data loaded!', type: 'success' });
                  setTimeout(() => setToast(null), 2000);
                }}
              >
                ⚡ Use Simulator Instead
              </button>
            </div>
          ) : (
            <div style={{ padding: 'var(--space-md)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-strong)', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                Web Serial API not available. Use Chrome or Edge for hardware connection.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ width: '100%' }}
                onClick={() => {
                  const simulatedQty = (Math.random() * (22.5 - 4.5) + 4.5).toFixed(1);
                  const simulatedFat = (Math.random() * (8.5 - 3.5) + 3.5).toFixed(1);
                  setQty(simulatedQty);
                  setFat(simulatedFat);
                  if (isClrMode) {
                    setClr(String(Math.floor(Math.random() * (32 - 26) + 26)));
                  } else {
                    setSnf((Math.random() * (9.3 - 8.2) + 8.2).toFixed(1));
                  }
                  setToast({ message: 'Simulated AMCU data loaded!', type: 'success' });
                  setTimeout(() => setToast(null), 2000);
                }}
              >
                ⚡ Simulate AMCU Data Link
              </button>
            </div>
          )}
        </div>

        {/* Card 2: 1-Click Messaging */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="settings-section-title" style={{ color: 'var(--accent-cyan)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
            <MessageCircle size={18} /> 1-Click Farmer Notification
          </div>

          {/* Message Preview */}
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-primary)',
            minHeight: '100px',
            whiteSpace: 'pre-wrap',
          }}>
            {lastSavedEntry ? (
              <>
                <strong>{config?.dairyName || 'Smart Dairy'}</strong>{'\n'}
                ━━━━━━━━━━━━━━━━{'\n'}
                📅 {lastSavedEntry.date} | {lastSavedEntry.shift === 'morning' ? '☀️ Morning' : '🌙 Evening'}{'\n'}
                👤 {lastSavedEntry.farmerCode} - {lastSavedEntry.farmerName}{'\n'}
                ⚖️ {formatNumber(lastSavedEntry.qty, 1)} Kg | FAT: {formatNumber(lastSavedEntry.fat, 1)}%{'\n'}
                💰 Rate: ₹{formatNumber(lastSavedEntry.rate, 2)}/Ltr{'\n'}
                <strong>💵 Amt: {formatCurrency(lastSavedEntry.amount)}</strong>
              </>
            ) : farmerFound ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 'var(--space-lg)' }}>
                <Info size={20} style={{ margin: '0 auto var(--space-sm)' }} />
                Save an entry to enable messaging.
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 'var(--space-lg)' }}>
                <Info size={20} style={{ margin: '0 auto var(--space-sm)' }} />
                Enter a farmer code and save an entry.
              </div>
            )}
          </div>

          {/* Send buttons */}
          {lastSavedEntry && farmerMobile && (
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                className="btn btn-sm"
                style={{ flex: 1, gap: 6, background: '#25D366', color: '#fff', border: 'none' }}
                onClick={() => {
                  const msg = buildMilkEntryMessage(config, lastSavedEntry);
                  sendViaWhatsApp(farmerMobile, msg, 'milk_entry', lastSavedEntry.farmerCode);
                  setToast({ message: `WhatsApp opened for ${lastSavedEntry.farmerName}!`, type: 'success' });
                  setTimeout(() => setToast(null), 3000);
                }}
              >
                <MessageCircle size={14} /> WhatsApp
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, gap: 6 }}
                onClick={() => {
                  const msg = buildMilkEntryMessage(config, lastSavedEntry).replace(/[*_~]/g, '');
                  sendViaSms(farmerMobile, msg, 'milk_entry', lastSavedEntry.farmerCode);
                  setToast({ message: `SMS app opened for ${lastSavedEntry.farmerName}!`, type: 'success' });
                  setTimeout(() => setToast(null), 3000);
                }}
              >
                <Smartphone size={14} /> SMS
              </button>
            </div>
          )}
          {lastSavedEntry && !farmerMobile && (
            <p style={{ fontSize: 11, color: 'var(--accent-amber)', textAlign: 'center', margin: 0 }}>
              ⚠️ No mobile number registered for this farmer. Add it in Farmer Master.
            </p>
          )}
        </div>
      </div>

      {/* Today's Entries Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {t('purchase.todayEntries')} — {shift === 'morning' ? '☀️ ' + t('purchase.morning') : '🌙 ' + t('purchase.evening')}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-xl)', fontFamily: 'var(--font-mono)', fontSize: 13, flexWrap: 'wrap' }}>
            <span>{t('purchase.totalQty')}: <strong>{formatNumber(totalQty, 1)} Kg</strong></span>
            <span>{t('purchase.totalAmt')}: <strong style={{ color: 'var(--accent-emerald)' }}>{formatCurrency(totalAmt)}</strong></span>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="empty-state">
            <ShoppingCart size={40} className="empty-state-icon" />
            <p className="empty-state-text">{t('purchase.noEntries')}</p>
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.sr')}</th>
                  <th>{t('purchase.farmerCode')}</th>
                  <th>{t('purchase.farmerName')}</th>
                  <th>{t('purchase.milkType')}</th>
                  <th>{t('purchase.weight')}</th>
                  <th>{t('purchase.fat')}</th>
                  <th>{t('purchase.snf')}</th>
                  <th>{t('purchase.rate')}</th>
                  <th>{t('purchase.amount')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr key={entry.id} className={idx === 0 && toast ? 'entry-flash' : ''}>
                    <td className="cell-center">{entries.length - idx}</td>
                    <td className="cell-mono">{entry.farmerCode}</td>
                    <td>{entry.farmerName}</td>
                    <td>
                      <span className={`badge ${entry.milkType === 'cow' ? 'badge-cyan' : entry.milkType === 'buffalo' ? 'badge-amber' : 'badge-emerald'}`}>
                        {t(`purchase.${entry.milkType}`)}
                      </span>
                    </td>
                    <td className="cell-mono">{formatNumber(entry.qty, 1)}</td>
                    <td className="cell-mono">{formatNumber(entry.fat, 1)}</td>
                    <td className="cell-mono">{formatNumber(entry.snf, 1)}</td>
                    <td className="cell-mono">{formatNumber(entry.rate, 2)}</td>
                    <td className="cell-amount">{formatCurrency(entry.amount)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => deleteEntry(entry.id)} title={t('purchase.delete')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hidden Print Receipt */}
      {entries.length > 0 && (
        <div className="print-receipt">
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 4, marginBottom: 4 }}>
            <strong>{config?.dairyName || 'Smart Dairy'}</strong>
            <br />
            <small>{config?.address || ''}</small>
          </div>
          <div style={{ fontSize: 10 }}>
            <p>Date: {date} | Shift: {shift}</p>
            <p>Farmer: {entries[0]?.farmerCode} - {entries[0]?.farmerName}</p>
            <p>Qty: {entries[0]?.qty} Kg | FAT: {entries[0]?.fat}% | SNF: {entries[0]?.snf}%</p>
            <p>Rate: ₹{entries[0]?.rate}/Ltr</p>
            <p style={{ fontSize: 14, fontWeight: 700 }}>Amount: {formatCurrency(entries[0]?.amount)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
