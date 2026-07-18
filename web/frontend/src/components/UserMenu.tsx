import { useEffect, useId, useRef, useState } from 'react';
import { LogOut, UserRound, Zap } from 'lucide-react';
import { User } from '../types';
import { prefersReducedMotion } from '../lib/motion';

interface UserMenuProps {
  user: User | null;
  isLoading: boolean;
  onSignInClick: () => void;
  onLogout: () => void;
  /** Opens universal profile modal (e.g. Agent header). */
  onProfileClick?: () => void;
}

const FREE_LIMIT = 5;
const PLUS_LIMIT = 15;
const PRO_LIMIT = 35;

function usageTone(pct: number): 'ok' | 'warn' | 'danger' {
  if (pct >= 95) return 'danger';
  if (pct >= 70) return 'warn';
  return 'ok';
}

export function UserMenu({
  user,
  isLoading,
  onSignInClick,
  onLogout,
  onProfileClick,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const reducedMotion = prefersReducedMotion();

  // Close on outside click or Escape; arrow-key menuitem navigation
  useEffect(() => {
    if (!isOpen) return;

    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        avatarRef.current?.focus();
        return;
      }

      if (!panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      );
      if (items.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const index = items.indexOf(active as HTMLElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = index < 0 ? 0 : (index + 1) % items.length;
        items[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
        items[next]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };

    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);

    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    }, 0);

    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [isOpen]);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading account"
        className={`user-menu-skeleton${reducedMotion ? ' user-menu-skeleton--static' : ''}`}
      />
    );
  }

  // Guest state — show "Sign In" text link + "Try Arena" pill
  if (!user) {
    return (
      <div className="user-menu-guest">
        <button type="button" className="user-menu-guest__signin" onClick={onSignInClick}>
          Sign in
        </button>
        <button
          type="button"
          className="user-menu-guest__cta desktop-only"
          onClick={onSignInClick}
        >
          Try Arena
        </button>
      </div>
    );
  }

  // Logged-in state
  const initial = (user.name?.trim()?.[0] || user.email[0] || '?').toUpperCase();
  const isPro = user.tier === 'PRO';
  const isPlus = user.tier === 'PLUS';
  const limit = isPro ? PRO_LIMIT : isPlus ? PLUS_LIMIT : FREE_LIMIT;
  const used = user.prompt_count_today ?? 0;
  const pct = Math.min((used / Math.max(limit, 1)) * 100, 100);
  const tone = usageTone(pct);
  const tierLabel = user.tier.charAt(0) + user.tier.slice(1).toLowerCase();

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        ref={avatarRef}
        type="button"
        className={`user-menu__avatar${isOpen ? ' user-menu__avatar--open' : ''}`}
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
      >
        {initial}
      </button>

      {isOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          className={`user-menu__panel${reducedMotion ? ' user-menu__panel--static' : ''}`}
        >
          <div className="user-menu__header">
            <div className="user-menu__avatar user-menu__avatar--lg" aria-hidden>
              {initial}
            </div>
            <div className="user-menu__identity">
              <p className="user-menu__email" title={user.email}>
                {user.email}
              </p>
              <div className="user-menu__tier-row">
                <span
                  className={[
                    'user-menu__tier',
                    isPro ? 'user-menu__tier--pro' : '',
                    isPlus ? 'user-menu__tier--plus' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {tierLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="user-menu__usage">
            <div className="user-menu__usage-row">
              <span className="user-menu__usage-label">Today</span>
              <span className="user-menu__usage-value">
                {used} / {limit} messages
              </span>
            </div>
            <div
              className="user-menu__meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={Math.min(used, limit)}
              aria-label="Messages used today"
            >
              <div
                className={`user-menu__meter-fill user-menu__meter-fill--${tone}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="user-menu__usage-note">
              <Zap width={12} height={12} aria-hidden />
              Resets daily
            </p>
          </div>

          <div className="user-menu__actions">
            {onProfileClick ? (
              <button
                type="button"
                role="menuitem"
                className="user-menu__item"
                onClick={() => {
                  setIsOpen(false);
                  onProfileClick();
                }}
              >
                <UserRound width={14} height={14} aria-hidden />
                Profile &amp; account
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="user-menu__item user-menu__item--danger"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
            >
              <LogOut width={14} height={14} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
