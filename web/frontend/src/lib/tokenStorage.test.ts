import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from './tokenStorage';

const ACCESS_KEY = 'arena_access_token';
const REFRESH_KEY = 'arena_refresh_token';

describe('tokenStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no tokens are stored', () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('round-trips tokens through localStorage', () => {
    setTokens('access-123', 'refresh-456');
    expect(getAccessToken()).toBe('access-123');
    expect(getRefreshToken()).toBe('refresh-456');
    expect(localStorage.getItem(ACCESS_KEY)).toBe('access-123');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-456');
  });

  it('clearTokens removes both keys', () => {
    setTokens('a', 'b');
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('setTokens overwrites previous values', () => {
    setTokens('old-a', 'old-b');
    setTokens('new-a', 'new-b');
    expect(getAccessToken()).toBe('new-a');
    expect(getRefreshToken()).toBe('new-b');
  });

  it('survives localStorage throws on set/get/clear (cycle 383)', () => {
    // Private mode, quota exceeded, and enterprise storage-disable
    // policies all throw inside localStorage. Token ops must NOT
    // bubble — otherwise the apiFetch refresh round-trip crashes
    // mid-flight and the user is stuck in a 401 loop with a freshly
    // rotated token that never made it to disk.
    const setSpy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    const getSpy = vi
      .spyOn(window.localStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    const removeSpy = vi
      .spyOn(window.localStorage, 'removeItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    try {
      // setTokens swallows the throw.
      expect(() => setTokens('a', 'b')).not.toThrow();
      // Reads return null instead of bubbling.
      expect(getAccessToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
      // clearTokens swallows the throw.
      expect(() => clearTokens()).not.toThrow();
    } finally {
      setSpy.mockRestore();
      getSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});