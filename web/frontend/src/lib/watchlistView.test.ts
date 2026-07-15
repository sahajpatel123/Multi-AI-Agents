import { describe, expect, it } from 'vitest';
import { watchlistBodyMode } from './watchlistView';

describe('watchlistBodyMode', () => {
  it('prefers loading over error and empty', () => {
    expect(watchlistBodyMode({ loading: true, loadFailed: true, itemCount: 0 })).toBe('loading');
    expect(watchlistBodyMode({ loading: true, loadFailed: false, itemCount: 3 })).toBe('loading');
  });

  it('shows load error instead of empty when the fetch failed', () => {
    expect(watchlistBodyMode({ loading: false, loadFailed: true, itemCount: 0 })).toBe('load_error');
  });

  it('shows empty only when load succeeded with zero items', () => {
    expect(watchlistBodyMode({ loading: false, loadFailed: false, itemCount: 0 })).toBe('empty');
  });

  it('shows the list when items are present', () => {
    expect(watchlistBodyMode({ loading: false, loadFailed: false, itemCount: 2 })).toBe('list');
    // Failed refresh that still has prior items should keep the list (caller passes loadFailed false for soft errors)
    expect(watchlistBodyMode({ loading: false, loadFailed: false, itemCount: 1 })).toBe('list');
  });
});
