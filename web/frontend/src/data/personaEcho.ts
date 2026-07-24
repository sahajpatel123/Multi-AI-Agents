// Persona Echo — pure helpers for the perspective-reframe surface at
// /persona-echo. Given any text, 4 personas each reframe it from
// their angle. Pure functions + deterministic selection from a seed.

import { PERSONAS } from './personas';

export type EchoKind = 'short' | 'medium' | 'long' | 'argument' | 'narrative';

export interface EchoAngle {
  readonly personaId: string;
  readonly angle: string;
  readonly take: string;
  readonly followup: string;
}

export interface PersonaEcho {
  readonly kind: EchoKind;
  readonly headline: string;
  readonly summary: string;
  readonly angles: ReadonlyArray<EchoAngle>;
  readonly reframing: string;
}

/** Pure — classify the input text by length + structure. */
export function classifyEchoKind(text: string): EchoKind {
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const lower = trimmed.toLowerCase();
  const argumentWords = ['because', 'therefore', 'thus', 'so', 'must', 'should', 'always', 'never'];
  const narrativeWords = ['then', 'after', 'before', 'when', 'i felt', 'i saw', 'he said', 'she said'];

  const hasArgument = argumentWords.some((w) => lower.includes(w));
  const hasNarrative = narrativeWords.some((w) => lower.includes(w));

  if (words === 0) return 'short';
  if (words < 8) return 'short';
  if (hasArgument) return 'argument';
  if (hasNarrative) return 'narrative';
  if (words > 200) return 'long';
  return 'medium';
}

const ECHO_HEADLINES: Record<EchoKind, string> = {
  short: 'A fragment — here is what four minds do with it.',
  medium: 'A note worth reframing.',
  long: 'A long read — four angles from four minds.',
  argument: 'An argument — four minds, four objections.',
  narrative: 'A story — here is how four minds retell it.',
};

const ECHO_SUMMARY: Record<EchoKind, string> = {
  short: 'Short inputs get four short takes. Pick the one that lands.',
  medium: 'Same text, four angles. The reframing is the value.',
  long: 'Long reads deserve four pair of eyes. Here they are.',
  argument: 'Every argument is a target. Four minds, four openings.',
  narrative: 'A story told once is a story. Told four times is a pattern.',
};

const ECHO_REFRAMING: Record<EchoKind, string> = {
  short: 'Drop in a sentence. Get four minds on it in under a second.',
  medium: 'Paste a thought. See it from four angles you did not have.',
  long: 'Drop in a long passage. Four minds carve it into four takes.',
  argument: 'Paste an argument. The contrarian and the optimist will fight over it.',
  narrative: 'Paste a story. Four minds retell it from their vantage point.',
};

// Per-kind angles — each kind has 4 fixed angles tied to specific
// personas so the framing is deterministic and persona-specific.

const ECHO_ANGLES: Record<EchoKind, ReadonlyArray<EchoAngle>> = {
  short: [
    {
      personaId: 'philosopher',
      angle: 'The Philosopher reframes',
      take: 'Short notes are often the most honest. The Philosopher asks what question this sentence is the answer to.',
      followup: 'Ask yourself: what question am I trying to answer?',
    },
    {
      personaId: 'contrarian',
      angle: 'The Contrarian disagrees',
      take: 'The Contrarian takes the opposite reading. What if this sentence is true only because the writer needs it to be true?',
      followup: 'Steel-man the opposite. If you can, your position survives.',
    },
    {
      personaId: 'pragmatist',
      angle: 'The Pragmatist acts',
      take: 'The Pragmatist asks: what would you do with this sentence tomorrow morning?',
      followup: 'If the answer is nothing, rewrite it into an action.',
    },
    {
      personaId: 'empath',
      angle: 'The Empath feels',
      take: 'The Empath asks who is in the room when this sentence lands. Who would feel seen? Who would flinch?',
      followup: 'Read it aloud in the recipient\'s voice before sending.',
    },
  ],
  medium: [
    {
      personaId: 'analyst',
      angle: 'The Analyst finds the assumption',
      take: 'Every paragraph has a load-bearing claim. The Analyst names the one assumption the rest depends on.',
      followup: 'If that assumption collapses, what survives?',
    },
    {
      personaId: 'optimist',
      angle: 'The Optimist names the mechanism',
      take: 'The Optimist asks: what specific process would make this come true? Vague hope is not a plan.',
      followup: 'Write down the mechanism. If you cannot, the claim is wishful.',
    },
    {
      personaId: 'scientist',
      angle: 'The Scientist distinguishes data from inference',
      take: 'The Scientist separates what you observed from what you concluded. The line is often missing.',
      followup: 'Underline every claim that does not have a source.',
    },
    {
      personaId: 'engineer',
      angle: 'The Engineer hunts the bottleneck',
      take: 'The Engineer asks: which constraint, if removed, would change this paragraph the most?',
      followup: 'Solve that constraint. The rest falls.',
    },
  ],
  long: [
    {
      personaId: 'historian',
      angle: 'The Historian names the precedent',
      take: 'The Historian reads the long read as a pattern. Where has this kind of thinking been tried before?',
      followup: 'Name one historical example. If you cannot, this may be novel — or naive.',
    },
    {
      personaId: 'ethicist',
      angle: 'The Ethicist names who pays',
      take: 'The Ethicist walks the entire piece and asks: who pays the cost if this is true? Who is unaccounted for?',
      followup: 'Add the unaccounted party. The piece is stronger for it.',
    },
    {
      personaId: 'strategist',
      angle: 'The Strategist picks the move',
      take: 'The Strategist asks: if you had to act on this today, what is the single move?',
      followup: 'Cut the rest. The move is the message.',
    },
    {
      personaId: 'futurist',
      angle: 'The Futurist extrapolates',
      take: 'The Futurist reads the long read for trajectory. What does this imply five years out?',
      followup: 'Write the second-order effect out loud. If it surprises you, the piece is incomplete.',
    },
  ],
  argument: [
    {
      personaId: 'devilsadvocate',
      angle: "Devil's Advocate steelmans the contrary",
      take: "Devil's Advocate takes the opposite side. What is the strongest case against this argument?",
      followup: 'If your argument survives that case, you are done. If it does not, revise.',
    },
    {
      personaId: 'stoic',
      angle: 'The Stoic asks what is in your control',
      take: 'The Stoic asks: which part of this argument depends on things you control, and which on things you do not?',
      followup: 'Cut the second. The first is where your power lives.',
    },
    {
      personaId: 'economist',
      angle: 'The Economist traces the incentives',
      take: 'The Economist asks: who benefits if this argument is true? What does it cost them if it is false?',
      followup: 'Follow the money. It is rarely lying about its motives.',
    },
    {
      personaId: 'ethicist',
      angle: 'The Ethicist asks who is excluded',
      take: 'The Ethicist asks: whose voice is missing from this argument? Whose perspective was not invited?',
      followup: 'Add them. The argument survives scrutiny longer.',
    },
  ],
  narrative: [
    {
      personaId: 'empath',
      angle: 'The Empath retells from inside',
      take: 'The Empath retells the story from the most-affected character. What does it look like from their seat?',
      followup: 'Rewrite one paragraph from that vantage. The story changes.',
    },
    {
      personaId: 'historian',
      angle: 'The Historian places it',
      take: 'The Historian reads the story as an instance. Where has this shape of story played out before?',
      followup: 'Name the parallel. The reader gets a second axis to read on.',
    },
    {
      personaId: 'stoic',
      angle: 'The Stoic strips it',
      take: 'The Stoic strips the story to its load-bearing fact. What is the one thing that must be true?',
      followup: 'Cut everything else. The strongest stories carry one fact.',
    },
    {
      personaId: 'contrarian',
      angle: 'The Contrarian retells it differently',
      take: 'The Contrarian asks: what if the narrator is unreliable? What if the ending was the beginning?',
      followup: 'Try a different opening sentence. The whole story may move.',
    },
  ],
};

/**
 * Pure — build the echo for a given text. Same input in = same
 * classification + same angles every time. Deterministic by kind.
 */
export function buildEcho(text: string): PersonaEcho {
  const kind = classifyEchoKind(text);
  return {
    kind,
    headline: ECHO_HEADLINES[kind],
    summary: ECHO_SUMMARY[kind],
    angles: ECHO_ANGLES[kind],
    reframing: ECHO_REFRAMING[kind],
  };
}

/** Pure — returns true if any persona in the angles exists in the catalog. */
export function echoAnglesValid(angles: ReadonlyArray<EchoAngle>): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const a of angles) {
    if (!known.has(a.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for an echo. */
export function echoShareUrl(origin: string, text: string): string {
  return `${origin}/persona-echo?text=${encodeURIComponent(text)}`;
}

// Echo history (localStorage) — every committed echo is saved with
// the kind + text snippet + timestamp so users can revisit past
// reframes and the counter stays accurate across reloads.

export interface EchoHistoryEntry {
  readonly id: string;
  readonly kind: EchoKind;
  readonly textSnippet: string;
  readonly savedAt: string;
}

const HISTORY_KEY = 'arena:persona-echo:history:v1';
const HISTORY_LIMIT = 16;
const COUNTER_KEY = 'arena:persona-echo:counter:v1';

export function readEchoHistory(): ReadonlyArray<EchoHistoryEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EchoHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.kind === 'string' &&
          typeof e.textSnippet === 'string',
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function appendEchoHistory(entry: EchoHistoryEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readEchoHistory().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, HISTORY_LIMIT);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* silent */
  }
}

export function clearEchoHistory() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* silent */
  }
}

/** Pure — read the persisted echoes counter (lifetime count). */
export function readEchoCounter(): number {
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

/** Side-effect-free — increment the persisted echoes counter. */
export function incrementEchoCounter(): number {
  const next = readEchoCounter() + 1;
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(COUNTER_KEY, String(next));
  } catch {
    /* silent */
  }
  return next;
}

export function clearEchoCounter() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(COUNTER_KEY);
  } catch {
    /* silent */
  }
}