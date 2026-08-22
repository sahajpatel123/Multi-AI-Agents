/**
 * Tests for Persona Mosaic combinational engine.
 *
 * The mosaic page is the 4-persona "house style" surface at
 * /persona-mosaic. It must:
 *  - require exactly 4 distinct personas
 *  - return null for any other input (3, 5, duplicates, unknown ids)
 *  - be deterministic: same 4 ids always produce the same mosaic
 *  - always include a non-empty house name, tagline, manifesto, best
 *    question
 *  - temperature bucket matches the mean
 *  - share URL builder encodes the 4 ids correctly
 */

import { describe, expect, it } from 'vitest';
import {
  appendSavedTeam,
  buildMosaic,
  clearSavedTeams,
  mosaicOfTheDay,
  mosaicShareUrl,
  readSavedTeams,
  removeSavedTeam,
  todayIsoDate,
  type MosaicSavedTeam,
  type PersonaMosaic,
} from './personaMosaic';
import { PERSONAS } from './personas';

const SAMPLE = ['analyst', 'empath', 'engineer', 'contrarian'];

describe('buildMosaic', () => {
  it('returns null for fewer than 4 personas', () => {
    expect(buildMosaic(['analyst'])).toBeNull();
    expect(buildMosaic(['analyst', 'optimist', 'stoic'])).toBeNull();
  });

  it('returns null for more than 4 personas', () => {
    expect(
      buildMosaic(['analyst', 'optimist', 'stoic', 'contrarian', 'futurist']),
    ).toBeNull();
  });

  it('returns null for duplicates', () => {
    expect(
      buildMosaic(['analyst', 'analyst', 'optimist', 'stoic']),
    ).toBeNull();
  });

  it('returns null for unknown persona ids', () => {
    expect(
      buildMosaic(['analyst', 'optimist', 'stoic', 'nope']),
    ).toBeNull();
  });

  it('returns a valid mosaic for a 4-persona combo', () => {
    const m = buildMosaic(SAMPLE);
    expect(m).not.toBeNull();
    expect(m!.personaIds).toEqual(SAMPLE);
    expect(m!.houseName.length).toBeGreaterThan(4);
    expect(m!.tagline.length).toBeGreaterThan(8);
    expect(m!.manifesto.length).toBeGreaterThan(0);
    expect(m!.bestQuestion.length).toBeGreaterThan(8);
  });

  it('is deterministic for the same 4 ids', () => {
    const a = buildMosaic(SAMPLE);
    const b = buildMosaic(SAMPLE);
    expect(a).toEqual(b);
  });

  it('temperature bucket matches the mean', () => {
    const m = buildMosaic(SAMPLE)!;
    const mean = m.meanTemp;
    if (mean <= 0.3) expect(m.tempLabel).toBe('ice-cold');
    else if (mean <= 0.55) expect(m.tempLabel).toBe('cool');
    else if (mean <= 0.75) expect(m.tempLabel).toBe('warm');
    else expect(m.tempLabel).toBe('incendiary');
  });

  it('meanTemp equals the average of the 4 persona temperatures', () => {
    const ids = ['analyst', 'optimist', 'stoic', 'contrarian'];
    const m = buildMosaic(ids)!;
    const expected =
      ids.reduce((sum, id) => {
        const p = PERSONAS.find((x) => x.id === id)!;
        return sum + p.temperature;
      }, 0) / 4;
    expect(Math.abs(m.meanTemp - expected)).toBeLessThan(0.0001);
  });

  it('produces 1820 reachable mosaics across the catalog', () => {
    // Pick 4-distinct combos and confirm none crash. We don't enumerate
    // all 1820 here; just sanity-check a known varied sample.
    const combos: string[][] = [
      ['analyst', 'empath', 'engineer', 'contrarian'],
      ['optimist', 'stoic', 'futurist', 'ethicist'],
      ['philosopher', 'pragmatist', 'historian', 'strategist'],
      ['economist', 'firstprinciples', 'devilsadvocate', 'scientist'],
      ['analyst', 'optimist', 'pragmatist', 'contrarian'],
    ];
    for (const combo of combos) {
      const m = buildMosaic(combo);
      expect(m).not.toBeNull();
    }
  });

  it('every produced mosaic has a flavor-consistent house name', () => {
    // Skeptics / strategists / contrarians should each surface a name
    // that contains their flavor token. Otherwise flavor detection is broken.
    const skeptic = buildMosaic(['analyst', 'scientist', 'stoic', 'firstprinciples']);
    expect(skeptic!.houseName).toMatch(/Skeptic|Doubt|Audit/);

    const strategist = buildMosaic(['strategist', 'economist', 'engineer', 'futurist']);
    expect(strategist!.houseName).toMatch(/Asymmetric|Leverage|Position/);

    const contrarian = buildMosaic(['contrarian', 'devilsadvocate', 'empath', 'optimist']);
    expect(contrarian!.houseName).toMatch(/Spite|Contrary|Heretics/);
  });

  it('every produced mosaic personaId list preserves order from the caller', () => {
    const ids = ['contrarian', 'analyst', 'empath', 'engineer'];
    const m = buildMosaic(ids)!;
    expect(m.personaIds).toEqual(ids);
  });
});

describe('mosaicShareUrl', () => {
  it('encodes the 4 ids comma-separated', () => {
    expect(mosaicShareUrl('https://x', SAMPLE)).toBe(
      'https://x/persona-mosaic?p=analyst,empath,engineer,contrarian',
    );
  });

  it('preserves the order from the caller', () => {
    expect(mosaicShareUrl('https://x', ['contrarian', 'analyst', 'empath', 'engineer']))
      .toBe('https://x/persona-mosaic?p=contrarian,analyst,empath,engineer');
  });
});

describe('PersonaMosaic type invariants', () => {
  it('every field type matches the contract', () => {
    const m: PersonaMosaic | null = buildMosaic(SAMPLE);
    expect(m).not.toBeNull();
    expect(typeof m!.houseName).toBe('string');
    expect(typeof m!.tagline).toBe('string');
    expect(typeof m!.meanTemp).toBe('number');
    expect(['ice-cold', 'cool', 'warm', 'incendiary']).toContain(m!.tempLabel);
    expect(Array.isArray(m!.personaIds)).toBe(true);
    expect(m!.personaIds).toHaveLength(4);
    expect(Array.isArray(m!.manifesto)).toBe(true);
    expect(m!.manifesto.length).toBeGreaterThan(0);
    expect(typeof m!.bestQuestion).toBe('string');
  });
});

describe('mosaicOfTheDay', () => {
  it('returns 4 distinct persona ids for any YYYY-MM-DD date', () => {
    const ids = mosaicOfTheDay('2026-07-24');
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) {
      expect(PERSONAS.some((p) => p.id === id)).toBe(true);
    }
  });

  it('is deterministic for the same date', () => {
    const a = mosaicOfTheDay('2026-07-24');
    const b = mosaicOfTheDay('2026-07-24');
    expect(a).toEqual(b);
  });

  it('produces a different combo for a different date', () => {
    const a = mosaicOfTheDay('2026-07-24');
    const b = mosaicOfTheDay('2026-07-25');
    expect(a).not.toEqual(b);
  });

  it('falls back to a default combo for invalid date strings', () => {
    const ids = mosaicOfTheDay('not-a-date');
    expect(ids).toHaveLength(4);
  });

  it('returns valid combos across many consecutive days', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 30; day++) {
      const ids = mosaicOfTheDay(`2026-07-${String(day).padStart(2, '0')}`);
      seen.add(ids.join(','));
      for (const id of ids) {
        expect(PERSONAS.some((p) => p.id === id)).toBe(true);
      }
    }
    // Across 30 days we expect a healthy variety — at least 20 distinct combos.
    expect(seen.size).toBeGreaterThanOrEqual(20);
  });
});

describe('todayIsoDate', () => {
  it('returns a YYYY-MM-DD string', () => {
    const s = todayIsoDate();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('saved teams (localStorage)', () => {
  const makeTeam = (id: string, ids: string[]): MosaicSavedTeam => ({
    id,
    name: `Team ${id}`,
    personaIds: ids,
    savedAt: new Date().toISOString(),
  });

  it('readSavedTeams returns empty array when storage is empty', () => {
    clearSavedTeams();
    expect(readSavedTeams()).toEqual([]);
  });

  it('appendSavedTeam + readSavedTeams round-trip', () => {
    clearSavedTeams();
    const team = makeTeam('a', SAMPLE);
    appendSavedTeam(team);
    expect(readSavedTeams()).toHaveLength(1);
  });

  it('appendSavedTeam deduplicates by id', () => {
    clearSavedTeams();
    appendSavedTeam(makeTeam('dup', SAMPLE));
    appendSavedTeam(makeTeam('dup', ['contrarian', 'analyst', 'optimist', 'engineer']));
    const result = readSavedTeams();
    expect(result.length).toBe(1);
    expect(result[0].personaIds).toEqual(['contrarian', 'analyst', 'optimist', 'engineer']);
  });

  it('appendSavedTeam caps the stored list at 12 entries', () => {
    clearSavedTeams();
    for (let i = 0; i < 20; i++) {
      appendSavedTeam(
        makeTeam(`t-${i}`, ['analyst', 'optimist', 'stoic', 'contrarian']),
      );
    }
    expect(readSavedTeams().length).toBeLessThanOrEqual(12);
  });

  it('removeSavedTeam deletes a single entry', () => {
    clearSavedTeams();
    appendSavedTeam(makeTeam('a', SAMPLE));
    appendSavedTeam(makeTeam('b', ['contrarian', 'analyst', 'optimist', 'engineer']));
    removeSavedTeam('a');
    const result = readSavedTeams();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('b');
  });

  it('clearSavedTeams empties storage', () => {
    appendSavedTeam(makeTeam('x', SAMPLE));
    clearSavedTeams();
    expect(readSavedTeams()).toEqual([]);
  });

  it('rejects entries that do not have exactly 4 persona ids', () => {
    clearSavedTeams();
    // Direct write bypassing the helper to test validation
    window.localStorage.setItem(
      'arena:persona-mosaic:saved:v1',
      JSON.stringify([
        { id: 'a', name: 'Bad Team', personaIds: ['analyst', 'optimist'], savedAt: 'x' },
      ]),
    );
    expect(readSavedTeams()).toEqual([]);
  });
});
