import { useCallback, useEffect, useId, useState } from 'react';
import { Lock, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { RazorpayCheckout } from './RazorpayCheckout';
import { useAuth } from '../hooks/useAuth';
import { useTier } from '../context/TierContext';
import { DEFAULT_REDIRECT_INTENT, setRedirectIntent } from '../utils/redirectIntent';
import { shouldUpgradeModalEscapeClose } from '../lib/upgradeModalEscape';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitle?: string;
}

const featureItems = [
  'Debate mode — challenge any mind',
  'All 16 personas unlocked',
  'Memory across sessions',
];

export function UpgradeModal({
  isOpen,
  onClose,
  subtitle = 'Debate mode lets you challenge any mind and watch the others react in real time.',
}: UpgradeModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated, refreshUser, user } = useAuth();
  const { refreshTier } = useTier();
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const titleId = useId();
  const errorId = useId();

  const handleClose = useCallback(() => {
    setCheckoutPlan(null);
    setCheckoutError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      setCheckoutPlan(null);
      setCheckoutError(null);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!shouldUpgradeModalEscapeClose(checkoutPlan)) return;
      e.preventDefault();
      handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, checkoutPlan, handleClose]);

  const handleUpgradePlusMonthly = () => {
    if (!isAuthenticated) {
      setRedirectIntent(DEFAULT_REDIRECT_INTENT);
      navigate('/signin');
      handleClose();
      return;
    }
    setCheckoutError(null);
    setCheckoutPlan('plus_monthly');
  };

  const onCheckoutSuccess = useCallback(async () => {
    setCheckoutPlan(null);
    setCheckoutError(null);
    onClose();
    await refreshTier();
    await refreshUser();
  }, [onClose, refreshTier, refreshUser]);

  const onCheckoutError = useCallback((message: string) => {
    setCheckoutPlan(null);
    setCheckoutError(
      (message || '').trim() || 'Payment failed. Try again or open Pricing for other plans.',
    );
  }, []);

  const onCheckoutDismiss = useCallback(() => {
    setCheckoutPlan(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="upgrade-modal-overlay"
      role="presentation"
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(26,23,20,0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      {checkoutPlan && (
        <RazorpayCheckout
          key={checkoutPlan}
          planKey={checkoutPlan}
          prefillEmail={user?.email}
          onSuccess={onCheckoutSuccess}
          onError={onCheckoutError}
          onClose={onCheckoutDismiss}
        />
      )}
      <div
        className="upgrade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FAF7F4',
          borderRadius: '20px',
          padding: '2.5rem',
          maxWidth: '420px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 32px 80px rgba(26,23,20,0.18)',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            color: '#C4956A',
            margin: '0 auto 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Lock style={{ width: '32px', height: '32px' }} aria-hidden />
        </div>
        <h2
          id={titleId}
          style={{
            fontSize: '22px',
            fontWeight: 500,
            letterSpacing: '-.02em',
            marginBottom: '.5rem',
            color: '#1A1714',
          }}
        >
          This is a Plus feature
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: '#6B6460',
            lineHeight: 1.7,
            marginBottom: '2rem',
          }}
        >
          {subtitle}
        </p>

        <div style={{ textAlign: 'left' }}>
          {featureItems.map((item) => (
            <div
              key={item}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
                fontSize: '13px',
                color: '#1A1714',
                marginBottom: '.5rem',
              }}
            >
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#C4956A',
                  color: '#FAF7F4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-hidden
              >
                <Check style={{ width: '10px', height: '10px' }} />
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        {checkoutError ? (
          <p
            id={errorId}
            role="alert"
            style={{
              margin: '1.25rem 0 0',
              fontSize: 13,
              color: '#D85A30',
              lineHeight: 1.5,
              textAlign: 'left',
            }}
          >
            {checkoutError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleUpgradePlusMonthly}
          aria-describedby={checkoutError ? errorId : undefined}
          style={{
            width: '100%',
            padding: '13px 24px',
            borderRadius: '999px',
            background: '#1A1714',
            color: '#FAF7F4',
            fontSize: '14px',
            marginTop: checkoutError ? '0.85rem' : '1.5rem',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {checkoutError ? 'Try upgrade again — ₹999/mo' : 'Upgrade to Plus — ₹999/mo'}
        </button>
        <button
          type="button"
          onClick={() => {
            handleClose();
            navigate('/pricing');
          }}
          style={{
            width: '100%',
            padding: '11px 24px',
            borderRadius: '999px',
            background: 'transparent',
            color: '#6B6460',
            fontSize: '13px',
            marginTop: '0.65rem',
            border: '0.5px solid #E0D8D0',
            cursor: 'pointer',
          }}
        >
          See all plans
        </button>
        <button
          type="button"
          onClick={handleClose}
          style={{
            fontSize: '13px',
            color: '#6B6460',
            cursor: 'pointer',
            marginTop: '.8rem',
            background: 'transparent',
            border: 'none',
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
