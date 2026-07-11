import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { formatCurrency, formatNumber, formatDate, todayISO } from '../utils/formatters';
import Modal from './ui/Modal';
import { Store, Plus, Trash2, Search } from 'lucide-react';

const EMPTY_SALE = {
  date: '',
  farmerCode: '',
  farmerName: '',
  itemName: '',
  category: 'feed',
  qty: '1',
  unitPrice: '',
  amount: '',
  notes: '',
};

export default function StoreSales() {
  const { t } = useTranslation();
  const [sales, setSales] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_SALE, date: todayISO() });
  const [search, setSearch] = useState('');
  const [filterFarmer, setFilterFarmer] = useState('');

  useEffect(() => {
    loadSales();
    loadFarmers();
  }, []);

  async function loadSales() {
    const all = await db.storeSales.orderBy('createdAt').reverse().toArray();
    setSales(all);
  }

  async function loadFarmers() {
    const all = await db.farmers.where('isActive').equals(1).toArray();
    setFarmers(all);
  }

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.itemName.toLowerCase().includes(q) || String(s.farmerCode).includes(q) || (s.farmerName || '').toLowerCase().includes(q);
    const matchFarmer = !filterFarmer || String(s.farmerCode) === filterFarmer;
    return matchSearch && matchFarmer;
  });

  const openAdd = () => {
    setForm({ ...EMPTY_SALE, date: todayISO() });
    setShowModal(true);
  };

  const handleChange = (field, value) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'qty' || field === 'unitPrice') {
        const qty = parseFloat(field === 'qty' ? value : prev.qty) || 0;
        const price = parseFloat(field === 'unitPrice' ? value : prev.unitPrice) || 0;
        updated.amount = String((qty * price).toFixed(2));
      }
      if (field === 'farmerCode') {
        const farmer = farmers.find((f) => f.code === parseInt(value, 10));
        updated.farmerName = farmer?.name || '';
      }
      return updated;
    });
  };

  const saveSale = async () => {
    if (!form.farmerCode || !form.itemName || !form.amount) return;
    await db.storeSales.add({
      date: form.date,
      farmerCode: parseInt(form.farmerCode, 10),
      farmerName: form.farmerName,
      itemName: form.itemName,
      category: form.category,
      qty: parseFloat(form.qty) || 1,
      unitPrice: parseFloat(form.unitPrice) || 0,
      amount: parseFloat(form.amount) || 0,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    });
    setShowModal(false);
    await loadSales();
  };

  const deleteSale = async (id) => {
    if (window.confirm(t('store.deleteConfirm'))) {
      await db.storeSales.delete(id);
      await loadSales();
    }
  };

  // Calculate per-farmer balances
  const farmerBalances = {};
  sales.forEach((s) => {
    if (!farmerBalances[s.farmerCode]) {
      farmerBalances[s.farmerCode] = { name: s.farmerName, total: 0 };
    }
    farmerBalances[s.farmerCode].total += s.amount || 0;
  });

  const totalAmount = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('store.title')}</h1>
        <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 36, width: 200 }} placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: 180 }} value={filterFarmer} onChange={(e) => setFilterFarmer(e.target.value)}>
            <option value="">All Farmers</option>
            {farmers.map((f) => <option key={f.id} value={f.code}>{f.code} - {f.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} /> {t('store.addSale')}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Store size={48} className="empty-state-icon" />
            <p className="empty-state-text">{t('store.noSales')}</p>
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={16} /> {t('store.addSale')}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{filtered.length} entries</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-red)' }}>
              {t('common.total')}: {formatCurrency(totalAmount)}
            </span>
          </div>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('store.date')}</th>
                  <th>{t('store.farmerCode')}</th>
                  <th>{t('store.farmerName')}</th>
                  <th>{t('store.itemName')}</th>
                  <th>{t('store.category')}</th>
                  <th>{t('store.qty')}</th>
                  <th>{t('store.unitPrice')}</th>
                  <th>{t('store.amount')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => (
                  <tr key={sale.id}>
                    <td className="cell-mono">{formatDate(sale.date)}</td>
                    <td className="cell-mono">{sale.farmerCode}</td>
                    <td>{sale.farmerName}</td>
                    <td>{sale.itemName}</td>
                    <td>
                      <span className={`badge ${sale.category === 'feed' ? 'badge-amber' : sale.category === 'medicine' ? 'badge-cyan' : 'badge-emerald'}`}>
                        {t(`store.${sale.category}`)}
                      </span>
                    </td>
                    <td className="cell-mono">{sale.qty}</td>
                    <td className="cell-mono">{formatCurrency(sale.unitPrice)}</td>
                    <td className="cell-deduction">{formatCurrency(sale.amount)}</td>
                    <td>
                      <button className="btn btn-ghost btn-icon" onClick={() => deleteSale(sale.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Sale Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={t('store.addSale')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('store.cancel')}</button>
            <button className="btn btn-primary" onClick={saveSale} disabled={!form.farmerCode || !form.itemName || !form.amount}>{t('store.save')}</button>
          </>
        }
      >
        <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('store.date')}</label>
            <input type="date" className="form-input" value={form.date} onChange={(e) => handleChange('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('store.farmerCode')}</label>
            <select className="form-select" value={form.farmerCode} onChange={(e) => handleChange('farmerCode', e.target.value)}>
              <option value="">{t('payment.selectFarmer')}</option>
              {farmers.map((f) => <option key={f.id} value={f.code}>{f.code} - {f.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('store.itemName')}</label>
            <input className="form-input" value={form.itemName} onChange={(e) => handleChange('itemName', e.target.value)} placeholder="e.g. Cattle Feed 50kg" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('store.category')}</label>
            <select className="form-select" value={form.category} onChange={(e) => handleChange('category', e.target.value)}>
              <option value="feed">{t('store.feed')}</option>
              <option value="medicine">{t('store.medicine')}</option>
              <option value="other">{t('store.other')}</option>
            </select>
          </div>
        </div>
        <div className="form-row form-row-3" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('store.qty')}</label>
            <input type="number" className="form-input mono" value={form.qty} onChange={(e) => handleChange('qty', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('store.unitPrice')}</label>
            <input type="number" className="form-input mono" value={form.unitPrice} onChange={(e) => handleChange('unitPrice', e.target.value)} placeholder="₹0" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('store.amount')}</label>
            <input type="number" className="form-input mono" value={form.amount} onChange={(e) => handleChange('amount', e.target.value)} style={{ color: 'var(--accent-red)' }} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{t('store.notes')}</label>
          <input className="form-input" value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
