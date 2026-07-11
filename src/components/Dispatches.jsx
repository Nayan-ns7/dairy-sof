import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { formatCurrency, formatNumber, formatDate, todayISO, getCurrentShift } from '../utils/formatters';
import Modal from './ui/Modal';
import { Truck, Plus, Trash2, Printer } from 'lucide-react';

const EMPTY_DISPATCH = {
  date: '',
  shift: 'morning',
  tankerNo: '',
  driverName: '',
  weight: '',
  fat: '',
  snf: '',
  temperature: '',
  totalValue: '',
  notes: '',
};

export default function Dispatches() {
  const { t } = useTranslation();
  const [dispatches, setDispatches] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_DISPATCH, date: todayISO() });
  const [printData, setPrintData] = useState(null);
  const [dairyConfig, setDairyConfig] = useState(null);

  useEffect(() => {
    loadDispatches();
    loadConfig();
    db.dairyConfig.get(1).then((cfg) => {
      setForm((prev) => ({ ...prev, shift: getCurrentShift(cfg) }));
    });
  }, []);

  async function loadConfig() {
    const cfg = await db.dairyConfig.get(1);
    setDairyConfig(cfg);
  }

  const handlePrint = (d) => {
    setPrintData(d);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  async function loadDispatches() {
    const all = await db.dispatches.orderBy('createdAt').reverse().toArray();
    setDispatches(all);
  }

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveDispatch = async () => {
    if (!form.tankerNo || !form.weight) return;
    await db.dispatches.add({
      date: form.date,
      shift: form.shift,
      tankerNo: form.tankerNo,
      driverName: form.driverName,
      weight: parseFloat(form.weight) || 0,
      fat: parseFloat(form.fat) || 0,
      snf: parseFloat(form.snf) || 0,
      temperature: parseFloat(form.temperature) || 0,
      totalValue: parseFloat(form.totalValue) || 0,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    });
    setShowModal(false);
    setForm({ ...EMPTY_DISPATCH, date: todayISO() });
    await loadDispatches();
  };

  const deleteDispatch = async (id) => {
    if (window.confirm(t('dispatch.deleteConfirm'))) {
      await db.dispatches.delete(id);
      await loadDispatches();
    }
  };

  const totalWeight = dispatches.reduce((s, d) => s + (d.weight || 0), 0);
  const totalValue = dispatches.reduce((s, d) => s + (d.totalValue || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('dispatch.title')}</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> {t('dispatch.addNew')}
        </button>
      </div>

      {dispatches.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Truck size={48} className="empty-state-icon" />
            <p className="empty-state-text">{t('dispatch.noDispatches')}</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> {t('dispatch.addNew')}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{dispatches.length} Dispatches</span>
            <div style={{ display: 'flex', gap: 'var(--space-xl)', fontFamily: 'var(--font-mono)', fontSize: 13, flexWrap: 'wrap' }}>
              <span>Total Weight: <strong>{formatNumber(totalWeight, 1)} Kg</strong></span>
              <span>Total Value: <strong style={{ color: 'var(--accent-emerald)' }}>{formatCurrency(totalValue)}</strong></span>
            </div>
          </div>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('dispatch.date')}</th>
                  <th>{t('dispatch.shift')}</th>
                  <th>{t('dispatch.tankerNo')}</th>
                  <th>{t('dispatch.driverName')}</th>
                  <th>{t('dispatch.weight')}</th>
                  <th>{t('dispatch.fat')}</th>
                  <th>{t('dispatch.snf')}</th>
                  <th>{t('dispatch.temperature')}</th>
                  <th>{t('dispatch.totalValue')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map((d) => (
                  <tr key={d.id}>
                    <td className="cell-mono">{formatDate(d.date)}</td>
                    <td>
                      <span className={`badge ${d.shift === 'morning' ? 'badge-amber' : 'badge-cyan'}`}>
                        {d.shift === 'morning' ? '☀️' : '🌙'} {t(`purchase.${d.shift}`)}
                      </span>
                    </td>
                    <td className="cell-mono" style={{ fontWeight: 600 }}>{d.tankerNo}</td>
                    <td>{d.driverName}</td>
                    <td className="cell-mono">{formatNumber(d.weight, 1)}</td>
                    <td className="cell-mono">{formatNumber(d.fat, 1)}</td>
                    <td className="cell-mono">{formatNumber(d.snf, 1)}</td>
                    <td className="cell-mono">{d.temperature}°C</td>
                    <td className="cell-amount">{formatCurrency(d.totalValue)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon" onClick={() => handlePrint(d)} title={t('dispatch.print')}>
                          <Printer size={14} />
                        </button>
                        <button className="btn btn-ghost btn-icon" onClick={() => deleteDispatch(d.id)} title={t('dispatch.delete')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Dispatch Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={t('dispatch.addNew')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{t('dispatch.cancel')}</button>
            <button className="btn btn-primary" onClick={saveDispatch} disabled={!form.tankerNo || !form.weight}>{t('dispatch.save')}</button>
          </>
        }
      >
        <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('dispatch.date')}</label>
            <input type="date" className="form-input" value={form.date} onChange={(e) => handleChange('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dispatch.shift')}</label>
            <select className="form-select" value={form.shift} onChange={(e) => handleChange('shift', e.target.value)}>
              <option value="morning">{t('purchase.morning')}</option>
              <option value="evening">{t('purchase.evening')}</option>
            </select>
          </div>
        </div>
        <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('dispatch.tankerNo')}</label>
            <input className="form-input mono" value={form.tankerNo} onChange={(e) => handleChange('tankerNo', e.target.value)} placeholder="UP-80-AB-1234" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dispatch.driverName')}</label>
            <input className="form-input" value={form.driverName} onChange={(e) => handleChange('driverName', e.target.value)} />
          </div>
        </div>
        <div className="form-row form-row-4" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('dispatch.weight')}</label>
            <input type="number" step="0.1" className="form-input mono" value={form.weight} onChange={(e) => handleChange('weight', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dispatch.fat')}</label>
            <input type="number" step="0.1" className="form-input mono" value={form.fat} onChange={(e) => handleChange('fat', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dispatch.snf')}</label>
            <input type="number" step="0.1" className="form-input mono" value={form.snf} onChange={(e) => handleChange('snf', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dispatch.temperature')}</label>
            <input type="number" step="0.1" className="form-input mono" value={form.temperature} onChange={(e) => handleChange('temperature', e.target.value)} placeholder="°C" />
          </div>
        </div>
        <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('dispatch.totalValue')}</label>
            <input type="number" className="form-input mono" value={form.totalValue} onChange={(e) => handleChange('totalValue', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dispatch.notes')}</label>
            <input className="form-input" value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Hidden Print Receipt */}
      {printData && (
        <div className="print-receipt">
          {/* Header */}
          <div className="print-header">
            <strong className="print-dairy-name">{dairyConfig?.dairyName || 'Smart Dairy'}</strong>
            {dairyConfig?.address && <div className="print-dairy-addr">{dairyConfig.address}</div>}
            {dairyConfig?.phone && <div className="print-dairy-addr">Ph: {dairyConfig.phone}</div>}
            <div className="print-doc-title">TANKER DISPATCH NOTE</div>
          </div>

          {/* Dispatch Info */}
          <div className="print-info-section">
            <div className="print-row">
              <span>Date:</span>
              <span>{formatDate(printData.date)}</span>
            </div>
            <div className="print-row">
              <span>Shift:</span>
              <span>{printData.shift === 'morning' ? '☀️ Morning' : '🌙 Evening'}</span>
            </div>
            <div className="print-row">
              <span>Tanker No:</span>
              <strong>{printData.tankerNo}</strong>
            </div>
            <div className="print-row">
              <span>Driver:</span>
              <span>{printData.driverName || '—'}</span>
            </div>
          </div>

          {/* Quality Data Table */}
          <div className="print-section">
            <div className="print-section-title">Dispatch Details</div>
            <table className="print-table">
              <tbody>
                <tr>
                  <td>Net Weight</td>
                  <td style={{ textAlign: 'right' }}><strong>{formatNumber(printData.weight, 1)} Kg</strong></td>
                </tr>
                <tr>
                  <td>FAT %</td>
                  <td style={{ textAlign: 'right' }}>{formatNumber(printData.fat, 1)}%</td>
                </tr>
                <tr>
                  <td>SNF %</td>
                  <td style={{ textAlign: 'right' }}>{formatNumber(printData.snf, 1)}%</td>
                </tr>
                <tr>
                  <td>Temperature</td>
                  <td style={{ textAlign: 'right' }}>{printData.temperature}°C</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Total Value */}
          <div className="print-summary">
            <div className="print-divider"></div>
            <div className="print-row print-net-row">
              <strong>TOTAL VALUE:</strong>
              <strong>{formatCurrency(printData.totalValue)}</strong>
            </div>
          </div>

          {/* Footer */}
          <div className="print-footer">
            {printData.notes && (
              <div className="print-row">
                <span>Notes:</span>
                <span>{printData.notes}</span>
              </div>
            )}
            <div className="print-signatures">
              <div className="print-sig-line">
                <div className="print-sig-dash"></div>
                <span>Sender</span>
              </div>
              <div className="print-sig-line">
                <div className="print-sig-dash"></div>
                <span>Driver</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
