/** Browser tab titles for primary Arena routes. */

const BRAND = 'Arena';

/**
 * Map a location pathname to a document title.
 * Pure — safe to unit test without the DOM.
 */
export function titleForPath(pathname: string): string {
  const path = (pathname || '/').split('?')[0].replace(/\/$/, '') || '/';

  switch (path) {
    case '/':
      return `${BRAND} — Four minds. One question.`;
    case '/app':
    case '/arena':
      return `Arena panel · ${BRAND}`;
    case '/agent':
      return `Agent Mode · ${BRAND}`;
    case '/agent/watchlist':
      return `Watchlist · ${BRAND}`;
    case '/personas':
      return `Personas · ${BRAND}`;
    case '/pricing':
      return `Pricing · ${BRAND}`;
    case '/product':
      return `Product · ${BRAND}`;
    case '/about':
      return `About · ${BRAND}`;
    case '/signin':
      return `Sign in · ${BRAND}`;
    case '/changelog':
      return `Changelog · ${BRAND}`;
    case '/privacy':
      return `Privacy · ${BRAND}`;
    case '/terms':
      return `Terms · ${BRAND}`;
    case '/account':
      return `Account · ${BRAND}`;
    case '/share':
      return `Shared take · ${BRAND}`;
    default:
      if (path.startsWith('/room/')) return `Room · ${BRAND}`;
      if (path.startsWith('/agent/')) return `Agent · ${BRAND}`;
      return BRAND;
  }
}

export function applyDocumentTitle(pathname: string): void {
  if (typeof document === 'undefined') return;
  document.title = titleForPath(pathname);
}
