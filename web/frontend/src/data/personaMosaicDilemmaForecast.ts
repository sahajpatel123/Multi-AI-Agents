// Persona Mosaic Dilemma Forecast — pure helpers for the 8-mind
// A vs B dilemma framing comparison at /persona-mosaic-dilemma-forecast.
// Two dilemma framings; 8 personas each pick a side + explain.

import { PERSONAS } from './personas';

export type MosaicDilemmaForecastPick = 'A' | 'B';

export interface MosaicDilemmaForecastCritique {
  readonly personaId: string;
  readonly pick: MosaicDilemmaForecastPick;
  readonly take: string;
}

export interface PersonaMosaicDilemmaForecastTally {
  readonly a: number;
  readonly b: number;
}

export interface PersonaMosaicDilemmaForecast {
  readonly dilemmaA: string;
  readonly dilemmaB: string;
  readonly critiques: ReadonlyArray<MosaicDilemmaForecastCritique>;
  readonly winner: MosaicDilemmaForecastPick;
  readonly tally: PersonaMosaicDilemmaForecastTally;
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
    A: 'A. You read the recipient in their own voice. That is the difference between a good dilemma and a true one.',
    B: 'B. You read the recipient in their own voice. That is the difference between a good dilemma and a true one.',
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

// Panel size for the 8-mind dilemma framing. Sourced from the
// curated list below; a future change to that list updates this
// constant so the share text + majority descriptions stay in
// sync.
const PANEL_SIZE = 8;
export { PANEL_SIZE };

/**
 * Pure — build a Mosaic Dilemma Forecast for two framings. 8
 * personas each pick A or B + explain. Same inputs in = same
 * panel + same verdict.
 */
export function buildMosaicDilemmaForecast(
  dilemmaA: string,
  dilemmaB: string,
): PersonaMosaicDilemmaForecast {
  const a = dilemmaA.trim();
  const b = dilemmaB.trim();
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
    if (panel.length >= PANEL_SIZE) break;
    if (all.includes(id)) panel.push(id);
  }
  if (panel.length < PANEL_SIZE) {
    for (const i of all) {
      if (panel.length >= PANEL_SIZE) break;
      if (!panel.includes(i)) panel.push(i);
    }
  }
  const critiques: MosaicDilemmaForecastCritique[] = panel.slice(0, PANEL_SIZE).map(
    (personaId, slot) => {
      const pool = PERSONA_TAKES[personaId];
      const pick: MosaicDilemmaForecastPick = pool
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
  const winner: MosaicDilemmaForecastPick =
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
export function mosaicDilemmaForecastValid(
  forecast: PersonaMosaicDilemmaForecast,
): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const c of forecast.critiques) {
    if (!known.has(c.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a Mosaic Dilemma Forecast. */
export function mosaicDilemmaForecastShareUrl(
  origin: string,
  dilemmaA: string,
  dilemmaB: string,
): string {
  return `${origin}/persona-mosaic-dilemma-forecast?a=${encodeURIComponent(dilemmaA)}&b=${encodeURIComponent(dilemmaB)}`;
}
// Lifetime counter + A/B win tally + majority threshold.

export interface MosaicDilemmaForecastDecisionEntry {
  readonly id: string;
  readonly dilemmaASnippet: string;
  readonly dilemmaBSnippet: string;
  readonly winner: MosaicDilemmaForecastPick;
  readonly savedAt: string;
}

const COUNTER_KEY = 'arena:persona-mosaic-dilemma-forecast:counter:v1';
const DECISIONS_KEY = 'arena:persona-mosaic-dilemma-forecast:decisions:v1';
const DECISIONS_LIMIT = 50;

export function readMosaicDilemmaForecastCounter(): number {
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

export function incrementMosaicDilemmaForecastCounter(): number {
  const next = readMosaicDilemmaForecastCounter() + 1;
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(COUNTER_KEY, String(next));
  } catch {
    /* silent */
  }
  return next;
}

export function clearMosaicDilemmaForecastCounter() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(COUNTER_KEY);
  } catch {
    /* silent */
  }
}

export function appendMosaicDilemmaForecastDecision(
  entry: MosaicDilemmaForecastDecisionEntry,
): ReadonlyArray<MosaicDilemmaForecastDecisionEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DECISIONS_KEY);
    const existing: MosaicDilemmaForecastDecisionEntry[] = raw
      ? (JSON.parse(raw) as MosaicDilemmaForecastDecisionEntry[])
      : [];
    // Filter by id AND validate the entry shape so a corrupted
    // localStorage payload (e.g. a partial write from a future
    // schema) is scrubbed on the next append rather than
    // re-serialized and persisted forever.
    // Validate the entry shape AND dedup in a single O(n) pass so
    // a corrupted localStorage payload (e.g. a partial write or a
    // duplicate id) is scrubbed on the next append rather than
    // re-serialized and persisted forever. The new entry wins on id
    // collision (it's at the head of the final array).
    const seen = new Set<string>([entry.id]);
    const valid: MosaicDilemmaForecastDecisionEntry[] = [];
    for (const e of existing) {
      if (
        !e ||
        typeof e.id !== 'string' ||
        e.id === entry.id ||
        (e.winner !== 'A' && e.winner !== 'B') ||
        seen.has(e.id)
      ) {
        continue;
      }
      seen.add(e.id);
      valid.push(e);
    }
    const next = [entry, ...valid].slice(0, DECISIONS_LIMIT);
    window.localStorage.setItem(DECISIONS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function readMosaicDilemmaForecastDecisions(): ReadonlyArray<MosaicDilemmaForecastDecisionEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DECISIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MosaicDilemmaForecastDecisionEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          (e.winner === 'A' || e.winner === 'B'),
      )
      .slice(0, DECISIONS_LIMIT);
  } catch {
    return [];
  }
}

export function clearMosaicDilemmaForecastDecisions() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DECISIONS_KEY);
  } catch {
    /* silent */
  }
}


/** Pure — compute lifetime A vs B win tally from decision log. */
export function mosaicDilemmaForecastWinTally(
  decisions: ReadonlyArray<MosaicDilemmaForecastDecisionEntry>,
): PersonaMosaicDilemmaForecastTally {
  let a = 0;
  let b = 0;
  for (const d of decisions) {
    if (d.winner === 'A') a += 1;
    else b += 1;
  }
  return { a, b };
}

export type MosaicDilemmaForecastMajorityLabel = 'decisive' | 'leaning' | 'split';

export interface MosaicDilemmaForecastMajorityInfo {
  readonly label: MosaicDilemmaForecastMajorityLabel;
  readonly description: string;
  readonly winnerCount: number;
  readonly loserCount: number;
}

/** Pure — describe how decisive a tally is. For an 8-mind
 * panel: 5+/8 is decisive, 4/8 is leaning, 3/8 is split. */
export function mosaicDilemmaForecastMajorityInfo(
  tally: MosaicDilemmaForecastTally,
  winner: MosaicDilemmaForecastPick,
): MosaicDilemmaForecastMajorityInfo {
  const winnerCount = winner === 'A' ? tally.a : tally.b;
  const loserCount = winner === 'A' ? tally.b : tally.a;
  if (winnerCount >= 5) {
    return {
      label: 'decisive',
      description: `${winnerCount} of ${PANEL_SIZE} minds — a strong majority.`,
      winnerCount,
      loserCount,
    };
  }
  if (winnerCount === 4) {
    return {
      label: 'leaning',
      description: `${winnerCount} of ${PANEL_SIZE} minds — a slight lean. The other side had real support.`,
      winnerCount,
      loserCount,
    };
  }
  return {
    label: 'split',
    description: `Only ${winnerCount} of ${PANEL_SIZE} minds — a genuine split. Run another panel for clarity.`,
    winnerCount,
    loserCount,
  };
}