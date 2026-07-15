const INTENT_KEY = 'arena_post_auth_redirect';

/** Canonical post-auth home when no deep-link was requested. */
export const DEFAULT_REDIRECT_INTENT = '/app';

/**
 * Only same-app relative paths are allowed (open-redirect hardening).
 * Rejects protocol-relative (`//evil.com`), absolute URLs, and backslash tricks.
 */
export function isSafeRedirectPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  const p = path.trim();
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//')) return false;
  if (p.includes('\\')) return false;
  if (p.includes('://')) return false;
  if (/[\u0000-\u001F\u007F]/.test(p)) return false;
  // Block encoded tricks that still resolve off-site in some browsers
  const lower = p.toLowerCase();
  if (lower.includes('javascript:') || lower.includes('data:')) return false;
  return true;
}

/**
 * Canonicalize legacy aliases so post-auth never lands on a redirect hop.
 * `/arena` is an alias of `/app` (see router Navigate).
 */
export function normalizeRedirectPath(path: string): string {
  const raw = (path || '').trim();
  if (!raw) return DEFAULT_REDIRECT_INTENT;
  const qIndex = raw.indexOf('?');
  const base = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const qs = qIndex >= 0 ? raw.slice(qIndex) : '';
  if (base === '/arena' || base === '/arena/') return `/app${qs}`;
  return raw;
}

export function setRedirectIntent(path: string): void {
  if (!isSafeRedirectPath(path)) return;
  try {
    sessionStorage.setItem(INTENT_KEY, normalizeRedirectPath(path.trim()));
  } catch {
    /* private mode / quota */
  }
}

export function getRedirectIntent(): string {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (raw && isSafeRedirectPath(raw)) return normalizeRedirectPath(raw.trim());
  } catch {
    /* ignore */
  }
  return DEFAULT_REDIRECT_INTENT;
}

export function clearRedirectIntent(): void {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Human label for where post-auth navigation will land. */
export function describeRedirectDestination(path: string): string {
  const base = (path || DEFAULT_REDIRECT_INTENT).split('?')[0] || DEFAULT_REDIRECT_INTENT;
  if (base === '/app' || base === '/arena') return 'Arena';
  if (base === '/agent') return 'Agent Mode';
  if (base.startsWith('/agent/watchlist')) return 'Watchlist';
  if (base === '/personas') return 'your panel';
  if (base === '/pricing') return 'Pricing';
  if (base === '/account') return 'your account';
  if (base.startsWith('/room/')) return 'the shared room';
  if (base === '/product') return 'Product';
  return 'where you left off';
}
