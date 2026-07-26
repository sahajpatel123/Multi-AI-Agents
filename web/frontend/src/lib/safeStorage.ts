/**
 * Safe wrappers around localStorage that swallow throws.
 *
 * localStorage can throw in:
 * - Private/incognito mode (some browsers).
 * - Quota exceeded.
 * - Enterprise storage-disable policies.
 * - Older Safari with "Block all cookies" enabled.
 *
 * The defensive pattern is to treat every read as best-effort
 * (returns null on throw) and every write/remove as fire-and-forget
 * (silently swallows). Callers can rely on the function returning
 * rather than crashing the calling component.
 *
 * Use these instead of `localStorage.x` directly in any code path
 * that runs on page load or in a user-interaction handler — a throw
 * there crashes the calling component's render path.
 */

export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode / quota / enterprise policy — silent */
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* silent */
    }
  },
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* silent */
    }
  },
  removeItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* silent */
    }
  },
};