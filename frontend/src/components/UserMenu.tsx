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

  const breatheStyle = `
    @keyframes breathe {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.5); opacity: 0.6; }
    }
  `;

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
    return (
      <>
        <style>{breatheStyle}</style>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E0D8D0', animation: 'breathe 2.4s ease-in-out infinite' }} />
      </>
    );
  }

  // Guest state — show "Sign In" text link + "Try Arena" pill
  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onSignInClick}
          style={{
            fontSize: '13px',
            color: '#6B6460',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 12px',
            transition: 'color 150ms ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}
        >
          Sign in
        </button>
        <button
          onClick={onSignInClick}
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#FAF7F4',
            background: '#1A1714',
            border: 'none',
            borderRadius: '999px',
            padding: '8px 16px',
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#C4956A';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#1A1714';
          }}
        >
          Try Arena
        </button>
      </div>
    );
  }

  // Logged-in state
  const initial = user.email[0].toUpperCase();
  const isPro = user.tier === 'pro';
  const limit = isPro ? null : REGISTERED_LIMIT;
  const used = user.prompt_count_today;
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;

  return (
    <div style={{ position: 'relative', zIndex: 90 }} ref={menuRef}>
      {/* Avatar button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 500,
          color: '#1A1714',
          background: '#F0EBE3',
          cursor: 'pointer',
          transition: 'all 150ms ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#E0D8D0'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#F0EBE3'}
        aria-label="Account menu"
      >
        {initial}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '40px',
            width: '256px',
            border: '0.5px solid #E0D8D0',
            borderRadius: '10px',
            zIndex: 100,
            padding: '4px',
            background: '#FFFFFF',
            boxShadow: '0 16px 34px rgba(26, 23, 20, 0.12)',
          }}
        >
          {/* User info */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '0.5px solid #E0D8D0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#F0EBE3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, color: '#1A1714' }}>
                {initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <p style={{ fontSize: '11px', color: '#6B6460', textTransform: 'capitalize' }}>{user.tier}</p>
                  {isPro && (
                    <span style={{ fontSize: '11px', fontWeight: 500, color: '#C4956A' }}>Pro</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Usage */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '0.5px solid #E0D8D0' }}>
            {isPro ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6B6460' }}>
                <Zap style={{ width: '12px', height: '12px', color: '#C4956A' }} />
                <span>Unlimited prompts</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#6B6460' }}>Today</span>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: '#1A1714' }}>
                    {used} / {limit} messages used
                  </span>
                </div>
                <div style={{ height: '2px', background: '#E0D8D0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: '#C4956A',
                      borderRadius: '999px',
                      width: `${pct}%`,
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
                <p style={{ fontSize: '11px', color: '#6B6460', marginTop: '6px' }}>
                  Resets at midnight UTC
                </p>
              </>
            )}
          </div>

          {/* Actions */}
          <button
            onClick={() => { setIsOpen(false); onLogout(); }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 1rem',
              fontSize: '13px',
              color: '#6B6460',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              borderRadius: '6px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#1A1714';
              e.currentTarget.style.background = '#F0EBE3';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#6B6460';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LogOut style={{ width: '14px', height: '14px' }} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
