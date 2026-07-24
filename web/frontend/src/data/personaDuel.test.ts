/**
 * Tests for Persona Duel bracket engine.
 *
 * The duel page is the 16-persona single-elimination tournament at
 * /persona-duel. It depends on:
 *  - building a valid bracket (3 rounds, 8 → 4 → 2 → 1 matchups)
 *  - the bracket being deterministic for the same seed
 *  - picks being validated against the two participants
 *  - picks cascading to the next round's matchup slots
 *  - the champion being correctly identified when the final round ends
 *  - share URL encoding the seed
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from './personas';
import {
  applyPick,
  buildBracket,
  currentChampion,
  duelShareUrl,
  pickCount,
  totalMatchups,
} from './personaDuel';

const CATALOG_SIZE = PERSONAS.length;

describe('buildBracket', () => {
  it(`has ${Math.log2(CATALOG_SIZE)} rounds for a ${CATALOG_SIZE}-persona catalog`, () => {
    const bracket = buildBracket('test-seed');
    expect(bracket.rounds.length).toBe(Math.log2(CATALOG_SIZE));
  });

  it(`first round has ${CATALOG_SIZE / 2} matchups`, () => {
    const bracket = buildBracket('test-seed');
    expect(bracket.rounds[0].matchups.length).toBe(CATALOG_SIZE / 2);
  });

  it('halves matchup count each round until final', () => {
    const bracket = buildBracket('test-seed');
    for (let i = 1; i < bracket.rounds.length; i++) {
      const prev = bracket.rounds[i - 1].matchups.length;
      const cur = bracket.rounds[i].matchups.length;
      expect(cur).toBe(prev / 2);
    }
  });

  it('starts with no winners picked', () => {
    const bracket = buildBracket('test-seed');
    for (const round of bracket.rounds) {
      for (const m of round.matchups) {
        expect(m.winnerId).toBeNull();
      }
    }
  });

  it('every first-round matchup pairs two distinct personas from the catalog', () => {
    const bracket = buildBracket('test-seed');
    const known = new Set(PERSONAS.map((p) => p.id));
    for (const m of bracket.rounds[0].matchups) {
      expect(known.has(m.leftId)).toBe(true);
      expect(known.has(m.rightId)).toBe(true);
      expect(m.leftId).not.toBe(m.rightId);
    }
  });

  it('every persona appears exactly once in the first round', () => {
    const bracket = buildBracket('test-seed');
    const ids: string[] = [];
    for (const m of bracket.rounds[0].matchups) {
      ids.push(m.leftId, m.rightId);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(CATALOG_SIZE);
  });

  it('is deterministic for the same seed', () => {
    const a = buildBracket('repeatable');
    const b = buildBracket('repeatable');
    expect(a.rounds[0].matchups.map((m) => [m.leftId, m.rightId])).toEqual(
      b.rounds[0].matchups.map((m) => [m.leftId, m.rightId]),
    );
  });

  it('produces different brackets for different seeds', () => {
    const a = buildBracket('seed-a');
    const b = buildBracket('seed-b');
    const aPairs = a.rounds[0].matchups.map((m) => `${m.leftId}-${m.rightId}`);
    const bPairs = b.rounds[0].matchups.map((m) => `${m.leftId}-${m.rightId}`);
    expect(aPairs).not.toEqual(bPairs);
  });
});

describe('applyPick', () => {
  it('returns the same bracket when the matchup id is unknown', () => {
    const bracket = buildBracket('test');
    const updated = applyPick(bracket, 'bogus', bracket.rounds[0].matchups[0].leftId);
    expect(updated).toEqual(bracket);
  });

  it('returns the same bracket when the winner is not a participant', () => {
    const bracket = buildBracket('test');
    const first = bracket.rounds[0].matchups[0];
    const updated = applyPick(bracket, first.id, 'not-a-persona');
    expect(updated).toEqual(bracket);
  });

  it('records the winner and cascades to the next round', () => {
    const bracket = buildBracket('test');
    const first = bracket.rounds[0].matchups[0];
    const winner = first.leftId;
    const updated = applyPick(bracket, first.id, winner);
    expect(updated.rounds[0].matchups[0].winnerId).toBe(winner);

    if (bracket.rounds.length > 1) {
      const nextRoundFirst = updated.rounds[1].matchups[0];
      // The winner should now appear in the next round's slot.
      expect([nextRoundFirst.leftId, nextRoundFirst.rightId]).toContain(winner);
    }
  });

  it('champion is null until the final round has a winner', () => {
    const bracket = buildBracket('test');
    // Pick one first-round matchup only.
    const updated = applyPick(
      bracket,
      bracket.rounds[0].matchups[0].id,
      bracket.rounds[0].matchups[0].leftId,
    );
    expect(updated.championId).toBeNull();
  });

  it('champion is set after all rounds are fully picked', () => {
    let bracket = buildBracket('test');
    // Walk through every matchup, always picking the left persona.
    while (pickCount(bracket) < totalMatchups(bracket)) {
      const next = bracket.rounds
        .flatMap((r) => r.matchups)
        .find((m) => !m.winnerId);
      if (!next) break;
      bracket = applyPick(bracket, next.id, next.leftId);
    }
    expect(bracket.championId).not.toBeNull();
    expect(currentChampion(bracket)).toBe(bracket.championId);
  });
});

describe('pickCount + totalMatchups', () => {
  it('totalMatchups = sum of all matchup counts', () => {
    const bracket = buildBracket('test');
    const expected = bracket.rounds.reduce((sum, r) => sum + r.matchups.length, 0);
    expect(totalMatchups(bracket)).toBe(expected);
    expect(totalMatchups(bracket)).toBe(CATALOG_SIZE - 1);
  });

  it('pickCount starts at 0 and grows with each pick', () => {
    const bracket = buildBracket('test');
    expect(pickCount(bracket)).toBe(0);
    const updated = applyPick(
      bracket,
      bracket.rounds[0].matchups[0].id,
      bracket.rounds[0].matchups[0].leftId,
    );
    expect(pickCount(updated)).toBe(1);
  });
});

describe('duelShareUrl', () => {
  it('encodes the seed into a query string', () => {
    const url = duelShareUrl('https://x', 'my-seed');
    expect(url).toBe('https://x/persona-duel?seed=my-seed');
  });
});