/**
 * Tests for Persona Echo data + reframe engine.
 *
 * The Echo page is the perspective-reframe surface at /persona-echo.
 * It depends on:
 *  - classifyEchoKind correctly mapping text characteristics
 *  - buildEcho returning 4 angles per kind with real persona ids
 *  - same input in = same echo out (deterministic)
 *  - all 5 kinds (short, medium, long, argument, narrative) have
 *    unique headline + summary + reframing copy
 *  - share URL encodes the text correctly
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendEchoHistory,
  buildEcho,
  classifyEchoKind,
  clearEchoCounter,
  clearEchoHistory,
  echoAnglesValid,
  echoShareUrl,
  incrementEchoCounter,
  readEchoCounter,
  readEchoHistory,
  type EchoHistoryEntry,
  type EchoKind,
} from './personaEcho';

const VALID_KINDS = new Set<EchoKind>([
  'short', 'medium', 'long', 'argument', 'narrative',
]);

describe('classifyEchoKind', () => {
  it('returns short for empty input', () => {
    expect(classifyEchoKind('')).toBe('short');
  });

  it('returns short for very short inputs', () => {
    expect(classifyEchoKind('hi')).toBe('short');
    expect(classifyEchoKind('one two three')).toBe('short');
  });

  it('returns argument for prompts with because / should / therefore', () => {
    expect(classifyEchoKind('We should always test our assumptions because they leak.')).toBe('argument');
  });

  it('returns narrative for prompts with then / after / I felt', () => {
    expect(classifyEchoKind('I felt the rain on my face after the long walk.')).toBe('narrative');
  });

  it('returns long for > 200 words', () => {
    const long = Array.from({ length: 220 }, () => 'word').join(' ');
    expect(classifyEchoKind(long)).toBe('long');
  });

  it('returns medium for a normal-length neutral paragraph', () => {
    expect(
      classifyEchoKind(
        'Our team has shipped eleven releases this quarter, all on schedule. The quality bar has held and the customers are happy.',
      ),
    ).toBe('medium');
  });

  it('is deterministic for the same input', () => {
    const prompt = 'A normal sentence with several words.';
    expect(classifyEchoKind(prompt)).toBe(classifyEchoKind(prompt));
  });
});

describe('buildEcho', () => {
  it('returns a complete echo with 4 angles for any text', () => {
    const echo = buildEcho('Any text works here.');
    expect(VALID_KINDS.has(echo.kind)).toBe(true);
    expect(echo.headline.length).toBeGreaterThan(0);
    expect(echo.summary.length).toBeGreaterThan(0);
    expect(echo.reframing.length).toBeGreaterThan(0);
    expect(echo.angles).toHaveLength(4);
  });

  it('every angle references a known persona', () => {
    const echo = buildEcho('Sample input.');
    expect(echoAnglesValid(echo.angles)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const angle of echo.angles) {
      expect(known.has(angle.personaId)).toBe(true);
    }
  });

  it('every angle has a non-empty take and followup', () => {
    const echo = buildEcho('A medium-length paragraph that talks about strategy.');
    for (const angle of echo.angles) {
      expect(angle.angle.length).toBeGreaterThan(0);
      expect(angle.take.length).toBeGreaterThan(20);
      expect(angle.followup.length).toBeGreaterThan(8);
    }
  });

  it('is deterministic for the same input', () => {
    const a = buildEcho('A short test prompt.');
    const b = buildEcho('A short test prompt.');
    expect(a).toEqual(b);
  });

  it('produces distinct headlines across kinds', () => {
    const kinds: ReadonlyArray<EchoKind> = ['short', 'medium', 'long', 'argument', 'narrative'];
    const headlines = new Set(
      kinds.map((kind) => {
        const echo = buildEcho(
          kind === 'long'
            ? Array.from({ length: 220 }, () => 'word').join(' ')
            : kind === 'argument'
            ? 'We should always test our assumptions because they leak over time and corrupt the team.'
            : kind === 'narrative'
            ? 'I felt the cold on my face, then I saw the light at the end of the road.'
            : kind === 'short'
            ? 'hi'
            : 'Our team has shipped eleven releases this quarter on schedule and the customers are happy with the result.',
        );
        return echo.headline;
      }),
    );
    expect(headlines.size).toBeGreaterThanOrEqual(4);
  });
});

describe('echoShareUrl', () => {
  it('encodes the text into a query string', () => {
    const url = echoShareUrl('https://x', 'A test prompt.');
    expect(url.startsWith('https://x/persona-echo?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('A test prompt.');
  });
});

describe('echo history (localStorage)', () => {
  const makeEntry = (id: string, kind: EchoKind = 'short'): EchoHistoryEntry => ({
    id,
    kind,
    textSnippet: 'snippet',
    savedAt: new Date().toISOString(),
  });

  it('readEchoHistory returns empty array when storage is empty', () => {
    clearEchoHistory();
    expect(readEchoHistory()).toEqual([]);
  });

  it('appendEchoHistory + readEchoHistory round-trip', () => {
    clearEchoHistory();
    appendEchoHistory(makeEntry('e-1'));
    expect(readEchoHistory()).toHaveLength(1);
  });

  it('appendEchoHistory deduplicates by id', () => {
    clearEchoHistory();
    appendEchoHistory(makeEntry('dup', 'short'));
    appendEchoHistory(makeEntry('dup', 'long'));
    const result = readEchoHistory();
    expect(result.length).toBe(1);
    expect(result[0].kind).toBe('long');
  });

  it('appendEchoHistory caps at 16 entries', () => {
    clearEchoHistory();
    for (let i = 0; i < 20; i++) {
      appendEchoHistory(makeEntry(`e-${i}`, 'medium'));
    }
    expect(readEchoHistory().length).toBeLessThanOrEqual(16);
  });

  it('clearEchoHistory empties storage', () => {
    appendEchoHistory(makeEntry('x'));
    clearEchoHistory();
    expect(readEchoHistory()).toEqual([]);
  });
});

describe('echo counter (localStorage)', () => {
  it('starts at 0 when storage is empty', () => {
    clearEchoCounter();
    expect(readEchoCounter()).toBe(0);
  });

  it('increments monotonically', () => {
    clearEchoCounter();
    expect(incrementEchoCounter()).toBe(1);
    expect(incrementEchoCounter()).toBe(2);
    expect(incrementEchoCounter()).toBe(3);
  });

  it('clearEchoCounter resets to 0', () => {
    incrementEchoCounter();
    incrementEchoCounter();
    clearEchoCounter();
    expect(readEchoCounter()).toBe(0);
  });
});