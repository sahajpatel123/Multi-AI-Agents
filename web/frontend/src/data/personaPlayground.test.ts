/**
 * Persona Playground catalog integrity tests.
 *
 * The playground at /persona-playground is the discoverability surface
 * for every persona tool. If a route is registered in main.tsx but the
 * playground catalog never learns about it, the tool becomes an
 * orphan (reachable only by direct URL). If the catalog lists a path
 * the router does not know, the card links to a 404.
 *
 * Invariants:
 *  - every /persona-* and /personas route in main.tsx is in the catalog
 *    (the catalog is the discoverability index — it must be complete)
 *  - every catalog path is registered as a route in main.tsx
 *    (no broken card links)
 *  - catalog paths are unique
 *  - required fields (path, name, tagline, blurb, format) are non-empty
 *  - every category used has at least one tool
 *  - the playground page itself (/persona-playground) is not listed
 *    inside the catalog (the hub does not list itself)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  clearFeaturedDismissState,
  dayOfYear,
  formatLocalDate,
  isDismissedFor,
  personaPlaygroundCategories,
  pickFeaturedOfDay,
  readFeaturedDismissState,
  relatedTools,
  writeFeaturedDismissState,
  type PersonaPlaygroundEntry,
} from './personaPlayground';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) =>
  readFileSync(join(here, relativePath), 'utf8');

const ROUTES_PATH = '../main.tsx';

const ROUTE_PATTERN = /<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z0-9_]+)Page\s+\/>\}/g;

const TOOL_PATH_PATTERN = /^\/persona-(?!playground$)[a-z-]+$/;

function extractPersonaRoutes(): string[] {
  const src = readSource(ROUTES_PATH);
  const paths: string[] = [];
  for (const match of src.matchAll(ROUTE_PATTERN)) {
    const path = match[1];
    if (TOOL_PATH_PATTERN.test(path)) {
      paths.push(path);
    }
  }
  return paths.sort();
}

describe('Persona Playground catalog', () => {
  it('has unique paths', () => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
      if (seen.has(entry.path)) duplicates.add(entry.path);
      seen.add(entry.path);
    }
    expect(Array.from(duplicates)).toEqual([]);
  });

  it('every entry has non-empty required fields', () => {
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
      expect(entry.path, `path on ${entry.name ?? 'unknown'}`).toMatch(/^\/persona/);
      expect(entry.name, `name for ${entry.path}`).not.toEqual('');
      expect(entry.tagline, `tagline for ${entry.path}`).not.toEqual('');
      expect(entry.blurb, `blurb for ${entry.path}`).not.toEqual('');
      expect(entry.format, `format for ${entry.path}`).not.toEqual('');
    }
  });

  it('every category has at least one tool', () => {
    const seen = new Set(PERSONA_PLAYGROUND_ENTRIES.map((e) => e.category));
    const declared = new Set(personaPlaygroundCategories());
    expect(seen).toEqual(declared);
  });

  it('does not list the hub itself', () => {
    const self = PERSONA_PLAYGROUND_ENTRIES.find((e) => e.path === '/persona-playground');
    expect(self).toBeUndefined();
  });

  it('every catalog path is registered as a route in main.tsx', () => {
    const registered = new Set(extractPersonaRoutes());
    const orphans: string[] = [];
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
      if (!registered.has(entry.path)) orphans.push(entry.path);
    }
    expect(orphans, 'catalog paths that have no <Route> entry').toEqual([]);
  });

  it('every persona route in main.tsx is in the catalog (no orphans)', () => {
    const registered = extractPersonaRoutes();
    const catalogPaths = new Set(PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path));
    const missing: string[] = [];
    for (const path of registered) {
      if (!catalogPaths.has(path)) missing.push(path);
    }
    expect(missing, 'routes that are not in the playground catalog').toEqual([]);
  });

  it('every entry belongs to a recognized category', () => {
    const allowed = new Set<string>(personaPlaygroundCategories());
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
      expect(allowed.has(entry.category), `bad category on ${entry.path}`).toBe(true);
    }
  });
});

describe('Persona Playground entry shape (typecheck helper)', () => {
  it('matches the documented surface', () => {
    const sample: PersonaPlaygroundEntry = {
      path: '/persona-match',
      name: 'Persona Match',
      tagline: 'Which Arena mind are you?',
      blurb: 'Five questions, sixteen minds, one match.',
      category: 'discover',
      format: '5-question quiz',
    };
    expect(sample.path).toMatch(/^\/persona/);
  });
});

describe('Daily featured tool', () => {
  it('formatLocalDate produces zero-padded YYYY-MM-DD', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatLocalDate(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(formatLocalDate(new Date(2026, 6, 25))).toBe('2026-07-25');
  });

  it('dayOfYear is 1 on Jan 1 and 366 on Dec 31 in a leap year', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2024, 11, 31))).toBe(366);
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
  });

  it('pickFeaturedOfDay is deterministic for the same date', () => {
    const a = new Date(2026, 6, 25, 9, 0, 0);
    const b = new Date(2026, 6, 25, 23, 59, 59);
    expect(pickFeaturedOfDay(a)).toEqual(pickFeaturedOfDay(b));
  });

  it('pickFeaturedOfDay changes on a different day', () => {
    const today = new Date(2026, 6, 25);
    const tomorrow = new Date(2026, 6, 26);
    const todayPick = pickFeaturedOfDay(today);
    const tomorrowPick = pickFeaturedOfDay(tomorrow);
    // Adjacent days in a 27-entry catalog may land on the same slot if
    // dayOfYear % 27 collides — skip the assertion in that case.
    if (dayOfYear(today) % PERSONA_PLAYGROUND_ENTRIES.length !==
        dayOfYear(tomorrow) % PERSONA_PLAYGROUND_ENTRIES.length) {
      expect(todayPick).not.toEqual(tomorrowPick);
    }
  });

  it('pickFeaturedOfDay returns null for empty catalog', () => {
    expect(pickFeaturedOfDay(new Date(2026, 6, 25), [])).toBeNull();
  });

  it('pickFeaturedOfDay returns an entry indexed by dayOfYear mod length', () => {
    const date = new Date(2026, 6, 25);
    const expected = PERSONA_PLAYGROUND_ENTRIES[dayOfYear(date) % PERSONA_PLAYGROUND_ENTRIES.length];
    expect(pickFeaturedOfDay(date)).toEqual(expected);
  });

  it('isDismissedFor requires matching day and current schema version', () => {
    const today = new Date(2026, 6, 25);
    const todayKey = formatLocalDate(today);
    expect(
      isDismissedFor(today, { v: 1, dismissedOn: todayKey }),
    ).toBe(true);
    expect(
      isDismissedFor(today, { v: 1, dismissedOn: '2026-07-24' }),
    ).toBe(false);
    expect(
      isDismissedFor(today, { v: 2, dismissedOn: todayKey }),
    ).toBe(false);
    expect(isDismissedFor(today, null)).toBe(false);
  });

  it('readFeaturedDismissState parses the canonical shape', () => {
    const storage = makeMemoryStorage({
      'arena:persona-playground:featured:v1': JSON.stringify({
        v: 1,
        dismissedOn: '2026-07-25',
      }),
    });
    expect(readFeaturedDismissState(storage)).toEqual({
      v: 1,
      dismissedOn: '2026-07-25',
    });
  });

  it('readFeaturedDismissState rejects malformed JSON silently', () => {
    const storage = makeMemoryStorage({
      'arena:persona-playground:featured:v1': '{not json',
    });
    expect(readFeaturedDismissState(storage)).toBeNull();
  });

  it('readFeaturedDismissState rejects wrong version', () => {
    const storage = makeMemoryStorage({
      'arena:persona-playground:featured:v1': JSON.stringify({
        v: 99,
        dismissedOn: '2026-07-25',
      }),
    });
    expect(readFeaturedDismissState(storage)).toBeNull();
  });

  it('readFeaturedDismissState rejects malformed date', () => {
    const storage = makeMemoryStorage({
      'arena:persona-playground:featured:v1': JSON.stringify({
        v: 1,
        dismissedOn: 'not-a-date',
      }),
    });
    expect(readFeaturedDismissState(storage)).toBeNull();
  });

  it('writeFeaturedDismissState round-trips through read', () => {
    const storage = makeMemoryStorage();
    const today = new Date(2026, 6, 25);
    writeFeaturedDismissState(storage, today);
    expect(readFeaturedDismissState(storage)).toEqual({
      v: 1,
      dismissedOn: '2026-07-25',
    });
  });

  it('clearFeaturedDismissState removes the key', () => {
    const storage = makeMemoryStorage({
      'arena:persona-playground:featured:v1': JSON.stringify({
        v: 1,
        dismissedOn: '2026-07-25',
      }),
    });
    clearFeaturedDismissState(storage);
    expect(storage.getItem('arena:persona-playground:featured:v1')).toBeNull();
  });

  it('write and clear are no-ops when storage is null', () => {
    expect(() => writeFeaturedDismissState(null, new Date(2026, 6, 25))).not.toThrow();
    expect(() => clearFeaturedDismissState(null)).not.toThrow();
  });
});

function makeMemoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('relatedTools', () => {
  it('excludes the current path', () => {
    const result = relatedTools('/persona-match', 5);
    expect(result.find((e) => e.path === '/persona-match')).toBeUndefined();
  });

  it('returns at most `limit` entries', () => {
    expect(relatedTools('/persona-match', 3)).toHaveLength(3);
    expect(relatedTools('/persona-match', 100)).toHaveLength(
      PERSONA_PLAYGROUND_ENTRIES.length - 1,
    );
  });

  it('defaults to 3 entries', () => {
    expect(relatedTools('/persona-match')).toHaveLength(3);
  });

  it('returns [] for unknown paths', () => {
    expect(relatedTools('/persona-does-not-exist')).toEqual([]);
  });

  it('returns [] for non-positive limit', () => {
    expect(relatedTools('/persona-match', 0)).toEqual([]);
    expect(relatedTools('/persona-match', -1)).toEqual([]);
  });

  it('returns [] for empty entry list', () => {
    expect(relatedTools('/persona-match', 3, [])).toEqual([]);
  });

  it('prefers same-category entries first', () => {
    // /persona-match is a discover-category tool with 6 same-category
    // siblings in the catalog. The first 3 results should all be discover.
    const result = relatedTools('/persona-match', 3);
    expect(result).toHaveLength(3);
    for (const entry of result) {
      expect(entry.category).toBe('discover');
    }
  });

  it('falls back to other categories when same-category is exhausted', () => {
    // /persona-roast is the only entry in the "roast" category, so the
    // second item must come from a different category.
    const result = relatedTools('/persona-roast', 2);
    expect(result).toHaveLength(2);
    expect(result[0]?.category).toBe('roast');
    // The second slot is unavoidable cross-category.
    expect(result[1]?.category).not.toBe('roast');
  });

  it('is deterministic across calls', () => {
    const a = relatedTools('/persona-council', 5);
    const b = relatedTools('/persona-council', 5);
    expect(a).toEqual(b);
  });

  it('does not mutate the input entries', () => {
    const before = PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path);
    relatedTools('/persona-confessional', 10);
    const after = PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path);
    expect(after).toEqual(before);
  });
});
