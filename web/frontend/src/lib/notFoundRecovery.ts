/** Pure recovery destinations for the branded 404 page. */

export type NotFoundAction = {
  id: string;
  label: string;
  path: string;
  /** Guest-only: set redirect intent before /signin when true. */
  requiresAuth?: boolean;
  /** Primary visual weight: primary | secondary | ghost */
  variant: 'primary' | 'secondary' | 'ghost';
};

/**
 * Sanitize a path for display (never render raw query injection noise).
 */
export function formatAttemptedPath(pathname: string, search = ''): string | null {
  const path = (pathname || '').split('?')[0].trim();
  if (!path || path === '/') return null;
  // Cap length; allow common URL path characters only
  const cleaned = path.replace(/[^\w\-./:@%]/g, '').slice(0, 120);
  if (!cleaned || cleaned === '/') return null;
  const q = (search || '').replace(/[^\w\-.=&%]/g, '').slice(0, 80);
  return q ? `${cleaned}?${q}` : cleaned;
}

/**
 * Recovery actions for guests vs signed-in users.
 * Home is always first; product CTAs follow auth state.
 */
export function notFoundActions(isAuthenticated: boolean): NotFoundAction[] {
  if (isAuthenticated) {
    return [
      { id: 'home', label: 'Back to home', path: '/', variant: 'primary' },
      { id: 'arena', label: 'Open Arena →', path: '/app', variant: 'secondary' },
      { id: 'agent', label: 'Agent Mode', path: '/agent', variant: 'ghost' },
      { id: 'watchlist', label: 'Watchlist', path: '/agent/watchlist', variant: 'ghost' },
    ];
  }
  return [
    { id: 'home', label: 'Back to home', path: '/', variant: 'primary' },
    {
      id: 'arena',
      label: 'Try Arena →',
      path: '/app',
      requiresAuth: true,
      variant: 'secondary',
    },
    { id: 'product', label: 'How it works', path: '/product', variant: 'ghost' },
  ];
}
