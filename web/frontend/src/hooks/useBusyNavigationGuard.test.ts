/**
 * Tests for the useBusyNavigationGuard hook.
 *
 * The hook registers a `beforeunload` handler while in-flight work is
 * running (Arena stream, Agent pipeline, Debate, Discuss). The browser
 * uses this to warn the user about losing progress on tab close / reload.
 *
 * Drift here means:
 *   - handler not registered while work is in flight → user closes tab
 *     silently and loses a long-running research run, OR
 *   - handler stays registered after work ends → every subsequent
 *     navigation warns the user for no reason.
 *
 * We pin the contract by spying on window.addEventListener /
 * removeEventListener and observing what the hook does on mount, busy
 * flips, and unmount.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBusyNavigationGuard } from './useBusyNavigationGuard';

const addSpy = vi.spyOn(window, 'addEventListener');
const removeSpy = vi.spyOn(window, 'removeEventListener');

beforeEach(() => {
  addSpy.mockClear();
  removeSpy.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

function beforeunloadCalls(spy: ReturnType<typeof vi.spyOn>): number {
  return spy.mock.calls.filter(([type]) => type === 'beforeunload').length;
}

describe('useBusyNavigationGuard', () => {
  it('registers a beforeunload listener when busy=true on mount', () => {
    renderHook(() => useBusyNavigationGuard(true));
    expect(beforeunloadCalls(addSpy)).toBe(1);
    expect(beforeunloadCalls(removeSpy)).toBe(0);
  });

  it('does NOT register a listener when busy=false on mount', () => {
    // shouldWarnOnLeave(busy=false) → false → early return, no listener
    renderHook(() => useBusyNavigationGuard(false));
    expect(beforeunloadCalls(addSpy)).toBe(0);
    expect(beforeunloadCalls(removeSpy)).toBe(0);
  });

  it('removes the listener on unmount while busy', () => {
    const { unmount } = renderHook(() => useBusyNavigationGuard(true));
    expect(beforeunloadCalls(addSpy)).toBe(1);
    unmount();
    expect(beforeunloadCalls(removeSpy)).toBe(1);
  });

  it('removes the listener when busy flips true → false', () => {
    const { rerender } = renderHook(
      ({ busy }: { busy: boolean }) => useBusyNavigationGuard(busy),
      { initialProps: { busy: true } },
    );
    expect(beforeunloadCalls(addSpy)).toBe(1);
    rerender({ busy: false });
    // Effect cleanup fires on rerender, removing the prior listener
    expect(beforeunloadCalls(removeSpy)).toBe(1);
  });

  it('registers a listener when busy flips false → true', () => {
    const { rerender } = renderHook(
      ({ busy }: { busy: boolean }) => useBusyNavigationGuard(busy),
      { initialProps: { busy: false } },
    );
    expect(beforeunloadCalls(addSpy)).toBe(0);
    rerender({ busy: true });
    expect(beforeunloadCalls(addSpy)).toBe(1);
  });

  it('re-registers a listener when the message prop changes while busy', () => {
    const { rerender } = renderHook(
      ({ message }: { message: string }) => useBusyNavigationGuard(true, message),
      { initialProps: { message: 'first' } },
    );
    expect(beforeunloadCalls(addSpy)).toBe(1);
    rerender({ message: 'second' });
    // The effect re-runs because `message` is in the dep array; the
    // prior listener is removed and a fresh one is registered.
    expect(beforeunloadCalls(removeSpy)).toBe(1);
    expect(beforeunloadCalls(addSpy)).toBe(2);
  });

  it('uses the default message when no message prop is provided', () => {
    renderHook(() => useBusyNavigationGuard(true));
    const [[, handler]] = addSpy.mock.calls.filter(([t]) => t === 'beforeunload');
    expect(typeof handler).toBe('function');
    // Fire the handler with a fake event and assert it sets returnValue
    // (Chromium requires returnValue for the dialog to show).
    const event = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
    (handler as (e: BeforeUnloadEvent) => void)(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue.length).toBeGreaterThan(0);
  });

  it('forwards the custom message to the handler', () => {
    renderHook(() => useBusyNavigationGuard(true, 'Run will be cancelled'));
    const [[, handler]] = addSpy.mock.calls.filter(([t]) => t === 'beforeunload');
    const event = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
    (handler as (e: BeforeUnloadEvent) => string | undefined)(event);
    expect(event.returnValue).toBe('Run will be cancelled');
  });
});
