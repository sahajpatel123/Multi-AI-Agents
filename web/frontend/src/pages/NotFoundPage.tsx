import { useEffect, useState } from 'react';
import { Compass, Copy, Check } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Button } from '../components/Button';
import { MotionButton } from '../components/MotionButton';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { motionDuration, prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import { formatAttemptedPath, notFoundActions } from '../lib/notFoundRecovery';

export function NotFoundPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const attempted = formatAttemptedPath(location.pathname, location.search);
  const actions = notFoundActions(isAuthenticated);
  const [copied, setCopied] = useState(false);
  const reduceMotion = prefersReducedMotion();

  useEffect(() => {
    if (!copied) return;
    const hold = motionDuration(1800);
    if (hold <= 0) {
      setCopied(false);
      return;
    }
    const t = window.setTimeout(() => setCopied(false), hold);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopyPath = async () => {
    if (!attempted) return;
    const ok = await copyToClipboard(attempted);
    if (ok) setCopied(true);
  };

  return (
    <div className="not-found-page">
      <div className="not-found-page__orbs" aria-hidden="true">
        <div className="not-found-page__orb not-found-page__orb--a" />
        <div className="not-found-page__orb not-found-page__orb--b" />
      </div>
      <Navbar />
      <main
        id="main-content"
        className={`not-found-main${reduceMotion ? '' : ' page-enter'}`}
        tabIndex={-1}
        aria-labelledby="not-found-title"
      >
        <div className="not-found-card">
          <span className="not-found-card__watermark" aria-hidden="true">
            404
          </span>

          <div className="not-found-mark" aria-hidden>
            <span className="not-found-mark__glow" />
            <Compass className="not-found-mark__icon" width={28} height={28} strokeWidth={1.5} />
          </div>

          <p className="not-found-kicker">
            <span className="not-found-kicker__dot" aria-hidden="true" />
            404 · Lost path
          </p>
          <h1 id="not-found-title" className="not-found-title">
            This page isn&apos;t in the arena
          </h1>
          <p className="not-found-body">
            The link may be old, mistyped, or the take was never shared. Head back to something
            real.
          </p>

          <div className="not-found-minds" aria-hidden="true">
            <span className="not-found-minds__label">Still four minds</span>
            <div className="not-found-minds__dots">
              <span className="not-found-minds__dot" />
              <span className="not-found-minds__dot" />
              <span className="not-found-minds__dot" />
              <span className="not-found-minds__dot" />
            </div>
          </div>

          {attempted ? (
            <div className="not-found-path">
              <div className="not-found-path__meta">
                <span className="not-found-path__label">Requested</span>
                <code className="not-found-path__value" title={attempted}>
                  {attempted}
                </code>
              </div>
              <button
                type="button"
                className={`not-found-path__copy${copied ? ' is-copied' : ''}`}
                onClick={() => void handleCopyPath()}
                aria-label={copied ? 'Path copied' : 'Copy requested path'}
              >
                {copied ? (
                  <Check width={14} height={14} aria-hidden />
                ) : (
                  <Copy width={14} height={14} aria-hidden />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          ) : (
            <div className="not-found-path not-found-path--empty" aria-hidden />
          )}

          <div className="not-found-actions" role="group" aria-label="Recovery options">
            {actions.map((action) => {
              const go = () => {
                if (action.requiresAuth && !isAuthenticated) {
                  setRedirectIntent(action.path);
                  navigate('/signin');
                  return;
                }
                navigate(action.path);
              };
              // Primary recovery CTA gets spring MotionButton; denser secondary
              // stack keeps plain Button so hover scales don't compete.
              if (action.variant === 'primary') {
                return (
                  <MotionButton
                    key={action.id}
                    type="button"
                    variant="primary"
                    size="md"
                    fullWidth
                    onClick={go}
                  >
                    {action.label}
                  </MotionButton>
                );
              }
              return (
                <Button
                  key={action.id}
                  type="button"
                  variant={action.variant}
                  size="md"
                  fullWidth
                  onClick={go}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>

          <p className="not-found-hint">
            Tip: start from Home or jump straight into a fresh Arena run.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
