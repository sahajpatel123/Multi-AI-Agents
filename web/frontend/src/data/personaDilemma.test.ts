/**
 * Tests for Persona Dilemma data + split engine.
 *
 * The Dilemma page is the A-vs-B debate surface at /persona-dilemma.
 * 4 personas split into arguing sides; user picks the winner.
 *
 * Invariants:
 *  - exactly 4 takes per dilemma
 *  - exactly 2 on each side (left + right)
 *  - takes reference real persona ids
 *  - same dilemma in = same lineup out (deterministic)
 *  - dilemmaTally sums to 4
 *  - share URL encodes both options
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  appendDecision,
  buildDilemma,
  clearDecisions,
  dilemmaShareUrl,
  dilemmaTally,
  dilemmaValid,
  readDecisions,
  winTally,
  type DilemmaDecisionEntry,
} from './personaDilemma';

describe('buildDilemma', () => {
  it('returns 4 takes', () => {
    const d = buildDilemma('safe job', 'risky startup');
    expect(d.takes).toHaveLength(4);
  });

  it('has exactly 2 takes on each side', () => {
    const d = buildDilemma('A', 'B');
    const left = d.takes.filter((t) => t.side === 'left').length;
    const right = d.takes.filter((t) => t.side === 'right').length;
    expect(left).toBe(2);
    expect(right).toBe(2);
  });

  it('every take references a real persona', () => {
    const d = buildDilemma('Sample A', 'Sample B');
    expect(dilemmaValid(d)).toBe(true);
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const t of d.takes) {
      expect(known.has(t.personaId)).toBe(true);
    }
  });

  it('every take has a non-empty take string', () => {
    const d = buildDilemma('Safe', 'Risky');
    for (const t of d.takes) {
      expect(t.take.length).toBeGreaterThan(20);
    }
  });

  it('is deterministic for the same dilemma', () => {
    const a = buildDilemma('Safe job', 'Risky startup');
    const b = buildDilemma('Safe job', 'Risky startup');
    expect(a.takes.map((t) => `${t.personaId}:${t.side}`)).toEqual(
      b.takes.map((t) => `${t.personaId}:${t.side}`),
    );
  });

  it('produces different lineups for different dilemmas', () => {
    const a = buildDilemma('Stay', 'Leave');
    const b = buildDilemma('Ship now', 'Ship later');
    const aKey = a.takes.map((t) => `${t.personaId}:${t.side}`).join('|');
    const bKey = b.takes.map((t) => `${t.personaId}:${t.side}`).join('|');
    expect(aKey).not.toBe(bKey);
  });

  it('returns 4 distinct persona ids', () => {
    const d = buildDilemma('X', 'Y');
    const ids = d.takes.map((t) => t.personaId);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('dilemmaTally', () => {
  it('returns 2/2 for any valid dilemma', () => {
    const d = buildDilemma('A', 'B');
    expect(dilemmaTally(d)).toEqual({ left: 2, right: 2 });
  });
});

describe('dilemmaShareUrl', () => {
  it('encodes both options into the query string', () => {
    const url = dilemmaShareUrl('https://x', 'Safe', 'Risky');
    expect(url).toContain('/persona-dilemma');
    expect(url).toContain('l=Safe');
    expect(url).toContain('r=Risky');
  });
});

describe('decisions + winTally (localStorage)', () => {
  const makeEntry = (id: string, winner: 'left' | 'right'): DilemmaDecisionEntry => ({
    id,
    left: 'A',
    right: 'B',
    winner,
    savedAt: new Date().toISOString(),
  });

  it('readDecisions returns empty array when storage is empty', () => {
    clearDecisions();
    expect(readDecisions()).toEqual([]);
  });

  it('appendDecision + readDecisions round-trip', () => {
    clearDecisions();
    appendDecision(makeEntry('d-1', 'left'));
    expect(readDecisions()).toHaveLength(1);
  });

  it('appendDecision deduplicates by id', () => {
    clearDecisions();
    appendDecision(makeEntry('dup', 'left'));
    appendDecision(makeEntry('dup', 'right'));
    const result = readDecisions();
    expect(result.length).toBe(1);
    expect(result[0].winner).toBe('right');
  });

  it('appendDecision caps at 50 entries', () => {
    clearDecisions();
    for (let i = 0; i < 60; i++) {
      appendDecision(makeEntry(`d-${i}`, i % 2 === 0 ? 'left' : 'right'));
    }
    expect(readDecisions().length).toBeLessThanOrEqual(50);
  });

  it('clearDecisions empties storage', () => {
    appendDecision(makeEntry('x', 'left'));
    clearDecisions();
    expect(readDecisions()).toEqual([]);
  });
});

describe('winTally', () => {
  it('returns 0/0 for empty history', () => {
    expect(winTally([])).toEqual({ left: 0, right: 0, total: 0 });
  });

  it('counts left and right winners correctly', () => {
    const decisions: ReadonlyArray<DilemmaDecisionEntry> = [
      { id: 'a', left: 'A', right: 'B', winner: 'left', savedAt: '' },
      { id: 'b', left: 'C', right: 'D', winner: 'left', savedAt: '' },
      { id: 'c', left: 'E', right: 'F', winner: 'right', savedAt: '' },
      { id: 'd', left: 'G', right: 'H', winner: 'right', savedAt: '' },
      { id: 'e', left: 'I', right: 'J', winner: 'right', savedAt: '' },
    ];
    expect(winTally(decisions)).toEqual({ left: 2, right: 3, total: 5 });
  });
});