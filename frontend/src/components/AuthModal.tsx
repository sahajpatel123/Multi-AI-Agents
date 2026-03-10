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
        className="fixed inset-0 bg-text-primary/20 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal card */}
        <div
          className="bg-surface border border-border rounded-xl shadow-lg w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
            <h2 className="font-serif text-lg font-semibold text-text-primary">
              {tab === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            {(['login', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null); }}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'text-text-primary border-b-2 border-accent -mb-px'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Email
              </label>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg
                           text-text-primary text-sm placeholder:text-text-secondary/50
                           focus:outline-none focus:border-accent/60 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                minLength={tab === 'signup' ? 8 : 1}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg
                           text-text-primary text-sm placeholder:text-text-secondary/50
                           focus:outline-none focus:border-accent/60 transition-colors"
                placeholder={tab === 'signup' ? 'At least 8 characters' : '••••••••'}
              />
            </div>

            {error && (
              <p className="text-sm text-accent">{error}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-text-primary text-background text-sm font-medium
                         rounded-lg hover:bg-text-primary/90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? (tab === 'login' ? 'Logging in...' : 'Creating account...')
                : (tab === 'login' ? 'Log in' : 'Create account')}
            </button>

            {tab === 'signup' && (
              <p className="text-xs text-text-secondary text-center">
                Free account includes 20 prompts per day.
              </p>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
