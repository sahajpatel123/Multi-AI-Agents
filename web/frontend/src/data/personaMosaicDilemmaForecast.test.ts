/**
 * Tests for Persona Mosaic Dilemma Forecast data + 8-mind voting.
 *
 * The Mosaic Dilemma Forecast page is the 8-mind A vs B
 * dilemma framing comparison at /persona-mosaic-dilemma-forecast.
 * 8 personas each pick A or B + explain. Pure functions only.
 *
 * Invariants:
 *  - exactly 8 critiques per forecast
 *  - every critique references a real persona id
 *  - every pick is in the closed set (A or B)
 *  - tally sums to 8
 *  - winner is the majority pick (ties broken by seed hash)
 *  - is deterministic for the same dilemma pair
 *  - share URL encodes both inputs
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendMosaicDilemmaForecastDecision,
  buildMosaicDilemmaForecast,
  clearMosaicDilemmaForecastCounter,
  clearMosaicDilemmaForecastDecisions,
  incrementMosaicDilemmaForecastCounter,
  mosaicDilemmaForecastMajorityInfo,
  mosaicDilemmaForecastShareUrl,
  mosaicDilemmaForecastValid,
  mosaicDilemmaForecastWinTally,
  PANEL_SIZE,
  readMosaicDilemmaForecastCounter,
  readMosaicDilemmaForecastDecisions,
  type MosaicDilemmaForecastPick,
  type PersonaMosaicDilemmaForecast,
} from './personaMosaicDilemmaForecast';

const VALID_PICKS = new Set<MosaicDilemmaForecastPick>(['A', 'B']);

describe('buildMosaicDilemmaForecast', () => {
  it('returns 8 critiques for any pair', () => {
    const f = buildMosaicDilemmaForecast('Take the safe job', 'Take the risky startup');
    expect(f.critiques).toHaveLength(8);
  });

  it('every critique references a real persona', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    expect(mosaicDilemmaForecastValid(f)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const c of f.critiques) {
      expect(known.has(c.personaId)).toBe(true);
    }
  });

  it('returns false when a critique references an unknown persona', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    const bogus: PersonaMosaicDilemmaForecast = {
      ...f,
      critiques: [
        ...f.critiques.slice(0, PANEL_SIZE - 1),
        {
          personaId: 'not-a-real-persona',
          pick: 'A',
          take: 'I have no view on this battle.',
        },
      ],
    };
    expect(mosaicDilemmaForecastValid(bogus)).toBe(false);
  });

  it('every pick is in the closed set', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    for (const c of f.critiques) {
      expect(VALID_PICKS.has(c.pick)).toBe(true);
    }
  });

  it('tally sums to 8', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    expect(f.tally.a + f.tally.b).toBe(8);
  });

  it('winner is the majority pick (or seed-broken tie)', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    if (f.tally.a > f.tally.b) {
      expect(f.winner).toBe('A');
    } else if (f.tally.b > f.tally.a) {
      expect(f.winner).toBe('B');
    } else {
      expect(['A', 'B']).toContain(f.winner);
    }
  });

  it('is deterministic for the same dilemma pair', () => {
    const a = buildMosaicDilemmaForecast('Dilemma A', 'Dilemma B');
    const b = buildMosaicDilemmaForecast('Dilemma A', 'Dilemma B');
    expect(a.critiques.map((c) => `${c.personaId}:${c.pick}`)).toEqual(
      b.critiques.map((c) => `${c.personaId}:${c.pick}`),
    );
  });

  it('returns 8 distinct persona ids', () => {
    const f = buildMosaicDilemmaForecast('A', 'B');
    const ids = f.critiques.map((c) => c.personaId);
    expect(new Set(ids).size).toBe(8);
  });

  it('trims whitespace from inputs', () => {
    const f = buildMosaicDilemmaForecast('  A  ', '  B  ');
    expect(f.dilemmaA).toBe('A');
    expect(f.dilemmaB).toBe('B');
  });
});

describe('mosaicDilemmaForecastShareUrl', () => {
  it('encodes both inputs into the query string', () => {
    const url = mosaicDilemmaForecastShareUrl('https://x', 'A', 'B');
    expect(url).toContain('/persona-mosaic-dilemma-forecast');
    expect(url).toContain('a=A');
    expect(url).toContain('b=B');
  });

  it('encodes special characters so the URL is round-trippable', () => {
    // A regression that dropped encodeURIComponent would let
    // '&' / '=' / '#' from the dilemma text leak into the query
    // string and corrupt the share link.
    const url = mosaicDilemmaForecastShareUrl(
      'https://x',
      'Take the safe job & a bonus',
      'Tell them the hard truth #now',
    );
    expect(url).toContain('a=Take%20the%20safe%20job%20%26%20a%20bonus');
    expect(url).toContain('b=Tell%20them%20the%20hard%20truth%20%23now');
    // The encoded URL, when the page parses it, must round-trip
    // back to the original dilemma text.
    const a = decodeURIComponent(
      new URL(url).searchParams.get('a') ?? '',
    );
    const b = decodeURIComponent(
      new URL(url).searchParams.get('b') ?? '',
    );
    expect(a).toBe('Take the safe job & a bonus');
    expect(b).toBe('Tell them the hard truth #now');
  });
});
describe('mosaic dilemma forecast counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearMosaicDilemmaForecastCounter();
    expect(readMosaicDilemmaForecastCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearMosaicDilemmaForecastCounter();
    expect(incrementMosaicDilemmaForecastCounter()).toBe(1);
    expect(incrementMosaicDilemmaForecastCounter()).toBe(2);
  });

  it('clearMosaicDilemmaForecastCounter resets to 0', () => {
    incrementMosaicDilemmaForecastCounter();
    clearMosaicDilemmaForecastCounter();
    expect(readMosaicDilemmaForecastCounter()).toBe(0);
  });
});

describe('mosaic dilemma forecast decisions + winTally (localStorage)', () => {
  const makeDecision = (id: string, winner: MosaicDilemmaForecastPick) => ({
    id,
    dilemmaASnippet: 'A',
    dilemmaBSnippet: 'B',
    winner,
    savedAt: '2026-07-25T00:00:00Z',
  });

  it('readMosaicDilemmaForecastDecisions returns empty array when storage is empty', () => {
    clearMosaicDilemmaForecastDecisions();
    expect(readMosaicDilemmaForecastDecisions()).toEqual([]);
  });

  it('appendMosaicDilemmaForecastDecision + read round-trip', () => {
    clearMosaicDilemmaForecastDecisions();
    appendMosaicDilemmaForecastDecision(makeDecision('d-1', 'A'));
    expect(readMosaicDilemmaForecastDecisions()).toHaveLength(1);
  });

  it('appendMosaicDilemmaForecastDecision deduplicates by id', () => {
    clearMosaicDilemmaForecastDecisions();
    appendMosaicDilemmaForecastDecision(makeDecision('dup', 'A'));
    appendMosaicDilemmaForecastDecision(makeDecision('dup', 'B'));
    const result = readMosaicDilemmaForecastDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('B');
  });

  it('appendMosaicDilemmaForecastDecision caps at 50 entries', () => {
    clearMosaicDilemmaForecastDecisions();
    for (let i = 0; i < 60; i++) {
      appendMosaicDilemmaForecastDecision(makeDecision(`d-${i}`, 'A'));
    }
    expect(readMosaicDilemmaForecastDecisions().length).toBe(50);
  });

  it('appendMosaicDilemmaForecastDecision dedupes within existing entries', () => {
    clearMosaicDilemmaForecastDecisions();
    // Seed with two entries that share the same id (legacy duplicate
    // from a partial write or external edit). The Set-based dedup
    // in cycle 319 should collapse them so the read returns a single
    // entry per id.
    const dupes = [
      makeDecision('shared', 'A'),
      makeDecision('shared', 'B'),
      makeDecision('unique', 'A'),
    ];
    window.localStorage.setItem(
      'arena:persona-mosaic-dilemma-forecast:decisions:v1',
      JSON.stringify(dupes),
    );
    appendMosaicDilemmaForecastDecision(makeDecision('fresh', 'A'));
    const result = readMosaicDilemmaForecastDecisions();
    const ids = result.map((e) => e.id);
    expect(ids).toContain('fresh');
    expect(ids).toContain('shared');
    expect(ids).toContain('unique');
    // The 'shared' duplicate should be collapsed (only the first wins).
    expect(result.filter((e) => e.id === 'shared').length).toBe(1);
  });

  it('readMosaicDilemmaForecastDecisions caps at 50 even when localStorage has more', () => {
    clearMosaicDilemmaForecastDecisions();
    // Seed localStorage with 60 valid entries directly. The read
    // function should slice to DECISIONS_LIMIT so the on-screen tally
    // never exceeds the cap before the next append scrubs it.
    const overCap = Array.from({ length: 60 }, (_, i) =>
      makeDecision(`d-${i}`, 'A'),
    );
    window.localStorage.setItem(
      'arena:persona-mosaic-dilemma-forecast:decisions:v1',
      JSON.stringify(overCap),
    );
    expect(readMosaicDilemmaForecastDecisions().length).toBe(50);
  });

  it('appendMosaicDilemmaForecastDecision returns the new array when localStorage is empty', () => {
    clearMosaicDilemmaForecastDecisions();
    const next = appendMosaicDilemmaForecastDecision(makeDecision('first', 'A'));
    // The cycle-312 contract: append returns the validated next array
    // so the page can skip a second localStorage read. With a fresh
    // log, that array is exactly the one entry.
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('first');
    expect(next[0]?.winner).toBe('A');
  });

  it('appendMosaicDilemmaForecastDecision returns [] when localStorage is empty', () => {
    // Pin the post-append return value contract from cycle 312: the
    // function returns the validated next array, and an empty log
    // yields an empty array (not undefined or null).
    clearMosaicDilemmaForecastDecisions();
    expect(appendMosaicDilemmaForecastDecision(makeDecision('first', 'A'))).toEqual([
      makeDecision('first', 'A'),
    ]);
  });

  it('appendMosaicDilemmaForecastDecision scrubs malformed entries', () => {
    clearMosaicDilemmaForecastDecisions();
    // Simulate a corrupted payload (partial write, schema drift, manual
    // edit): a string passed where an entry should be, an entry missing
    // the winner field, and an entry with an invalid winner value.
    const corrupted = [
      'not-an-object',
      { id: 'valid-1', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'A', savedAt: '' },
      { id: 'no-winner', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', savedAt: '' },
      { id: 'bad-winner', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'Z', savedAt: '' },
    ];
    window.localStorage.setItem('arena:persona-mosaic-dilemma-forecast:decisions:v1', JSON.stringify(corrupted));
    appendMosaicDilemmaForecastDecision(makeDecision('new', 'B'));
    const result = readMosaicDilemmaForecastDecisions();
    // Only the valid entry + the new one survive.
    expect(result.map((e) => e.id).sort()).toEqual(['new', 'valid-1']);
  });

  it('clearMosaicDilemmaForecastDecisions empties storage', () => {
    appendMosaicDilemmaForecastDecision(makeDecision('x', 'A'));
    clearMosaicDilemmaForecastDecisions();
    expect(readMosaicDilemmaForecastDecisions()).toEqual([]);
  });
});

describe('mosaicDilemmaForecastWinTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(mosaicDilemmaForecastWinTally([])).toEqual({ a: 0, b: 0 });
  });

  it('counts A and B winners correctly', () => {
    const decisions = [
      { id: 'a', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'b', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'A' as const, savedAt: '' },
      { id: 'c', dilemmaASnippet: 'A', dilemmaBSnippet: 'B', winner: 'B' as const, savedAt: '' },
    ];
    const tally = mosaicDilemmaForecastWinTally(decisions);
    expect(tally.a).toBe(2);
    expect(tally.b).toBe(1);
  });
});

describe('mosaicDilemmaForecastMajorityInfo', () => {
  it('returns decisive for 5+/8', () => {
    const info = mosaicDilemmaForecastMajorityInfo({ a: 5, b: 3 }, 'A');
    expect(info.label).toBe('decisive');
  });

  it('returns decisive for the max 8/0', () => {
    const info = mosaicDilemmaForecastMajorityInfo({ a: 8, b: 0 }, 'A');
    expect(info.label).toBe('decisive');
    expect(info.winnerCount).toBe(8);
    expect(info.loserCount).toBe(0);
  });

  it('returns leaning for 4/8', () => {
    const info = mosaicDilemmaForecastMajorityInfo({ a: 4, b: 4 }, 'A');
    expect(info.label).toBe('leaning');
  });

  it('returns split for 3/8 or less', () => {
    const info = mosaicDilemmaForecastMajorityInfo({ a: 3, b: 5 }, 'A');
    expect(info.label).toBe('split');
  });

  it('returns winnerCount and loserCount for the winner', () => {
    const aWins = mosaicDilemmaForecastMajorityInfo({ a: 6, b: 2 }, 'A');
    expect(aWins.winnerCount).toBe(6);
    expect(aWins.loserCount).toBe(2);
    const bWins = mosaicDilemmaForecastMajorityInfo({ a: 2, b: 6 }, 'B');
    expect(bWins.winnerCount).toBe(6);
    expect(bWins.loserCount).toBe(2);
  });

  it('references the winner side, not always A', () => {
    // Regression: a refactor that hardcoded tally.a would silently
    // mislabel the count when B is the winner.
    const info = mosaicDilemmaForecastMajorityInfo({ a: 3, b: 5 }, 'B');
    expect(info.winnerCount).toBe(5);
    expect(info.loserCount).toBe(3);
  });
});
