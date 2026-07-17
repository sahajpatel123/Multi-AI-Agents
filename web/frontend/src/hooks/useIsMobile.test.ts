import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile, useIsSmallScreen, useMediaQuery } from './useIsMobile';

/**
 * Vitest doesn't ship with matchMedia. Build a controllable mock that
 * lets each test simulate viewport changes by calling the listeners
 * attached to a tracked mockMedia object. The mock also stores every
 * MQL object it has returned so fire() updates the live one the hook
 * captured — not a fresh mock object the hook can't see.
 */
type Listener = (e: { matches: boolean }) => void;
type MockMQL = {
  matches: boolean;
  media: string;
  onchange: null;
  addListener: (cb: Listener) => void;
  removeListener: (cb: Listener) => void;
  addEventListener: (_: string, cb: Listener) => void;
  removeEventListener: (_: string, cb: Listener) => void;
  dispatchEvent: () => boolean;
  _listeners: Set<Listener>;
};

function makeMql(query: string, initial: boolean): MockMQL {
  const listeners = new Set<Listener>();
  const mql: MockMQL = {
    matches: initial,
    media: query,
    onchange: null,
    addListener: (cb) => listeners.add(cb),
    removeListener: (cb) => listeners.delete(cb),
    addEventListener: (_, cb) => listeners.add(cb),
    removeEventListener: (_, cb) => listeners.delete(cb),
    dispatchEvent: () => false,
    _listeners: listeners,
  };
  return mql;
}

function installMatchMedia(initial: boolean) {
  const created: MockMQL[] = [];
  const matchMedia = vi.fn((query: string) => {
    const mql = makeMql(query, initial);
    created.push(mql);
    return mql;
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMedia,
  });
  const fire = (next: boolean) => {
    // Update the most-recently-created MQL — that's the one the hook
    // is currently subscribed to. Mutate its matches and notify.
    const target = created[created.length - 1];
    if (!target) return;
    target.matches = next;
    target._listeners.forEach((cb) => cb({ matches: next }));
  };
  return { fire, matchMedia };
}

afterEach(() => {
  // Reset to a no-op between tests so installMatchMedia isn't fighting
  // a previously installed mock.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

describe('useMediaQuery', () => {
  beforeEach(() => {
    installMatchMedia(false);
  });

  it('returns the initial matchMedia value', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 100px)'));
    expect(result.current).toBe(false);
  });

  it('updates when the media query fires a change event', () => {
    const { fire } = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 100px)'));
    expect(result.current).toBe(false);
    act(() => {
      fire(true);
    });
    expect(result.current).toBe(true);
  });

  it('removes the change listener on unmount', () => {
    const { fire } = installMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 100px)'));
    unmount();
    // After unmount, firing must not throw — the listener was removed.
    expect(() => fire(true)).not.toThrow();
  });

  it('re-syncs when the query argument changes', () => {
    const { matchMedia } = installMatchMedia(false);
    const { result, rerender } = renderHook(
      ({ q }) => useMediaQuery(q),
      { initialProps: { q: '(max-width: 100px)' } },
    );
    expect(result.current).toBe(false);
    // Rerender with a different query — matchMedia should be called again.
    rerender({ q: '(max-width: 200px)' });
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 200px)');
  });
});

describe('useIsMobile', () => {
  it('is true when initial viewport is mobile-sized', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('is false when initial viewport is desktop-sized', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when crossing the mobile breakpoint', () => {
    const { fire } = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => {
      fire(true);
    });
    expect(result.current).toBe(true);
  });
});

describe('useIsSmallScreen', () => {
  it('tracks the smaller breakpoint independently of useIsMobile', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsSmallScreen());
    expect(result.current).toBe(false);
  });
});