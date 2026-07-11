import { useState } from 'react';
import { useTranslation } from '../../i18n/i18nContext';
import { canAccessPage, ROLES } from '../../utils/auth';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  BarChart3,
  Wallet,
  Store,
  Truck,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Milk,
  Heart,
  Coins,
  LogOut,
  User,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { id: 'purchase', icon: ShoppingCart, labelKey: 'nav.purchase' },
  { id: 'farmers', icon: Users, labelKey: 'nav.farmers' },
  { id: 'rate-chart', icon: BarChart3, labelKey: 'nav.rateChart' },
  { id: 'payments', icon: Wallet, labelKey: 'nav.payments' },
  { id: 'store-sales', icon: Store, labelKey: 'nav.storeSales' },
  { id: 'dispatches', icon: Truck, labelKey: 'nav.dispatches' },
  { id: 'livestock', icon: Heart, labelKey: 'nav.livestock' },
  { id: 'loans', icon: Coins, labelKey: 'nav.loans' },
  { id: 'settings', icon: Settings, labelKey: 'nav.settings' },
];

export default function Sidebar({ activePage, onNavigate, currentUser, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation();

  // Filter nav items based on current user's role permissions
  const visibleItems = NAV_ITEMS.filter(item => canAccessPage(item.id));

  const roleLabel = ROLES[currentUser?.role]?.label || 'User';
  const roleBadgeColor = currentUser?.role === 'admin'
    ? 'var(--accent-amber)'
    : currentUser?.role === 'manager'
      ? 'var(--accent-cyan)'
      : 'var(--accent-emerald)';

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Milk size={18} />
        </div>
        <span className="sidebar-title">{t('app.name')}</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? t(item.labelKey) : undefined}
            >
              <Icon className="nav-icon" size={20} />
              <span className="nav-label">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer — User Info + Logout */}
      <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {/* User Badge */}
        {!collapsed && currentUser && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: 'var(--space-sm) var(--space-md)',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            fontSize: 12,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 'var(--radius-md)',
              background: `${roleBadgeColor}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <User size={14} color={roleBadgeColor} />
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{
                fontWeight: 600, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {currentUser.username}
              </div>
              <div style={{
                fontSize: 10, color: roleBadgeColor, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                {roleLabel}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ flex: 1 }}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            className="sidebar-toggle"
            onClick={onLogout}
            title="Logout"
            style={{
              color: 'var(--accent-red)',
              flex: collapsed ? 1 : 'none',
              width: collapsed ? undefined : 36,
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
