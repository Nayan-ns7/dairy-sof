import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

/**
 * Reusable Modal Dialog
 *
 * @param {object} props
 * @param {boolean} props.isOpen — Whether the modal is visible
 * @param {function} props.onClose — Close handler
 * @param {string} props.title — Modal title
 * @param {React.ReactNode} props.children — Modal body content
 * @param {React.ReactNode} [props.footer] — Optional footer with action buttons
 * @param {boolean} [props.large] — Use wider modal
 */
export default function Modal({ isOpen, onClose, title, children, footer, large }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal ${large ? 'modal-lg' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
