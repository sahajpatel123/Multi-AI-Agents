import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (path: string) => location.pathname === path;

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
        </div>
      </div>
      <div style={{ height: '0.5px', background: '#E0D8D0' }} />
    </nav>
  );
}
