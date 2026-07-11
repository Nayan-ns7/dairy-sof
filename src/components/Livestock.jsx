import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { formatDate, formatNumber, todayISO } from '../utils/formatters';
import { Milk, Activity, Heart, Calendar, Plus, Trash2, Shield, Info, ClipboardList } from 'lucide-react';
import Modal from './ui/Modal';

export default function Livestock() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('registry');
  const [cattle, setCattle] = useState([]);
  const [yields, setYields] = useState([]);
  const [healthLogs, setHealthLogs] = useState([]);
  const [breedingLogs, setBreedingLogs] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [showAddCattle, setShowAddCattle] = useState(false);
  const [showAddYield, setShowAddYield] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);

  // Form States
  const [cattleForm, setCattleForm] = useState({
    tagNo: '',
    name: '',
    breed: 'Gir',
    gender: 'cow',
    status: 'Lactating',
    farmerCode: '',
  });

  const [yieldForm, setYieldForm] = useState({
    date: todayISO(),
    shift: 'morning',
    cattleId: '',
    qty: '',
  });

  const [eventForm, setEventForm] = useState({
    logType: 'health', // 'health' | 'breeding'
    date: todayISO(),
    cattleId: '',
    type: 'Vaccination', // or 'Insemination', 'Calving' etc
    partnerTagNo: '',
    details: '',
    cost: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const allCattle = await db.cattle.toArray();
    const allYields = await db.milkYields.toArray();
    const allHealth = await db.healthRecords.toArray();
    const allBreeding = await db.breedingRecords.toArray();
    const allFarmers = await db.farmers.where('isActive').equals(1).toArray();

    setCattle(allCattle);
    setYields(allYields);
    setHealthLogs(allHealth);
    setBreedingLogs(allBreeding);
    setFarmers(allFarmers);
  }

  const handleAddCattle = async (e) => {
    e.preventDefault();
    if (!cattleForm.tagNo || !cattleForm.name) {
      alert('Please fill tag number and name');
      return;
    }
    await db.cattle.add({
      tagNo: cattleForm.tagNo,
      name: cattleForm.name,
      breed: cattleForm.breed,
      gender: cattleForm.gender,
      status: cattleForm.status,
      farmerCode: cattleForm.farmerCode || null,
      createdAt: new Date().toISOString(),
    });
    setShowAddCattle(false);
    setCattleForm({
      tagNo: '',
      name: '',
      breed: 'Gir',
      gender: 'cow',
      status: 'Lactating',
      farmerCode: '',
    });
    loadData();
  };

  const handleDeleteCattle = async (id) => {
    if (window.confirm('Are you sure you want to delete this cattle record?')) {
      await db.cattle.delete(id);
      loadData();
    }
  };

  const handleAddYield = async (e) => {
    e.preventDefault();
    if (!yieldForm.cattleId || !yieldForm.qty) {
      alert('Please select animal and specify yield quantity');
      return;
    }
    await db.milkYields.add({
      date: yieldForm.date,
      shift: yieldForm.shift,
      cattleId: Number(yieldForm.cattleId),
      qty: Number(yieldForm.qty),
      createdAt: new Date().toISOString(),
    });
    setShowAddYield(false);
    setYieldForm({
      date: todayISO(),
      shift: 'morning',
      cattleId: '',
      qty: '',
    });
    loadData();
  };

  const handleDeleteYield = async (id) => {
    if (window.confirm('Delete this yield entry?')) {
      await db.milkYields.delete(id);
      loadData();
    }
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!eventForm.cattleId || !eventForm.type) {
      alert('Please select animal and specify event type');
      return;
    }

    if (eventForm.logType === 'health') {
      await db.healthRecords.add({
        date: eventForm.date,
        cattleId: Number(eventForm.cattleId),
        type: eventForm.type,
        details: eventForm.details,
        cost: Number(eventForm.cost) || 0,
        createdAt: new Date().toISOString(),
      });
    } else {
      await db.breedingRecords.add({
        date: eventForm.date,
        cattleId: Number(eventForm.cattleId),
        type: eventForm.type,
        partnerTagNo: eventForm.partnerTagNo,
        status: eventForm.details || 'Pending',
        createdAt: new Date().toISOString(),
      });
    }

    setShowAddEvent(false);
    setEventForm({
      logType: 'health',
      date: todayISO(),
      cattleId: '',
      type: 'Vaccination',
      partnerTagNo: '',
      details: '',
      cost: '',
    });
    loadData();
  };

  const getCattleTagAndName = (id) => {
    const found = cattle.find((c) => c.id === id);
    return found ? `${found.tagNo} (${found.name})` : `ID: ${id}`;
  };

  // Dashboard Stats
  const activeCattleCount = cattle.length;
  const lactatingCount = cattle.filter((c) => c.status === 'Lactating').length;
  const totalYieldToday = yields
    .filter((y) => y.date === todayISO())
    .reduce((sum, y) => sum + y.qty, 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('livestock.title')}</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          {activeTab === 'registry' && (
            <button className="btn btn-primary" onClick={() => setShowAddCattle(true)}>
              <Plus size={16} /> {t('livestock.addNew')}
            </button>
          )}
          {activeTab === 'yields' && (
            <button className="btn btn-primary" onClick={() => setShowAddYield(true)}>
              <Plus size={16} /> {t('livestock.recordYield')}
            </button>
          )}
          {activeTab === 'events' && (
            <button className="btn btn-primary" onClick={() => setShowAddEvent(true)}>
              <Plus size={16} /> Add Event
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="stat-card">
          <div className="stat-label">Active Cattle</div>
          <div className="stat-value">{activeCattleCount}</div>
          <Activity className="stat-icon" size={24} />
        </div>
        <div className="stat-card">
          <div className="stat-label">Lactating Cows</div>
          <div className="stat-value">{lactatingCount}</div>
          <Milk className="stat-icon" size={24} />
        </div>
        <div className="stat-card">
          <div className="stat-label">Today's Milk Yield</div>
          <div className="stat-value">{formatNumber(totalYieldToday, 1)} Ltr</div>
          <Heart className="stat-icon" size={24} />
        </div>
      </div>

      {/* Tabs Menu */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-default)', marginBottom: 'var(--space-lg)' }}>
        <button
          className={`nav-item ${activeTab === 'registry' ? 'active' : ''}`}
          style={{ borderBottom: activeTab === 'registry' ? '2px solid var(--accent-amber)' : 'none', borderRadius: 0, padding: '12px 24px', background: 'transparent', outline: 'none' }}
          onClick={() => setActiveTab('registry')}
        >
          <ClipboardList size={16} style={{ marginRight: 8 }} /> {t('livestock.cattleRegistry')}
        </button>
        <button
          className={`nav-item ${activeTab === 'yields' ? 'active' : ''}`}
          style={{ borderBottom: activeTab === 'yields' ? '2px solid var(--accent-amber)' : 'none', borderRadius: 0, padding: '12px 24px', background: 'transparent', outline: 'none' }}
          onClick={() => setActiveTab('yields')}
        >
          <Milk size={16} style={{ marginRight: 8 }} /> {t('livestock.dailyYields')}
        </button>
        <button
          className={`nav-item ${activeTab === 'events' ? 'active' : ''}`}
          style={{ borderBottom: activeTab === 'events' ? '2px solid var(--accent-amber)' : 'none', borderRadius: 0, padding: '12px 24px', background: 'transparent', outline: 'none' }}
          onClick={() => setActiveTab('events')}
        >
          <Calendar size={16} style={{ marginRight: 8 }} /> {t('livestock.healthBreeding')}
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'registry' && (
        <div className="card">
          {cattle.length === 0 ? (
            <div className="empty-state">
              <Info className="empty-state-icon" size={48} />
              <div className="empty-state-text">No cattle records registered yet. Click 'Add New Cattle' to start tracking.</div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('livestock.tagNo')}</th>
                    <th>{t('livestock.name')}</th>
                    <th>{t('livestock.breed')}</th>
                    <th>{t('livestock.gender')}</th>
                    <th>{t('livestock.status')}</th>
                    <th>{t('livestock.farmerCode')}</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cattle.map((c) => (
                    <tr key={c.id}>
                      <td className="cell-mono">{c.tagNo}</td>
                      <td>{c.name}</td>
                      <td>{c.breed}</td>
                      <td style={{ textTransform: 'capitalize' }}>{c.gender}</td>
                      <td>
                        <span className={`badge ${c.status === 'Lactating' ? 'badge-emerald' : c.status === 'Pregnant' ? 'badge-cyan' : 'badge-amber'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="cell-mono">{c.farmerCode || '—'}</td>
                      <td>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteCattle(c.id)}>
                          <Trash2 size={14} style={{ color: 'var(--accent-red)' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'yields' && (
        <div className="card">
          {yields.length === 0 ? (
            <div className="empty-state">
              <Milk className="empty-state-icon" size={48} />
              <div className="empty-state-text">No daily yields logged. Track your livestock milking performance.</div>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('livestock.date')}</th>
                    <th>{t('livestock.shift')}</th>
                    <th>Cattle (Tag)</th>
                    <th style={{ textAlign: 'right' }}>{t('livestock.qty')}</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {yields.map((y) => (
                    <tr key={y.id}>
                      <td>{formatDate(y.date)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{y.shift}</td>
                      <td>{getCattleTagAndName(y.cattleId)}</td>
                      <td style={{ textAlign: 'right' }} className="cell-mono">{formatNumber(y.qty, 1)} Ltr</td>
                      <td>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteYield(y.id)}>
                          <Trash2 size={14} style={{ color: 'var(--accent-red)' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="dashboard-split-grid">
          {/* Health Records Card */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} style={{ color: 'var(--accent-emerald)' }} /> Medical & Health Logs
              </h2>
            </div>
            {healthLogs.length === 0 ? (
              <div className="empty-state">
                <Info className="empty-state-icon" size={32} />
                <div className="empty-state-text">No health records logged.</div>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Cattle</th>
                      <th>Type</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthLogs.map((h) => (
                      <tr key={h.id}>
                        <td>{formatDate(h.date)}</td>
                        <td>{getCattleTagAndName(h.cattleId)}</td>
                        <td>{h.type}</td>
                        <td className="cell-mono">₹{formatNumber(h.cost, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Breeding Records Card */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Heart size={18} style={{ color: 'var(--accent-red)' }} /> Breeding & Calving Logs
              </h2>
            </div>
            {breedingLogs.length === 0 ? (
              <div className="empty-state">
                <Info className="empty-state-icon" size={32} />
                <div className="empty-state-text">No breeding records logged.</div>
              </div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Cattle</th>
                      <th>Event</th>
                      <th>Status/Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breedingLogs.map((b) => (
                      <tr key={b.id}>
                        <td>{formatDate(b.date)}</td>
                        <td>{getCattleTagAndName(b.cattleId)}</td>
                        <td>{b.type}</td>
                        <td>{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {/* 1. Add Cattle */}
      <Modal isOpen={showAddCattle} onClose={() => setShowAddCattle(false)} title={t('livestock.addNew')}>
        <form onSubmit={handleAddCattle} className="form-group" style={{ gap: 'var(--space-md)' }}>
          <div className="form-group">
            <label className="form-label">{t('livestock.tagNo')}</label>
            <input
              type="text"
              className="form-input mono"
              placeholder="e.g. TAG10023"
              value={cattleForm.tagNo}
              onChange={(e) => setCattleForm((prev) => ({ ...prev, tagNo: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('livestock.name')}</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Lakshmi"
              value={cattleForm.name}
              onChange={(e) => setCattleForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">{t('livestock.breed')}</label>
              <select
                className="form-select"
                value={cattleForm.breed}
                onChange={(e) => setCattleForm((prev) => ({ ...prev, breed: e.target.value }))}
              >
                <option value="Gir">Gir Cow</option>
                <option value="Sahiwal">Sahiwal Cow</option>
                <option value="HF">Holstein Friesian (HF)</option>
                <option value="Jersey">Jersey Cow</option>
                <option value="Murrah">Murrah Buffalo</option>
                <option value="Nili-Ravi">Nili-Ravi Buffalo</option>
                <option value="Mixed">Mixed/Local</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('livestock.gender')}</label>
              <select
                className="form-select"
                value={cattleForm.gender}
                onChange={(e) => setCattleForm((prev) => ({ ...prev, gender: e.target.value }))}
              >
                <option value="cow">Cow / Buffalo (Female)</option>
                <option value="bull">Bull (Male)</option>
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">{t('livestock.status')}</label>
              <select
                className="form-select"
                value={cattleForm.status}
                onChange={(e) => setCattleForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="Lactating">Lactating</option>
                <option value="Pregnant">Pregnant</option>
                <option value="Dry">Dry</option>
                <option value="Heifer">Heifer</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Linked Farmer</label>
              <select
                className="form-select"
                value={cattleForm.farmerCode}
                onChange={(e) => setCattleForm((prev) => ({ ...prev, farmerCode: e.target.value }))}
              >
                <option value="">— None (Self Managed) —</option>
                {farmers.map((f) => (
                  <option key={f.id} value={f.code}>{f.code} - {f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-footer" style={{ padding: 'var(--space-md) 0 0 0', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddCattle(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {t('common.save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Record Daily Yield */}
      <Modal isOpen={showAddYield} onClose={() => setShowAddYield(false)} title={t('livestock.recordYield')}>
        <form onSubmit={handleAddYield} className="form-group" style={{ gap: 'var(--space-md)' }}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">{t('livestock.date')}</label>
              <input
                type="date"
                className="form-input"
                value={yieldForm.date}
                onChange={(e) => setYieldForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('livestock.shift')}</label>
              <select
                className="form-select"
                value={yieldForm.shift}
                onChange={(e) => setYieldForm((prev) => ({ ...prev, shift: e.target.value }))}
              >
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Select Animal</label>
            <select
              className="form-select"
              value={yieldForm.cattleId}
              onChange={(e) => setYieldForm((prev) => ({ ...prev, cattleId: e.target.value }))}
            >
              <option value="">— Choose Cattle —</option>
              {cattle.map((c) => (
                <option key={c.id} value={c.id}>{c.tagNo} - {c.name} ({c.breed})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Milk Quantity (Liters)</label>
            <input
              type="number"
              step="0.1"
              className="form-input mono"
              placeholder="e.g. 8.5"
              value={yieldForm.qty}
              onChange={(e) => setYieldForm((prev) => ({ ...prev, qty: e.target.value }))}
            />
          </div>
          <div className="modal-footer" style={{ padding: 'var(--space-md) 0 0 0', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddYield(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Logs
            </button>
          </div>
        </form>
      </Modal>

      {/* 3. Add Event (Health/Breeding) */}
      <Modal isOpen={showAddEvent} onClose={() => setShowAddEvent(false)} title="Add Livestock Event">
        <form onSubmit={handleAddEvent} className="form-group" style={{ gap: 'var(--space-md)' }}>
          <div className="form-group">
            <label className="form-label">Event Category</label>
            <div style={{ display: 'flex', gap: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="logType"
                  checked={eventForm.logType === 'health'}
                  onChange={() => setEventForm((prev) => ({ ...prev, logType: 'health', type: 'Vaccination' }))}
                /> Health & Medical Log
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="logType"
                  checked={eventForm.logType === 'breeding'}
                  onChange={() => setEventForm((prev) => ({ ...prev, logType: 'breeding', type: 'Artificial Insemination' }))}
                /> Breeding & Reproduction Log
              </label>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-input"
                value={eventForm.date}
                onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Select Cattle</label>
              <select
                className="form-select"
                value={eventForm.cattleId}
                onChange={(e) => setEventForm((prev) => ({ ...prev, cattleId: e.target.value }))}
              >
                <option value="">— Choose Cattle —</option>
                {cattle.map((c) => (
                  <option key={c.id} value={c.id}>{c.tagNo} - {c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Event Type</label>
            {eventForm.logType === 'health' ? (
              <select
                className="form-select"
                value={eventForm.type}
                onChange={(e) => setEventForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="Vaccination">Vaccination</option>
                <option value="Deworming">Deworming</option>
                <option value="Medical Treatment">Disease Treatment</option>
                <option value="Veterinary Checkup">Routine Veterinary Check</option>
              </select>
            ) : (
              <select
                className="form-select"
                value={eventForm.type}
                onChange={(e) => setEventForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="Artificial Insemination">Artificial Insemination (A.I.)</option>
                <option value="Natural Service">Natural Service (Bull Mating)</option>
                <option value="Pregnancy Diagnosis">Pregnancy Diagnosis Check</option>
                <option value="Calving">Calving Event (Birth)</option>
              </select>
            )}
          </div>
          {eventForm.logType === 'breeding' && (
            <div className="form-group">
              <label className="form-label">Partner / Bull Tag Number (If applicable)</label>
              <input
                type="text"
                className="form-input mono"
                placeholder="e.g. BULL504"
                value={eventForm.partnerTagNo}
                onChange={(e) => setEventForm((prev) => ({ ...prev, partnerTagNo: e.target.value }))}
              />
            </div>
          )}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">{eventForm.logType === 'health' ? 'Treatment / Vet Cost (₹)' : 'Calving / Diagnosis Result'}</label>
              <input
                type="text"
                className="form-input"
                placeholder={eventForm.logType === 'health' ? 'e.g. 250' : 'e.g. Confirmed Pregnant / Single Male Calf'}
                value={eventForm.logType === 'health' ? eventForm.cost : eventForm.details}
                onChange={(e) => {
                  const val = e.target.value;
                  if (eventForm.logType === 'health') {
                    setEventForm((prev) => ({ ...prev, cost: val }));
                  } else {
                    setEventForm((prev) => ({ ...prev, details: val }));
                  }
                }}
              />
            </div>
            {eventForm.logType === 'health' && (
              <div className="form-group">
                <label className="form-label">Medicines / Vaccine Details</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. FMD Vaccine 2ml / Ivomec"
                  value={eventForm.details}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, details: e.target.value }))}
                />
              </div>
            )}
          </div>
          <div className="modal-footer" style={{ padding: 'var(--space-md) 0 0 0', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddEvent(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Log Event
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
