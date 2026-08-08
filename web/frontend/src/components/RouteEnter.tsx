import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Remounts `.page-enter` on every pathname change so route transitions
 * re-play the soft enter animation. App shells use a quieter variant so
 * streaming / dense UI does not fight a full marketing fade.
 */
export function RouteEnter({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const quiet =
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname.startsWith('/agent') ||
    pathname.startsWith('/account') ||
    pathname.startsWith('/room/');

  return (
    <div
      key={pathname}
      className={quiet ? 'page-enter page-enter--quiet' : 'page-enter'}
    >
      {children}
    </div>
  );
}
