import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfileModal } from '../context/ProfileModalContext';
import { setRedirectIntent } from '../utils/redirectIntent';

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

  const isActive = (path: string) => location.pathname === path;
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
            <button type="button" className="navbar-brand" onClick={() => navigate('/')}>
              <span className="navbar-brand-dot" aria-hidden />
              <span className="navbar-brand-text">Arena</span>
            </button>

            <div className="navbar-nav-links" aria-label="Primary navigation">
              <button
                type="button"
                className={`navbar-nav-link${isActive('/product') ? ' navbar-nav-link--active' : ''}`}
                onClick={() => navigate('/product')}
              >
                Product
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
            </div>

            {!isAuthenticated ? (
              <div className="navbar-auth">
                <button
                  type="button"
                  className="navbar-hamburger"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Open navigation menu"
                >
                  <span style={{ fontSize: '20px', lineHeight: 1, color: '#1A1714' }}>☰</span>
                </button>
                <button type="button" className="navbar-signin-link" onClick={() => {
                  setRedirectIntent('/');
                  navigate('/signin');
                }}>
                  Sign in
                </button>
                <button type="button" className="navbar-cta-pill" onClick={() => {
                  if (isAuthenticated) {
                    navigate('/app');
                    return;
                  }
                  setRedirectIntent('/arena');
                  navigate('/signin');
                }}>
                  Try Arena →
                </button>
              </div>
            ) : (
              <div ref={menuRef} className="navbar-auth" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="navbar-hamburger"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Open navigation menu"
                >
                  <span style={{ fontSize: '20px', lineHeight: 1, color: '#1A1714' }}>☰</span>
                </button>
                <button
                  type="button"
                  className="desktop-only"
                  onClick={() => openModal('top-right')}
                  aria-label="Profile and settings"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#C4956A',
                    color: '#FAF7F2',
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1.5px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#C4956A';
                    e.currentTarget.style.background = '#B8845A';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.background = '#C4956A';
                  }}
                >
                  {profileInitials}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="navbar-divider-line" aria-hidden />
      </nav>

      {menuOpen && <div className="mobile-only navbar-mobile-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <div
        ref={mobilePanelRef}
        className={`mobile-only navbar-mobile-panel${menuOpen ? ' open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
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
              background: '#F0EBE3',
              color: '#1A1714',
              fontSize: '20px',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            { label: 'Product', path: '/product' },
            { label: 'Pricing', path: '/pricing' },
            { label: 'About', path: '/about' },
          ].map((item) => (
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
          {isAuthenticated && (
            <>
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
              setRedirectIntent('/arena');
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
