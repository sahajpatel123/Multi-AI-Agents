import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfileModal } from '../context/ProfileModalContext';
import { Button } from './Button';
import { setRedirectIntent } from '../utils/redirectIntent';

function HamburgerIcon() {
  return (
    <svg
      className="navbar-hamburger-icon"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" stroke="#2C1810" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const { openModal } = useProfileModal();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const t = event.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (mobilePanelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const isActive = (path: string) => location.pathname === path;
  const isChatPage =
    location.pathname === '/app' ||
    location.pathname === '/arena' ||
    location.pathname === '/agent' ||
    location.pathname.startsWith('/agent');
  const profileInitials = (() => {
    const email = user?.email || '';
    const n = (user?.name || '').trim();
    if (n) {
      const parts = n.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return n.slice(0, 2).toUpperCase();
    }
    return (email.split('@')[0] || 'A').slice(0, 2).toUpperCase();
  })();

  const shellClass = `navbar-shell${scrolled ? ' navbar-shell--scrolled' : ''}`;

  return (
    <>
      <nav className={shellClass}>
        <div className="navbar-inner-container">
          <div className="navbar-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              {isAuthenticated ? (
                <button
                  type="button"
                  className="mobile-only navbar-hamburger navbar-hamburger--leading"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Open navigation menu"
                >
                  <HamburgerIcon />
                </button>
              ) : null}
              <button type="button" className="navbar-brand" onClick={() => navigate('/')}>
                <span className="navbar-brand-dot" aria-hidden />
                <span className="navbar-brand-text">Arena</span>
              </button>
            </div>

            <div className="navbar-nav-links" aria-label="Primary navigation">
              {isAuthenticated ? (
                <>
                  <button
                    type="button"
                    className={`navbar-nav-link${isActive('/app') ? ' navbar-nav-link--active' : ''}`}
                    onClick={() => navigate('/app')}
                  >
                    Arena
                  </button>
                  <button
                    type="button"
                    className={`navbar-nav-link${location.pathname.startsWith('/agent') ? ' navbar-nav-link--active' : ''}`}
                    onClick={() => navigate('/agent')}
                  >
                    Agent
                  </button>
                  <button
                    type="button"
                    className={`navbar-nav-link${isActive('/pricing') ? ' navbar-nav-link--active' : ''}`}
                    onClick={() => navigate('/pricing')}
                  >
                    Pricing
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`navbar-nav-link${isActive('/product') ? ' navbar-nav-link--active' : ''}`}
                    onClick={() => navigate('/product')}
                  >
                    Product
                  </button>
                  <button
                    type="button"
                    className={`navbar-nav-link${isActive('/capabilities') ? ' navbar-nav-link--active' : ''}`}
                    onClick={() => navigate('/capabilities')}
                  >
                    Capabilities
                  </button>
                  <button
                    type="button"
                    className={`navbar-nav-link${isActive('/pricing') ? ' navbar-nav-link--active' : ''}`}
                    onClick={() => navigate('/pricing')}
                  >
                    Pricing
                  </button>
                  <button
                    type="button"
                    className={`navbar-nav-link${isActive('/about') ? ' navbar-nav-link--active' : ''}`}
                    onClick={() => navigate('/about')}
                  >
                    About
                  </button>
                </>
              )}
            </div>

            <div className="navbar-right-cluster">
              {!isAuthenticated ? (
                <div className="navbar-auth">
                  <button
                    type="button"
                    className="navbar-hamburger"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Open navigation menu"
                  >
                    <HamburgerIcon />
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="navbar-signin-link"
                    onClick={() => {
                      setRedirectIntent('/');
                      navigate('/signin?tab=signin');
                    }}
                  >
                    Sign in
                  </Button>
                  <button
                    type="button"
                    className="navbar-cta-pill"
                    onClick={() => {
                      if (isAuthenticated) {
                        navigate('/app');
                        return;
                      }
                      setRedirectIntent('/app');
                      navigate('/signin?tab=signup');
                    }}
                  >
                    Sign up →
                  </button>
                </div>
              ) : (
                <div ref={menuRef} className="navbar-auth navbar-auth--session">
                  <button
                    type="button"
                    className="mobile-only navbar-mobile-profile-avatar"
                    onClick={() => {
                      openModal('top-right');
                    }}
                    aria-label="Profile and settings"
                  >
                    {profileInitials}
                  </button>
                  {!isChatPage && (
                    <button
                      type="button"
                      className="desktop-only navbar-desktop-avatar"
                      onClick={() => openModal('top-right')}
                      aria-label="Profile and settings"
                    >
                      {profileInitials}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="navbar-divider-line" aria-hidden />
      </nav>

      {menuOpen && (
        <div className="mobile-only navbar-mobile-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
      <div
        ref={mobilePanelRef}
        className={`mobile-only navbar-mobile-panel${menuOpen ? ' open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              minHeight: 'auto',
              minWidth: 'auto',
            }}
          >
            <span className="navbar-brand-dot" aria-hidden />
            <span className="navbar-brand-text">Arena</span>
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation menu"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '999px',
              border: 'none',
              background: '#EDE4D8',
              color: '#2C1810',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {(isAuthenticated
            ? [
                { label: 'Arena', path: '/app' },
                { label: 'Agent', path: '/agent' },
                { label: 'Watchlist', path: '/agent/watchlist' },
                { label: 'Pricing', path: '/pricing' },
                { label: 'About', path: '/about' },
              ]
            : [
                { label: 'Product', path: '/product' },
                { label: 'Capabilities', path: '/capabilities' },
                { label: 'Pricing', path: '/pricing' },
                { label: 'About', path: '/about' },
              ]
          ).map((item) => (
            <button
              key={item.path}
              type="button"
              className="navbar-mobile-link"
              onClick={() => {
                setMenuOpen(false);
                navigate(item.path);
              }}
            >
              {item.label}
            </button>
          ))}
          {!isAuthenticated ? (
            <>
              <button
                type="button"
                className="navbar-mobile-link"
                onClick={() => {
                  setMenuOpen(false);
                  setRedirectIntent('/');
                  navigate('/signin?tab=signin');
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                className="navbar-mobile-link"
                onClick={() => {
                  setMenuOpen(false);
                  setRedirectIntent('/app');
                  navigate('/signin?tab=signup');
                }}
              >
                Sign up free
              </button>
            </>
          ) : (
            <>
              {/* Product destinations (Arena/Agent/Watchlist) already listed above —
                  only account actions here to avoid duplicate buttons. */}
              <button
                type="button"
                className="navbar-mobile-link"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/personas');
                }}
              >
                My Panel
              </button>
              <button
                type="button"
                className="navbar-mobile-link"
                onClick={() => {
                  setMenuOpen(false);
                  openModal('top-right', 'plan');
                }}
              >
                Subscription
              </button>
              <button
                type="button"
                className="navbar-mobile-link"
                onClick={async () => {
                  setMenuOpen(false);
                  await logout();
                  navigate('/');
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>

        {!isAuthenticated && (
          <button
            type="button"
            className="navbar-mobile-cta"
            onClick={() => {
              setMenuOpen(false);
              if (isAuthenticated) {
                navigate('/app');
                return;
              }
              setRedirectIntent('/app');
              navigate('/signin');
            }}
          >
            Try Arena →
          </button>
        )}
      </div>
    </>
  );
}
