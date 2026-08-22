// Persona Dilemma Forecast — pure helpers for the 4-mind
// "which dilemma is sharper?" surface at
// /persona-dilemma-forecast. Two dilemma questions; 4
// personas each pick A or B + explain. Pure functions only.

import { PERSONAS } from './personas';

export type DilemmaForecastPick = 'A' | 'B';

export interface DilemmaForecastCritique {
  readonly personaId: string;
  readonly pick: DilemmaForecastPick;
  readonly take: string;
}

export interface PersonaDilemmaForecast {
  readonly dilemmaA: string;
  readonly dilemmaB: string;
  readonly critiques: ReadonlyArray<DilemmaForecastCritique>;
  readonly winner: DilemmaForecastPick;
  readonly tally: { readonly a: number; readonly b: number };
}

const PERSONA_TAKES: Record<
  string,
  { A: string; B: string }
> = {
  analyst: {
    A: 'A. The framing carries a clearer assumption. The dilemma asks the question the user can act on.',
    B: 'B. The framing carries a clearer assumption. The dilemma asks the question the user can act on.',
  },
  futurist: {
    A: 'A. The dilemma has a longer second-order arc. It points to where the decision will be re-evaluated.',
    B: 'B. The dilemma has a longer second-order arc. It points to where the decision will be re-evaluated.',
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
    A: 'A. The mechanism behind A is testable. The mechanism behind B is post-hoc.',
    B: 'B. The mechanism behind B is testable. The mechanism behind A is post-hoc.',
  },
  historian: {
    A: 'A. Where this kind of dilemma has been asked before, the answer was clear.',
    B: 'B. Where this kind of dilemma has been asked before, the answer was clear.',
  },
  economist: {
    A: 'A. The expected value calculation supports A. The incentive alignment is sound.',
    B: 'B. The expected value calculation supports B. The incentive alignment is sound.',
  },
  ethicist: {
    A: 'A. The cost is borne by the people you have named. The decision is consistent with your values.',
    B: 'B. The cost is borne by the people you have named. The decision is consistent with your values.',
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
 * Pure — build a Dilemma Forecast for two dilemma questions. 4
 * personas each pick A or B + explain. Same dilemmas in = same
 * panel + same verdict.
 */
export function buildDilemmaForecast(
  dilemmaA: string,
  dilemmaB: string,
): PersonaDilemmaForecast {
  const a = dilemmaA.trim();
  const b = dilemmaB.trim();
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
  const critiques: DilemmaForecastCritique[] = panel.slice(0, 4).map(
    (personaId, slot) => {
      const pool = PERSONA_TAKES[personaId];
      const pick: DilemmaForecastPick = pool
        ? simpleHash(`${seed}::${personaId}::${slot}`) % 2 === 0
          ? 'A'
          : 'B'
        : 'A';
      return {
        personaId,
        pick,
        take: pool?.[pick] ?? 'I have no view on this dilemma forecast.',
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
  const winner: DilemmaForecastPick =
    tally.a > tally.b
      ? 'A'
      : tally.b > tally.a
      ? 'B'
      : simpleHash(seed) % 2 === 0
      ? 'A'
      : 'B';
  return {
    dilemmaA: a,
    dilemmaB: b,
    critiques,
    winner,
    tally,
  };
}

/** Pure — verify a forecast's critiques reference real personas. */
export function dilemmaForecastValid(forecast: PersonaDilemmaForecast): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const c of forecast.critiques) {
    if (!known.has(c.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a dilemma forecast. */
export function dilemmaForecastShareUrl(
  origin: string,
  dilemmaA: string,
  dilemmaB: string,
): string {
  return `${origin}/persona-dilemma-forecast?a=${encodeURIComponent(dilemmaA)}&b=${encodeURIComponent(dilemmaB)}`;
}

// Lifetime counter + A/B win tally — persisted across reloads.

export interface DilemmaForecastDecisionEntry {
  readonly id: string;
  readonly dilemmaASnippet: string;
  readonly dilemmaBSnippet: string;
  readonly winner: DilemmaForecastPick;
  readonly savedAt: string;
}

const COUNTER_KEY = 'arena:persona-dilemma-forecast:counter:v1';
const DECISIONS_KEY = 'arena:persona-dilemma-forecast:decisions:v1';
const DECISIONS_LIMIT = 50;

export function readDilemmaForecastCounter(): number {
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

export function incrementDilemmaForecastCounter(): number {
  const next = readDilemmaForecastCounter() + 1;
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(COUNTER_KEY, String(next));
  } catch {
    /* silent */
  }
  return next;
}

export function clearDilemmaForecastCounter() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(COUNTER_KEY);
  } catch {
    /* silent */
  }
}

export function appendDilemmaForecastDecision(
  entry: DilemmaForecastDecisionEntry,
) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(DECISIONS_KEY);
    const existing: DilemmaForecastDecisionEntry[] = raw
      ? (JSON.parse(raw) as DilemmaForecastDecisionEntry[])
      : [];
    const next = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, DECISIONS_LIMIT);
    window.localStorage.setItem(DECISIONS_KEY, JSON.stringify(next));
  } catch {
    /* silent */
  }
}

export function readDilemmaForecastDecisions(): ReadonlyArray<DilemmaForecastDecisionEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DECISIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DilemmaForecastDecisionEntry[];
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

export function clearDilemmaForecastDecisions() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DECISIONS_KEY);
  } catch {
    /* silent */
  }
}

export interface DilemmaForecastTally {
  readonly a: number;
  readonly b: number;
}

/** Pure — compute lifetime A vs B win tally from decision log. */
export function dilemmaForecastWinTally(
  decisions: ReadonlyArray<DilemmaForecastDecisionEntry>,
): DilemmaForecastTally {
  let a = 0;
  let b = 0;
  for (const d of decisions) {
    if (d.winner === 'A') a += 1;
    else b += 1;
  }
  return { a, b };
}

export type DilemmaForecastMajorityLabel = 'unanimous' | 'strong' | 'split';

export interface DilemmaForecastMajorityInfo {
  readonly label: DilemmaForecastMajorityLabel;
  readonly description: string;
  readonly winnerCount: number;
  readonly loserCount: number;
}

/** Pure — describe how decisive a tally is. For a 4-mind panel:
 * 4/4 is unanimous, 3/4 is strong, 2/4 is split. */
export function dilemmaForecastMajorityInfo(
  tally: DilemmaForecastTally,
  winner: DilemmaForecastPick,
): DilemmaForecastMajorityInfo {
  const winnerCount = winner === 'A' ? tally.a : tally.b;
  const loserCount = winner === 'A' ? tally.b : tally.a;
  if (winnerCount === 4) {
    return {
      label: 'unanimous',
      description: '4 of 4 minds — unanimous.',
      winnerCount,
      loserCount,
    };
  }
  if (winnerCount === 3) {
    return {
      label: 'strong',
      description: '3 of 4 minds — a strong majority.',
      winnerCount,
      loserCount,
    };
  }
  return {
    label: 'split',
    description: '2 of 4 minds — a genuine split.',
    winnerCount,
    loserCount,
  };
}
