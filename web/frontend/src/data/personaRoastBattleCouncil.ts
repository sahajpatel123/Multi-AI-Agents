// Persona Roast Battle Council — pure helpers for the 8-mind
// deliberation at /persona-roast-battle-council. Two AI outputs;
// 8 personas each pick A or B + explain. Pure functions only.

import { PERSONAS } from './personas';

export type RoastBattleCouncilPick = 'A' | 'B';

export interface RoastBattleCouncilCritique {
  readonly personaId: string;
  readonly pick: RoastBattleCouncilPick;
  readonly take: string;
}

export interface PersonaRoastBattleCouncil {
  readonly outputA: string;
  readonly outputB: string;
  readonly critiques: ReadonlyArray<RoastBattleCouncilCritique>;
  readonly winner: RoastBattleCouncilPick;
  readonly tally: { readonly a: number; readonly b: number };
}

// 8 personas with curated A/B takes. Picked deterministically from
// the (seed, personaId, slot) hash so same input = same lineup.
const PERSONA_TAKES: Record<
  string,
  { A: string; B: string }
> = {
  analyst: {
    A: 'A. The reasoning is cleaner; the assumptions are visible and the conclusion follows.',
    B: 'B. The reasoning is cleaner; the assumptions are visible and the conclusion follows.',
  },
  futurist: {
    A: 'A. The second-order effects compound faster. The trajectory here is the one that matters.',
    B: 'B. The second-order effects compound faster. The trajectory here is the one that matters.',
  },
  philosopher: {
    A: 'A. The question is the right one. Most outputs are not. That is the difference.',
    B: 'B. The question is the right one. Most outputs are not. That is the difference.',
  },
  pragmatist: {
    A: 'A. You can act on this on Monday morning. That is the test most outputs fail.',
    B: 'B. You can act on this on Monday morning. That is the test most outputs fail.',
  },
  contrarian: {
    A: 'A. I am taking the opposite side. The consensus is a polite disagreement you have not started yet.',
    B: 'B. I am taking the opposite side. The consensus is a polite disagreement you have not started yet.',
  },
  scientist: {
    A: 'A. The mechanism is real. The mechanism behind A is the one I would test first.',
    B: 'B. The mechanism is real. The mechanism behind B is the one I would test first.',
  },
  historian: {
    A: 'A. Where this has been tried before, the answer was clear. Trust the precedent.',
    B: 'B. Where this has been tried before, the answer was clear. Trust the precedent.',
  },
  economist: {
    A: 'A. The expected value calculation supports this. The incentive alignment is sound.',
    B: 'B. The expected value calculation supports this. The incentive alignment is sound.',
  },
  ethicist: {
    A: 'A. The decision is consistent with the values you have stated. The cost is borne by the people you have named.',
    B: 'B. The decision is consistent with the values you have stated. The cost is borne by the people you have named.',
  },
  stoic: {
    A: 'A. Choose the part that is yours. The rest is a story you tell yourself about why you cannot move.',
    B: 'B. Choose the part that is yours. The rest is a story you tell yourself about why you cannot move.',
  },
  strategist: {
    A: 'A. Pick the move, not the work. Asymmetric bets beat grind every time.',
    B: 'B. Pick the move, not the work. Asymmetric bets beat grind every time.',
  },
  engineer: {
    A: 'A. The constraint, if removed, changes everything. Solve that one first.',
    B: 'B. The constraint, if removed, changes everything. Solve that one first.',
  },
  optimist: {
    A: 'A. The mechanism is real. People who bet against it will be wrong, but for the right reasons.',
    B: 'B. The mechanism is real. People who bet against it will be wrong, but for the right reasons.',
  },
  empath: {
    A: 'A. You read the recipient in their own voice. That is the difference between a good output and a true one.',
    B: 'B. You read the recipient in their own voice. That is the difference between a good output and a true one.',
  },
  firstprinciples: {
    A: 'A. The framing is sound. The question, stripped of the framing, still asks the same thing.',
    B: 'B. The framing is sound. The question, stripped of the framing, still asks the same thing.',
  },
  devilsadvocate: {
    A: 'A. The strongest case against your own position is the one you are most afraid to read.',
    B: 'B. The strongest case against your own position is the one you are most afraid to read.',
  },
};

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Pure — build a Roast Battle Council for a pair of AI outputs.
 * 8 personas each pick A or B + explain. Same input pair = same
 * panel + verdict.
 */
export function buildRoastBattleCouncil(
  outputA: string,
  outputB: string,
): PersonaRoastBattleCouncil {
  const a = outputA.trim();
  const b = outputB.trim();
  const seed = `${a}::${b}`;
  // Pick 8 distinct personas. Preferred 8 in a curated order.
  const all = PERSONAS.map((p) => p.id);
  const preferred = [
    'analyst',
    'futurist',
    'philosopher',
    'pragmatist',
    'contrarian',
    'scientist',
    'strategist',
    'ethicist',
  ];
  const picked: string[] = [];
  for (const id of preferred) {
    if (picked.length >= 8) break;
    if (all.includes(id)) picked.push(id);
  }
  if (picked.length < 8) {
    for (const i of all) {
      if (picked.length >= 8) break;
      if (!picked.includes(i)) picked.push(i);
    }
  }
  const panel = picked.slice(0, 8);
  const critiques: RoastBattleCouncilCritique[] = panel.map(
    (personaId, slot) => {
      const pool = PERSONA_TAKES[personaId];
      const pick: RoastBattleCouncilPick = pool
        ? simpleHash(`${seed}::${personaId}::${slot}`) % 2 === 0
          ? 'A'
          : 'B'
        : 'A';
      return {
        personaId,
        pick,
        take: pool?.[pick] ?? 'I have no view on this battle.',
      };
    },
  );
  const tally = critiques.reduce(
    (acc, c) => {
      if (c.pick === 'A') acc.a += 1;
      else acc.b += 1;
      return acc;
    },
    { a: 0, b: 0 },
  );
  const winner: RoastBattleCouncilPick =
    tally.a > tally.b
      ? 'A'
      : tally.b > tally.a
      ? 'B'
      : simpleHash(seed) % 2 === 0
      ? 'A'
      : 'B';
  return {
    outputA: a,
    outputB: b,
    critiques,
    winner,
    tally,
  };
}

/** Pure — verify a council's critiques reference real personas. */
export function roastBattleCouncilValid(council: PersonaRoastBattleCouncil): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const c of council.critiques) {
    if (!known.has(c.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a roast battle council. */
export function roastBattleCouncilShareUrl(
  origin: string,
  outputA: string,
  outputB: string,
): string {
  return `${origin}/persona-roast-battle-council?a=${encodeURIComponent(outputA)}&b=${encodeURIComponent(outputB)}`;
}