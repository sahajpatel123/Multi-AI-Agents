const INTENT_KEY = 'arena_post_auth_redirect';

export function setRedirectIntent(path: string): void {
  sessionStorage.setItem(INTENT_KEY, path);
}

export function getRedirectIntent(): string {
  return sessionStorage.getItem(INTENT_KEY) || '/arena';
}

export function clearRedirectIntent(): void {
  sessionStorage.removeItem(INTENT_KEY);
}
