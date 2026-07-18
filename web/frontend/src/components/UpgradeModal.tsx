import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Lock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { MotionButton } from './MotionButton';
import { RazorpayCheckout } from './RazorpayCheckout';
import { useAuth } from '../hooks/useAuth';
import { useTier } from '../context/TierContext';
import { prefersReducedMotion } from '../lib/motion';
import { shouldUpgradeModalEscapeClose } from '../lib/upgradeModalEscape';
import { DEFAULT_REDIRECT_INTENT, setRedirectIntent } from '../utils/redirectIntent';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitle?: string;
}

const featureItems = [
  'Debate mode — challenge any mind',
  'All 16 personas unlocked',
  'Memory across sessions',
] as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const descId = useId();
  const errorId = useId();
  const featuresId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const reduceMotion = prefersReducedMotion();

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
    const t = window.setTimeout(() => primaryRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!shouldUpgradeModalEscapeClose(checkoutPlan)) return;
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key !== 'Tab' || !cardRef.current) return;

      const nodes = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => {
        if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !cardRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !cardRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, checkoutPlan, handleClose]);

  useEffect(() => {
    if (!checkoutError) return;
    errorRef.current?.focus();
  }, [checkoutError]);

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

  const checkoutBusy = checkoutPlan != null;

  return (
    <div
      className={`upgrade-modal-overlay${reduceMotion ? ' upgrade-modal-overlay--static' : ''}`}
      role="presentation"
      onClick={() => {
        if (checkoutBusy) return;
        handleClose();
      }}
    >
      {checkoutPlan ? (
        <RazorpayCheckout
          key={checkoutPlan}
          planKey={checkoutPlan}
          prefillEmail={user?.email}
          onSuccess={onCheckoutSuccess}
          onError={onCheckoutError}
          onClose={onCheckoutDismiss}
        />
      ) : null}

      <div
        ref={cardRef}
        className={`upgrade-modal${reduceMotion ? ' upgrade-modal--static' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="upgrade-modal__close"
          onClick={handleClose}
          aria-label="Close"
          disabled={checkoutBusy}
        >
          <X width={16} height={16} aria-hidden />
        </button>

        <div className="upgrade-modal__icon" aria-hidden>
          <Lock width={28} height={28} />
        </div>

        <h2 id={titleId} className="upgrade-modal__title">
          This is a Plus feature
        </h2>
        <p id={descId} className="upgrade-modal__subtitle">
          {subtitle}
        </p>

        <ul id={featuresId} className="upgrade-modal__features" aria-label="Plus includes">
          {featureItems.map((item) => (
            <li key={item} className="upgrade-modal__feature">
              <span className="upgrade-modal__check" aria-hidden>
                <Check width={10} height={10} strokeWidth={2.5} />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {checkoutError ? (
          <p
            ref={errorRef}
            id={errorId}
            role="alert"
            tabIndex={-1}
            className="upgrade-modal__error"
          >
            {checkoutError}
          </p>
        ) : null}

        <div className="upgrade-modal__actions">
          <MotionButton
            ref={primaryRef}
            type="button"
            variant="primary"
            size="md"
            fullWidth
            loading={checkoutBusy}
            onClick={handleUpgradePlusMonthly}
            aria-describedby={checkoutError ? errorId : featuresId}
            className="upgrade-modal__cta"
          >
            {checkoutBusy
              ? 'Opening checkout…'
              : checkoutError
                ? 'Try upgrade again — ₹999/mo'
                : 'Upgrade to Plus — ₹999/mo'}
          </MotionButton>

          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            disabled={checkoutBusy}
            onClick={() => {
              handleClose();
              navigate('/pricing');
            }}
          >
            See all plans
          </Button>

          <button
            type="button"
            className="upgrade-modal__dismiss"
            onClick={handleClose}
            disabled={checkoutBusy}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
