import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { formatCurrency, formatNumber, todayISO } from '../utils/formatters';
import {
  ShoppingCart,
  Users,
  Droplets,
  TrendingUp,
  Beaker,
  Truck,
  UserPlus,
  BarChart3,
  Sun,
  Moon,
} from 'lucide-react';

export default function Dashboard({ onNavigate }) {
  const { t } = useTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState({
    totalLiters: 0,
    totalAmount: 0,
    farmerCount: 0,
    avgFat: 0,
    avgSnf: 0,
    morningLiters: 0,
    eveningLiters: 0,
    morningAmount: 0,
    eveningAmount: 0,
  });
  const [weekData, setWeekData] = useState([]);
  const [recentEntries, setRecentEntries] = useState([]);

  // Real-time clock timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentTime.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  const hoursStr = String(displayHours).padStart(2, '0');
  const minutesStr = String(minutes).padStart(2, '0');
  const secondsStr = String(seconds).padStart(2, '0');

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    const today = todayISO();

    // Today's purchases
    const todayPurchases = await db.purchases
      .where('date')
      .equals(today)
      .toArray();

    if (todayPurchases.length > 0) {
      const totalLiters = todayPurchases.reduce((s, p) => s + (p.qty || 0), 0);
      const totalAmount = todayPurchases.reduce((s, p) => s + (p.amount || 0), 0);
      const farmerCodes = new Set(todayPurchases.map((p) => p.farmerCode));
      const avgFat = todayPurchases.reduce((s, p) => s + (p.fat || 0), 0) / todayPurchases.length;
      const avgSnf = todayPurchases.reduce((s, p) => s + (p.snf || 0), 0) / todayPurchases.length;

      const morningEntries = todayPurchases.filter((p) => p.shift === 'morning');
      const eveningEntries = todayPurchases.filter((p) => p.shift === 'evening');

      setStats({
        totalLiters,
        totalAmount,
        farmerCount: farmerCodes.size,
        avgFat,
        avgSnf,
        morningLiters: morningEntries.reduce((s, p) => s + (p.qty || 0), 0),
        eveningLiters: eveningEntries.reduce((s, p) => s + (p.qty || 0), 0),
        morningAmount: morningEntries.reduce((s, p) => s + (p.amount || 0), 0),
        eveningAmount: eveningEntries.reduce((s, p) => s + (p.amount || 0), 0),
      });
    } else {
      setStats({
        totalLiters: 0,
        totalAmount: 0,
        farmerCount: 0,
        avgFat: 0,
        avgSnf: 0,
        morningLiters: 0,
        eveningLiters: 0,
        morningAmount: 0,
        eveningAmount: 0,
      });
    }

    // Last 5 entries
    const recent = await db.purchases.orderBy('createdAt').reverse().limit(5).toArray();
    setRecentEntries(recent);

    // Last 7 days trend
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayPurchases = await db.purchases.where('date').equals(dateStr).toArray();
      const liters = dayPurchases.reduce((s, p) => s + (p.qty || 0), 0);
      const amount = dayPurchases.reduce((s, p) => s + (p.amount || 0), 0);
      days.push({
        date: dateStr,
        label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
        liters,
        amount,
      });
    }
    setWeekData(days);
  }

  const maxLiters = Math.max(...weekData.map((d) => d.liters), 1);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('dashboard.title')}</h1>
        <div className="cute-time-pill">
          {hours >= 6 && hours < 18 ? (
            <Sun className="cute-icon-pulse" size={16} />
          ) : (
            <Moon className="cute-icon-pulse" size={16} />
          )}
          <span>{formattedDate}</span>
          <span style={{ color: 'var(--border-strong)', padding: '0 4px' }}>|</span>
          <span className="cute-time-text">
            {hoursStr}
            <span className="cute-time-colon">:</span>
            {minutesStr}
            <span className="cute-time-colon">:</span>
            {secondsStr}
            <span style={{ fontSize: 10, marginLeft: 4, fontWeight: 500, opacity: 0.8 }}>{ampm}</span>
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-cyan)' }}>
          <span className="stat-label">{t('dashboard.totalLiters')}</span>
          <span className="stat-value">{formatNumber(stats.totalLiters, 1)}</span>
          <Droplets className="stat-icon" size={32} />
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-emerald)' }}>
          <span className="stat-label">{t('dashboard.totalAmount')}</span>
          <span className="stat-value">{formatCurrency(stats.totalAmount)}</span>
          <TrendingUp className="stat-icon" size={32} />
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-purple)' }}>
          <span className="stat-label">{t('dashboard.farmerCount')}</span>
          <span className="stat-value">{stats.farmerCount}</span>
          <Users className="stat-icon" size={32} />
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-amber)' }}>
          <span className="stat-label">{t('dashboard.avgFat')}</span>
          <span className="stat-value">{formatNumber(stats.avgFat, 1)}</span>
          <Beaker className="stat-icon" size={32} />
        </div>
      </div>

      {/* Morning vs Evening */}
      <div className="dashboard-split-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">☀️ {t('dashboard.morning')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('dashboard.totalLiters')}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600 }}>
                {formatNumber(stats.morningLiters, 1)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('dashboard.totalAmount')}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--accent-emerald)' }}>
                {formatCurrency(stats.morningAmount)}
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">🌙 {t('dashboard.evening')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('dashboard.totalLiters')}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600 }}>
                {formatNumber(stats.eveningLiters, 1)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('dashboard.totalAmount')}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--accent-emerald)' }}>
                {formatCurrency(stats.eveningAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="card-header">
          <span className="card-title">{t('dashboard.quickActions')}</span>
        </div>
        <div className="quick-actions">
          <button className="quick-action-btn" onClick={() => onNavigate('purchase')}>
            <ShoppingCart size={24} />
            {t('nav.purchase')}
          </button>
          <button className="quick-action-btn" onClick={() => onNavigate('farmers')}>
            <UserPlus size={24} />
            {t('farmer.addNew')}
          </button>
          <button className="quick-action-btn" onClick={() => onNavigate('rate-chart')}>
            <BarChart3 size={24} />
            {t('nav.rateChart')}
          </button>
          <button className="quick-action-btn" onClick={() => onNavigate('dispatches')}>
            <Truck size={24} />
            {t('nav.dispatches')}
          </button>
        </div>
      </div>

      {/* 7-Day Trend */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="card-header">
          <span className="card-title">{t('dashboard.weekTrend')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-md)', height: 140, padding: '0 var(--space-sm)' }}>
          {weekData.map((day) => (
            <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                {day.liters > 0 ? formatNumber(day.liters, 0) : ''}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 40,
                  height: `${Math.max((day.liters / maxLiters) * 100, 4)}%`,
                  background: day.liters > 0
                    ? 'linear-gradient(to top, var(--accent-amber), var(--accent-amber-hover))'
                    : 'var(--border-subtle)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                  minHeight: 4,
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{day.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Entries */}
      {recentEntries.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Entries</span>
          </div>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('purchase.farmerCode')}</th>
                  <th>{t('purchase.farmerName')}</th>
                  <th>{t('purchase.weight')}</th>
                  <th>{t('purchase.fat')}</th>
                  <th>{t('purchase.snf')}</th>
                  <th>{t('purchase.rate')}</th>
                  <th>{t('purchase.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cell-mono">{entry.farmerCode}</td>
                    <td>{entry.farmerName}</td>
                    <td className="cell-mono">{formatNumber(entry.qty, 1)}</td>
                    <td className="cell-mono">{formatNumber(entry.fat, 1)}</td>
                    <td className="cell-mono">{formatNumber(entry.snf, 1)}</td>
                    <td className="cell-mono">{formatNumber(entry.rate, 2)}</td>
                    <td className="cell-amount">{formatCurrency(entry.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
