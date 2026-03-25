import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { setRedirectIntent } from '../utils/redirectIntent';
import MicroLoader from './MicroLoader';

interface ProtectedRouteProps {
  children: ReactElement;
}

/**
 * Central auth gate: wait for session check, then allow render or redirect to sign-in.
 * Add new protected routes only here in `main.tsx` — not inside page components.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#F5F0E8',
        }}
      >
        <MicroLoader />
      </div>
    );
  }

  if (!user) {
    setRedirectIntent(location.pathname);
    return <Navigate to="/signin" replace />;
  }

  return children;
}
