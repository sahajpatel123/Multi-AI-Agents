import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeLocalStorage, safeSessionStorage } from './safeStorage';

describe('safeLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips values through the underlying localStorage', () => {
    safeLocalStorage.setItem('k', 'v');
    expect(safeLocalStorage.getItem('k')).toBe('v');
    expect(localStorage.getItem('k')).toBe('v');
    safeLocalStorage.removeItem('k');
    expect(safeLocalStorage.getItem('k')).toBeNull();
  });

  it('returns null on getItem throw (cycle 386)', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(safeLocalStorage.getItem('k')).toBeNull();
  });

  it('swallows setItem throws', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => safeLocalStorage.setItem('k', 'v')).not.toThrow();
  });

  it('swallows removeItem throws', () => {
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => safeLocalStorage.removeItem('k')).not.toThrow();
  });
});

describe('safeSessionStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips values through the underlying sessionStorage', () => {
    safeSessionStorage.setItem('k', 'v');
    expect(safeSessionStorage.getItem('k')).toBe('v');
    safeSessionStorage.removeItem('k');
    expect(safeSessionStorage.getItem('k')).toBeNull();
  });

  it('returns null on getItem throw', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(safeSessionStorage.getItem('k')).toBeNull();
  });

  it('swallows setItem + removeItem throws', () => {
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(window.sessionStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => safeSessionStorage.setItem('k', 'v')).not.toThrow();
    expect(() => safeSessionStorage.removeItem('k')).not.toThrow();
  });
});