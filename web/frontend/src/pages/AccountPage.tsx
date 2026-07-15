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
      style={{
        minHeight: '100vh',
        background: '#F5F0E8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
      }}
      aria-busy="true"
      aria-label="Opening account settings"
    >
      <MicroLoader />
      <p style={{ margin: 0, fontSize: 14, color: '#8C7355' }}>Opening your account…</p>
      <button
        type="button"
        className="arena-btn arena-btn--ghost arena-btn--sm"
        onClick={() => navigate('/agent', { replace: true })}
      >
        Skip to Agent
      </button>
    </div>
  );
}
