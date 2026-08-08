// Persona Dilemma — pure helpers for the A-vs-B debate surface at
// /persona-dilemma. Two options; 4 personas split into arguing
// sides; user picks the winner. Pure functions only — same dilemma
// always produces the same 4-take lineup.

import { PERSONAS } from './personas';

export type DilemmaSide = 'left' | 'right';

export interface DilemmaTake {
  readonly personaId: string;
  readonly side: DilemmaSide;
  readonly take: string;
}

export interface PersonaDilemma {
  readonly left: string;
  readonly right: string;
  readonly takes: ReadonlyArray<DilemmaTake>;
}

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// Per-persona argument templates, keyed by which side they tend to
// argue. Each persona has one take per side — they always have an
// opinion on any dilemma.

const PERSONA_ARGUMENTS: Record<
  string,
  { left: string; right: string }
> = {
  analyst: {
    left: 'Take the safe option. The downside on the risky one is not bounded; you are pricing in survivorship bias.',
    right: 'Take the risky option. The safe one is the default for a reason, but the upside is bounded by what everyone else already chose.',
  },
  philosopher: {
    left: 'Take the safe option. The question is not which is better, but which one you can defend in five years without regret.',
    right: 'Take the risky option. The safe one answers a question you have not asked; the risky one demands you ask it.',
  },
  pragmatist: {
    left: 'Take the safe option. You can test it on a Monday morning. The other one cannot be tested; it must be lived.',
    right: 'Take the risky option. The safe one is the default everyone picks and learns nothing from.',
  },
  contrarian: {
    left: 'Take the safe option — but only because the room is taking the risky one. The consensus is a polite disagreement you have not started yet.',
    right: 'Take the risky option. The safe one is the consensus; the consensus is usually wrong on the upside.',
  },
  scientist: {
    left: 'Take the safe option. The evidence for it is broader; the evidence for the other is mostly narrative.',
    right: 'Take the risky option. The safe one is supported by a closed dataset; the risky one has unexplored variance.',
  },
  historian: {
    left: 'Take the safe option. Where this question has been asked before, the regret is asymmetric.',
    right: 'Take the risky option. The cases that defined a generation were the ones that looked unsafe at the time.',
  },
  economist: {
    left: 'Take the safe option. The expected value calculation favors it once you correctly price the tail risk.',
    right: 'Take the risky option. The expected value favors it once you correctly price the upside that the safe option cannot access.',
  },
  ethicist: {
    left: 'Take the safe option. The risky one externalizes costs onto people who are not in this room.',
    right: 'Take the risky option. The safe one asks the same people to keep absorbing the cost of stability.',
  },
  stoic: {
    left: 'Take the safe option. It changes fewer things you cannot control.',
    right: 'Take the risky option. It changes more things you can. Choose the part that is yours.',
  },
  futurist: {
    left: 'Take the safe option for now. The risky one is not gone; it is just later.',
    right: 'Take the risky option. The safe one is a snapshot; the risky one is a trajectory.',
  },
  strategist: {
    left: 'Take the safe option. It is the move that lets you take the next move. The risky one consumes the next move.',
    right: 'Take the risky option. The safe one is a position; the risky one is a bet on a position that no one else has taken.',
  },
  engineer: {
    left: 'Take the safe option. You can fail safely; the other one cannot fail safely.',
    right: 'Take the risky option. The safe one optimizes for the worst case; the risky one optimizes for the highest leverage move.',
  },
  optimist: {
    left: 'Take the safe option. It is the version of the choice that has more people rooting for it.',
    right: 'Take the risky option. The mechanism behind the upside is the same mechanism you will need elsewhere.',
  },
  empath: {
    left: 'Take the safe option. Think about who is affected by the downside and how they would feel six months from now.',
    right: 'Take the risky option. Think about who is affected by the absence of your growth and how they would feel six months from now.',
  },
  firstprinciples: {
    left: 'Take the safe option. Strip the framing and ask: which one needs fewer assumptions to defend?',
    right: 'Take the risky option. Strip the framing and ask: which one has more load-bearing claims that nobody has tested yet?',
  },
  devilsadvocate: {
    left: 'Take the safe option — and steelman the strongest case against it before you commit.',
    right: 'Take the risky option — and steelman the strongest case against it before you commit.',
  },
};

/**
 * Pure — build a dilemma. Splits 4 personas into left/right sides
 * deterministically from the dilemma text. Same dilemma in = same
 * lineups every time.
 */
export function buildDilemma(
  leftOption: string,
  rightOption: string,
): PersonaDilemma {
  const seed = `${leftOption}::${rightOption}`;
  // Pick 4 distinct personas from the catalog via a stable hash.
  const all = PERSONAS.map((p) => p.id);
  const indices = all.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = simpleHash(`${seed}:${i}`) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picked = indices.slice(0, 4);
  // Alternate sides: 0,2 -> left; 1,3 -> right.
  const takes: DilemmaTake[] = picked.map((personaIdx, slot) => {
    const personaId = all[personaIdx];
    const side: DilemmaSide = slot % 2 === 0 ? 'left' : 'right';
    const args = PERSONA_ARGUMENTS[personaId];
    return {
      personaId,
      side,
      take: (side === 'left' ? args?.left : args?.right) ?? 'I have no view on this one.',
    };
  });
  return {
    left: leftOption.trim(),
    right: rightOption.trim(),
    takes,
  };
}

/** Pure — count of takes on each side. */
export function dilemmaTally(
  dilemma: PersonaDilemma,
): { left: number; right: number } {
  return dilemma.takes.reduce(
    (acc, t) => {
      acc[t.side] += 1;
      return acc;
    },
    { left: 0, right: 0 },
  );
}

/** Pure — verify a dilemma's takes reference real personas. */
export function dilemmaValid(dilemma: PersonaDilemma): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const t of dilemma.takes) {
    if (!known.has(t.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a dilemma. */
export function dilemmaShareUrl(
  origin: string,
  left: string,
  right: string,
): string {
  return `${origin}/persona-dilemma?l=${encodeURIComponent(left)}&r=${encodeURIComponent(right)}`;
}

// Decisions counter — lifetime tally of how many dilemmas the user
// has actually decided (picked a winner on). Persisted across
// reloads so the counter survives.

export interface DilemmaDecisionEntry {
  readonly id: string;
  readonly left: string;
  readonly right: string;
  readonly winner: 'left' | 'right';
  readonly savedAt: string;
}

const HISTORY_KEY = 'arena:persona-dilemma:decisions:v1';
const COUNTER_LIMIT = 50;

export function readDecisions(): ReadonlyArray<DilemmaDecisionEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DilemmaDecisionEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.left === 'string' &&
          typeof e.right === 'string' &&
          (e.winner === 'left' || e.winner === 'right'),
      )
      .slice(0, COUNTER_LIMIT);
  } catch {
    return [];
  }
}

export function appendDecision(entry: DilemmaDecisionEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readDecisions().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, COUNTER_LIMIT);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* silent */
  }
}

export function clearDecisions() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* silent */
  }
}

export interface DilemmaWinTally {
  readonly left: number;
  readonly right: number;
  readonly total: number;
}

/** Pure — compute lifetime win tally from decisions history. */
export function winTally(
  decisions: ReadonlyArray<DilemmaDecisionEntry>,
): DilemmaWinTally {
  let left = 0;
  let right = 0;
  for (const d of decisions) {
    if (d.winner === 'left') left += 1;
    else right += 1;
  }
  return { left, right, total: left + right };
}