const ACCESS_KEY = 'arena_access_token';
const REFRESH_KEY = 'arena_refresh_token';

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setTokens(access: string, refresh: string): void {
  try {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // localStorage can throw in private mode, with quota exceeded, or
    // when storage is disabled by enterprise policy. The tokens
    // survive only in memory until the next page load — but the
    // refresh round-trip just succeeded, so the in-memory caller
    // (`apiFetch`) will retry the request with the new token.
    // Silent here on purpose; surface via session-expired modal if
    // storage remains broken across navigations.
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}
