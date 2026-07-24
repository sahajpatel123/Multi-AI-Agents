// Persona Mosaic Roasting Battle — pure helpers for the 4-mind
// A vs B Mosaic Roasting comparison at
// /persona-mosaic-roasting-battle. Two Mosaic Roasting results;
// 4 personas each pick A or B + explain. Pure functions only.

import { PERSONAS } from './personas';

export type MosaicRoastingBattlePick = 'A' | 'B';

export interface MosaicRoastingBattleCritique {
  readonly personaId: string;
  readonly pick: MosaicRoastingBattlePick;
  readonly take: string;
}

export interface PersonaMosaicRoastingBattle {
  readonly outputA: string;
  readonly outputB: string;
  readonly critiques: ReadonlyArray<MosaicRoastingBattleCritique>;
  readonly winner: MosaicRoastingBattlePick;
  readonly tally: { readonly a: number; readonly b: number };
}

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
    A: 'A. The question is the right one. Most Mosaic Roasting framings are not. That is the difference.',
    B: 'B. The question is the right one. Most Mosaic Roasting framings are not. That is the difference.',
  },
  pragmatist: {
    A: 'A. You can act on this on Monday morning. That is the test most Mosaic Roasting answers fail.',
    B: 'B. You can act on this on Monday morning. That is the test most Mosaic Roasting answers fail.',
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
    A: 'A. You read the recipient in their own voice. That is the difference between a good Mosaic Roasting and a true one.',
    B: 'B. You read the recipient in their own voice. That is the difference between a good Mosaic Roasting and a true one.',
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
 * Pure — build a Mosaic Roasting Battle for two outputs. 4
 * personas each pick A or B + explain. Same inputs in = same
 * panel + same verdict.
 */
export function buildMosaicRoastingBattle(
  outputA: string,
  outputB: string,
): PersonaMosaicRoastingBattle {
  const a = outputA.trim();
  const b = outputB.trim();
  const seed = `${a}::${b}`;
  // Curated 4-persona panel.
  const preferred = ['analyst', 'philosopher', 'pragmatist', 'contrarian'];
  const all = PERSONAS.map((p) => p.id);
  const panel: string[] = [];
  for (const id of preferred) {
    if (panel.length >= 4) break;
    if (all.includes(id)) panel.push(id);
  }
  if (panel.length < 4) {
    for (const i of all) {
      if (panel.length >= 4) break;
      if (!panel.includes(i)) panel.push(i);
    }
  }
  const critiques: MosaicRoastingBattleCritique[] = panel.slice(0, 4).map(
    (personaId, slot) => {
      const pool = PERSONA_TAKES[personaId];
      const pick: MosaicRoastingBattlePick = pool
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
  const winner: MosaicRoastingBattlePick =
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

/** Pure — verify a battle's critiques reference real personas. */
export function mosaicRoastingBattleValid(
  battle: PersonaMosaicRoastingBattle,
): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const c of battle.critiques) {
    if (!known.has(c.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a Mosaic Roasting battle. */
export function mosaicRoastingBattleShareUrl(
  origin: string,
  outputA: string,
  outputB: string,
): string {
  return `${origin}/persona-mosaic-roasting-battle?a=${encodeURIComponent(outputA)}&b=${encodeURIComponent(outputB)}`;
}