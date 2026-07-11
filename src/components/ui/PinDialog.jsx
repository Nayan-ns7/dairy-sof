import { useState, useEffect, useRef } from 'react';
import { Shield, X } from 'lucide-react';

/**
 * 4-digit Security PIN confirmation dialog.
 * Used as the "2nd check" before sensitive operations like:
 *  - Deleting entries
 *  - Modifying rate charts
 *  - Disbursing loans
 *  - Changing settings
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {string} props.title - Operation description
 * @param {function} props.onConfirm - Called with the entered PIN
 * @param {function} props.onCancel - Called when dialog is dismissed
 * @param {string} [props.error] - External error message to display
 */
export default function PinDialog({ isOpen, title, onConfirm, onCancel, error: externalError }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Focus first input on open
  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '']);
      setError('');
      setTimeout(() => inputRefs[0].current?.focus(), 100);
    }
  }, [isOpen]);

  // Show external errors
  useEffect(() => {
    if (externalError) setError(externalError);
  }, [externalError]);

  const handleDigitChange = (index, value) => {
    // Only allow single digits
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);
    setError('');

    if (value && index < 3) {
      // Auto-advance to next input
      inputRefs[index + 1].current?.focus();
    }

    // Auto-submit when all 4 digits are entered
    if (value && index === 3) {
      const pin = newDigits.join('');
      if (pin.length === 4) {
        onConfirm(pin);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Move back on backspace when current field is empty
      inputRefs[index - 1].current?.focus();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newDigits = pasted.split('');
      setDigits(newDigits);
      onConfirm(pasted);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{
        width: '100%', maxWidth: 340,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-default)',
        padding: 'var(--space-2xl)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
        animation: 'fadeIn 0.15s ease-out',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'rgba(245,158,11,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={18} color="var(--accent-amber)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                Security PIN Required
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                {title || 'Confirm this action'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="btn btn-ghost btn-icon"
            style={{ marginTop: -4, marginRight: -8 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* PIN Input Grid */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 12,
          marginBottom: 'var(--space-lg)',
        }}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              style={{
                width: 52, height: 56,
                textAlign: 'center',
                fontSize: 24, fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg-elevated)',
                border: `2px solid ${error ? 'var(--accent-red)' : 'var(--border-strong)'}`,
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent-cyan)';
                e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = error ? 'var(--accent-red)' : 'var(--border-strong)';
                e.target.style.boxShadow = 'none';
              }}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p style={{
            textAlign: 'center', fontSize: 12,
            color: 'var(--accent-red)', margin: '0 0 var(--space-md)',
          }}>
            {error}
          </p>
        )}

        {/* Footer hint */}
        <p style={{
          textAlign: 'center', fontSize: 11,
          color: 'var(--text-muted)', margin: 0,
        }}>
          Enter your 4-digit security PIN to proceed.
          <br />Press <span className="kbd" style={{ fontSize: 10 }}>Esc</span> to cancel.
        </p>
      </div>
    </div>
  );
}
