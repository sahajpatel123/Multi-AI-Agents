/**
 * Tests for Persona Mosaic Council data + custom-panel engine.
 *
 * The Mosaic Council page is the custom 4-mind deliberation at
 * /persona-mosaic-council. The user picks 4 personas + a
 * question, only those 4 respond.
 *
 * Invariants:
 *  - exactly 4 takes when the panel has 4 personas
 *  - every take references a real persona id
 *  - panel is deduplicated
 *  - stance is in the closed set (4 values)
 *  - same panel + question = same council (deterministic)
 *  - share URL encodes both the question and the panel
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  buildMosaicCouncil,
  mosaicCouncilShareUrl,
  mosaicCouncilValid,
  type MosaicStance,
} from './personaMosaicCouncil';

const VALID_STANCES = new Set<MosaicStance>(['agrees', 'cautions', 'reframes', 'pushes']);
const SAMPLE_PANEL = ['analyst', 'philosopher', 'pragmatist', 'contrarian'];

describe('buildMosaicCouncil', () => {
  it('returns 4 takes when the panel has 4 personas', () => {
    const c = buildMosaicCouncil('A test question.', SAMPLE_PANEL);
    expect(c.takes).toHaveLength(4);
  });

  it('deduplicates the panel and caps at 4', () => {
    const c = buildMosaicCouncil('A test question.', [
      'analyst',
      'analyst',
      'analyst',
      'analyst',
      'analyst',
    ]);
    expect(c.takes).toHaveLength(1);
    expect(c.panel).toEqual(['analyst']);
  });

  it('caps at 4 even when given more', () => {
    const c = buildMosaicCouncil('A test question.', [
      'analyst',
      'philosopher',
      'pragmatist',
      'contrarian',
      'scientist',
      'historian',
    ]);
    expect(c.takes).toHaveLength(4);
    expect(c.panel).toHaveLength(4);
  });

  it('returns 0 takes for an empty panel', () => {
    const c = buildMosaicCouncil('A test question.', []);
    expect(c.takes).toHaveLength(0);
  });

  it('every take references a real persona', () => {
    const c = buildMosaicCouncil('A test question.', SAMPLE_PANEL);
    expect(mosaicCouncilValid(c)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const t of c.takes) {
      expect(known.has(t.personaId)).toBe(true);
    }
  });

  it('every stance is in the closed set', () => {
    const c = buildMosaicCouncil('A test question.', SAMPLE_PANEL);
    for (const t of c.takes) {
      expect(VALID_STANCES.has(t.stance)).toBe(true);
    }
  });

  it('every take has a non-empty take string', () => {
    const c = buildMosaicCouncil('A test question.', SAMPLE_PANEL);
    for (const t of c.takes) {
      expect(t.take.length).toBeGreaterThan(20);
    }
  });

  it('is deterministic for the same panel + question', () => {
    const a = buildMosaicCouncil('A fixed test question.', SAMPLE_PANEL);
    const b = buildMosaicCouncil('A fixed test question.', SAMPLE_PANEL);
    expect(a.takes.map((t) => `${t.personaId}:${t.stance}`)).toEqual(
      b.takes.map((t) => `${t.personaId}:${t.stance}`),
    );
  });

  it('produces different councils for different panels on the same question', () => {
    const a = buildMosaicCouncil('A fixed test question.', [
      'analyst',
      'philosopher',
      'pragmatist',
      'contrarian',
    ]);
    const b = buildMosaicCouncil('A fixed test question.', [
      'analyst',
      'philosopher',
      'pragmatist',
      'scientist',
    ]);
    expect(a.takes.map((t) => t.stance)).not.toEqual(
      b.takes.map((t) => t.stance),
    );
  });
});

describe('mosaicCouncilShareUrl', () => {
  it('encodes both question and panel into the query string', () => {
    const url = mosaicCouncilShareUrl(
      'https://x',
      'A test question.',
      SAMPLE_PANEL,
    );
    expect(url).toContain('/persona-mosaic-council');
    expect(url).toContain('q=A%20test%20question.');
    expect(url).toContain('p=analyst%2Cphilosopher%2Cpragmatist%2Ccontrarian');
  });
});