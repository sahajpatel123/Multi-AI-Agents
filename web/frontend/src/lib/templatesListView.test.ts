import { describe, expect, it } from 'vitest';
import { templatesListBodyMode } from './templatesListView';

describe('templatesListBodyMode', () => {
  it('distinguishes loading, error, empty, and list', () => {
    expect(templatesListBodyMode({ loading: true, loadFailed: false, itemCount: 0 })).toBe(
      'loading',
    );
    expect(templatesListBodyMode({ loading: false, loadFailed: true, itemCount: 0 })).toBe(
      'load_error',
    );
    expect(templatesListBodyMode({ loading: false, loadFailed: false, itemCount: 0 })).toBe(
      'empty',
    );
    expect(templatesListBodyMode({ loading: false, loadFailed: false, itemCount: 3 })).toBe(
      'list',
    );
  });

  it('keeps list mode when items exist even if a later load fails', () => {
    expect(templatesListBodyMode({ loading: false, loadFailed: true, itemCount: 2 })).toBe(
      'list',
    );
  });
});
