/**
 * Tests for the useBusyDocumentTitle hook.
 *
 * The hook overlays the document title while long-running work is in
 * flight (Arena stream / Agent pipeline stages) so the user can see
 * progress in the browser tab. The contract is:
 *   - busy=true  → apply absolute title (e.g. "Resolving… · Arena")
 *   - busy=false → apply the route's normal title via applyDocumentTitle
 *   - on unmount while busy → restore the route title (cleanup)
 *
 * Drift here means either:
 *   - the tab title stays stuck on the busy state after the work ends
 *     (annoying — users think something is still running), OR
 *   - the busy title never shows during a long run (silent failure of
 *     the progress UX).
 *
 * We pin the contract by mocking `lib/documentTitle` and observing the
 * helper calls triggered by mount, busy-flips, and unmount.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/documentTitle', () => ({
  applyAbsoluteDocumentTitle: vi.fn(),
  applyDocumentTitle: vi.fn(),
}));

import {
  applyAbsoluteDocumentTitle,
  applyDocumentTitle,
} from '../lib/documentTitle';
import { useBusyDocumentTitle } from './useBusyDocumentTitle';

const mockedApplyAbsolute = vi.mocked(applyAbsoluteDocumentTitle);
const mockedApplyRoute = vi.mocked(applyDocumentTitle);

beforeEach(() => {
  mockedApplyAbsolute.mockClear();
  mockedApplyRoute.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useBusyDocumentTitle', () => {
  it('applies the busy title on mount when busy=true', () => {
    renderHook(() => useBusyDocumentTitle(true, 'Resolving…', '/app'));
    expect(mockedApplyAbsolute).toHaveBeenCalledTimes(1);
    expect(mockedApplyAbsolute).toHaveBeenCalledWith('Resolving…');
    // Route title must NOT be applied while busy — that would clobber the
    // progress overlay before it ever shows.
    expect(mockedApplyRoute).not.toHaveBeenCalled();
  });

  it('applies the route title on mount when busy=false', () => {
    renderHook(() => useBusyDocumentTitle(false, 'Resolving…', '/app'));
    expect(mockedApplyAbsolute).not.toHaveBeenCalled();
    expect(mockedApplyRoute).toHaveBeenCalledTimes(1);
    expect(mockedApplyRoute).toHaveBeenCalledWith('/app');
  });

  it('swaps from busy to idle title when busy flips false', () => {
    const { rerender } = renderHook(
      ({ busy, title }: { busy: boolean; title: string }) =>
        useBusyDocumentTitle(busy, title, '/agent'),
      { initialProps: { busy: true, title: 'Planning…' } },
    );
    expect(mockedApplyAbsolute).toHaveBeenLastCalledWith('Planning…');
    expect(mockedApplyRoute).not.toHaveBeenCalled();

    rerender({ busy: false, title: 'Planning…' });
    // Now idle — must apply the route title.
    expect(mockedApplyRoute).toHaveBeenLastCalledWith('/agent');
  });

  it('swaps from idle to busy title when busy flips true', () => {
    const { rerender } = renderHook(
      ({ busy, title }: { busy: boolean; title: string }) =>
        useBusyDocumentTitle(busy, title, '/agent'),
      { initialProps: { busy: false, title: 'Solving…' } },
    );
    expect(mockedApplyAbsolute).not.toHaveBeenCalled();

    rerender({ busy: true, title: 'Solving…' });
    expect(mockedApplyAbsolute).toHaveBeenLastCalledWith('Solving…');
  });

  it('restores the route title on unmount while busy', () => {
    const { unmount } = renderHook(() =>
      useBusyDocumentTitle(true, 'Judging…', '/agent'),
    );
    expect(mockedApplyAbsolute).toHaveBeenCalledTimes(1);
    mockedApplyRoute.mockClear();

    unmount();
    // Cleanup must restore the route title so the tab returns to its
    // idle label after the work completes.
    expect(mockedApplyRoute).toHaveBeenCalledTimes(1);
    expect(mockedApplyRoute).toHaveBeenCalledWith('/agent');
  });

  it('re-applies the route title when busy flips false (no unmount needed)', () => {
    // Cleanup is also expected in the busy→idle flip path because the
    // previous effect's cleanup runs before the new effect's body.
    const { rerender } = renderHook(
      ({ busy }: { busy: boolean }) =>
        useBusyDocumentTitle(busy, 'Researching…', '/docs'),
      { initialProps: { busy: true } },
    );
    mockedApplyRoute.mockClear();

    rerender({ busy: false });
    expect(mockedApplyRoute).toHaveBeenCalledWith('/docs');
  });

  it('re-applies the busy title when the title prop changes while busy', () => {
    // Pipeline stages update the title (Planning → Researching → …).
    // The hook must re-apply so the tab title reflects current progress.
    const { rerender } = renderHook(
      ({ title }: { title: string }) =>
        useBusyDocumentTitle(true, title, '/agent'),
      { initialProps: { title: 'Planning…' } },
    );
    expect(mockedApplyAbsolute).toHaveBeenLastCalledWith('Planning…');

    rerender({ title: 'Researching…' });
    expect(mockedApplyAbsolute).toHaveBeenLastCalledWith('Researching…');

    rerender({ title: 'Solving…' });
    expect(mockedApplyAbsolute).toHaveBeenLastCalledWith('Solving…');
  });

  it('forwards the exact titleWhenBusy and restorePath strings', () => {
    renderHook(() => useBusyDocumentTitle(true, 'Custom Busy Title 42', '/custom/path'));
    expect(mockedApplyAbsolute).toHaveBeenCalledWith('Custom Busy Title 42');
    mockedApplyAbsolute.mockClear();

    const { rerender } = renderHook(
      ({ busy, restore }: { busy: boolean; restore: string }) =>
        useBusyDocumentTitle(busy, 'busy', restore),
      { initialProps: { busy: true, restore: '/initial' } },
    );
    rerender({ busy: false, restore: '/new-path' });
    expect(mockedApplyRoute).toHaveBeenLastCalledWith('/new-path');
  });
});
