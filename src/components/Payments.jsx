import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { buildPaymentMessage, sendViaWhatsApp, sendViaSms } from '../utils/messaging';
import { Wallet, Printer, Download, Calculator, Plus, Trash2, Search, MessageCircle, Smartphone } from 'lucide-react';

export default function Payments() {
  const { t } = useTranslation();
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmer, setSelectedFarmer] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [billing, setBilling] = useState(null);
  const [storeDeductions, setStoreDeductions] = useState([]);
  const [manualDeductions, setManualDeductions] = useState([]);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [bankRef, setBankRef] = useState('');
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState(null);
  const [printData, setPrintData] = useState(null);
  const [dairyConfig, setDairyConfig] = useState(null);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // Search refs
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const fromDateRef = useRef(null);

  // Show Toast helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Reset billing calculation when inputs change to avoid stale state
  useEffect(() => {
    setBilling(null);
    setStoreDeductions([]);
    setManualDeductions([]);
  }, [selectedFarmer, periodStart, periodEnd]);

  useEffect(() => {
    loadFarmers();
    loadHistory();
    loadConfig();
  }, []);

  async function loadConfig() {
    const cfg = await db.dairyConfig.get(1);
    setDairyConfig(cfg);
  }

  const handlePrint = async (p) => {
    // Hydrate full data: collection entries + deduction line items
    const purchases = await db.purchases
      .where('farmerCode')
      .equals(p.farmerCode)
      .toArray();
    const entries = purchases.filter(
      (e) => e.date >= p.periodStart && e.date <= p.periodEnd
    );

    const deductionItems = await db.deductions
      .where('paymentId')
      .equals(p.id)
      .toArray();

    const totalQty = entries.reduce((s, e) => s + (e.qty || 0), 0);
    const avgFat = entries.length > 0
      ? entries.reduce((s, e) => s + (e.fat || 0), 0) / entries.length
      : 0;
    const avgSnf = entries.length > 0
      ? entries.reduce((s, e) => s + (e.snf || 0), 0) / entries.length
      : 0;

    setPrintData({
      ...p,
      entries,
      deductionItems,
      totalQty,
      avgFat,
      avgSnf,
    });
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleWhatsApp = (p) => {
    if (!p.farmerMobile) {
      showToast('No mobile number registered for this farmer', 'error');
      return;
    }
    const msg = buildPaymentMessage(dairyConfig, p);
    sendViaWhatsApp(p.farmerMobile, msg);
  };

  const handleSms = (p) => {
    if (!p.farmerMobile) {
      showToast('No mobile number registered for this farmer', 'error');
      return;
    }
    const msg = buildPaymentMessage(dairyConfig, p);
    sendViaSms(p.farmerMobile, msg);
  };

  async function loadFarmers() {
    const all = await db.farmers.where('isActive').equals(1).toArray();
    setFarmers(all);
  }

  // Farmer Search Dropdown Logic
  const handleFarmerSelectClick = () => {
    setShowSearch(true);
    setSearchQuery('');
    setActiveIndex(0);
  };

  const filteredFarmers = farmers.filter((f) => {
    const q = searchQuery.toLowerCase();
    return (
      String(f.code).includes(q) ||
      f.name.toLowerCase().includes(q) ||
      (f.mobile || '').includes(q)
    );
  });

  const selectFarmer = (farmer) => {
    setSelectedFarmer(String(farmer.code));
    setShowSearch(false);
    
    // Auto focus From Date field
    setTimeout(() => {
      fromDateRef.current?.focus();
    }, 50);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (filteredFarmers.length > 0 ? (prev + 1) % filteredFarmers.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (filteredFarmers.length > 0 ? (prev - 1 + filteredFarmers.length) % filteredFarmers.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredFarmers[activeIndex]) {
        selectFarmer(filteredFarmers[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSearch(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSearch(false);
      }
    }
    if (showSearch) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSearch]);

  // Autofocus the search input when dropdown is shown
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
      setActiveIndex(0);
    }
  }, [showSearch]);

  async function loadHistory() {
    const all = await db.payments.orderBy('createdAt').reverse().limit(50).toArray();
    setHistory(all);
  }

  const calculateBilling = async () => {
    if (!selectedFarmer || !periodStart || !periodEnd) return;

    if (periodStart > periodEnd) {
      showToast('From Date cannot be after To Date', 'error');
      return;
    }

    const farmerCode = parseInt(selectedFarmer, 10);
    const purchases = await db.purchases
      .where('farmerCode')
      .equals(farmerCode)
      .toArray();

    // Filter by date range
    const filtered = purchases.filter(
      (p) => p.date >= periodStart && p.date <= periodEnd
    );

    if (filtered.length === 0) {
      setBilling({
        farmerCode,
        farmerName: farmers.find((f) => f.code === farmerCode)?.name || '',
        totalQty: 0,
        avgFat: 0,
        avgSnf: 0,
        grossAmount: 0,
        entries: [],
      });
      setStoreDeductions([]);
      setManualDeductions([]);
      return;
    }

    const totalQty = filtered.reduce((s, p) => s + (p.qty || 0), 0);
    const grossAmount = filtered.reduce((s, p) => s + (p.amount || 0), 0);
    const avgFat = filtered.reduce((s, p) => s + (p.fat || 0), 0) / filtered.length;
    const avgSnf = filtered.reduce((s, p) => s + (p.snf || 0), 0) / filtered.length;

    setBilling({
      farmerCode,
      farmerName: filtered[0]?.farmerName || '',
      totalQty,
      avgFat,
      avgSnf,
      grossAmount,
      entries: filtered,
    });

    // Load store sales deductions for this farmer and period
    const sales = await db.storeSales
      .where('farmerCode')
      .equals(farmerCode)
      .toArray();
    const periodSales = sales.filter(
      (s) => s.date >= periodStart && s.date <= periodEnd
    );
    setStoreDeductions(periodSales);

    // Load active loans and calculate suggested repayment deduction
    const activeLoans = await db.loans.where('farmerCode').equals(farmerCode).toArray();
    const suggestedLoans = [];
    for (const loan of activeLoans) {
      if (!loan.active) continue;
      const reps = await db.repayments.where('loanId').equals(loan.id).toArray();
      const repaidSum = reps.reduce((s, r) => s + r.amount, 0);
      const outstanding = loan.amount - repaidSum;
      if (outstanding > 0) {
        const suggestedAmt = Math.min(outstanding, (grossAmount * loan.repaymentDeductionRate) / 100);
        suggestedLoans.push({
          type: 'loan',
          loanId: loan.id,
          description: `Loan Repayment (Ref: #${loan.id} - ${loan.remarks || 'Advance'})`,
          amount: suggestedAmt.toFixed(2),
        });
      }
    }
    setManualDeductions(suggestedLoans);
  };

  const addManualDeduction = () => {
    setManualDeductions((prev) => [
      ...prev,
      { type: 'feedAdvance', description: '', amount: '' },
    ]);
  };

  const updateDeduction = (index, field, value) => {
    setManualDeductions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeDeduction = (index) => {
    setManualDeductions((prev) => prev.filter((_, i) => i !== index));
  };

  const totalStoreDeductions = storeDeductions.reduce((s, d) => s + (d.amount || 0), 0);
  const totalManualDeductions = manualDeductions.reduce(
    (s, d) => s + (parseFloat(d.amount) || 0),
    0
  );
  const totalDeductions = totalStoreDeductions + totalManualDeductions;
  const netPayable = (billing?.grossAmount || 0) - totalDeductions;

  const markPaid = async () => {
    if (!billing || netPayable <= 0) return;

    const payment = {
      farmerCode: billing.farmerCode,
      farmerName: billing.farmerName,
      periodStart,
      periodEnd,
      grossAmount: billing.grossAmount,
      totalDeductions,
      netAmount: netPayable,
      paymentMode,
      bankRef: paymentMode === 'bank' ? bankRef : '',
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const paymentId = await db.payments.add(payment);

    // Save deduction line items
    const allDeds = [
      ...storeDeductions.map((s) => ({
        paymentId,
        farmerCode: billing.farmerCode,
        type: 'store',
        description: s.itemName,
        amount: s.amount,
        createdAt: new Date().toISOString(),
      })),
      ...manualDeductions
        .filter((d) => d.amount)
        .map((d) => ({
          paymentId,
          farmerCode: billing.farmerCode,
          type: d.type,
          description: d.description,
          amount: parseFloat(d.amount),
          createdAt: new Date().toISOString(),
        })),
    ];
    if (allDeds.length > 0) {
      await db.deductions.bulkAdd(allDeds);
    }

    // Save repayment logs for loan deductions
    const loanDeductions = manualDeductions.filter((d) => d.type === 'loan' && d.loanId && d.amount);
    for (const ld of loanDeductions) {
      await db.repayments.add({
        loanId: ld.loanId,
        paymentId,
        date: new Date().toISOString().split('T')[0],
        amount: parseFloat(ld.amount),
        createdAt: new Date().toISOString(),
      });
    }

    showToast('Payment recorded!', 'success');

    setBilling(null);
    setStoreDeductions([]);
    setManualDeductions([]);
    await loadHistory();
  };

  const generateBankSheet = () => {
    const bankFarmers = history.filter((h) => h.paymentMode === 'bank');
    if (bankFarmers.length === 0) return;

    let csv = 'Farmer Name,Account No,IFSC,Amount\n';
    bankFarmers.forEach((p) => {
      const farmer = farmers.find((f) => f.code === p.farmerCode);
      csv += `"${p.farmerName}","${farmer?.accountNo || ''}","${farmer?.ifsc || ''}",${p.netAmount}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bank-upload-sheet.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedFarmerObj = farmers.find((f) => String(f.code) === String(selectedFarmer));

  return (
    <div>
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${typeof toast === 'object' ? toast.type : 'success'}`}>
            {typeof toast === 'object' ? toast.message : toast}
          </div>
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">{t('payment.title')}</h1>
        <button className="btn btn-secondary" onClick={generateBankSheet}>
          <Download size={16} /> {t('payment.generateBank')}
        </button>
      </div>

      {/* Selection Card */}
      <div 
        className="card" 
        style={{ 
          marginBottom: 'var(--space-xl)',
          overflow: 'visible',
          zIndex: showSearch ? 10 : 1
        }}
      >
        <div className="form-row form-row-4" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="form-group">
            <label className="form-label">{t('payment.periodStart')}</label>
            <input ref={fromDateRef} type="date" className="form-input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('payment.periodEnd')}</label>
            <input type="date" className="form-input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="form-group" style={{ position: 'relative' }} ref={dropdownRef}>
            <label className="form-label">{t('payment.selectFarmer')}</label>
            <div 
              onClick={handleFarmerSelectClick}
              className="farmer-search-trigger"
              style={{
                padding: 'var(--space-md) var(--space-lg)',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                fontSize: 14,
                fontWeight: 500,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: selectedFarmerObj ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'background var(--transition-fast), border-color var(--transition-fast)',
              }}
            >
              <span>
                {selectedFarmerObj 
                  ? `${selectedFarmerObj.code} - ${selectedFarmerObj.name}`
                  : t('payment.selectFarmer')}
              </span>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
            </div>

            {showSearch && (
              <div 
                className="farmer-search-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  width: '100%',
                  zIndex: 100,
                  marginTop: 8,
                  background: 'var(--bg-primary)',
                  border: '2px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: 'var(--space-sm)',
                }}
              >
                <input
                  ref={searchInputRef}
                  type="text"
                  className="form-input"
                  placeholder="Type code, name or mobile..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  style={{ marginBottom: 'var(--space-sm)' }}
                />
                
                <div 
                  className="farmer-search-list"
                  style={{ 
                    maxHeight: 200, 
                    overflowY: 'auto', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 4 
                  }}
                >
                  {filteredFarmers.length === 0 ? (
                    <div style={{ padding: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                      No matching farmers found
                    </div>
                  ) : (
                    filteredFarmers.map((f, idx) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => selectFarmer(f)}
                        className={`farmer-search-item ${idx === activeIndex ? 'active' : ''}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 'var(--space-sm) var(--space-md)',
                          border: 'none',
                          background: idx === activeIndex ? 'var(--bg-hover)' : 'transparent',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'left',
                          width: '100%',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: 'var(--text-primary)',
                          transition: 'background var(--transition-fast)',
                        }}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <div>
                          <strong style={{ fontFamily: 'var(--font-mono)', marginRight: 8, color: 'var(--accent-amber)' }}>
                            {String(f.code).padStart(3, '0')}
                          </strong>
                          <span style={{ fontWeight: 500 }}>{f.name}</span>
                        </div>
                        {f.mobile && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {f.mobile}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={calculateBilling} disabled={!selectedFarmer || !periodStart || !periodEnd}>
              <Calculator size={16} /> {t('payment.calculate')}
            </button>
          </div>
        </div>
      </div>

      {/* Billing Result */}
      {billing && (
        <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <div className="card-header">
            <span className="card-title">
              {billing.farmerName} (Code: {billing.farmerCode}) — {formatDate(periodStart)} to {formatDate(periodEnd)}
            </span>
          </div>

          {/* Summary stats */}
          <div className="stat-grid" style={{ marginBottom: 'var(--space-xl)' }}>
            <div className="stat-card" style={{ '--stat-accent': 'var(--accent-cyan)' }}>
              <span className="stat-label">{t('payment.totalQty')}</span>
              <span className="stat-value">{formatNumber(billing.totalQty, 1)}</span>
            </div>
            <div className="stat-card" style={{ '--stat-accent': 'var(--accent-amber)' }}>
              <span className="stat-label">{t('payment.avgFat')}</span>
              <span className="stat-value">{formatNumber(billing.avgFat, 1)}</span>
            </div>
            <div className="stat-card" style={{ '--stat-accent': 'var(--accent-purple)' }}>
              <span className="stat-label">{t('payment.avgSnf')}</span>
              <span className="stat-value">{formatNumber(billing.avgSnf, 1)}</span>
            </div>
            <div className="stat-card" style={{ '--stat-accent': 'var(--accent-emerald)' }}>
              <span className="stat-label">{t('payment.grossAmount')}</span>
              <span className="stat-value">{formatCurrency(billing.grossAmount)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-red)', marginBottom: 'var(--space-md)' }}>
              {t('payment.deductions')}
            </div>

            {/* Store deductions */}
            {storeDeductions.length > 0 && (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('payment.storeDeductions')}</div>
                {storeDeductions.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>
                    <span>{s.itemName} ({formatDate(s.date)})</span>
                    <span className="cell-deduction" style={{ fontFamily: 'var(--font-mono)' }}>-{formatCurrency(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Manual deductions */}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('payment.manualDeductions')}</div>
            {manualDeductions.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', alignItems: 'center' }}>
                <select className="form-select" style={{ width: 140 }} value={d.type} onChange={(e) => updateDeduction(i, 'type', e.target.value)}>
                  <option value="feedAdvance">{t('payment.feedAdvance')}</option>
                  <option value="loanRecovery">{t('payment.loanRecovery')}</option>
                  <option value="other">{t('payment.other')}</option>
                </select>
                <input className="form-input" style={{ flex: 1 }} placeholder={t('payment.deductionDesc')} value={d.description} onChange={(e) => updateDeduction(i, 'description', e.target.value)} />
                <input type="number" className="form-input mono" style={{ width: 120 }} placeholder="₹0" value={d.amount} onChange={(e) => updateDeduction(i, 'amount', e.target.value)} />
                <button className="btn btn-ghost btn-icon" onClick={() => removeDeduction(i)}><Trash2 size={14} /></button>
              </div>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={addManualDeduction}>
              <Plus size={14} /> {t('payment.addDeduction')}
            </button>
          </div>

          {/* Detailed entries */}
          {billing.entries && billing.entries.length > 0 && (
            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-amber)', marginBottom: 'var(--space-md)' }}>
                Milk Collection Records
              </div>
              <div className="data-table-wrapper" style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Shift</th>
                      <th>Milk Type</th>
                      <th>Qty (Kg)</th>
                      <th>FAT %</th>
                      <th>SNF %</th>
                      <th>Rate</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="cell-mono">{formatDate(entry.date)}</td>
                        <td>{entry.shift === 'morning' ? '☀️ Morning' : '🌙 Evening'}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary */}
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)', fontSize: 14 }}>
              <span>{t('payment.grossAmount')}</span>
              <span className="cell-amount" style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>{formatCurrency(billing.grossAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)', fontSize: 14 }}>
              <span>{t('payment.totalDeductions')}</span>
              <span className="cell-deduction" style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>-{formatCurrency(totalDeductions)}</span>
            </div>
            <div style={{ borderTop: '2px solid var(--accent-amber)', paddingTop: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
              <span>{t('payment.netPayable')}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: netPayable >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>{formatCurrency(netPayable)}</span>
            </div>
          </div>

          {/* Payment Action */}
          <div style={{ marginTop: 'var(--space-xl)', display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ width: 160 }}>
              <label className="form-label">{t('payment.paymentMode')}</label>
              <select className="form-select" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <option value="cash">{t('payment.cash')}</option>
                <option value="bank">{t('payment.bank')}</option>
              </select>
            </div>
            {paymentMode === 'bank' && (
              <div className="form-group" style={{ width: 200 }}>
                <label className="form-label">{t('payment.bankRef')}</label>
                <input className="form-input mono" value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
              </div>
            )}
            <button className="btn btn-primary btn-lg" onClick={markPaid} disabled={netPayable <= 0}>
              <Wallet size={16} /> {t('payment.markPaid')}
            </button>
          </div>
        </div>
      )}

      {/* Payment History */}
      {history.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('payment.history')}</span>
          </div>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('purchase.farmerCode')}</th>
                  <th>{t('purchase.farmerName')}</th>
                  <th>Period</th>
                  <th>{t('payment.grossAmount')}</th>
                  <th>{t('payment.totalDeductions')}</th>
                  <th>{t('payment.netPayable')}</th>
                  <th>{t('payment.paymentMode')}</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-mono">{p.farmerCode}</td>
                    <td>{p.farmerName}</td>
                    <td className="cell-mono">{formatDate(p.periodStart)} - {formatDate(p.periodEnd)}</td>
                    <td className="cell-mono">{formatCurrency(p.grossAmount)}</td>
                    <td className="cell-deduction">{formatCurrency(p.totalDeductions)}</td>
                    <td className="cell-amount">{formatCurrency(p.netAmount)}</td>
                    <td><span className={`badge ${p.paymentMode === 'cash' ? 'badge-amber' : 'badge-cyan'}`}>{p.paymentMode}</span></td>
                    <td className="cell-mono">{formatDate(p.paidAt)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-icon" onClick={() => handlePrint(p)} title={t('payment.printSlip')}>
                        <Printer size={14} />
                      </button>
                      <button className="btn btn-ghost btn-icon" style={{ color: '#25D366' }} onClick={() => handleWhatsApp(p)} title="Send via WhatsApp">
                        <MessageCircle size={14} />
                      </button>
                      <button className="btn btn-ghost btn-icon" style={{ color: 'var(--accent-amber)' }} onClick={() => handleSms(p)} title="Send via SMS">
                        <Smartphone size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hidden Print Receipt */}
      {printData && (
        <div className="print-receipt">
          {/* Header */}
          <div className="print-header">
            <strong className="print-dairy-name">{dairyConfig?.dairyName || 'Smart Dairy'}</strong>
            {dairyConfig?.address && <div className="print-dairy-addr">{dairyConfig.address}</div>}
            {dairyConfig?.phone && <div className="print-dairy-addr">Ph: {dairyConfig.phone}</div>}
            <div className="print-doc-title">PAYMENT BILL STATEMENT</div>
          </div>

          {/* Farmer & Period Info */}
          <div className="print-info-section">
            <div className="print-row">
              <span>Farmer:</span>
              <strong>{printData.farmerCode} — {printData.farmerName}</strong>
            </div>
            <div className="print-row">
              <span>Period:</span>
              <span>{formatDate(printData.periodStart)} to {formatDate(printData.periodEnd)}</span>
            </div>
            <div className="print-row">
              <span>Payment Date:</span>
              <span>{formatDate(printData.paidAt)}</span>
            </div>
          </div>

          {/* Collection Entries Table */}
          {printData.entries && printData.entries.length > 0 && (
            <div className="print-section">
              <div className="print-section-title">Milk Collection</div>
              <table className="print-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>FAT</th>
                    <th style={{ textAlign: 'right' }}>SNF</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                    <th style={{ textAlign: 'right' }}>Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {printData.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDate(e.date)}</td>
                      <td>{e.shift === 'morning' ? 'M' : 'E'}</td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(e.qty, 1)}</td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(e.fat, 1)}</td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(e.snf, 1)}</td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(e.rate, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="print-table-total">
                    <td colSpan={2}><strong>Total</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{formatNumber(printData.totalQty, 1)}</strong></td>
                    <td style={{ textAlign: 'right' }}>{formatNumber(printData.avgFat, 1)}</td>
                    <td style={{ textAlign: 'right' }}>{formatNumber(printData.avgSnf, 1)}</td>
                    <td></td>
                    <td style={{ textAlign: 'right' }}><strong>{formatCurrency(printData.grossAmount)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Deductions */}
          {printData.deductionItems && printData.deductionItems.length > 0 && (
            <div className="print-section">
              <div className="print-section-title">Deductions</div>
              {printData.deductionItems.map((d, i) => (
                <div className="print-row" key={i}>
                  <span>{d.type === 'store' ? '🛒 ' : ''}{d.description || d.type}</span>
                  <span style={{ color: '#c00' }}>-{formatCurrency(d.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="print-summary">
            <div className="print-row">
              <span>Gross Milk Amount:</span>
              <span>{formatCurrency(printData.grossAmount)}</span>
            </div>
            <div className="print-row" style={{ color: '#c00' }}>
              <span>Total Deductions:</span>
              <span>-{formatCurrency(printData.totalDeductions)}</span>
            </div>
            <div className="print-divider"></div>
            <div className="print-row print-net-row">
              <strong>NET PAYABLE:</strong>
              <strong>{formatCurrency(printData.netAmount)}</strong>
            </div>
          </div>

          {/* Footer */}
          <div className="print-footer">
            <div className="print-row">
              <span>Mode:</span>
              <span>{printData.paymentMode.toUpperCase()}{printData.bankRef ? ` (Ref: ${printData.bankRef})` : ''}</span>
            </div>
            <div className="print-thankyou">Thank you!</div>
          </div>
        </div>
      )}
    </div>
  );
}
