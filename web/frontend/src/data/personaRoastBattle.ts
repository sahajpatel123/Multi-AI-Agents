// Persona Roast Battle — pure helpers for the A-vs-B output
// comparison at /persona-roast-battle. 4 personas each pick a
// winner between two AI outputs + explain why. Pure functions only.

import { PERSONAS } from './personas';

export type RoastBattlePick = 'A' | 'B';

export interface RoastBattleCritique {
  readonly personaId: string;
  readonly pick: RoastBattlePick;
  readonly take: string;
}

export interface PersonaRoastBattle {
  readonly outputA: string;
  readonly outputB: string;
  readonly critiques: ReadonlyArray<RoastBattleCritique>;
  readonly winner: RoastBattlePick;
  readonly tally: { readonly a: number; readonly b: number };
}

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Per-persona pick templates — each persona has one take per side
// so they always have a view.

const PERSONA_PICKS: Record<
  string,
  { A: string; B: string }
> = {
  analyst: {
    A: 'A. The reasoning is cleaner; the assumptions are visible and the conclusion follows.',
    B: 'B. The reasoning is cleaner; the assumptions are visible and the conclusion follows.',
  },
  philosopher: {
    A: 'A. It asks the better question, even if the answer is less polished.',
    B: 'B. It asks the better question, even if the answer is less polished.',
  },
  pragmatist: {
    A: 'A. You can act on this on Monday morning. B is the kind of answer that sounds smart and ships nothing.',
    B: 'B. You can act on this on Monday morning. A is the kind of answer that sounds smart and ships nothing.',
  },
  strategist: {
    A: 'A. It picks a move. B explains why a move is hard. Pick the move.',
    B: 'B. It picks a move. A explains why a move is hard. Pick the move.',
  },
};

/**
 * Pure — pick 4 distinct personas from the seed. The 4 personas
 * chosen for a battle are stable: same pair in = same panel every
 * time.
 */
function pickBattlePanel(seed: string): ReadonlyArray<string> {
  const all = PERSONAS.map((p) => p.id);
  const indices = all.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = simpleHash(`${seed}:${i}`) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const preferred = ['analyst', 'philosopher', 'pragmatist', 'strategist'];
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
 * Pure — build the roast battle for a pair of outputs. Each
 * critic's pick is determined by a stable hash of (seed, personaId)
 * so the same input pair produces the same panel.
 */
export function buildRoastBattle(
  outputA: string,
  outputB: string,
): PersonaRoastBattle {
  const a = outputA.trim();
  const b = outputB.trim();
  const seed = `${a}::${b}`;
  const panel = pickBattlePanel(seed);
  // Pick side: hash the (seed, personaId) and use bit 0 to pick A/B.
  const critiques: RoastBattleCritique[] = panel.map((personaId, slot) => {
    const pool = PERSONA_PICKS[personaId];
    // Hash the (seed, personaId, slot) tuple so each persona's pick
    // varies meaningfully across inputs. The previous simple-hash
    // form had too much collision on the curated pool.
    const pick: RoastBattlePick =
      simpleHash(`${seed}::${personaId}::${slot}`) % 2 === 0 ? 'A' : 'B';
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
  const winner: RoastBattlePick = tally.a > tally.b ? 'A' : tally.b > tally.a ? 'B' : (simpleHash(seed) % 2 === 0 ? 'A' : 'B');
  return {
    outputA: a,
    outputB: b,
    critiques,
    winner,
    tally,
  };
}

/** Pure — verify a battle's critiques reference real personas. */
export function roastBattleValid(battle: PersonaRoastBattle): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const c of battle.critiques) {
    if (!known.has(c.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a roast battle. */
export function roastBattleShareUrl(
  origin: string,
  outputA: string,
  outputB: string,
): string {
  return `${origin}/persona-roast-battle?a=${encodeURIComponent(outputA)}&b=${encodeURIComponent(outputB)}`;
}