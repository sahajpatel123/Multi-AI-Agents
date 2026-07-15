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

export function setRedirectIntent(path: string): void {
  if (!isSafeRedirectPath(path)) return;
  try {
    sessionStorage.setItem(INTENT_KEY, path.trim());
  } catch {
    /* private mode / quota */
  }
}

export function getRedirectIntent(): string {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (raw && isSafeRedirectPath(raw)) return raw.trim();
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
