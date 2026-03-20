import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
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
  const avatarLabel = (user?.email?.trim().charAt(0) || 'A').toUpperCase();

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
                <button type="button" className="navbar-signin-link" onClick={() => navigate('/signin')}>
                  Sign in
                </button>
                <button type="button" className="navbar-cta-pill" onClick={() => navigate('/app')}>
                  Try Arena →
                </button>
              </div>
            ) : (
              <div ref={menuRef} className="navbar-auth" style={{ position: 'relative' }}>
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
                  className="navbar-user-avatar"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                >
                  {avatarLabel}
                </button>

                {menuOpen && (
                  <div className="navbar-user-dropdown">
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#6B6460',
                        padding: '8px 12px',
                        borderBottom: '0.5px solid #F0EBE3',
                      }}
                    >
                      {user?.email}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/personas');
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        fontSize: '13px',
                        color: '#1A1714',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F0EBE3';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      My Panel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/account');
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        fontSize: '13px',
                        color: '#1A1714',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F0EBE3';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      Subscription
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuOpen(false);
                        await logout();
                        navigate('/');
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        fontSize: '13px',
                        color: '#1A1714',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F0EBE3';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
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
                  navigate('/account');
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
              navigate('/app');
            }}
          >
            Try Arena →
          </button>
        )}
      </div>
    </>
  );
}
