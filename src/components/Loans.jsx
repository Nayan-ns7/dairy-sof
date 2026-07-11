import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/i18nContext';
import db from '../db';
import { formatDate, formatCurrency, todayISO } from '../utils/formatters';
import { Coins, Plus, Trash2, Info, Search, List, Receipt } from 'lucide-react';
import Modal from './ui/Modal';

export default function Loans() {
  const { t } = useTranslation();
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [showDisburse, setShowDisburse] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedLoanHistory, setSelectedLoanHistory] = useState([]);

  // Form State
  const [form, setForm] = useState({
    farmerCode: '',
    amount: '',
    repaymentDeductionRate: '10', // Default 10% of milk billing
    remarks: '',
    date: todayISO(),
  });

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const allLoans = await db.loans.toArray();
    const allRepayments = await db.repayments.toArray();
    const allFarmers = await db.farmers.where('isActive').equals(1).toArray();

    // Attach outstanding balance, farmer name to each loan
    const hydratedLoans = await Promise.all(
      allLoans.map(async (l) => {
        const farmer = allFarmers.find((f) => String(f.code) === String(l.farmerCode));
        // Calculate repayments made for this loan
        const loanRepayments = allRepayments.filter((r) => r.loanId === l.id);
        const totalRepaid = loanRepayments.reduce((sum, r) => sum + r.amount, 0);
        const outstanding = l.active ? Math.max(0, l.amount - totalRepaid) : 0;
        return {
          ...l,
          farmerName: farmer ? farmer.name : 'Unknown Farmer',
          outstanding,
          totalRepaid,
        };
      })
    );

    setLoans(hydratedLoans);
    setRepayments(allRepayments);
    setFarmers(allFarmers);
  }

  const handleDisburse = async (e) => {
    e.preventDefault();
    if (!form.farmerCode || !form.amount) {
      alert('Please fill out farmer code and loan amount');
      return;
    }

    const farmerExists = farmers.some((f) => String(f.code) === String(form.farmerCode));
    if (!farmerExists) {
      alert(`Farmer with code "${form.farmerCode}" does not exist or is inactive`);
      return;
    }

    await db.loans.add({
      farmerCode: form.farmerCode,
      amount: Number(form.amount),
      repaymentDeductionRate: Number(form.repaymentDeductionRate) || 10,
      remarks: form.remarks,
      date: form.date,
      active: 1,
      createdAt: new Date().toISOString(),
    });

    setShowDisburse(false);
    setForm({
      farmerCode: '',
      amount: '',
      repaymentDeductionRate: '10',
      remarks: '',
      date: todayISO(),
    });
    loadData();
  };

  const handleDeleteLoan = async (id) => {
    if (window.confirm('Are you sure you want to delete this loan record? Repayments will also be affected.')) {
      await db.loans.delete(id);
      // Clean repayments
      const relatedRepayments = repayments.filter((r) => r.loanId === id);
      for (const r of relatedRepayments) {
        await db.repayments.delete(r.id);
      }
      loadData();
    }
  };

  const handleViewHistory = (loanId) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const history = repayments.filter((r) => r.loanId === loanId);
    setSelectedLoanHistory({
      loan,
      history,
    });
    setShowHistoryModal(true);
  };

  // Stats
  const totalOutstanding = loans.reduce((sum, l) => sum + l.outstanding, 0);
  const activeLoansCount = loans.filter((l) => l.active && l.outstanding > 0).length;
  const totalDisbursed = loans.reduce((sum, l) => sum + l.amount, 0);

  const filteredLoans = loans.filter((l) => {
    const q = searchQuery.toLowerCase();
    return (
      String(l.farmerCode).includes(q) ||
      l.farmerName.toLowerCase().includes(q) ||
      (l.remarks || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('loans.title')}</h1>
        <button className="btn btn-primary" onClick={() => setShowDisburse(true)}>
          <Plus size={16} /> {t('loans.disburse')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-amber)' }}>
          <div className="stat-label">{t('loans.outstanding')}</div>
          <div className="stat-value" style={{ color: 'var(--accent-red)' }}>{formatCurrency(totalOutstanding)}</div>
          <Coins className="stat-icon" size={24} />
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-emerald)' }}>
          <div className="stat-label">Active Loan Accounts</div>
          <div className="stat-value">{activeLoansCount}</div>
          <List className="stat-icon" size={24} />
        </div>
        <div className="stat-card" style={{ '--stat-accent': 'var(--accent-cyan)' }}>
          <div className="stat-label">Total Disbursed</div>
          <div className="stat-value">{formatCurrency(totalDisbursed)}</div>
          <Receipt className="stat-icon" size={24} />
        </div>
      </div>

      {/* Search Filter */}
      <div className="card-header" style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', padding: 0, border: 'none', marginBottom: 'var(--space-lg)' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 260 }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '36px' }}
              placeholder="Search by farmer code or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--text-muted)' }} />
          </div>
        </div>
      </div>

      {/* Loans Ledger Table */}
      <div className="card">
        {filteredLoans.length === 0 ? (
          <div className="empty-state">
            <Info className="empty-state-icon" size={48} />
            <div className="empty-state-text">No active loan records found matching search.</div>
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('loans.date')}</th>
                  <th>{t('loans.farmerCode')}</th>
                  <th>Farmer Name</th>
                  <th style={{ textAlign: 'right' }}>Original Amount</th>
                  <th style={{ textAlign: 'right' }}>Deduction Rate</th>
                  <th style={{ textAlign: 'right' }}>Repaid</th>
                  <th style={{ textAlign: 'right' }}>{t('loans.outstanding')}</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDate(l.date)}</td>
                    <td className="cell-mono">{l.farmerCode}</td>
                    <td>{l.farmerName}</td>
                    <td style={{ textAlign: 'right' }} className="cell-mono">{formatCurrency(l.amount)}</td>
                    <td style={{ textAlign: 'right' }} className="cell-mono">{l.repaymentDeductionRate}%</td>
                    <td style={{ textAlign: 'right' }} className="cell-mono text-success">{formatCurrency(l.totalRepaid)}</td>
                    <td style={{ textAlign: 'right' }} className="cell-mono cell-deduction">
                      {l.outstanding > 0 ? formatCurrency(l.outstanding) : <span className="badge badge-emerald">Settled</span>}
                    </td>
                    <td style={{ fontSize: '12px' }}>{l.remarks || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleViewHistory(l.id)} title="View Repayments">
                          History
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteLoan(l.id)}>
                          <Trash2 size={14} style={{ color: 'var(--accent-red)' }} />
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

      {/* Modal 1: Disburse Loan */}
      <Modal isOpen={showDisburse} onClose={() => setShowDisburse(false)} title={t('loans.disburse')}>
        <form onSubmit={handleDisburse} className="form-group" style={{ gap: 'var(--space-md)' }}>
          <div className="form-group">
            <label className="form-label">{t('loans.farmerCode')}</label>
            <input
              type="text"
              className="form-input mono"
              placeholder="e.g. 101"
              value={form.farmerCode}
              onChange={(e) => setForm((prev) => ({ ...prev, farmerCode: e.target.value }))}
            />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">{t('loans.amount')}</label>
              <input
                type="number"
                className="form-input mono"
                placeholder="e.g. 5000"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('loans.rate')}</label>
              <input
                type="number"
                className="form-input mono"
                placeholder="e.g. 10 (percentage of milk payout)"
                value={form.repaymentDeductionRate}
                onChange={(e) => setForm((prev) => ({ ...prev, repaymentDeductionRate: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Date Disbursed</label>
              <input
                type="date"
                className="form-input"
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Remarks / Purpose</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Purchase of cattle feed / cow loan"
                value={form.remarks}
                onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
              />
            </div>
          </div>
          <div className="modal-footer" style={{ padding: 'var(--space-md) 0 0 0', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowDisburse(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Disburse Advance
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: View Repayments History */}
      <Modal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} title="Repayment Details">
        {selectedLoanHistory?.loan && (
          <div>
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <p><strong>Farmer:</strong> {selectedLoanHistory.loan.farmerCode} - {selectedLoanHistory.loan.farmerName}</p>
              <p><strong>Disbursed:</strong> {formatCurrency(selectedLoanHistory.loan.amount)} on {formatDate(selectedLoanHistory.loan.date)}</p>
              <p><strong>Deduction Rate:</strong> {selectedLoanHistory.loan.repaymentDeductionRate}% per billing period</p>
              <p><strong>Outstanding Balance:</strong> {formatCurrency(selectedLoanHistory.loan.outstanding)}</p>
            </div>
            <h4 style={{ marginBottom: 'var(--space-sm)', fontSize: '14px', fontWeight: 600 }}>Transaction Logs</h4>
            {selectedLoanHistory.history.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No repayment transactions logged yet. Payments generated on the payments tab will auto-deduct loan balances.</p>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Repayment Amount</th>
                      <th>Payment Settlement ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLoanHistory.history.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.date)}</td>
                        <td className="cell-mono text-success">+{formatCurrency(r.amount)}</td>
                        <td className="cell-mono">#PAY-{r.paymentId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal-footer" style={{ padding: 'var(--space-md) 0 0 0', borderTop: 'none' }}>
              <button className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
