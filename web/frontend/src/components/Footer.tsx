import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ORIGIN } from '../api';
import { interpretHealthPayload, type SystemStatus } from '../lib/healthStatus';
import { motionDuration, prefersReducedMotion } from '../lib/motion';

const HEALTH_POLL_MS = 45_000;

function statusCopy(status: SystemStatus): {
  label: string;
  title: string;
} {
  switch (status) {
    case 'operational':
      return {
        label: 'All systems operational',
        title: 'API health check passed',
      };
    case 'degraded':
      return {
        label: 'Systems degraded',
        title: 'API reported degraded status',
      };
    case 'unreachable':
      return {
        label: 'Status unavailable',
        title: 'Could not reach the API health endpoint',
      };
    default:
      return {
        label: 'Checking status…',
        title: 'Checking API health',
      };
  }
}

export function Footer() {
  const navigate = useNavigate();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('checking');
  const reducedMotion = prefersReducedMotion();
  const year = new Date().getFullYear();
  const { label: statusLabel, title: statusTitle } = statusCopy(systemStatus);
  const statusPulse =
    !reducedMotion &&
    (systemStatus === 'operational' || systemStatus === 'checking');

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

  const goHowItWorks = () => {
    navigate('/product');
  };

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__brand-block">
            <button
              type="button"
              className="site-footer__brand"
              onClick={() => navigate('/')}
              aria-label="Arena home"
            >
              <span
                className={`site-footer__brand-dot${reducedMotion ? '' : ' site-footer__brand-dot--breathe'}`}
                aria-hidden
              />
              <span className="site-footer__brand-name">Arena</span>
            </button>
            <p className="site-footer__tagline">
              Four minds. One question. The best answer wins.
            </p>
          </div>

          <nav className="site-footer__nav" aria-label="Footer">
            <div className="site-footer__col">
              <h4 className="site-footer__heading">Product</h4>
              <ul className="site-footer__list">
                <li>
                  <button type="button" className="site-footer__link" onClick={goHowItWorks}>
                    Product
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="site-footer__link"
                    onClick={() => navigate('/capabilities')}
                  >
                    Capabilities
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="site-footer__link"
                    onClick={() => navigate('/pricing')}
                  >
                    Pricing
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="site-footer__link"
                    onClick={() => navigate('/changelog')}
                  >
                    Changelog
                  </button>
                </li>
              </ul>
            </div>

            <div className="site-footer__col">
              <h4 className="site-footer__heading">Company</h4>
              <ul className="site-footer__list">
                <li>
                  <button
                    type="button"
                    className="site-footer__link"
                    onClick={() => navigate('/about')}
                  >
                    About
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="site-footer__link"
                    onClick={() => navigate('/terms')}
                  >
                    Terms
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    className="site-footer__link"
                    onClick={() => navigate('/privacy')}
                  >
                    Privacy
                  </button>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="site-footer__bottom">
          <span className="site-footer__copy">
            © {year} Arena. All rights reserved.
          </span>
          <div
            className={`site-footer__status site-footer__status--${systemStatus}`}
            role="status"
            aria-live="polite"
            title={statusTitle}
          >
            <span
              className={`site-footer__status-dot${statusPulse ? ' site-footer__status-dot--pulse' : ''}`}
              aria-hidden
            />
            <span className="site-footer__status-label">{statusLabel}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
