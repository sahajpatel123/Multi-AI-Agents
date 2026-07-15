import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ORIGIN } from '../api';

type SystemStatus = 'checking' | 'operational' | 'degraded' | 'unreachable';

export function Footer() {
  const navigate = useNavigate();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);

    void fetch(`${API_ORIGIN}/api/health`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('health failed');
        const data = (await r.json()) as { status?: string; database?: string };
        if (cancelled) return;
        if (data.status === 'healthy') {
          setSystemStatus(
            data.database && data.database !== 'connected' ? 'degraded' : 'operational',
          );
        } else if (data.status === 'degraded') {
          setSystemStatus('degraded');
        } else {
          setSystemStatus('degraded');
        }
      })
      .catch(() => {
        if (!cancelled) setSystemStatus('unreachable');
      })
      .finally(() => {
        window.clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

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

  const statusLabel =
    systemStatus === 'operational'
      ? 'All systems operational'
      : systemStatus === 'degraded'
        ? 'Systems degraded'
        : systemStatus === 'unreachable'
          ? 'Status unavailable'
          : 'Checking status…';
  const statusColor =
    systemStatus === 'operational'
      ? '#8AA899'
      : systemStatus === 'degraded'
        ? '#C4956A'
        : systemStatus === 'unreachable'
          ? '#A89070'
          : '#C4A882';

  return (
    <footer
      style={{
        maxWidth: '1080px',
        margin: '5rem auto 0',
        padding: '0 24px',
        borderTop: '0.5px solid #E0D8D0',
        paddingTop: '2.5rem',
        paddingBottom: 'max(2rem, calc(1.5rem + env(safe-area-inset-bottom, 0px)))',
      }}
    >
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        .breathe { animation: breathe 2.4s ease-in-out infinite; }
        .breathe-slow { animation: breathe 3.2s ease-in-out infinite; }
      `}</style>

      <div className="footer-top" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
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

      </div>

      <div className="footer-bottom" style={{ borderTop: '0.5px solid #E0D8D0', marginTop: '1.5rem', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: '#6B6460' }}>© 2026 Arena. All rights reserved.</span>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          role="status"
          aria-live="polite"
          title={
            systemStatus === 'operational'
              ? 'API health check passed'
              : systemStatus === 'degraded'
                ? 'API reported degraded status'
                : systemStatus === 'unreachable'
                  ? 'Could not reach the API health endpoint'
                  : 'Checking API health'
          }
        >
          <div
            style={{ width: '5px', height: '5px', borderRadius: '50%', background: statusColor }}
            className={systemStatus === 'operational' || systemStatus === 'checking' ? 'breathe-slow' : undefined}
          />
          <span style={{ fontSize: '12px', color: statusColor }}>{statusLabel}</span>
        </div>
      </div>
    </footer>
  );
}
