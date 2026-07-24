// Persona Forecast Battle — pure helpers for the A-vs-B future-
// scenario comparison at /persona-forecast-battle. Two scenarios;
// 4 personas each pick A or B + explain. Pure functions only —
// same pair in produces the same panel + verdict.

import { PERSONAS } from './personas';

export type ForecastBattlePick = 'A' | 'B';

export interface ForecastBattleCritique {
  readonly personaId: string;
  readonly pick: ForecastBattlePick;
  readonly take: string;
}

export interface PersonaForecastBattle {
  readonly scenarioA: string;
  readonly scenarioB: string;
  readonly critiques: ReadonlyArray<ForecastBattleCritique>;
  readonly winner: ForecastBattlePick;
  readonly tally: { readonly a: number; readonly b: number };
}

const PERSONA_TAKES: Record<
  string,
  { A: string; B: string }
> = {
  analyst: {
    A: 'A. The underlying data is more certain. The assumptions are visible and the conclusion follows.',
    B: 'B. The underlying data is more certain. The assumptions are visible and the conclusion follows.',
  },
  futurist: {
    A: 'A. The second-order effects compound faster. The trajectory here is the one that matters.',
    B: 'B. The second-order effects compound faster. The trajectory here is the one that matters.',
  },
  philosopher: {
    A: 'A. The question is the right one. Most forecasts are not. That is the difference.',
    B: 'B. The question is the right one. Most forecasts are not. That is the difference.',
  },
  pragmatist: {
    A: 'A. You can act on this on Monday morning. That is the test most forecasts fail.',
    B: 'B. You can act on this on Monday morning. That is the test most forecasts fail.',
  },
  contrarian: {
    A: 'A. The consensus is a polite disagreement you have not started yet. Take the other side.',
    B: 'B. The consensus is a polite disagreement you have not started yet. Take the other side.',
  },
  scientist: {
    A: 'A. The mechanism is testable. The mechanism behind A is the one I would test first.',
    B: 'B. The mechanism is testable. The mechanism behind B is the one I would test first.',
  },
  historian: {
    A: 'A. Where this has been asked before, the answer was clear. Trust the precedent.',
    B: 'B. Where this has been asked before, the answer was clear. Trust the precedent.',
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
    A: 'A. You read the recipient in their own voice. That is the difference between a good forecast and a true one.',
    B: 'B. You read the recipient in their own voice. That is the difference between a good forecast and a true one.',
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
 * Pure — pick 4 distinct personas from the seed. The 4 personas
 * chosen for a battle are stable: same pair in = same panel.
 */
function pickBattlePanel(seed: string): ReadonlyArray<string> {
  const all = PERSONAS.map((p) => p.id);
  const indices = all.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = simpleHash(`${seed}:${i}`) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const preferred = ['futurist', 'analyst', 'strategist', 'pragmatist'];
  const picked: string[] = [];
  for (const id of preferred) {
    if (picked.length >= 4) break;
    if (all.includes(id)) picked.push(id);
  }
  if (picked.length < 4) {
    for (const i of indices) {
      if (picked.length >= 4) break;
      const personaId = all[i];
      if (personaId && !picked.includes(personaId)) picked.push(personaId);
    }
  }
  return picked.slice(0, 4);
}

/**
 * Pure — build a forecast battle for a pair of scenarios. Each
 * critic's pick is determined by a stable hash of (seed, personaId)
 * so the same input pair produces the same panel.
 */
export function buildForecastBattle(
  scenarioA: string,
  scenarioB: string,
): PersonaForecastBattle {
  const a = scenarioA.trim();
  const b = scenarioB.trim();
  const seed = `${a}::${b}`;
  const panel = pickBattlePanel(seed);
  const critiques: ForecastBattleCritique[] = panel.map((personaId, slot) => {
    const pool = PERSONA_TAKES[personaId];
    const pick: ForecastBattlePick =
      pool
        ? simpleHash(`${seed}::${personaId}::${slot}`) % 2 === 0
          ? 'A'
          : 'B'
        : 'A';
    return {
      personaId,
      pick,
      take: pool?.[pick] ?? 'I have no view on this battle.',
    };
  });
  const tally = critiques.reduce(
    (acc, c) => {
      if (c.pick === 'A') acc.a += 1;
      else acc.b += 1;
      return acc;
    },
    { a: 0, b: 0 },
  );
  const winner: ForecastBattlePick =
    tally.a > tally.b ? 'A' : tally.b > tally.a ? 'B' : simpleHash(seed) % 2 === 0 ? 'A' : 'B';
  return {
    scenarioA: a,
    scenarioB: b,
    critiques,
    winner,
    tally,
  };
}

/** Pure — verify a battle's critiques reference real personas. */
export function forecastBattleValid(battle: PersonaForecastBattle): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const c of battle.critiques) {
    if (!known.has(c.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a forecast battle. */
export function forecastBattleShareUrl(
  origin: string,
  scenarioA: string,
  scenarioB: string,
): string {
  return `${origin}/persona-forecast-battle?a=${encodeURIComponent(scenarioA)}&b=${encodeURIComponent(scenarioB)}`;
}