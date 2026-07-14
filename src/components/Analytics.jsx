import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { formatCurrency, formatNumber, todayISO, getCurrentShift } from '../utils/formatters';
import {
  BarChart3,
  Settings2,
  Calendar,
  Droplets,
  TrendingUp,
  TrendingDown,
  Users,
  Beaker,
  Sun,
  Moon,
  AlertTriangle,
  Zap,
  Send,
  CheckCircle,
  Minus,
} from 'lucide-react';

/**
 * Analytics & Control — Deep analytics dashboard with operational controls.
 *
 * Tab 1: Analytics Dashboard
 *   - Period-aware summary cards
 *   - Daily collection trend chart
 *   - Morning vs Evening shift comparison
 *   - Quality (FAT) distribution
 *   - Farmer leaderboard (top/bottom 5)
 *   - Period-over-period growth indicator
 *
 * Tab 2: Control Panel
 *   - Current shift indicator
 *   - Quality thresholds (min FAT / min SNF)
 *   - Rate bonus/penalty multiplier
 *   - Save controls to dairyConfig
 */
export default function Analytics({ requirePin }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('analytics');

  // ── Analytics state ──
  const [period, setPeriod] = useState('today');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLiters: 0, totalAmount: 0, farmerCount: 0, avgFat: 0, avgSnf: 0, entryCount: 0,
  });
  const [shiftStats, setShiftStats] = useState({ morning: { liters: 0, amount: 0, count: 0 }, evening: { liters: 0, amount: 0, count: 0 } });
  const [trendData, setTrendData] = useState([]);
  const [fatDistribution, setFatDistribution] = useState([]);
  const [topFarmers, setTopFarmers] = useState([]);
  const [bottomFarmers, setBottomFarmers] = useState([]);
  const [growthPercent, setGrowthPercent] = useState(null);

  // ── Control state ──
  const [config, setConfig] = useState(null);
  const [currentShift, setCurrentShift] = useState('morning');
  const [minFat, setMinFat] = useState(0);
  const [minSnf, setMinSnf] = useState(0);
  const [bonusPercent, setBonusPercent] = useState(0);
  const [toast, setToast] = useState(null);

  // Load config on mount
  useEffect(() => {
    async function loadConfig() {
      const cfg = await db.dairyConfig.get(1);
      setConfig(cfg);
      setCurrentShift(getCurrentShift(cfg));
      setMinFat(cfg?.minFatThreshold || 0);
      setMinSnf(cfg?.minSnfThreshold || 0);
      setBonusPercent(cfg?.rateBonusPercent || 0);
    }
    loadConfig();
  }, []);

  // Load analytics data whenever period changes
  useEffect(() => {
    loadAnalytics();
  }, [period, customFrom, customTo]);

  // ── Date range helper ──
  function getDateRange() {
    const today = new Date();
    const toISO = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    switch (period) {
      case 'today':
        return { from: todayISO(), to: todayISO() };
      case 'week': {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return { from: toISO(start), to: toISO(today) };
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: toISO(start), to: toISO(today) };
      }
      case 'custom':
        return { from: customFrom, to: customTo };
      default:
        return { from: todayISO(), to: todayISO() };
    }
  }

  // ── Previous period for growth comparison ──
  function getPreviousDateRange() {
    const { from, to } = getDateRange();
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const days = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
    const prevEnd = new Date(fromDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    const toISO = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    return { from: toISO(prevStart), to: toISO(prevEnd) };
  }

  async function loadAnalytics() {
    setLoading(true);
    const { from, to } = getDateRange();

    // Fetch all purchases in the date range
    const purchases = await db.purchases
      .where('date')
      .between(from, to, true, true)
      .toArray();

    // Summary stats
    if (purchases.length > 0) {
      const totalLiters = purchases.reduce((s, p) => s + (p.qty || 0), 0);
      const totalAmount = purchases.reduce((s, p) => s + (p.amount || 0), 0);
      const farmerCodes = new Set(purchases.map((p) => p.farmerCode));
      const avgFat = purchases.reduce((s, p) => s + (p.fat || 0), 0) / purchases.length;
      const avgSnf = purchases.reduce((s, p) => s + (p.snf || 0), 0) / purchases.length;
      setStats({ totalLiters, totalAmount, farmerCount: farmerCodes.size, avgFat, avgSnf, entryCount: purchases.length });
    } else {
      setStats({ totalLiters: 0, totalAmount: 0, farmerCount: 0, avgFat: 0, avgSnf: 0, entryCount: 0 });
    }

    // Shift comparison
    const morningEntries = purchases.filter((p) => p.shift === 'morning');
    const eveningEntries = purchases.filter((p) => p.shift === 'evening');
    setShiftStats({
      morning: {
        liters: morningEntries.reduce((s, p) => s + (p.qty || 0), 0),
        amount: morningEntries.reduce((s, p) => s + (p.amount || 0), 0),
        count: morningEntries.length,
      },
      evening: {
        liters: eveningEntries.reduce((s, p) => s + (p.qty || 0), 0),
        amount: eveningEntries.reduce((s, p) => s + (p.amount || 0), 0),
        count: eveningEntries.length,
      },
    });

    // Daily trend (build array for each day in range)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const days = [];
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayPurchases = purchases.filter((p) => p.date === dateStr);
      const liters = dayPurchases.reduce((s, p) => s + (p.qty || 0), 0);
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
        liters,
      });
    }
    setTrendData(days);

    // FAT distribution
    const fatBuckets = [
      { label: '< 3.0', min: -Infinity, max: 3.0, color: 'var(--accent-red)' },
      { label: '3.0–4.0', min: 3.0, max: 4.0, color: 'var(--accent-amber)' },
      { label: '4.0–5.0', min: 4.0, max: 5.0, color: 'var(--accent-cyan)' },
      { label: '5.0–6.0', min: 5.0, max: 6.0, color: 'var(--accent-emerald)' },
      { label: '6.0–7.0', min: 6.0, max: 7.0, color: 'var(--accent-purple)' },
      { label: '> 7.0', min: 7.0, max: Infinity, color: 'var(--accent-amber)' },
    ];
    const dist = fatBuckets.map((bucket) => ({
      ...bucket,
      count: purchases.filter((p) => (p.fat || 0) >= bucket.min && (p.fat || 0) < bucket.max).length,
    }));
    setFatDistribution(dist);

    // Farmer leaderboard
    const farmerTotals = {};
    purchases.forEach((p) => {
      if (!farmerTotals[p.farmerCode]) {
        farmerTotals[p.farmerCode] = { code: p.farmerCode, name: p.farmerName, liters: 0, fatSum: 0, snfSum: 0, count: 0 };
      }
      farmerTotals[p.farmerCode].liters += (p.qty || 0);
      farmerTotals[p.farmerCode].fatSum += (p.fat || 0);
      farmerTotals[p.farmerCode].snfSum += (p.snf || 0);
      farmerTotals[p.farmerCode].count += 1;
    });
    const sorted = Object.values(farmerTotals).sort((a, b) => b.liters - a.liters);
    setTopFarmers(sorted.slice(0, 5).map((f) => ({ ...f, avgFat: f.fatSum / f.count, avgSnf: f.snfSum / f.count })));
    setBottomFarmers(sorted.slice(-5).reverse().map((f) => ({ ...f, avgFat: f.fatSum / f.count, avgSnf: f.snfSum / f.count })));

    // Growth vs previous period
    const prev = getPreviousDateRange();
    const prevPurchases = await db.purchases
      .where('date')
      .between(prev.from, prev.to, true, true)
      .toArray();
    const currentLiters = purchases.reduce((s, p) => s + (p.qty || 0), 0);
    const prevLiters = prevPurchases.reduce((s, p) => s + (p.qty || 0), 0);
    if (prevLiters > 0) {
      setGrowthPercent(((currentLiters - prevLiters) / prevLiters) * 100);
    } else if (currentLiters > 0) {
      setGrowthPercent(100);
    } else {
      setGrowthPercent(null);
    }

    setLoading(false);
  }

  // ── Control Panel: Save ──
  async function saveControls() {
    const confirmed = await requirePin(t('control.save'));
    if (!confirmed) return;
    await db.dairyConfig.update(1, {
      minFatThreshold: Number(minFat) || 0,
      minSnfThreshold: Number(minSnf) || 0,
      rateBonusPercent: Number(bonusPercent) || 0,
    });
    showToast(t('control.saved'));
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  const maxTrendLiters = Math.max(...trendData.map((d) => d.liters), 1);
  const maxFatCount = Math.max(...fatDistribution.map((d) => d.count), 1);

  function getRankClass(idx) {
    if (idx === 0) return 'gold';
    if (idx === 1) return 'silver';
    if (idx === 2) return 'bronze';
    return 'default';
  }

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">{t('analytics.title')}</h1>
      </div>

      {/* Tab Switcher */}
      <div className="analytics-tabs" style={{ marginBottom: 'var(--space-xl)' }}>
        <button
          className={`analytics-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={16} />
          {t('analytics.tab.analytics')}
        </button>
        <button
          className={`analytics-tab ${activeTab === 'control' ? 'active' : ''}`}
          onClick={() => setActiveTab('control')}
        >
          <Settings2 size={16} />
          {t('analytics.tab.control')}
          {bonusPercent !== 0 && (
            <span className={`bonus-badge ${bonusPercent > 0 ? 'positive' : 'negative'}`}>
              <Zap size={10} />
              {bonusPercent > 0 ? '+' : ''}{bonusPercent}%
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════ ANALYTICS TAB ═══════════════ */}
      {activeTab === 'analytics' && (
        <div>
          {/* Period Selector */}
          <div className="analytics-period-bar" style={{ marginBottom: 'var(--space-xl)' }}>
            <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
            {['today', 'week', 'month', 'custom'].map((p) => (
              <button
                key={p}
                className={`period-btn ${period === p ? 'active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {t(`analytics.${p === 'week' ? 'thisWeek' : p === 'month' ? 'thisMonth' : p}`)}
              </button>
            ))}
            {period === 'custom' && (
              <>
                <input
                  type="date"
                  className="form-input"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={{ width: 140, fontSize: 12, padding: '6px 8px' }}
                />
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <input
                  type="date"
                  className="form-input"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={{ width: 140, fontSize: 12, padding: '6px 8px' }}
                />
              </>
            )}
          </div>

          {loading ? (
            <div className="empty-state" style={{ padding: 'var(--space-3xl)' }}>
              <p className="empty-state-text">{t('common.loading')}</p>
            </div>
          ) : stats.entryCount === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-3xl)' }}>
              <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-lg)' }}>
                <BarChart3 size={28} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="empty-state-text">{t('analytics.noData')}</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="analytics-summary-grid" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="analytics-summary-card" style={{ '--card-accent': 'var(--accent-cyan)' }}>
                  <span className="analytics-summary-label">{t('analytics.totalLiters')}</span>
                  <span className="analytics-summary-value">{formatNumber(stats.totalLiters, 1)}</span>
                </div>
                <div className="analytics-summary-card" style={{ '--card-accent': 'var(--accent-emerald)' }}>
                  <span className="analytics-summary-label">{t('analytics.totalAmount')}</span>
                  <span className="analytics-summary-value">{formatCurrency(stats.totalAmount)}</span>
                </div>
                <div className="analytics-summary-card" style={{ '--card-accent': 'var(--accent-purple)' }}>
                  <span className="analytics-summary-label">{t('analytics.farmerCount')}</span>
                  <span className="analytics-summary-value">{stats.farmerCount}</span>
                </div>
                <div className="analytics-summary-card" style={{ '--card-accent': 'var(--accent-amber)' }}>
                  <span className="analytics-summary-label">{t('analytics.avgFat')}</span>
                  <span className="analytics-summary-value">{formatNumber(stats.avgFat, 1)}</span>
                </div>
                <div className="analytics-summary-card" style={{ '--card-accent': 'var(--accent-cyan)' }}>
                  <span className="analytics-summary-label">{t('analytics.avgSnf')}</span>
                  <span className="analytics-summary-value">{formatNumber(stats.avgSnf, 1)}</span>
                </div>
              </div>

              {/* Growth Indicator */}
              {growthPercent !== null && (
                <div className="card" style={{ marginBottom: 'var(--space-xl)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                  <div>
                    <span className="card-title">{t('analytics.growth')}</span>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t('analytics.totalLiters')}: {formatNumber(stats.totalLiters, 1)} {t('analytics.liters')}
                    </p>
                  </div>
                  <div className={`growth-indicator ${growthPercent > 0 ? 'positive' : growthPercent < 0 ? 'negative' : 'neutral'}`}>
                    {growthPercent > 0 ? <TrendingUp size={16} /> : growthPercent < 0 ? <TrendingDown size={16} /> : <Minus size={16} />}
                    {growthPercent > 0 ? '+' : ''}{formatNumber(growthPercent, 1)}%
                  </div>
                </div>
              )}

              {/* Collection Trend Chart */}
              {trendData.length > 1 && (
                <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
                  <div className="card-header">
                    <span className="card-title">{t('analytics.collectionTrend')}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {stats.entryCount} {t('analytics.entries')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: trendData.length > 15 ? 2 : 'var(--space-sm)', height: 160, padding: '0 var(--space-sm)' }}>
                    {trendData.map((day) => (
                      <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {day.liters > 0 ? formatNumber(day.liters, 0) : ''}
                        </span>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: 36,
                            height: `${Math.max((day.liters / maxTrendLiters) * 100, 4)}%`,
                            background: day.liters > 0
                              ? 'linear-gradient(to top, var(--accent-amber), var(--accent-cyan))'
                              : 'var(--border-subtle)',
                            borderRadius: '4px 4px 0 0',
                            transition: 'height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                            minHeight: 4,
                          }}
                        />
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                          {day.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shift Comparison + Quality Distribution (2-column) */}
              <div className="analytics-grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                {/* Shift Comparison */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">{t('analytics.shiftComparison')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
                    {/* Morning */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-md)' }}>
                        <Sun size={16} style={{ color: '#D97706' }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#D97706' }}>{t('dashboard.morning')}</span>
                      </div>
                      <div style={{ marginBottom: 'var(--space-sm)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('analytics.totalLiters')}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600 }}>{formatNumber(shiftStats.morning.liters, 1)}</div>
                      </div>
                      <div style={{ marginBottom: 'var(--space-sm)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('analytics.totalAmount')}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent-emerald)' }}>{formatCurrency(shiftStats.morning.amount)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('analytics.entries')}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>{shiftStats.morning.count}</div>
                      </div>
                    </div>
                    {/* Divider */}
                    <div style={{ width: 1, background: 'var(--border-default)' }} />
                    {/* Evening */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-md)' }}>
                        <Moon size={16} style={{ color: '#6366F1' }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#6366F1' }}>{t('dashboard.evening')}</span>
                      </div>
                      <div style={{ marginBottom: 'var(--space-sm)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('analytics.totalLiters')}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600 }}>{formatNumber(shiftStats.evening.liters, 1)}</div>
                      </div>
                      <div style={{ marginBottom: 'var(--space-sm)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('analytics.totalAmount')}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent-emerald)' }}>{formatCurrency(shiftStats.evening.amount)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('analytics.entries')}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>{shiftStats.evening.count}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quality Distribution */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">{t('analytics.qualityDistribution')}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>FAT %</span>
                  </div>
                  {fatDistribution.map((bucket) => (
                    <div key={bucket.label} className="quality-bar-row">
                      <span className="quality-bar-label">{bucket.label}</span>
                      <div className="quality-bar-track">
                        <div
                          className="quality-bar-fill"
                          style={{
                            width: bucket.count > 0 ? `${Math.max((bucket.count / maxFatCount) * 100, 8)}%` : '0%',
                            background: bucket.color,
                          }}
                        >
                          {bucket.count > 0 && bucket.count}
                        </div>
                      </div>
                      <span className="quality-bar-count">{bucket.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Farmer Leaderboard (2-column) */}
              {topFarmers.length > 0 && (
                <div className="analytics-grid-2">
                  {/* Top 5 */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">🏆 {t('analytics.topFarmers')}</span>
                    </div>
                    <table className="leaderboard-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t('purchase.farmerName')}</th>
                          <th>{t('analytics.liters')}</th>
                          <th>{t('purchase.fat')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topFarmers.map((f, i) => (
                          <tr key={f.code}>
                            <td><span className={`leaderboard-rank ${getRankClass(i)}`}>{i + 1}</span></td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{f.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.code}</div>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatNumber(f.liters, 1)}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{formatNumber(f.avgFat, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Bottom 5 */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">📉 {t('analytics.bottomFarmers')}</span>
                    </div>
                    <table className="leaderboard-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{t('purchase.farmerName')}</th>
                          <th>{t('analytics.liters')}</th>
                          <th>{t('purchase.fat')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bottomFarmers.map((f, i) => (
                          <tr key={f.code}>
                            <td><span className="leaderboard-rank default">{topFarmers.length > 5 ? '–' : topFarmers.length - bottomFarmers.length + i + 1}</span></td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{f.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.code}</div>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatNumber(f.liters, 1)}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{formatNumber(f.avgFat, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════ CONTROL PANEL TAB ═══════════════ */}
      {activeTab === 'control' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {/* Shift Control */}
          <div className="control-section" style={{ '--section-accent': 'var(--accent-amber)' }}>
            <div className="control-section-title">
              {currentShift === 'morning' ? <Sun size={18} /> : <Moon size={18} />}
              {t('control.shiftControl')}
            </div>
            <div className="control-row">
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>{t('control.currentShift')}</div>
                <div className={`shift-indicator ${currentShift}`}>
                  {currentShift === 'morning' ? <Sun size={20} /> : <Moon size={20} />}
                  {currentShift === 'morning' ? t('dashboard.morning') : t('dashboard.evening')}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {config && (
                  <>
                    ☀️ {config.shiftMorningStart} – {config.shiftMorningEnd}
                    <span style={{ margin: '0 8px' }}>|</span>
                    🌙 {config.shiftEveningStart} – {config.shiftEveningEnd}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quality Thresholds */}
          <div className="control-section" style={{ '--section-accent': 'var(--accent-red)' }}>
            <div className="control-section-title">
              <AlertTriangle size={18} />
              {t('control.qualityThresholds')}
            </div>
            <div className="control-row" style={{ marginBottom: 'var(--space-md)' }}>
              <div className="control-field">
                <label>{t('control.minFat')}</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={minFat}
                  onChange={(e) => setMinFat(e.target.value)}
                />
              </div>
              <div className="control-field">
                <label>{t('control.minSnf')}</label>
                <input
                  type="number"
                  min="0"
                  max="12"
                  step="0.1"
                  value={minSnf}
                  onChange={(e) => setMinSnf(e.target.value)}
                />
              </div>
            </div>
            <p className="control-hint">{t('control.thresholdHint')}</p>
          </div>

          {/* Rate Bonus / Penalty */}
          <div className="control-section" style={{ '--section-accent': 'var(--accent-emerald)' }}>
            <div className="control-section-title">
              <Zap size={18} />
              {t('control.rateBonus')}
              {bonusPercent !== 0 && (
                <span className={`bonus-badge ${Number(bonusPercent) > 0 ? 'positive' : 'negative'}`}>
                  {t('control.bonusActive')}: {Number(bonusPercent) > 0 ? '+' : ''}{bonusPercent}%
                </span>
              )}
            </div>
            <div className="control-row" style={{ marginBottom: 'var(--space-md)' }}>
              <div className="control-field">
                <label>{t('control.bonusPercent')}</label>
                <input
                  type="number"
                  min="-50"
                  max="50"
                  step="0.5"
                  value={bonusPercent}
                  onChange={(e) => setBonusPercent(e.target.value)}
                />
              </div>
            </div>
            <p className="control-hint">{t('control.bonusHint')}</p>
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <button className="btn btn-primary" onClick={saveControls}>
              <CheckCircle size={16} />
              {t('control.save')}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 20px', borderRadius: 'var(--radius-lg)',
          background: 'var(--accent-amber)', color: 'var(--text-inverse)',
          fontWeight: 600, fontSize: 13,
          boxShadow: 'var(--shadow-lg)',
          animation: 'fadeIn 0.2s ease',
        }}>
          <CheckCircle size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
