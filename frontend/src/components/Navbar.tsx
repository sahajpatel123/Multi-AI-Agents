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
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  const isActive = (path: string) => location.pathname === path;
  const avatarLabel = (user?.email?.trim().charAt(0) || 'A').toUpperCase();

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: scrolled ? '#FAF7F4' : 'transparent',
        borderBottom: scrolled ? '1px solid #E0D8D0' : '1px solid transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        transition: 'all 300ms ease',
        animation: 'fadeUp 500ms ease forwards',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <button
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4956A' }} className="breathe" />
            <span style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714' }}>Arena</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
            <button
              onClick={() => navigate('/product')}
              style={{
                fontSize: '13px',
                color: isActive('/product') ? '#1A1714' : '#6B6460',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'}
              onMouseLeave={(e) => e.currentTarget.style.color = isActive('/product') ? '#1A1714' : '#6B6460'}
            >
              Product
            </button>
            <button
              onClick={() => navigate('/pricing')}
              style={{
                fontSize: '13px',
                color: isActive('/pricing') ? '#1A1714' : '#6B6460',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'}
              onMouseLeave={(e) => e.currentTarget.style.color = isActive('/pricing') ? '#1A1714' : '#6B6460'}
            >
              Pricing
            </button>
            <button
              onClick={() => navigate('/about')}
              style={{
                fontSize: '13px',
                color: isActive('/about') ? '#1A1714' : '#6B6460',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'}
              onMouseLeave={(e) => e.currentTarget.style.color = isActive('/about') ? '#1A1714' : '#6B6460'}
            >
              About
            </button>
          </div>

          {!isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={() => navigate('/signin')}
                style={{
                  fontSize: '13px',
                  color: '#6B6460',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'color 150ms',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}
              >
                Sign in
              </button>
              <button
                onClick={() => navigate('/app')}
                style={{
                  fontSize: '12px',
                  padding: '7px 18px',
                  borderRadius: '999px',
                  background: '#1A1714',
                  color: '#FAF7F4',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Try Arena →
              </button>
            </div>
          ) : (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#F0EBE3',
                  color: '#1A1714',
                  fontSize: '13px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1.5px solid #E0D8D0',
                  cursor: 'pointer',
                }}
              >
                {avatarLabel}
              </button>

              {menuOpen && (
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 16px rgba(26,23,20,0.08)',
                    padding: '6px',
                    minWidth: '160px',
                    position: 'absolute',
                    right: 0,
                    top: '40px',
                    zIndex: 100,
                  }}
                >
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
      <div style={{ height: '0.5px', background: '#E0D8D0' }} />
    </nav>
  );
}
