import { useNavigate } from 'react-router-dom';

export function Footer() {
  const navigate = useNavigate();

  const scrollToHowItWorks = () => {
    if (window.location.pathname === '/') {
      document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/');
      setTimeout(() => {
        document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  return (
    <footer style={{ maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px', borderTop: '0.5px solid #E0D8D0', paddingTop: '2.5rem', paddingBottom: '2rem' }}>
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        .breathe { animation: breathe 2.4s ease-in-out infinite; }
        .breathe-slow { animation: breathe 3.2s ease-in-out infinite; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
        <div>
          <button
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '.8rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4956A' }} className="breathe" />
            <span style={{ fontSize: '16px', fontWeight: 500, color: '#1A1714' }}>Arena</span>
          </button>
          <p style={{ fontSize: '12px', color: '#6B6460', lineHeight: 1.7 }}>Four minds. One question. The best answer wins.</p>
        </div>

        <div>
          <h4 style={{ fontSize: '11px', fontWeight: 500, color: '#1A1714', marginBottom: '.8rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>Product</h4>
          <button onClick={scrollToHowItWorks} style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>How it works</button>
          <button onClick={() => navigate('/pricing')} style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>Pricing</button>
          <button onClick={() => navigate('/changelog')} style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>Changelog</button>
        </div>

        <div>
          <h4 style={{ fontSize: '11px', fontWeight: 500, color: '#1A1714', marginBottom: '.8rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>Company</h4>
          <button onClick={() => navigate('/about')} style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>About</button>
          <button onClick={() => navigate('/terms')} style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>Terms</button>
          <button onClick={() => navigate('/privacy')} style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>Privacy</button>
        </div>

        <div>
          <h4 style={{ fontSize: '11px', fontWeight: 500, color: '#1A1714', marginBottom: '.8rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>Connect</h4>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', textDecoration: 'none', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>X / Twitter</a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', textDecoration: 'none', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>GitHub</a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '13px', color: '#6B6460', marginBottom: '.35rem', textDecoration: 'none', transition: 'color 150ms' }} onMouseEnter={(e) => e.currentTarget.style.color = '#1A1714'} onMouseLeave={(e) => e.currentTarget.style.color = '#6B6460'}>LinkedIn</a>
        </div>
      </div>

      <div style={{ borderTop: '0.5px solid #E0D8D0', marginTop: '1.5rem', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: '#6B6460' }}>© 2026 Arena. All rights reserved.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#8AA899' }} className="breathe-slow" />
          <span style={{ fontSize: '12px', color: '#8AA899' }}>All systems operational</span>
        </div>
        <span style={{ fontSize: '12px', color: '#6B6460' }}>Built by Sahaj Patel</span>
      </div>
    </footer>
  );
}
