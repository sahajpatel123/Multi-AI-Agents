import { useEffect, type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import MicroLoader from './MicroLoader';

interface ProtectedRouteProps {
  children: ReactElement;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const reduceMotion = prefersReducedMotion();

  useEffect(() => {
    if (loading || user) return;
    setRedirectIntent(`${location.pathname}${location.search}`);
  }, [loading, user, location.pathname, location.search]);

  if (loading) {
    return (
      <div
        className={[
          'auth-gate',
          reduceMotion ? 'auth-gate--static' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading session"
      >
        <div className="auth-gate__inner">
          <div className="auth-gate__brand" aria-hidden>
            <span className="auth-gate__dot" />
            <span className="auth-gate__wordmark">Arena</span>
          </div>
          <MicroLoader label="Checking your session" cycleWords={false} />
          <p className="auth-gate__hint">One moment while we confirm you&apos;re signed in…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return children;
}
