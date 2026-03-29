import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { setRedirectIntent } from '../utils/redirectIntent';
import MicroLoader from './MicroLoader';

interface ProtectedRouteProps {
  children: ReactElement;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) return <MicroLoader />;

  if (!user) {
    setRedirectIntent(`${window.location.pathname}${window.location.search}`);
    return <Navigate to="/signin" replace />;
  }

  return children;
}
