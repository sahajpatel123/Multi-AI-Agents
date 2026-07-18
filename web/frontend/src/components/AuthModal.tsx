import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { Button } from './Button';
import { authCaughtErrorMessage } from '../lib/authFormMessages';
import { prefersReducedMotion } from '../lib/motion';
import { clearRedirectIntent } from '../utils/redirectIntent';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
  defaultTab?: 'login' | 'signup';
}

type Tab = 'login' | 'signup';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AuthModal({
  isOpen,
  onClose,
  onLogin,
  onRegister,
  defaultTab = 'login',
}: AuthModalProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  // Reset form when modal opens or default tab prop changes while open
  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setIsSubmitting(false);
    setTab(defaultTab);
    const t = window.setTimeout(() => emailRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen, defaultTab]);

  // Escape + focus trap while open
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;

      const nodes = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => {
        if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
          return false;
        }
        // offsetParent is null for position:fixed (mobile bottom-sheet); use layout size.
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

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Lock background scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Announce errors to keyboard / SR users by moving focus
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
  }, [error]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    if (tab === 'signup') {
      if (!name.trim()) {
        setError('Name is required');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (tab === 'login') {
        await onLogin(trimmedEmail, password);
      } else {
        await onRegister(name.trim(), trimmedEmail, password);
      }
      clearRedirectIntent();
      onClose();
    } catch (err) {
      setError(authCaughtErrorMessage(err, 'Something went wrong'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    setShowPassword(false);
  };

  const reduceMotion = prefersReducedMotion();

  return (
    <div
      className={`auth-modal-overlay${reduceMotion ? ' auth-modal-overlay--static' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className={`auth-modal-card${reduceMotion ? ' auth-modal-card--static' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="auth-modal-header">
          <h2 id={titleId} className="auth-modal-title">
            {tab === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X width={16} height={16} aria-hidden />
          </button>
        </div>

        <div className="auth-modal-tabs" role="tablist" aria-label="Auth mode">
          {(['login', 'signup'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`auth-tab-${t}`}
              aria-selected={tab === t}
              aria-controls="auth-modal-panel"
              className={`auth-modal-tab${tab === t ? ' auth-modal-tab--active' : ''}`}
              onClick={() => switchTab(t)}
            >
              {t === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form
          id="auth-modal-panel"
          role="tabpanel"
          aria-labelledby={`auth-tab-${tab}`}
          className="auth-modal-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {tab === 'signup' && (
            <div className="auth-field">
              <label htmlFor={nameId} className="auth-field__label">
                Name
              </label>
              <input
                id={nameId}
                type="text"
                className="auth-field__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Your name"
                disabled={isSubmitting}
                aria-invalid={error === 'Name is required' ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor={emailId} className="auth-field__label">
              Email
            </label>
            <input
              ref={emailRef}
              id={emailId}
              type="email"
              className="auth-field__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              disabled={isSubmitting}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          <div className="auth-field">
            <label htmlFor={passwordId} className="auth-field__label">
              Password
            </label>
            <div className="auth-field__password-wrap">
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                className="auth-field__input auth-field__input--password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                minLength={tab === 'signup' ? 8 : 1}
                placeholder={tab === 'signup' ? 'At least 8 characters' : '••••••••'}
                disabled={isSubmitting}
                aria-invalid={
                  error?.toLowerCase().includes('password') ? true : undefined
                }
                aria-describedby={error ? errorId : undefined}
              />
              <button
                type="button"
                className="auth-field__reveal"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                disabled={isSubmitting}
              >
                {showPassword ? (
                  <EyeOff width={16} height={16} aria-hidden />
                ) : (
                  <Eye width={16} height={16} aria-hidden />
                )}
              </button>
            </div>
            {tab === 'signup' ? (
              <p className="auth-field__hint">Use at least 8 characters.</p>
            ) : null}
          </div>

          {error ? (
            <p
              ref={errorRef}
              id={errorId}
              role="alert"
              tabIndex={-1}
              className="auth-modal-error"
            >
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            loading={isSubmitting}
            className="auth-modal-submit"
          >
            {isSubmitting
              ? tab === 'login'
                ? 'Logging in…'
                : 'Creating account…'
              : tab === 'login'
                ? 'Log in'
                : 'Create account'}
          </Button>

          {tab === 'signup' ? (
            <p className="auth-modal-footnote">
              Free account includes daily prompts — no credit card required.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
