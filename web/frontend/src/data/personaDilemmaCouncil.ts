// Persona Dilemma Council — pure helpers for the 8-mind A-vs-B
// dilemma deliberation at /persona-dilemma-council. Two options;
// 8 personas each pick a side + explain. Pure functions only.

import { PERSONAS } from './personas';

export type DilemmaCouncilPick = 'A' | 'B';

export interface DilemmaCouncilTake {
  readonly personaId: string;
  readonly pick: DilemmaCouncilPick;
  readonly take: string;
}

export interface PersonaDilemmaCouncil {
  readonly optionA: string;
  readonly optionB: string;
  readonly critiques: ReadonlyArray<DilemmaCouncilTake>;
  readonly winner: DilemmaCouncilPick;
  readonly tally: { readonly a: number; readonly b: number };
}

const PERSONA_TAKES: Record<
  string,
  { A: string; B: string }
> = {
  analyst: {
    A: 'A. The data supports this. The alternative has more uncertainty than its advocates admit.',
    B: 'B. The data supports this. The alternative has more uncertainty than its advocates admit.',
  },
  futurist: {
    A: 'A. The second-order effects compound faster. The trajectory here is the one that matters.',
    B: 'B. The second-order effects compound faster. The trajectory here is the one that matters.',
  },
  philosopher: {
    A: 'A. The question is the right one. Most dilemma framings are not. That is the difference.',
    B: 'B. The question is the right one. Most dilemma framings are not. That is the difference.',
  },
  pragmatist: {
    A: 'A. You can act on this on Monday morning. That is the test most dilemma answers fail.',
    B: 'B. You can act on this on Monday morning. That is the test most dilemma answers fail.',
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
    A: 'A. Where this kind of dilemma has been resolved before, the answer was clear. Trust the precedent.',
    B: 'B. Where this kind of dilemma has been resolved before, the answer was clear. Trust the precedent.',
  },
  economist: {
    A: 'A. The expected value calculation supports this. The incentive alignment is sound.',
    B: 'B. The expected value calculation supports this. The incentive alignment is sound.',
  },
  ethicist: {
    A: 'A. The decision is consistent with the values you have stated. The cost is borne by the people you have named.',
    B: 'B. ' +
      'B. The decision is consistent with the values you have stated. The cost is borne by the people you have named.',
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
    A: 'A. You read the recipient in their own voice. That is the difference between a good answer and a true one.',
    B: 'B. You read the recipient in their own voice. That is the difference between a good answer and a true one.',
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
 * Pure — build a Dilemma Council for two options. 8 personas
 * each pick A or B + explain. Same options in = same panel +
 * same verdict.
 */
export function buildDilemmaCouncil(
  optionA: string,
  optionB: string,
): PersonaDilemmaCouncil {
  const a = optionA.trim();
  const b = optionB.trim();
  const seed = `${a}::${b}`;
  // Curated 8-persona panel.
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
  const all = PERSONAS.map((p) => p.id);
  const panel: string[] = [];
  for (const id of preferred) {
    if (panel.length >= 8) break;
    if (all.includes(id)) panel.push(id);
  }
  if (panel.length < 8) {
    for (const i of all) {
      if (panel.length >= 8) break;
      if (!panel.includes(i)) panel.push(i);
    }
  }
  const critiques: DilemmaCouncilTake[] = panel.slice(0, 8).map(
    (personaId, slot) => {
      const pool = PERSONA_TAKES[personaId];
      const pick: DilemmaCouncilPick = pool
        ? simpleHash(`${seed}::${personaId}::${slot}`) % 2 === 0
          ? 'A'
          : 'B'
        : 'A';
      return {
        personaId,
        pick,
        take: pool?.[pick] ?? 'I have no view on this dilemma.',
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
  const winner: DilemmaCouncilPick =
    tally.a > tally.b
      ? 'A'
      : tally.b > tally.a
      ? 'B'
      : simpleHash(seed) % 2 === 0
      ? 'A'
      : 'B';
  return {
    optionA: a,
    optionB: b,
    critiques,
    winner,
    tally,
  };
}

/** Pure — verify a council's critiques reference real personas. */
export function dilemmaCouncilValid(council: PersonaDilemmaCouncil): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const c of council.critiques) {
    if (!known.has(c.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a dilemma council. */
export function dilemmaCouncilShareUrl(
  origin: string,
  optionA: string,
  optionB: string,
): string {
  return `${origin}/persona-dilemma-council?a=${encodeURIComponent(optionA)}&b=${encodeURIComponent(optionB)}`;
}

// Lifetime counter + A/B win tally — persisted across reloads.

export interface DilemmaCouncilDecisionEntry {
  readonly id: string;
  readonly optionASnippet: string;
  readonly optionBSnippet: string;
  readonly winner: DilemmaCouncilPick;
  readonly savedAt: string;
}

const COUNTER_KEY = 'arena:persona-dilemma-council:counter:v1';
const DECISIONS_KEY = 'arena:persona-dilemma-council:decisions:v1';
const DECISIONS_LIMIT = 50;

export function readDilemmaCouncilCounter(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(COUNTER_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function incrementDilemmaCouncilCounter(): number {
  const next = readDilemmaCouncilCounter() + 1;
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(COUNTER_KEY, String(next));
  } catch {
    /* silent */
  }
  return next;
}

export function clearDilemmaCouncilCounter() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(COUNTER_KEY);
  } catch {
    /* silent */
  }
}

export function appendDilemmaCouncilDecision(
  entry: DilemmaCouncilDecisionEntry,
) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(DECISIONS_KEY);
    const existing: DilemmaCouncilDecisionEntry[] = raw
      ? (JSON.parse(raw) as DilemmaCouncilDecisionEntry[])
      : [];
    const next = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, DECISIONS_LIMIT);
    window.localStorage.setItem(DECISIONS_KEY, JSON.stringify(next));
  } catch {
    /* silent */
  }
}

export function readDilemmaCouncilDecisions(): ReadonlyArray<DilemmaCouncilDecisionEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DECISIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DilemmaCouncilDecisionEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        (e.winner === 'A' || e.winner === 'B'),
    );
  } catch {
    return [];
  }
}

export function clearDilemmaCouncilDecisions() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DECISIONS_KEY);
  } catch {
    /* silent */
  }
}

export interface DilemmaCouncilTally {
  readonly a: number;
  readonly b: number;
}

/** Pure — compute lifetime A vs B win tally from decision log. */
export function dilemmaCouncilWinTally(
  decisions: ReadonlyArray<DilemmaCouncilDecisionEntry>,
): DilemmaCouncilTally {
  let a = 0;
  let b = 0;
  for (const d of decisions) {
    if (d.winner === 'A') a += 1;
    else b += 1;
  }
  return { a, b };
}

export type DilemmaCouncilMajorityLabel = 'decisive' | 'leaning' | 'split';

export interface DilemmaCouncilMajorityInfo {
  readonly label: DilemmaCouncilMajorityLabel;
  readonly description: string;
  readonly winnerCount: number;
  readonly loserCount: number;
}

/** Pure — describe how decisive a tally is. For an 8-mind
 * council: 5+/8 is decisive, 4/8 is leaning, 3/8 is split. */
export function dilemmaCouncilMajorityInfo(
  tally: DilemmaCouncilTally,
  winner: DilemmaCouncilPick,
): DilemmaCouncilMajorityInfo {
  const winnerCount = winner === 'A' ? tally.a : tally.b;
  const loserCount = winner === 'A' ? tally.b : tally.a;
  if (winnerCount >= 5) {
    return {
      label: 'decisive',
      description: `${winnerCount} of 8 minds — a strong majority.`,
      winnerCount,
      loserCount,
    };
  }
  if (winnerCount === 4) {
    return {
      label: 'leaning',
      description: `${winnerCount} of 8 minds — a slight lean. The other side had real support.`,
      winnerCount,
      loserCount,
    };
  }
  return {
    label: 'split',
    description: `Only ${winnerCount} of 8 minds — a genuine split. Run another council for clarity.`,
    winnerCount,
    loserCount,
  };
}
