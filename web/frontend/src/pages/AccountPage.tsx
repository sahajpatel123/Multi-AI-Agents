import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfileModal } from '../context/ProfileModalContext';
import MicroLoader from '../components/MicroLoader';

/**
 * Legacy `/account` route: opens the universal profile modal.
 * Renders a branded shell so the user never stares at a blank page, and
 * navigates to Agent when the modal is closed (no dead-end route).
 */
export function AccountPage() {
  const { openModal, isOpen, closing } = useProfileModal();
  const navigate = useNavigate();
  const sawOpen = useRef(false);

  useEffect(() => {
    openModal('top-right', 'account');
  }, [openModal]);

  useEffect(() => {
    if (isOpen) {
      sawOpen.current = true;
      return;
    }
    // Only redirect after the user has actually opened then closed the modal.
    if (sawOpen.current && !closing) {
      navigate('/agent', { replace: true });
    }
  }, [isOpen, closing, navigate]);

  return (
    <div
      className="account-route-shell"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Opening account settings"
    >
      <div className="account-route-shell__card">
        <div className="account-route-shell__brand" aria-hidden>
          <span className="account-route-shell__dot" />
          <span className="account-route-shell__name">Arena</span>
        </div>
        <MicroLoader label="Opening account" cycleWords={false} />
        <p className="account-route-shell__copy">Opening your account…</p>
        <button
          type="button"
          className="arena-btn arena-btn--ghost arena-btn--sm"
          onClick={() => navigate('/agent', { replace: true })}
        >
          Skip to Agent
        </button>
      </div>
    </div>
  );
}
