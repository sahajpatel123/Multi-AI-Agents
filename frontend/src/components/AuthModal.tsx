import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  defaultTab?: 'login' | 'signup';
}

type Tab = 'login' | 'signup';

export function AuthModal({
  isOpen,
  onClose,
  onLogin,
  onRegister,
  defaultTab = 'login',
}: AuthModalProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens or tab changes
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setPassword('');
      setError(null);
      setIsSubmitting(false);
      setTab(defaultTab);
      setTimeout(() => emailRef.current?.focus(), 50);
    }
  }, [isOpen, defaultTab]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (tab === 'login') {
        await onLogin(email, password);
      } else {
        await onRegister(email, password);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(26, 23, 20, 0.2)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
        onClick={onClose}
      >
        {/* Modal card */}
        <div
          style={{
            background: '#FFFFFF',
            border: '0.5px solid #E0D8D0',
            borderRadius: '14px',
            boxShadow: '0 16px 34px rgba(26, 23, 20, 0.12)',
            width: '100%',
            maxWidth: '420px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem 1rem', borderBottom: '0.5px solid #E0D8D0' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#1A1714' }}>
              {tab === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <button
              onClick={onClose}
              style={{
                color: '#6B6460',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                transition: 'color 150ms ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}
              aria-label="Close"
            >
              <X style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '0.5px solid #E0D8D0' }}>
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                style={{
                  flex: 1,
                  padding: '0.75rem 0',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: tab === t ? '#1A1714' : '#6B6460',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === t ? '2px solid #C4956A' : 'none',
                  marginBottom: tab === t ? '-1px' : '0',
                  cursor: 'pointer',
                  transition: 'color 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (tab !== t) e.currentTarget.style.color = '#1A1714';
                }}
                onMouseLeave={(e) => {
                  if (tab !== t) e.currentTarget.style.color = '#6B6460';
                }}
              >
                {t === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6B6460', marginBottom: '6px' }}>
                Email
              </label>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#FAF7F4',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: '10px',
                  color: '#1A1714',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'all 150ms ease',
                }}
                placeholder="you@example.com"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C4956A';
                  e.currentTarget.style.background = '#FFFFFF';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#E0D8D0';
                  e.currentTarget.style.background = '#FAF7F4';
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#6B6460', marginBottom: '6px' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                minLength={tab === 'signup' ? 8 : 1}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#FAF7F4',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: '10px',
                  color: '#1A1714',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'all 150ms ease',
                }}
                placeholder={tab === 'signup' ? 'At least 8 characters' : '••••••••'}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#C4956A';
                  e.currentTarget.style.background = '#FFFFFF';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#E0D8D0';
                  e.currentTarget.style.background = '#FAF7F4';
                }}
              />
            </div>

            {error && (
              <p style={{ fontSize: '13px', color: '#C4956A' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '10px 0',
                background: isSubmitting ? '#6B6460' : '#1A1714',
                color: '#FAF7F4',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '999px',
                border: 'none',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.5 : 1,
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = '#C4956A';
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = '#1A1714';
              }}
            >
              {isSubmitting
                ? (tab === 'login' ? 'Logging in...' : 'Creating account...')
                : (tab === 'login' ? 'Log in' : 'Create account')}
            </button>

            {tab === 'signup' && (
              <p style={{ fontSize: '11px', color: '#6B6460', textAlign: 'center' }}>
                Free account includes 20 prompts per day.
              </p>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
