import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { generateRateMatrix } from '../utils/rateCalc';
import Modal from './ui/Modal';
import { Plus, Trash2, Check, Download, BarChart3 } from 'lucide-react';

const EMPTY_CHART = {
  name: '',
  milkType: 'cow',
  baseRate: '',
  baseFat: '6.0',
  baseSnf: '8.5',
  fatRate: '0.50',
  snfRate: '0.30',
  isActive: 0,
};

export default function RateChart() {
  const { t } = useTranslation();
  const [charts, setCharts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CHART });
  const [editChart, setEditChart] = useState(null);
  const [preview, setPreview] = useState(null);
  const [viewChart, setViewChart] = useState(null);

  useEffect(() => { loadCharts(); }, []);

  async function loadCharts() {
    const all = await db.rateCharts.orderBy('createdAt').reverse().toArray();
    setCharts(all);
  }

  const openAdd = () => {
    setForm({ ...EMPTY_CHART });
    setEditChart(null);
    setPreview(null);
    setShowModal(true);
  };

  const openEdit = (chart) => {
    setForm({
      name: chart.name,
      milkType: chart.milkType,
      baseRate: String(chart.baseRate),
      baseFat: String(chart.baseFat),
      baseSnf: String(chart.baseSnf),
      fatRate: String(chart.fatRate),
      snfRate: String(chart.snfRate),
      isActive: chart.isActive,
    });
    setEditChart(chart);
    setPreview(chart.matrix || null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditChart(null);
    setPreview(null);
    setForm({ ...EMPTY_CHART });
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setPreview(null);
  };

  const generatePreview = () => {
    const matrix = generateRateMatrix({
      baseRate: parseFloat(form.baseRate),
      baseFat: parseFloat(form.baseFat),
      baseSnf: parseFloat(form.baseSnf),
      fatRate: parseFloat(form.fatRate),
      snfRate: parseFloat(form.snfRate),
    });
    setPreview(matrix);
  };

  const saveChart = async () => {
    if (!form.name || !form.baseRate || !preview) return;

    const data = {
      name: form.name,
      milkType: form.milkType,
      baseRate: parseFloat(form.baseRate),
      baseFat: parseFloat(form.baseFat),
      baseSnf: parseFloat(form.baseSnf),
      fatRate: parseFloat(form.fatRate),
      snfRate: parseFloat(form.snfRate),
      matrix: preview,
      isActive: form.isActive ? 1 : 0,
      createdAt: editChart?.createdAt || new Date().toISOString(),
    };

    if (editChart) {
      await db.rateCharts.update(editChart.id, data);
    } else {
      await db.rateCharts.add(data);
    }

    closeModal();
    await loadCharts();
  };

  const setActive = async (chart) => {
    // Deactivate all charts of same milk type, then activate this one
    const sameType = charts.filter((c) => c.milkType === chart.milkType);
    for (const c of sameType) {
      await db.rateCharts.update(c.id, { isActive: 0 });
    }
    await db.rateCharts.update(chart.id, { isActive: 1 });
    await loadCharts();
  };

  const deleteChart = async (id) => {
    if (window.confirm(t('rateChart.deleteConfirm'))) {
      await db.rateCharts.delete(id);
      await loadCharts();
    }
  };

  const exportCSV = (chart) => {
    if (!chart.matrix) return;
    const { fatValues, snfValues, matrix } = chart.matrix;
    let csv = 'FAT\\SNF,' + snfValues.join(',') + '\n';
    fatValues.forEach((fat, i) => {
      csv += fat + ',' + matrix[i].join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-chart-${chart.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('rateChart.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} />
          {t('rateChart.createNew')}
        </button>
      </div>

      {charts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={48} className="empty-state-icon" />
            <p className="empty-state-text">{t('rateChart.noCharts')}</p>
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={16} /> {t('rateChart.createNew')}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
          {charts.map((chart) => (
            <div key={chart.id} className="card" style={{ borderLeft: chart.isActive ? '3px solid var(--accent-emerald)' : undefined }}>
              <div className="card-header">
                <div>
                  <span className="card-title">{chart.name}</span>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 4 }}>
                    <span className={`badge ${chart.milkType === 'cow' ? 'badge-cyan' : 'badge-amber'}`}>
                      {t(`purchase.${chart.milkType}`)}
                    </span>
                    {chart.isActive ? (
                      <span className="badge badge-emerald">{t('rateChart.active')}</span>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  {!chart.isActive && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setActive(chart)}>
                      <Check size={14} /> {t('rateChart.setActive')}
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(chart)}>
                    <Download size={14} /> {t('rateChart.export')}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setViewChart(viewChart?.id === chart.id ? null : chart)}>
                    <BarChart3 size={14} /> {t('rateChart.preview')}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(chart)}>
                    {t('common.edit')}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteChart(chart.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Info Row */}
              <div style={{ display: 'flex', gap: 'var(--space-md) var(--space-2xl)', fontSize: 13, color: 'var(--text-secondary)', marginTop: 'var(--space-md)', flexWrap: 'wrap' }}>
                <span>Base Rate: <strong style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>₹{chart.baseRate}</strong></span>
                <span>Base FAT: <strong style={{ fontFamily: 'var(--font-mono)' }}>{chart.baseFat}%</strong></span>
                <span>Base SNF: <strong style={{ fontFamily: 'var(--font-mono)' }}>{chart.baseSnf}%</strong></span>
                <span>FAT Rate: <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{chart.fatRate}/0.1%</strong></span>
                <span>SNF Rate: <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{chart.snfRate}/0.1%</strong></span>
              </div>

              {/* Inline matrix preview */}
              {viewChart?.id === chart.id && chart.matrix && (
                <div style={{ marginTop: 'var(--space-lg)' }}>
                  <RateMatrixTable matrix={chart.matrix} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editChart ? t('rateChart.edit') : t('rateChart.createNew')}
        large
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeModal}>{t('rateChart.cancel')}</button>
            {!preview && (
              <button className="btn btn-primary" onClick={generatePreview} disabled={!form.baseRate}>
                {t('rateChart.generate')}
              </button>
            )}
            {preview && (
              <button className="btn btn-primary" onClick={saveChart} disabled={!form.name}>
                {t('rateChart.save')}
              </button>
            )}
          </>
        }
      >
        <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('rateChart.name')}</label>
            <input className="form-input" value={form.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="e.g. Buffalo Morning" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rateChart.milkType')}</label>
            <select className="form-select" value={form.milkType} onChange={(e) => handleChange('milkType', e.target.value)}>
              <option value="cow">{t('purchase.cow')}</option>
              <option value="buffalo">{t('purchase.buffalo')}</option>
              <option value="mixed">{t('purchase.mixed')}</option>
            </select>
          </div>
        </div>

        <div className="form-row form-row-3" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('rateChart.baseRate')}</label>
            <input type="number" step="0.01" className="form-input mono" value={form.baseRate} onChange={(e) => handleChange('baseRate', e.target.value)} placeholder="45.00" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rateChart.baseFat')}</label>
            <input type="number" step="0.1" className="form-input mono" value={form.baseFat} onChange={(e) => handleChange('baseFat', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('rateChart.baseSnf')}</label>
            <input type="number" step="0.1" className="form-input mono" value={form.baseSnf} onChange={(e) => handleChange('baseSnf', e.target.value)} />
          </div>
        </div>

        <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('rateChart.fatRate')}</label>
            <input type="number" step="0.01" className="form-input mono" value={form.fatRate} onChange={(e) => handleChange('fatRate', e.target.value)} />
            <span className="form-hint">₹ per 0.1% FAT change</span>
          </div>
          <div className="form-group">
            <label className="form-label">{t('rateChart.snfRate')}</label>
            <input type="number" step="0.01" className="form-input mono" value={form.snfRate} onChange={(e) => handleChange('snfRate', e.target.value)} />
            <span className="form-hint">₹ per 0.1% SNF change</span>
          </div>
        </div>

        {/* Matrix Preview */}
        {preview && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-amber)', marginBottom: 'var(--space-md)' }}>
              {t('rateChart.preview')} ({preview.fatValues.length} × {preview.snfValues.length} cells)
            </div>
            <RateMatrixTable matrix={preview} />
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * Rate Matrix Table sub-component
 */
function RateMatrixTable({ matrix }) {
  if (!matrix) return null;
  const { fatValues, snfValues, matrix: data } = matrix;

  return (
    <div className="rate-matrix-wrapper">
      <table className="rate-matrix">
        <thead>
          <tr>
            <th className="corner-cell">FAT↓ SNF→</th>
            {snfValues.map((snf) => (
              <th key={snf}>{snf}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fatValues.map((fat, fi) => (
            <tr key={fat}>
              <th>{fat}</th>
              {data[fi].map((rate, si) => (
                <td key={si}>{rate}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
