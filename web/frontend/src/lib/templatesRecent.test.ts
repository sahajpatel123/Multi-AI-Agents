import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentTemplateIds,
  loadRecentTemplateIds,
  orderTemplatesByRecentIds,
  pickRecentTemplates,
  recordRecentTemplateId,
  templatesRecentUseful,
} from './templatesRecent';

describe('templatesRecent', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    // isBrowser checks window.localStorage
    vi.stubGlobal('window', { localStorage: globalThis.localStorage });
  });

  it('records newest first and dedupes', () => {
    expect(recordRecentTemplateId('a')).toEqual(['a']);
    expect(recordRecentTemplateId('b')).toEqual(['b', 'a']);
    expect(recordRecentTemplateId('a')).toEqual(['a', 'b']);
    expect(loadRecentTemplateIds()).toEqual(['a', 'b']);
  });

  it('clears history', () => {
    recordRecentTemplateId('x');
    expect(clearRecentTemplateIds()).toEqual([]);
    expect(loadRecentTemplateIds()).toEqual([]);
  });

  it('orders catalog by recent rank', () => {
    const items = [
      { id: 'c', title: 'C' },
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ];
    expect(orderTemplatesByRecentIds(items, ['b', 'a']).map((t) => t.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('picks only existing recent templates', () => {
    const items = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ];
    expect(pickRecentTemplates(items, ['gone', 'b', 'a', 'b'], 2).map((t) => t.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('useful when any recents', () => {
    expect(templatesRecentUseful([])).toBe(false);
    expect(templatesRecentUseful(['x'])).toBe(true);
  });
});
