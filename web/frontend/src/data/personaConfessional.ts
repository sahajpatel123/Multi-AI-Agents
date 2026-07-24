// Persona Confessional — pure helpers for the anonymous "worst
// prompt" wall at /persona-confessional. Curated submissions
// plus anonymous user submissions stored locally. The council
// reuses the persona catalog to flavor each roast.

import { PERSONAS } from './personas';

export interface ConfessionalEntry {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly roastLabel: string;
  readonly roastDetail: string;
  readonly submittedAt: string;
  readonly author: 'curated' | 'you';
}

export interface ConfessionalCouncil {
  readonly prompt: string;
  readonly perspectives: ReadonlyArray<{
    readonly personaId: string;
    readonly angle: string;
    readonly line: string;
  }>;
}

const PERSPECTIVE_LINES: ReadonlyArray<{
  personaId: string;
  angle: string;
  line: string;
}> = [
  {
    personaId: 'analyst',
    angle: 'The Analyst',
    line: 'Three questions buried in one paragraph. The hardest one never gets asked.',
  },
  {
    personaId: 'philosopher',
    angle: 'The Philosopher',
    line: 'The question is the trap. Whoever wrote this has already decided the answer.',
  },
  {
    personaId: 'pragmatist',
    angle: 'The Pragmatist',
    line: 'Monday morning comes. This prompt does not. Pick a verb you can do this week.',
  },
  {
    personaId: 'contrarian',
    angle: 'The Contrarian',
    line: 'I am taking the opposite side. The consensus is a polite disagreement you have not started yet.',
  },
];

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Pure — generate the council roast for a prompt. */
export function buildConfessionalCouncil(prompt: string): ConfessionalCouncil {
  const lines = PERSPECTIVE_LINES.map((p) => {
    const persona = PERSONAS.find((x) => x.id === p.personaId);
    return {
      personaId: p.personaId,
      angle: p.angle,
      line: `${p.line}${persona ? ` ${persona.quote}` : ''}`,
    };
  });
  // Use a deterministic shift based on the prompt so the same
  // prompt always produces the same ordered perspectives.
  const offset = simpleHash(prompt) % 4;
  return {
    prompt: prompt.trim(),
    perspectives: [...lines.slice(offset), ...lines.slice(0, offset)],
  };
}

const CURATED_ENTRIES: ReadonlyArray<ConfessionalEntry> = [
  {
    id: 'lib-over-eager',
    label: 'The over-eager',
    prompt:
      'Write me a viral tweet that will get 10k likes and also build a personal brand and also sell my consulting offer. Make it punchy.',
    roastLabel: 'Ten goals in one sentence',
    roastDetail:
      'This prompt asks for a tweet, a personal brand, and a sales conversion in the same breath. Each requires a different format, audience, and metric. Pick one.',
    submittedAt: '2026-07-01T00:00:00Z',
    author: 'curated',
  },
  {
    id: 'lib-fog',
    label: 'The fog',
    prompt: 'Tell me about that thing we were talking about with the stuff and the whatever.',
    roastLabel: 'Three vague nouns',
    roastDetail:
      'No antecedent, no referent, no question. The panel could write anything and call it an answer. That is not a prompt.',
    submittedAt: '2026-07-02T00:00:00Z',
    author: 'curated',
  },
  {
    id: 'lib-costume',
    label: 'The costume',
    prompt:
      'Pretend you are a Nobel-winning economist from 1987. Answer in character. Use big words.',
    roastLabel: 'A performance, not an answer',
    roastDetail:
      'You asked for an outfit, not an answer. Whoever plays this role will tell you what a Nobel economist in 1987 would say, not what is true.',
    submittedAt: '2026-07-03T00:00:00Z',
    author: 'curated',
  },
  {
    id: 'lib-leading',
    label: 'The leading question',
    prompt:
      "Don't you think most advice about productivity is just hustle culture in disguise?",
    roastLabel: 'The conclusion is in the question',
    roastDetail:
      'Whoever wrote this already believes the answer. The prompt is a ceremony, not an inquiry.',
    submittedAt: '2026-07-04T00:00:00Z',
    author: 'curated',
  },
  {
    id: 'lib-vague-thesis',
    label: 'The vague thesis',
    prompt: 'Write me something interesting about AI.',
    roastLabel: 'A category, not a topic',
    roastDetail:
      '"AI" is a category, not a brief. "Interesting" is a feeling, not a brief. The panel could write 1000 answers and none of them would be the answer you wanted.',
    submittedAt: '2026-07-05T00:00:00Z',
    author: 'curated',
  },
  {
    id: 'lib-wishful',
    label: 'The wishful list',
    prompt:
      'Be my therapist and also my career coach and also my best friend and also my accountability partner. Tell me what to do with my life.',
    roastLabel: 'Four jobs, no context',
    roastDetail:
      'A therapist, a coach, a best friend, and an accountability partner do four different things with four different stakes. Asking one AI to be all four is asking for a costume party.',
    submittedAt: '2026-07-06T00:00:00Z',
    author: 'curated',
  },
];

const USER_ENTRIES_KEY = 'arena:persona-confessional:user-entries:v1';
const USER_ENTRIES_LIMIT = 24;

export function readUserEntries(): ReadonlyArray<ConfessionalEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(USER_ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConfessionalEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.prompt === 'string' &&
          e.author === 'you',
      )
      .slice(0, USER_ENTRIES_LIMIT);
  } catch {
    return [];
  }
}

export function appendUserEntry(entry: ConfessionalEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readUserEntries().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, USER_ENTRIES_LIMIT);
    window.localStorage.setItem(USER_ENTRIES_KEY, JSON.stringify(next));
  } catch {
    /* silent */
  }
}

export function removeUserEntry(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const next = readUserEntries().filter((e) => e.id !== id);
    window.localStorage.setItem(USER_ENTRIES_KEY, JSON.stringify(next));
  } catch {
    /* silent */
  }
}

export function clearUserEntries() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(USER_ENTRIES_KEY);
  } catch {
    /* silent */
  }
}

/** Curated entries — public-facing. */
export function getCuratedEntries(): ReadonlyArray<ConfessionalEntry> {
  return CURATED_ENTRIES;
}

/** Pure — verify a confessional entry's required fields are present. */
export function confessionalValid(entry: ConfessionalEntry): boolean {
  return (
    typeof entry.id === 'string' &&
    typeof entry.prompt === 'string' &&
    entry.prompt.length > 0 &&
    typeof entry.label === 'string'
  );
}

/** Build a shareable URL for a confessional prompt. */
export function confessionalShareUrl(origin: string, prompt: string): string {
  return `${origin}/persona-confessional?prompt=${encodeURIComponent(prompt)}`;
}

// Lifetime counter — how many confessionals the user has submitted.

const COUNTER_KEY = 'arena:persona-confessional:counter:v1';

export function readConfessionalCounter(): number {
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

export function incrementConfessionalCounter(): number {
  const next = readConfessionalCounter() + 1;
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(COUNTER_KEY, String(next));
  } catch {
    /* silent */
  }
  return next;
}

export function clearConfessionalCounter() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(COUNTER_KEY);
  } catch {
    /* silent */
  }
}

/**
 * Pure — pick the featured curated entry for the day. The featured
 * entry rotates daily by day-of-year so the wall always has a
 * different "today's pick" highlight.
 */
export function pickFeaturedEntryId(dateIso: string): string | null {
  const entries = getCuratedEntries();
  if (entries.length === 0) return null;
  const [y, m, d] = dateIso.split('-').map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return entries[0]?.id ?? null;
  const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
  return entries[dayIndex % entries.length].id;
}

/** Today's date as YYYY-MM-DD in local timezone. */
export function confessionalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}