import { useEffect, useRef, useState } from 'react';
import { LogOut, Zap } from 'lucide-react';
import { User } from '../types';

interface UserMenuProps {
  user: User | null;
  isLoading: boolean;
  onSignInClick: () => void;
  onLogout: () => void;
}

const REGISTERED_LIMIT = 10;

export function UserMenu({
  user,
  isLoading,
  onSignInClick,
  onLogout,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (isLoading) {
    return <div className="w-8 h-8 rounded-full bg-border animate-pulse" />;
  }

  // Guest state — show "Sign In" button
  if (!user) {
    return (
      <button
        onClick={onSignInClick}
        className="text-sm text-text-secondary hover:text-text-primary transition-all duration-200 px-3.5 py-1.5
                   border border-border rounded-lg hover:border-accent/55"
        style={{
          background: 'rgba(250,247,244,0.62)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78)',
        }}
      >
        Sign in
      </button>
    );
  }

  // Logged-in state
  const initial = user.email[0].toUpperCase();
  const isPro = user.tier === 'pro';
  const limit = isPro ? null : REGISTERED_LIMIT;
  const used = user.prompt_count_today;
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded-full border border-border flex items-center justify-center
                   text-sm font-medium text-text-primary hover:border-accent/50 transition-all duration-200"
        style={{
          background: 'rgba(240,235,227,0.88)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78)',
        }}
        aria-label="Account menu"
      >
        {initial}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 top-10 w-64 border border-border rounded-xl
                     z-50 py-1"
          style={{
            background: 'linear-gradient(180deg, rgba(248,244,240,0.98) 0%, rgba(243,238,233,0.98) 100%)',
            boxShadow: '0 16px 34px rgba(26, 23, 20, 0.16)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* User info */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-xs font-medium text-text-primary">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{user.email}</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-text-secondary capitalize">{user.tier}</p>
                  {isPro && (
                    <span className="text-xs font-medium text-accent">Pro</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Usage */}
          <div className="px-4 py-3 border-b border-border">
            {isPro ? (
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Zap className="w-3 h-3 text-accent" />
                <span>Unlimited prompts</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-text-secondary">Today</span>
                  <span className="text-xs font-medium text-text-primary">
                    {used} / {limit} messages used
                  </span>
                </div>
                <div className="h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-text-secondary mt-1.5">
                  Resets at midnight UTC
                </p>
              </>
            )}
          </div>

          {/* Actions */}
          <button
            onClick={() => { setIsOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary
                       hover:text-text-primary hover:bg-background transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
