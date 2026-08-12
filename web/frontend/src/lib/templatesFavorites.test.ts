import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFavoriteTemplateIds,
  isFavoriteTemplateId,
  loadFavoriteTemplateIds,
  pickFavoriteTemplates,
  TEMPLATES_FAVORITES_KEY,
  TEMPLATES_FAVORITES_LIMIT,
  templatesFavoritesUseful,
  toggleFavoriteTemplateId,
} from './templatesFavorites';

describe('templatesFavorites', () => {
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

  it('stars most-recently-first and toggles off', () => {
    const [afterA, nowA] = toggleFavoriteTemplateId('a');
    expect(nowA).toBe(true);
    expect(afterA).toEqual(['a']);

    const [afterB, nowB] = toggleFavoriteTemplateId('b');
    expect(nowB).toBe(true);
    expect(afterB).toEqual(['b', 'a']);
    expect(loadFavoriteTemplateIds()).toEqual(['b', 'a']);

    const [afterOffA, nowOffA] = toggleFavoriteTemplateId('a');
    expect(nowOffA).toBe(false);
    expect(afterOffA).toEqual(['b']);
    expect(isFavoriteTemplateId('a')).toBe(false);

    const [afterReA, nowReA] = toggleFavoriteTemplateId('a');
    expect(nowReA).toBe(true);
    expect(afterReA).toEqual(['a', 'b']);
    expect(isFavoriteTemplateId('a')).toBe(true);
    expect(isFavoriteTemplateId('b')).toBe(true);
  });

  it('rejects empty ids without mutating storage', () => {
    toggleFavoriteTemplateId('x');
    const [next, starred] = toggleFavoriteTemplateId('  ');
    expect(starred).toBe(false);
    expect(next).toEqual(['x']);
    expect(loadFavoriteTemplateIds()).toEqual(['x']);
  });

  it('caps the list at the limit', () => {
    for (let i = 0; i < TEMPLATES_FAVORITES_LIMIT + 5; i += 1) {
      toggleFavoriteTemplateId(`t${i}`);
    }
    const ids = loadFavoriteTemplateIds();
    expect(ids.length).toBe(TEMPLATES_FAVORITES_LIMIT);
    expect(ids[0]).toBe(`t${TEMPLATES_FAVORITES_LIMIT + 4}`);
    expect(ids).not.toContain('t0');
  });

  it('clears favorites', () => {
    toggleFavoriteTemplateId('x');
    expect(clearFavoriteTemplateIds()).toEqual([]);
    expect(loadFavoriteTemplateIds()).toEqual([]);
    expect(templatesFavoritesUseful([])).toBe(false);
  });

  it('recovers from malformed storage', () => {
    window.localStorage.setItem(TEMPLATES_FAVORITES_KEY, '{not json');
    expect(loadFavoriteTemplateIds()).toEqual([]);

    window.localStorage.setItem(TEMPLATES_FAVORITES_KEY, JSON.stringify({ ids: ['ok', '', 5, 'ok'] }));
    expect(loadFavoriteTemplateIds()).toEqual(['ok']);
  });

  it('reads legacy plain-array storage', () => {
    window.localStorage.setItem(TEMPLATES_FAVORITES_KEY, JSON.stringify(['a', 'b', 'a']));
    expect(loadFavoriteTemplateIds()).toEqual(['a', 'b']);
  });

  it('picks only existing favorites in star order', () => {
    const items = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ];
    expect(
      pickFavoriteTemplates(items, ['gone', 'b', 'a'], 2).map((t) => t.id),
    ).toEqual(['b', 'a']);
    expect(pickFavoriteTemplates(items, ['gone'], 1)).toEqual([]);
    expect(pickFavoriteTemplates([], ['a'], 3)).toEqual([]);
  });

  it('templatesFavoritesUseful reflects non-empty lists', () => {
    expect(templatesFavoritesUseful(['a'])).toBe(true);
    expect(templatesFavoritesUseful([])).toBe(false);
  });
});
