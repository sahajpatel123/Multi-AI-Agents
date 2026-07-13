import { describe, it, expect, beforeEach } from 'vitest';
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
});