import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ORIGIN } from '../api';
import { interpretHealthPayload, type SystemStatus } from '../lib/healthStatus';
import { motionDuration, motionTransition, prefersReducedMotion, scrollBehavior } from '../lib/motion';

const HEALTH_POLL_MS = 45_000;

export function Footer() {
  const navigate = useNavigate();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('checking');
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    let abortController: AbortController | null = null;

    const probe = () => {
      abortController?.abort();
      const controller = new AbortController();
      abortController = controller;
      const timer = window.setTimeout(() => controller.abort(), 4000);

      void fetch(`${API_ORIGIN}/api/health`, { signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error('health failed');
          const data = (await r.json()) as { status?: string; database?: string };
          if (!cancelled) setSystemStatus(interpretHealthPayload(data));
        })
        .catch(() => {
          if (!cancelled) setSystemStatus('unreachable');
        })
        .finally(() => {
          window.clearTimeout(timer);
        });
    };

    probe();
    const intervalMs = motionDuration(HEALTH_POLL_MS);
    const intervalId =
      intervalMs > 0 ? window.setInterval(probe, intervalMs) : undefined;

    return () => {
      cancelled = true;
      abortController?.abort();
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  const scrollToHowItWorks = () => {
    const behavior = scrollBehavior();
    if (window.location.pathname === '/') {
      document.getElementById('how-it-works')?.scrollIntoView({ behavior });
    } else {
      navigate('/');
      window.setTimeout(() => {
        document.getElementById('how-it-works')?.scrollIntoView({ behavior: scrollBehavior() });
      }, reducedMotion ? 0 : 100);
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

  const linkStyle: CSSProperties = {
    display: 'block',
    fontSize: '13px',
    color: '#6B6460',
    marginBottom: '.35rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
    transition: motionTransition('color', 150),
  };

  const onLinkEnter = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = '#1A1714';
  };
  const onLinkLeave = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = '#6B6460';
  };

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
      {!reducedMotion ? (
        <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        .breathe { animation: breathe 2.4s ease-in-out infinite; }
        .breathe-slow { animation: breathe 3.2s ease-in-out infinite; }
      `}</style>
      ) : null}

      <div className="footer-top" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
        <div>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '.8rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div
              style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4956A' }}
              className={reducedMotion ? undefined : 'breathe'}
            />
            <span style={{ fontSize: '16px', fontWeight: 500, color: '#1A1714' }}>Arena</span>
          </button>
          <p style={{ fontSize: '12px', color: '#6B6460', lineHeight: 1.7 }}>Four minds. One question. The best answer wins.</p>
        </div>

        <div>
          <h4 style={{ fontSize: '11px', fontWeight: 500, color: '#1A1714', marginBottom: '.8rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>Product</h4>
          <button type="button" onClick={scrollToHowItWorks} style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>How it works</button>
          <button type="button" onClick={() => navigate('/pricing')} style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>Pricing</button>
          <button type="button" onClick={() => navigate('/changelog')} style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>Changelog</button>
        </div>

        <div>
          <h4 style={{ fontSize: '11px', fontWeight: 500, color: '#1A1714', marginBottom: '.8rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>Company</h4>
          <button type="button" onClick={() => navigate('/about')} style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>About</button>
          <button type="button" onClick={() => navigate('/terms')} style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>Terms</button>
          <button type="button" onClick={() => navigate('/privacy')} style={linkStyle} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>Privacy</button>
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
            className={
              !reducedMotion && (systemStatus === 'operational' || systemStatus === 'checking')
                ? 'breathe-slow'
                : undefined
            }
          />
          <span style={{ fontSize: '12px', color: statusColor }}>{statusLabel}</span>
        </div>
      </div>
    </footer>
  );
}
