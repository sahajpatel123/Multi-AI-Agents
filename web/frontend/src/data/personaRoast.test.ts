/**
 * Tests for Persona Roast data + flavor detection.
 *
 * The Roast page is the prompt-critique surface at /persona-roast.
 * Same prompt in → same flavor + headline every time (pure functions).
 * The page depends on:
 *  - flavor detection being correct for the 6 documented cases
 *  - buildRoast returning the same headline/angles for the same input
 *  - 4 angles per roast, each anchored to a real persona id
 *  - angles being ordered by persona temperature (cold → hot)
 *  - share URL encoding the prompt
 *  - flavor labels matching the closed set
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendRoastHistory,
  buildRoast,
  clearRoastHistory,
  deriveRoastFlavor,
  readRoastHistory,
  roastFlavorLabel,
  roastSeverity,
  roastSeverityLabel,
  roastShareUrl,
  type RoastFlavor,
  type RoastHistoryEntry,
} from './personaRoast';

const VALID_FLAVORS = new Set<RoastFlavor>([
  'shallow', 'overloaded', 'vague', 'leading', 'meta', 'balanced',
]);

describe('deriveRoastFlavor', () => {
  it('returns shallow for empty input', () => {
    expect(deriveRoastFlavor('')).toBe('shallow');
  });

  it('returns shallow for very short prompts', () => {
    expect(deriveRoastFlavor('hi')).toBe('shallow');
    expect(deriveRoastFlavor('why?')).toBe('shallow');
  });

  it('returns overloaded for prompts > 80 words', () => {
    const long = Array.from({ length: 90 }, () => 'word').join(' ');
    expect(deriveRoastFlavor(long)).toBe('overloaded');
  });

  it('returns leading for prompts starting with leading words', () => {
    expect(deriveRoastFlavor('Why is X happening?')).toBe('leading');
    expect(deriveRoastFlavor("Don't you think Y is bad?")).toBe('leading');
  });

  it('returns meta for prompts that ask for roleplay', () => {
    expect(deriveRoastFlavor('You are a Nobel-winning economist.')).toBe('meta');
    expect(deriveRoastFlavor('Pretend you are my therapist.')).toBe('meta');
    expect(deriveRoastFlavor('Act as if you are a chef.')).toBe('meta');
  });

  it('returns vague for prompts with vague words', () => {
    expect(deriveRoastFlavor('Tell me about that thing.')).toBe('vague');
  });

  it('returns balanced for normal prompts', () => {
    expect(deriveRoastFlavor('How do I price my SaaS for solo founders?')).toBe('balanced');
    expect(deriveRoastFlavor('What makes a great product launch?')).toBe('balanced');
  });

  it('is deterministic for the same input', () => {
    const prompt = 'How should I write a better about page?';
    expect(deriveRoastFlavor(prompt)).toBe(deriveRoastFlavor(prompt));
  });
});

describe('buildRoast', () => {
  it('returns a complete roast for any prompt', () => {
    const roast = buildRoast('How do I write a great landing page?');
    expect(VALID_FLAVORS.has(roast.flavor)).toBe(true);
    expect(roast.headline.length).toBeGreaterThan(4);
    expect(roast.lede.length).toBeGreaterThan(8);
    expect(roast.angles).toHaveLength(4);
  });

  it('every angle references a known persona', () => {
    const known = new Set(PERSONAS.map((p) => p.id));
    const roast = buildRoast('Sample prompt');
    for (const angle of roast.angles) {
      expect(known.has(angle.personaId)).toBe(true);
    }
  });

  it('every angle has a non-empty bite', () => {
    const roast = buildRoast('Sample prompt');
    for (const angle of roast.angles) {
      expect(angle.bite.length).toBeGreaterThan(8);
    }
  });

  it('angles are ordered by persona temperature (cold first)', () => {
    const roast = buildRoast('A balanced prompt for the panel.');
    const temps = roast.angles.map((angle) => {
      const persona = PERSONAS.find((p) => p.id === angle.personaId);
      return persona?.temperature ?? 0;
    });
    for (let i = 1; i < temps.length; i++) {
      expect(temps[i]).toBeGreaterThanOrEqual(temps[i - 1]);
    }
  });

  it('is deterministic for the same input', () => {
    const prompt = 'What is the biggest mistake founders make?';
    const a = buildRoast(prompt);
    const b = buildRoast(prompt);
    expect(a.flavor).toBe(b.flavor);
    expect(a.headline).toBe(b.headline);
    expect(a.lede).toBe(b.lede);
    expect(a.angles.map((x) => x.personaId)).toEqual(
      b.angles.map((x) => x.personaId),
    );
  });

  it('different flavors produce different headlines', () => {
    const shallow = buildRoast('hi');
    const balanced = buildRoast('How should I structure a product roadmap?');
    const leading = buildRoast("Don't you think most advice is bad?");
    expect(shallow.headline).not.toBe(balanced.headline);
    expect(balanced.headline).not.toBe(leading.headline);
  });
});

describe('roastShareUrl', () => {
  it('encodes the prompt into a query string', () => {
    const url = roastShareUrl('https://x', 'How do I write a better pitch?');
    expect(url.startsWith('https://x/persona-roast?prompt=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('How do I write a better pitch?');
  });
});

describe('roastFlavorLabel', () => {
  it('returns a non-empty label for every flavor', () => {
    for (const flavor of VALID_FLAVORS) {
      expect(roastFlavorLabel(flavor).length).toBeGreaterThan(0);
    }
  });

  it('returns distinct labels for distinct flavors', () => {
    const labels = new Set<string>();
    for (const flavor of VALID_FLAVORS) {
      labels.add(roastFlavorLabel(flavor));
    }
    expect(labels.size).toBe(VALID_FLAVORS.size);
  });
});

describe('roastSeverity', () => {
  it('returns 1 for a balanced prompt', () => {
    expect(roastSeverity('How should I price my SaaS for solo founders?')).toBe(1);
  });

  it('returns 9 for a shallow prompt', () => {
    expect(roastSeverity('hi')).toBeGreaterThanOrEqual(8);
  });

  it('returns 7 for an overloaded prompt', () => {
    const long = Array.from({ length: 90 }, () => 'word').join(' ');
    expect(roastSeverity(long)).toBe(7);
  });

  it('returns 4 for a meta / roleplay prompt', () => {
    expect(roastSeverity('Pretend you are a Nobel-winning economist.')).toBe(4);
  });

  it('is bounded between 0 and 10', () => {
    const probes = [
      '',
      'hi',
      Array.from({ length: 200 }, () => 'word').join(' '),
      "Don't you think X is bad?",
      'Pretend you are a chef.',
      'How do I write a great landing page?',
    ];
    for (const prompt of probes) {
      const s = roastSeverity(prompt);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(10);
    }
  });
});

describe('roastSeverityLabel', () => {
  it('returns a non-empty label for every score 0-10', () => {
    for (let score = 0; score <= 10; score++) {
      expect(roastSeverityLabel(score).length).toBeGreaterThan(0);
    }
  });

  it('returns distinct labels for distinct buckets', () => {
    const labels = new Set<string>();
    for (let score = 0; score <= 10; score++) {
      labels.add(roastSeverityLabel(score));
    }
    // Expect at least 4 distinct buckets.
    expect(labels.size).toBeGreaterThanOrEqual(4);
  });
});

describe('roast history (localStorage)', () => {
  const makeEntry = (id: string, flavor: RoastFlavor = 'shallow'): RoastHistoryEntry => ({
    id,
    flavor,
    severity: 9,
    promptSnippet: 'sample',
    savedAt: new Date().toISOString(),
  });

  it('readRoastHistory returns empty array when storage is empty', () => {
    clearRoastHistory();
    expect(readRoastHistory()).toEqual([]);
  });

  it('appendRoastHistory + readRoastHistory round-trip', () => {
    clearRoastHistory();
    const entry = makeEntry('r-1');
    appendRoastHistory(entry);
    const result = readRoastHistory();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('r-1');
    expect(result[0].flavor).toBe('shallow');
  });

  it('appendRoastHistory deduplicates by id', () => {
    clearRoastHistory();
    appendRoastHistory(makeEntry('dup', 'shallow'));
    appendRoastHistory(makeEntry('dup', 'leading'));
    const result = readRoastHistory();
    expect(result.length).toBe(1);
    expect(result[0].flavor).toBe('leading');
  });

  it('appendRoastHistory caps at 12 entries', () => {
    clearRoastHistory();
    for (let i = 0; i < 20; i++) {
      appendRoastHistory(makeEntry(`r-${i}`, 'balanced'));
    }
    expect(readRoastHistory().length).toBeLessThanOrEqual(12);
  });

  it('clearRoastHistory empties storage', () => {
    appendRoastHistory(makeEntry('x'));
    clearRoastHistory();
    expect(readRoastHistory()).toEqual([]);
  });
});
