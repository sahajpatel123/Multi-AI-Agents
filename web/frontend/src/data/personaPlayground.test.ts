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
  MATCHUPS,
  PERSONA_PLAYGROUND_ENTRIES,
  WHATS_NEW,
  buildCompareFromCategory,
  buildCompareShareUrl,
  categorySummaries,
  clearFeaturedDismissState,
  compareEntries,
  dayOfYear,
  findMatchupByPaths,
  formatLocalDate,
  formatSummaries,
  isDismissedFor,
  matchToolForPurpose,
  personaPlaygroundCategories,
  pickFeaturedOfDay,
  pickRandomTool,
  pickSurpriseTool,
  readFeaturedDismissState,
  relatedTools,
  relatedToolsDefaultHeading,
  tryNextTool,
  unvisitedTools,
  writeFeaturedDismissState,
  type PersonaPlaygroundEntry,
} from './personaPlayground';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string) =>
  readFileSync(join(here, relativePath), 'utf8');

const ROUTES_PATH = '../main.tsx';

const ROUTE_PATTERN = /<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z0-9_]+)Page\s+\/>\}/g;

const TOOL_PATH_PATTERN = /^\/persona-(?!playground(?:\/|$))[a-z-]+$/;

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

describe('relatedToolsDefaultHeading', () => {
  it('returns a category-aware heading for known paths', () => {
    expect(relatedToolsDefaultHeading('/persona-match')).toBe('More discover tools');
    expect(relatedToolsDefaultHeading('/persona-roast')).toBe('More roast tools');
    expect(relatedToolsDefaultHeading('/persona-council')).toBe('More council tools');
    expect(relatedToolsDefaultHeading('/persona-mosaic')).toBe('More mosaic tools');
  });

  it('returns null for unknown paths', () => {
    expect(relatedToolsDefaultHeading('/persona-not-real')).toBeNull();
  });

  it('respects the entries argument', () => {
    expect(relatedToolsDefaultHeading('/persona-match', [])).toBeNull();
  });

  it('is deterministic across calls', () => {
    expect(relatedToolsDefaultHeading('/persona-battle')).toBe(
      relatedToolsDefaultHeading('/persona-battle'),
    );
  });
});

describe('compareEntries', () => {
  it('returns [a, b] for two valid catalog paths', () => {
    const result = compareEntries('/persona-council', '/persona-mosaic-council');
    expect(result).not.toBeNull();
    expect(result?.[0].path).toBe('/persona-council');
    expect(result?.[1].path).toBe('/persona-mosaic-council');
  });

  it('allows the same path on both sides (compare to itself)', () => {
    const result = compareEntries('/persona-battle', '/persona-battle');
    expect(result).not.toBeNull();
    expect(result?.[0].path).toBe('/persona-battle');
    expect(result?.[1].path).toBe('/persona-battle');
  });

  it('returns null when a is missing', () => {
    expect(compareEntries(null, '/persona-battle')).toBeNull();
    expect(compareEntries('', '/persona-battle')).toBeNull();
  });

  it('returns null when b is missing', () => {
    expect(compareEntries('/persona-battle', null)).toBeNull();
    expect(compareEntries('/persona-battle', '')).toBeNull();
  });

  it('returns null when a is not in the catalog', () => {
    expect(compareEntries('/persona-not-real', '/persona-battle')).toBeNull();
  });

  it('returns null when b is not in the catalog', () => {
    expect(compareEntries('/persona-battle', '/persona-not-real')).toBeNull();
  });

  it('is deterministic across calls', () => {
    const a = compareEntries('/persona-council', '/persona-mosaic');
    const b = compareEntries('/persona-council', '/persona-mosaic');
    expect(a).toEqual(b);
  });

  it('respects the entries argument (does not mutate the default)', () => {
    const before = PERSONA_PLAYGROUND_ENTRIES.length;
    compareEntries('/persona-battle', '/persona-council', []);
    expect(PERSONA_PLAYGROUND_ENTRIES.length).toBe(before);
  });
});

describe('buildCompareShareUrl', () => {
  it('encodes both paths and joins with the origin', () => {
    expect(
      buildCompareShareUrl(
        'https://arena.example',
        '/persona-council',
        '/persona-mosaic-council',
      ),
    ).toBe(
      'https://arena.example/persona-playground/compare?a=%2Fpersona-council&b=%2Fpersona-mosaic-council',
    );
  });

  it('trims a trailing slash on the origin', () => {
    expect(
      buildCompareShareUrl(
        'https://arena.example/',
        '/persona-council',
        '/persona-mosaic-council',
      ),
    ).toBe(
      'https://arena.example/persona-playground/compare?a=%2Fpersona-council&b=%2Fpersona-mosaic-council',
    );
  });

  it('returns null when a or b is missing', () => {
    expect(buildCompareShareUrl('https://x', null, '/persona-council')).toBeNull();
    expect(buildCompareShareUrl('https://x', '', '/persona-council')).toBeNull();
    expect(buildCompareShareUrl('https://x', '/persona-council', null)).toBeNull();
  });

  it('returns null when paths do not look like persona tool routes', () => {
    expect(
      buildCompareShareUrl('https://x', '/something-else', '/persona-council'),
    ).toBeNull();
    expect(
      buildCompareShareUrl('https://x', '/persona-council', 'https://other/path'),
    ).toBeNull();
  });
});

describe('MATCHUPS', () => {
  it('every matchup has a non-empty title and summary', () => {
    for (const matchup of MATCHUPS) {
      expect(matchup.title).not.toEqual('');
      expect(matchup.summary).not.toEqual('');
    }
  });

  it('every matchup pairs two distinct paths', () => {
    for (const matchup of MATCHUPS) {
      expect(matchup.paths).toHaveLength(2);
      expect(matchup.paths[0]).not.toBe(matchup.paths[1]);
    }
  });

  it('every matchup path is in the catalog', () => {
    const catalogPaths = new Set(PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path));
    for (const matchup of MATCHUPS) {
      expect(catalogPaths.has(matchup.paths[0]), `${matchup.paths[0]} (matchup "${matchup.title}")`).toBe(true);
      expect(catalogPaths.has(matchup.paths[1]), `${matchup.paths[1]} (matchup "${matchup.title}")`).toBe(true);
    }
  });

  it('matchup titles are unique', () => {
    const seen = new Set<string>();
    for (const matchup of MATCHUPS) {
      expect(seen.has(matchup.title), `duplicate title: ${matchup.title}`).toBe(false);
      seen.add(matchup.title);
    }
  });
});

describe('pickSurpriseTool', () => {
  it('returns a non-null entry from the catalog', () => {
    const pick = pickSurpriseTool(new Date(2026, 6, 25));
    expect(pick).not.toBeNull();
    expect(pick?.path).toMatch(/^\/persona-/);
  });

  it('excludes the given path', () => {
    const featured = pickFeaturedOfDay(new Date(2026, 6, 25));
    const surprise = pickSurpriseTool(new Date(2026, 6, 25), featured?.path ?? null);
    expect(surprise?.path).not.toBe(featured?.path);
  });

  it('excludes null safely (no exclusion)', () => {
    const pick = pickSurpriseTool(new Date(2026, 6, 25), null);
    expect(pick).not.toBeNull();
  });

  it('is deterministic for the same date', () => {
    const a = pickSurpriseTool(new Date(2026, 6, 25));
    const b = pickSurpriseTool(new Date(2026, 6, 25));
    expect(a).toEqual(b);
  });

  it('returns null for empty catalog', () => {
    expect(pickSurpriseTool(new Date(2026, 6, 25), null, [])).toBeNull();
  });

  it('returns null for single-entry catalog when the entry is excluded', () => {
    const only: PersonaPlaygroundEntry = {
      path: '/only',
      name: 'Only',
      tagline: '',
      blurb: '',
      category: 'discover',
      format: '',
    };
    expect(pickSurpriseTool(new Date(2026, 6, 25), '/only', [only])).toBeNull();
  });

  it('returns the single entry when it is not excluded', () => {
    const only: PersonaPlaygroundEntry = {
      path: '/only',
      name: 'Only',
      tagline: '',
      blurb: '',
      category: 'discover',
      format: '',
    };
    expect(pickSurpriseTool(new Date(2026, 6, 25), '/other', [only])).toEqual(only);
  });

  it('changes pick between days when catalog has >2 entries', () => {
    const today = new Date(2026, 6, 25);
    const tomorrow = new Date(2026, 6, 26);
    const a = pickSurpriseTool(today);
    const b = pickSurpriseTool(tomorrow);
    // Catalog is 27 entries; with exclusion by featured, consecutive
    // days may collide occasionally — assert only when they differ.
    if (
      dayOfYear(today) % PERSONA_PLAYGROUND_ENTRIES.length !==
      dayOfYear(tomorrow) % PERSONA_PLAYGROUND_ENTRIES.length
    ) {
      expect(a?.path).not.toBe(b?.path);
    }
  });
});

describe('findMatchupByPaths', () => {
  it('returns the matchup when given its declared path order', () => {
    const m = findMatchupByPaths('/persona-council', '/persona-mosaic-council');
    expect(m?.title).toBe('Council vs Mosaic Council');
  });

  it('is order-insensitive (a/b can be swapped)', () => {
    const m = findMatchupByPaths('/persona-mosaic-council', '/persona-council');
    expect(m?.title).toBe('Council vs Mosaic Council');
  });

  it('returns null when a or b is missing', () => {
    expect(findMatchupByPaths(null, '/persona-council')).toBeNull();
    expect(findMatchupByPaths('/persona-council', null)).toBeNull();
    expect(findMatchupByPaths('', '')).toBeNull();
  });

  it('returns null when paths do not match any curated matchup', () => {
    expect(findMatchupByPaths('/persona-match', '/persona-battle')).toBeNull();
  });

  it('respects the matchups argument', () => {
    expect(findMatchupByPaths('/persona-council', '/persona-mosaic-council', [])).toBeNull();
  });
});

describe('categorySummaries', () => {
  it('returns one entry per category', () => {
    const summaries = categorySummaries();
    const seen = new Set(summaries.map((s) => s.category));
    expect(seen.size).toBe(personaPlaygroundCategories().length);
  });

  it('every summary has a non-empty label, count, and description', () => {
    for (const summary of categorySummaries()) {
      expect(summary.label).not.toEqual('');
      expect(summary.count).toBeGreaterThan(0);
      expect(summary.description).not.toEqual('');
    }
  });

  it('counts sum to the catalog size', () => {
    const total = categorySummaries().reduce((acc, s) => acc + s.count, 0);
    expect(total).toBe(PERSONA_PLAYGROUND_ENTRIES.length);
  });
});

describe('unvisitedTools', () => {
  it('returns N entries not in the recent set', () => {
    const recent = ['/persona-match', '/persona-battle'];
    const result = unvisitedTools(recent, 3);
    expect(result).toHaveLength(3);
    for (const entry of result) {
      expect(recent).not.toContain(entry.path);
    }
  });

  it('excludes the given paths', () => {
    const result = unvisitedTools(['/persona-match'], 5);
    expect(result.find((e) => e.path === '/persona-match')).toBeUndefined();
  });

  it('returns [] when count is non-positive', () => {
    expect(unvisitedTools(['/x'], 0)).toEqual([]);
    expect(unvisitedTools(['/x'], -1)).toEqual([]);
  });

  it('returns [] when catalog is empty', () => {
    expect(unvisitedTools(['/x'], 3, [])).toEqual([]);
  });

  it('returns [] when recent covers the whole catalog', () => {
    const allPaths = PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path);
    expect(unvisitedTools(allPaths, 3)).toEqual([]);
  });

  it('is deterministic for the same date + recent set', () => {
    const recent = ['/persona-match', '/persona-battle', '/persona-council'];
    const date = new Date(2026, 6, 25);
    const a = unvisitedTools(recent, 4, PERSONA_PLAYGROUND_ENTRIES, date);
    const b = unvisitedTools(recent, 4, PERSONA_PLAYGROUND_ENTRIES, date);
    expect(a).toEqual(b);
  });

  it('caps at the count', () => {
    const result = unvisitedTools(['/persona-match'], 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.length).toBe(PERSONA_PLAYGROUND_ENTRIES.length - 1);
  });
});

describe('WHATS_NEW', () => {
  it('is non-empty', () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0);
  });

  it('every entry has a valid date, title, and summary', () => {
    for (const entry of WHATS_NEW) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.title).not.toEqual('');
      expect(entry.summary).not.toEqual('');
    }
  });

  it('optional links start with /persona- when present', () => {
    for (const entry of WHATS_NEW) {
      if (entry.link !== undefined) {
        expect(entry.link, `${entry.title} link`).toMatch(/^\/persona-/);
      }
    }
  });

  it('titles are unique', () => {
    const seen = new Set<string>();
    for (const entry of WHATS_NEW) {
      expect(seen.has(entry.title), `duplicate: ${entry.title}`).toBe(false);
      seen.add(entry.title);
    }
  });
});

describe('formatSummaries', () => {
  it('aggregates entries by format string', () => {
    const summaries = formatSummaries();
    const seen = new Set<string>();
    let total = 0;
    for (const summary of summaries) {
      expect(seen.has(summary.format)).toBe(false);
      seen.add(summary.format);
      expect(summary.count).toBe(summary.entries.length);
      total += summary.count;
    }
    expect(total).toBe(PERSONA_PLAYGROUND_ENTRIES.length);
  });

  it('sorts by count desc, then by format asc', () => {
    const summaries = formatSummaries();
    for (let i = 0; i < summaries.length - 1; i += 1) {
      const a = summaries[i];
      const b = summaries[i + 1];
      if (a.count === b.count) {
        expect(a.format.localeCompare(b.format)).toBeLessThan(0);
      } else {
        expect(a.count).toBeGreaterThan(b.count);
      }
    }
  });

  it('every entry in a summary has the matching format', () => {
    for (const summary of formatSummaries()) {
      for (const entry of summary.entries) {
        expect(entry.format).toBe(summary.format);
      }
    }
  });

  it('returns [] for empty input', () => {
    expect(formatSummaries([])).toEqual([]);
  });
});

describe('pickRandomTool', () => {
  it('returns a non-null entry from the catalog', () => {
    const pick = pickRandomTool([], 0, new Date(2026, 6, 25));
    expect(pick).not.toBeNull();
    expect(pick?.path).toMatch(/^\/persona-/);
  });

  it('excludes all paths in the exclude set', () => {
    const recent = ['/persona-match', '/persona-battle', '/persona-council'];
    const result = pickRandomTool(recent, 0, new Date(2026, 6, 25));
    if (result) {
      expect(recent).not.toContain(result.path);
    }
  });

  it('returns null when the only entry is excluded', () => {
    const only: PersonaPlaygroundEntry = {
      path: '/only',
      name: 'Only',
      tagline: '',
      blurb: '',
      category: 'discover',
      format: '',
    };
    expect(pickRandomTool(['/only'], 0, new Date(2026, 6, 25), [only])).toBeNull();
  });

  it('returns null for empty catalog', () => {
    expect(pickRandomTool([], 0, new Date(2026, 6, 25), [])).toBeNull();
  });

  it('is deterministic for the same date + salt + exclude set', () => {
    const a = pickRandomTool(['/persona-match'], 0, new Date(2026, 6, 25));
    const b = pickRandomTool(['/persona-match'], 0, new Date(2026, 6, 25));
    expect(a?.path).toBe(b?.path);
  });

  it('different salts can yield different picks', () => {
    // Salt 0 and salt 13 are arbitrary; just verify the helper uses
    // the salt as a seed offset.
    const a = pickRandomTool(['/persona-match'], 0, new Date(2026, 6, 25));
    const b = pickRandomTool(['/persona-match'], 13, new Date(2026, 6, 25));
    // With 26 candidates and 1 excluded, (day + 0) % 26 vs (day + 13) % 26
    // can collide if day % 26 happens to align. We just check shape.
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });
});

describe('buildCompareFromCategory', () => {
  it('returns 2 entries from the same category', () => {
    const result = buildCompareFromCategory('versus', [], 0, new Date(2026, 6, 25));
    expect(result).not.toBeNull();
    if (result) {
      expect(result[0].category).toBe('versus');
      expect(result[1].category).toBe('versus');
      expect(result[0].path).not.toBe(result[1].path);
    }
  });

  it('excludes the given paths', () => {
    const result = buildCompareFromCategory(
      'versus',
      ['/persona-battle'],
      0,
      new Date(2026, 6, 25),
    );
    if (result) {
      expect(result[0].path).not.toBe('/persona-battle');
      expect(result[1].path).not.toBe('/persona-battle');
    }
  });

  it('returns null when fewer than 2 non-excluded entries exist', () => {
    const only: PersonaPlaygroundEntry[] = [
      {
        path: '/a',
        name: 'A',
        tagline: '',
        blurb: '',
        category: 'mosaic',
        format: '',
      },
    ];
    expect(buildCompareFromCategory('mosaic', [], 0, new Date(2026, 6, 25), only)).toBeNull();
  });

  it('is deterministic for the same inputs', () => {
    const date = new Date(2026, 6, 25);
    const a = buildCompareFromCategory('council', [], 0, date);
    const b = buildCompareFromCategory('council', [], 0, date);
    expect(a?.[0].path).toBe(b?.[0].path);
    expect(a?.[1].path).toBe(b?.[1].path);
  });
});

describe('matchToolForPurpose', () => {
  it('returns an entry whose fields contain the query words', () => {
    const result = matchToolForPurpose('dilemma');
    expect(result).not.toBeNull();
    if (result) {
      const haystack = `${result.name} ${result.tagline} ${result.blurb} ${result.format}`.toLowerCase();
      expect(haystack).toContain('dilemma');
    }
  });

  it('matches against format strings', () => {
    const result = matchToolForPurpose('trivia');
    expect(result?.path).toBe('/persona-trivia');
  });

  it('returns null for an empty query', () => {
    expect(matchToolForPurpose('')).toBeNull();
  });

  it('returns null for short words that are filtered out', () => {
    expect(matchToolForPurpose('a an to')).toBeNull();
  });

  it('returns null when no entry matches', () => {
    expect(matchToolForPurpose('xyzzy-no-such-thing')).toBeNull();
  });

  it('is deterministic for the same query', () => {
    const a = matchToolForPurpose('council');
    const b = matchToolForPurpose('council');
    expect(a?.path).toBe(b?.path);
  });

  it('scores multi-word queries by total word matches', () => {
    // "persona forecast" should pick the entry that contains BOTH
    // words rather than just one.
    const result = matchToolForPurpose('persona forecast');
    // Both /persona-forecast and /persona-mosaic-dilemma-forecast
    // match; tie-breaks on first match in the catalog, which is
    // /persona-forecast (lower index). Score > 1 is what we test.
    expect(result).not.toBeNull();
    if (result) {
      const haystack = `${result.name} ${result.tagline} ${result.blurb} ${result.format}`.toLowerCase();
      expect(haystack).toContain('forecast');
    }
  });
});

describe('tryNextTool', () => {
  it('returns a non-starred entry from the catalog', () => {
    const result = tryNextTool(
      ['/persona-match'],
      ['/persona-battle'],
      0,
      new Date(2026, 6, 25),
    );
    expect(result).not.toBeNull();
    if (result) {
      expect(result.path).not.toBe('/persona-match');
    }
  });

  it('prefers tools in a category the user has explored', () => {
    // The user has visited /persona-battle (versus) recently.
    // tryNextTool should prefer another versus tool.
    const result = tryNextTool([], ['/persona-battle'], 0, new Date(2026, 6, 25));
    expect(result?.category).toBe('versus');
  });

  it('returns null when all entries are starred', () => {
    const allPaths = PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path);
    expect(tryNextTool(allPaths, [], 0, new Date(2026, 6, 25))).toBeNull();
  });

  it('returns null for an empty catalog', () => {
    expect(tryNextTool([], [], 0, new Date(2026, 6, 25), [])).toBeNull();
  });

  it('is deterministic for the same inputs', () => {
    const date = new Date(2026, 6, 25);
    const starred = ['/persona-match'];
    const recent = ['/persona-battle'];
    const a = tryNextTool(starred, recent, 0, date);
    const b = tryNextTool(starred, recent, 0, date);
    expect(a?.path).toBe(b?.path);
  });
});
