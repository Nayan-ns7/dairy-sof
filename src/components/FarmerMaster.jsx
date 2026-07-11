import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import Modal from './ui/Modal';
import WebcamCapture from './ui/WebcamCapture';
import { Search, UserPlus, Edit2, Trash2, Camera, Upload, User, Ban, UserCheck } from 'lucide-react';

const EMPTY_FARMER = {
  code: '',
  name: '',
  mobile: '',
  address: '',
  milkType: 'any',
  bankName: '',
  accountNo: '',
  ifsc: '',
  photo: null,
  isActive: 1,
};

export default function FarmerMaster() {
  const { t, locale } = useTranslation();
  const [farmers, setFarmers] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editFarmer, setEditFarmer] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FARMER });
  const [showWebcam, setShowWebcam] = useState(false);

  useEffect(() => {
    loadFarmers();
  }, []);

  async function loadFarmers() {
    const all = await db.farmers.orderBy('code').toArray();
    setFarmers(all);
  }

  const filtered = farmers.filter((f) => {
    const q = search.toLowerCase();
    return (
      String(f.code).includes(q) ||
      f.name.toLowerCase().includes(q) ||
      (f.mobile || '').includes(q)
    );
  });

  const openAdd = async () => {
    // Auto-generate next code
    const lastFarmer = await db.farmers.orderBy('code').last();
    const nextCode = lastFarmer ? lastFarmer.code + 1 : 1;
    setForm({ ...EMPTY_FARMER, code: nextCode });
    setEditFarmer(null);
    setShowModal(true);
  };

  const openEdit = (farmer) => {
    setForm({ ...farmer });
    setEditFarmer(farmer);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditFarmer(null);
    setForm({ ...EMPTY_FARMER });
    setShowWebcam(false);
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoCapture = (dataUrl) => {
    setForm((prev) => ({ ...prev, photo: dataUrl }));
    setShowWebcam(false);
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, photo: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const saveFarmer = async () => {
    if (!form.code || !form.name) return;

    const data = {
      ...form,
      code: parseInt(form.code, 10),
      createdAt: form.createdAt || new Date().toISOString(),
    };

    if (editFarmer) {
      await db.farmers.update(editFarmer.id, data);
    } else {
      await db.farmers.add(data);
    }

    closeModal();
    await loadFarmers();
  };

  const toggleActive = async (farmer) => {
    const msg = farmer.isActive
      ? t('farmer.deleteConfirm')
      : (locale === 'hi' ? 'क्या आप वाकई इस किसान को सक्रिय करना चाहते हैं?' : 'Are you sure you want to activate this farmer?');
    
    if (window.confirm(msg)) {
      await db.farmers.update(farmer.id, { isActive: farmer.isActive ? 0 : 1 });
      await loadFarmers();
    }
  };

  const deleteFarmer = async (farmer) => {
    const purchaseCount = await db.purchases.where('farmerCode').equals(farmer.code).count();
    const paymentCount = await db.payments.where('farmerCode').equals(farmer.code).count();
    const salesCount = await db.storeSales.where('farmerCode').equals(farmer.code).count();

    if (purchaseCount > 0 || paymentCount > 0 || salesCount > 0) {
      const msg = locale === 'hi' 
        ? 'इस किसान के पास लेन-देन के रिकॉर्ड हैं और इसे हटाया नहीं जा सकता। क्या आप इसके बजाय इसे निष्क्रिय करना चाहते हैं?' 
        : 'This farmer has transaction records and cannot be deleted. Would you like to deactivate them instead?';
      if (window.confirm(msg)) {
        await db.farmers.update(farmer.id, { isActive: 0 });
        await loadFarmers();
      }
    } else {
      const msg = locale === 'hi'
        ? 'क्या आप वाकई इस किसान को स्थायी रूप से हटाना चाहते हैं?'
        : 'Are you sure you want to permanently delete this farmer?';
      if (window.confirm(msg)) {
        await db.farmers.delete(farmer.id);
        await loadFarmers();
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('farmer.title')}</h1>
        <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 36, width: 240 }}
              placeholder={t('farmer.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={openAdd}>
            <UserPlus size={16} />
            {t('farmer.addNew')}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <User size={48} className="empty-state-icon" />
            <p className="empty-state-text">{t('farmer.noFarmers')}</p>
            <button className="btn btn-primary" onClick={openAdd}>
              <UserPlus size={16} />
              {t('farmer.addNew')}
            </button>
          </div>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('farmer.code')}</th>
                <th>{t('farmer.photo')}</th>
                <th>{t('farmer.name')}</th>
                <th>{t('farmer.mobile')}</th>
                <th>{t('farmer.milkType')}</th>
                <th>{t('farmer.bankName')}</th>
                <th>{t('farmer.accountNo')}</th>
                <th>{t('farmer.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((farmer) => (
                <tr key={farmer.id}>
                  <td className="cell-mono" style={{ fontWeight: 600 }}>{farmer.code}</td>
                  <td>
                    {farmer.photo ? (
                      <img src={farmer.photo} alt="" className="farmer-photo-thumb" />
                    ) : (
                      <div className="farmer-photo-placeholder">
                        <User size={16} />
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 500 }}>{farmer.name}</td>
                  <td className="cell-mono">{farmer.mobile || '—'}</td>
                  <td>
                    <span className={`badge ${farmer.milkType === 'cow' ? 'badge-cyan' : farmer.milkType === 'buffalo' ? 'badge-amber' : 'badge-emerald'}`}>
                      {t(`farmer.${farmer.milkType}`)}
                    </span>
                  </td>
                  <td>{farmer.bankName || '—'}</td>
                  <td className="cell-mono">{farmer.accountNo || '—'}</td>
                  <td>
                    <span className={`badge ${farmer.isActive ? 'badge-emerald' : 'badge-red'}`}>
                      {farmer.isActive ? t('farmer.active') : t('farmer.inactive')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-icon" onClick={() => openEdit(farmer)} title={t('common.edit')}>
                        <Edit2 size={14} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                      <button 
                        className="btn btn-ghost btn-icon" 
                        onClick={() => toggleActive(farmer)} 
                        title={farmer.isActive ? t('farmer.inactive') : t('farmer.active')}
                        style={{ color: farmer.isActive ? 'var(--text-muted)' : 'var(--accent-emerald)' }}
                      >
                        {farmer.isActive ? <Ban size={14} /> : <UserCheck size={14} />}
                      </button>
                      <button 
                        className="btn btn-ghost btn-icon" 
                        onClick={() => deleteFarmer(farmer)} 
                        title={t('common.delete')}
                        style={{ color: 'var(--accent-red)' }}
                      >
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editFarmer ? t('farmer.edit') : t('farmer.addNew')}
        large
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeModal}>{t('farmer.cancel')}</button>
            <button className="btn btn-primary" onClick={saveFarmer} disabled={!form.code || !form.name}>{t('farmer.save')}</button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
          {/* Photo Section */}
          <div style={{ flexShrink: 0, width: 200 }}>
            <label className="form-label" style={{ marginBottom: 'var(--space-sm)', display: 'block' }}>{t('farmer.photo')}</label>
            {showWebcam ? (
              <WebcamCapture onCapture={handlePhotoCapture} onCancel={() => setShowWebcam(false)} />
            ) : form.photo ? (
              <div>
                <div className="webcam-container">
                  <img src={form.photo} alt="Farmer" />
                </div>
                <div className="webcam-controls">
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowWebcam(true)}>
                    <Camera size={12} /> {t('farmer.retake')}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleChange('photo', null)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="webcam-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                </div>
                <div className="webcam-controls">
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowWebcam(true)}>
                    <Camera size={12} /> {t('farmer.capturePhoto')}
                  </button>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={12} /> {t('farmer.uploadPhoto')}
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div style={{ flex: 1 }}>
            <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
              <div className="form-group">
                <label className="form-label">{t('farmer.code')}</label>
                <input
                  type="number"
                  className="form-input mono"
                  value={form.code}
                  onChange={(e) => handleChange('code', e.target.value)}
                  disabled={!!editFarmer}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('farmer.name')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="form-row form-row-2" style={{ marginBottom: 'var(--space-lg)' }}>
              <div className="form-group">
                <label className="form-label">{t('farmer.mobile')}</label>
                <input
                  type="tel"
                  className="form-input mono"
                  value={form.mobile}
                  onChange={(e) => handleChange('mobile', e.target.value)}
                  maxLength={10}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('farmer.milkType')}</label>
                <select className="form-select" value={form.milkType} onChange={(e) => handleChange('milkType', e.target.value)}>
                  <option value="any">{t('farmer.any')}</option>
                  <option value="cow">{t('farmer.cow')}</option>
                  <option value="buffalo">{t('farmer.buffalo')}</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--space-lg)' }}>
              <label className="form-label">{t('farmer.address')}</label>
              <input
                type="text"
                className="form-input"
                value={form.address}
                onChange={(e) => handleChange('address', e.target.value)}
              />
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-amber)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Bank Details
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">{t('farmer.bankName')}</label>
                <input type="text" className="form-input" value={form.bankName} onChange={(e) => handleChange('bankName', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('farmer.accountNo')}</label>
                <input type="text" className="form-input mono" value={form.accountNo} onChange={(e) => handleChange('accountNo', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('farmer.ifsc')}</label>
                <input type="text" className="form-input mono" value={form.ifsc} onChange={(e) => handleChange('ifsc', e.target.value)} style={{ textTransform: 'uppercase' }} />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
