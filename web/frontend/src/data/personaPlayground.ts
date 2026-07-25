/**
 * Persona Playground hub catalog.
 *
 * Single source of truth for the 27 persona tools surfaced at
 * /persona-playground. The page is the entry point that the marketing
 * nav and the orphan-tool funnel both depend on, so a new persona route
 * is only "live" once it is registered here AND has a corresponding
 * <Route path=…> entry in main.tsx.
 *
 * Categories:
 *   discover  - quiz / spin / sort / triv / sample tools
 *   versus    - 1v1 or A vs B adjudication
 *   council   - many-minds group vote
 *   roast     - judging / critiquing outputs
 *   decide    - dilemma + A vs B choice frameworks
 *   forecast  - future-scenario pickers
 *   mosaic    - persona pickers
 */

export type PersonaPlaygroundCategory =
  | 'discover'
  | 'versus'
  | 'council'
  | 'roast'
  | 'decide'
  | 'forecast'
  | 'mosaic';

export interface PersonaPlaygroundEntry {
  /** URL path, must be unique across the catalog. */
  readonly path: string;
  /** Human-friendly name shown on the card. */
  readonly name: string;
  /** Two-line hero phrase, copied from the page's <h1>. */
  readonly tagline: string;
  /** One-sentence blurb for the card body. */
  readonly blurb: string;
  /** Group key used for filtering. */
  readonly category: PersonaPlaygroundCategory;
  /** Freeform display string like "4-mind panel" or "Community wall". */
  readonly format: string;
}

export const PERSONA_PLAYGROUND_ENTRIES: readonly PersonaPlaygroundEntry[] = [
  // discover
  {
    path: '/persona-match',
    name: 'Persona Match',
    tagline: 'Which Arena mind are you?',
    blurb: 'Five questions, sixteen minds, one match — discover the reasoning style that fits how you think.',
    category: 'discover',
    format: '5-question quiz',
  },
  {
    path: '/persona-wheel',
    name: 'Persona Wheel',
    tagline: 'Spin the arena. Meet a new mind.',
    blurb: 'Spin a wheel of all sixteen minds and get a fresh perspective on whatever you are wrestling with.',
    category: 'discover',
    format: 'Random mind',
  },
  {
    path: '/persona-trivia',
    name: 'Persona Trivia',
    tagline: 'Which Arena mind said this?',
    blurb: 'Guess which of the sixteen minds authored a short take — train your taste for the panel.',
    category: 'discover',
    format: 'Trivia game',
  },
  {
    path: '/persona-speed',
    name: 'Persona Speed',
    tagline: 'Sixty seconds. Sixteen minds.',
    blurb: 'Sort sixteen minds on a spectrum before the timer runs out. Fast, sharp, shareable.',
    category: 'discover',
    format: '60s sort',
  },
  {
    path: '/persona-challenge',
    name: 'Persona Challenge',
    tagline: "Today's bad prompt. Your move.",
    blurb: 'A daily challenge: take a real, terrible prompt and rewrite it. Compare with the community.',
    category: 'discover',
    format: 'Daily prompt',
  },
  {
    path: '/persona-library',
    name: 'Persona Library',
    tagline: 'Browse all 16 minds.',
    blurb: 'The full roster of Arena minds with example outputs, tonal notes, and when to call each one.',
    category: 'discover',
    format: 'Reference',
  },
  {
    path: '/persona-confessional',
    name: 'Persona Confessional',
    tagline: 'The anonymous wall of bad prompts.',
    blurb: 'A safe place to admit the prompt that almost shipped. Read the worst, learn from the wreckage.',
    category: 'discover',
    format: 'Community wall',
  },

  // versus
  {
    path: '/persona-battle',
    name: 'Persona Battle',
    tagline: 'Two minds. One topic.',
    blurb: 'Pit any two of the sixteen minds against each other on a topic and watch the styles collide.',
    category: 'versus',
    format: '2-mind duel',
  },
  {
    path: '/persona-duel',
    name: 'Persona Duel',
    tagline: 'Sixteen minds. One champion.',
    blurb: 'A single-elimination bracket where the sixteen Arena minds rank themselves on your prompt.',
    category: 'versus',
    format: '16-mind bracket',
  },
  {
    path: '/persona-echo',
    name: 'Persona Echo',
    tagline: 'Four minds. One text.',
    blurb: 'Four minds rewrite the same source text — compare style, voice, and bias side by side.',
    category: 'versus',
    format: '4-mind rewrite',
  },
  {
    path: '/persona-roast-battle',
    name: 'Roast Battle',
    tagline: 'Two outputs. Four minds judge.',
    blurb: 'Drop two AI outputs and let four Arena minds decide which one survives the roast.',
    category: 'versus',
    format: '4-mind panel',
  },
  {
    path: '/persona-forecast-battle',
    name: 'Forecast Battle',
    tagline: 'Two futures. Four minds pick.',
    blurb: 'Describe two possible futures and four minds argue which is more likely to land.',
    category: 'versus',
    format: '4-mind panel',
  },
  {
    path: '/persona-mosaic-battle',
    name: 'Mosaic Battle',
    tagline: 'Two outputs. Four minds judge.',
    blurb: 'Four Mosaic-style minds evaluate two competing outputs and pick the stronger one.',
    category: 'versus',
    format: '4-mind panel',
  },
  {
    path: '/persona-mosaic-roasting-battle',
    name: 'Mosaic Roasting Battle',
    tagline: 'Two Mosaic Roastings. Four minds judge.',
    blurb: 'Two Mosaic Roasting critiques go head-to-head — four minds score which roast lands harder.',
    category: 'versus',
    format: '4-mind panel',
  },

  // council
  {
    path: '/persona-council',
    name: 'Persona Council',
    tagline: 'One question. Sixteen minds.',
    blurb: 'Convene the full council — ask one question and every Arena mind weighs in, in order.',
    category: 'council',
    format: '16-mind council',
  },
  {
    path: '/persona-mosaic-council',
    name: 'Mosaic Council',
    tagline: 'Pick four minds. Ask anything.',
    blurb: 'Hand-pick any four of the sixteen minds and Arena names the house style they share.',
    category: 'council',
    format: '4-mind council',
  },
  {
    path: '/persona-dilemma-council',
    name: 'Dilemma Council',
    tagline: 'Two options. Eight minds vote.',
    blurb: 'An eight-mind council votes on the harder of two options and explains the split.',
    category: 'council',
    format: '8-mind council',
  },
  {
    path: '/persona-roast-battle-council',
    name: 'Roast Battle Council',
    tagline: 'Two outputs. Eight minds judge.',
    blurb: 'An eight-mind council arbitrates a head-to-head roast battle between two AI outputs.',
    category: 'council',
    format: '8-mind council',
  },
  {
    path: '/persona-mosaic-dilemma-council',
    name: 'Mosaic Dilemma Council',
    tagline: 'Two options. Eight minds vote.',
    blurb: 'A Mosaic-style eight-mind council breaks a two-option dilemma with a tally and a majority.',
    category: 'council',
    format: '8-mind council',
  },

  // roast
  {
    path: '/persona-roast',
    name: 'Persona Roast',
    tagline: 'Drop your prompt. Hear four minds.',
    blurb: 'Four minds critique your prompt — what works, what falls flat, and how to fix it on the next pass.',
    category: 'roast',
    format: '4-mind roast',
  },
  {
    path: '/persona-mosaic-roast',
    name: 'Mosaic Roast',
    tagline: 'Paste an AI output. Four minds judge it.',
    blurb: 'Four Mosaic-style minds tear into a pasted AI output and surface the bias, drift, and filler.',
    category: 'roast',
    format: '4-mind roast',
  },

  // decide
  {
    path: '/persona-dilemma',
    name: 'Persona Dilemma',
    tagline: 'Two options. Four minds.',
    blurb: 'Two options, four minds, one verdict — a fast framework for hard either-or calls.',
    category: 'decide',
    format: '4-mind dilemma',
  },
  {
    path: '/persona-dilemma-forecast',
    name: 'Dilemma Forecast',
    tagline: 'Two dilemmas. Four minds judge.',
    blurb: 'Two competing dilemma framings go in, four minds pick the framing that travels further.',
    category: 'decide',
    format: '4-mind panel',
  },
  {
    path: '/persona-mosaic-dilemma-forecast',
    name: 'Mosaic Dilemma Forecast',
    tagline: 'Two dilemma framings. Eight minds judge.',
    blurb: 'Two dilemma framings go in, an 8-persona panel picks the framing that earns the verdict.',
    category: 'decide',
    format: '8-mind panel',
  },

  // forecast
  {
    path: '/persona-forecast',
    name: 'Persona Forecast',
    tagline: 'Name a future. Four minds weigh in.',
    blurb: 'Name a future and four minds each predict the odds, the risk, and the catch.',
    category: 'forecast',
    format: '4-mind forecast',
  },
  {
    path: '/persona-mosaic-forecast',
    name: 'Mosaic Forecast',
    tagline: 'Two futures. Four minds pick.',
    blurb: 'Two possible futures go head-to-head and four Mosaic-style minds pick the likelier one.',
    category: 'forecast',
    format: '4-mind panel',
  },

  // mosaic
  {
    path: '/persona-mosaic',
    name: 'Persona Mosaic',
    tagline: 'Four minds. One house style.',
    blurb: 'Pick any four of the sixteen Arena minds and Arena names the house style they share.',
    category: 'mosaic',
    format: '4-mind panel',
  },
];

export function personaPlaygroundCategories(): readonly PersonaPlaygroundCategory[] {
  const seen = new Set<PersonaPlaygroundCategory>();
  for (const entry of PERSONA_PLAYGROUND_ENTRIES) seen.add(entry.category);
  return Array.from(seen);
}

/**
 * Return up to `limit` related entries for the given path. Same-category
 * entries come first (in catalog order), then any other categories fill
 * the remaining slots (deterministic — sorted by category label, then
 * path). The current path is always excluded. Returns [] when the path
 * is not in the catalog — callers should treat that as "no related".
 */
export function relatedTools(
  path: string,
  limit: number = 3,
  entries: readonly PersonaPlaygroundEntry[] = PERSONA_PLAYGROUND_ENTRIES,
): readonly PersonaPlaygroundEntry[] {
  if (limit <= 0 || entries.length === 0) return [];
  const current = entries.find((e) => e.path === path);
  if (!current) return [];

  const sameCategory = entries.filter(
    (e) => e.path !== path && e.category === current.category,
  );
  const otherCategory = entries.filter(
    (e) => e.path !== path && e.category !== current.category,
  );

  const ordered = [...sameCategory, ...otherCategory];
  return ordered.slice(0, limit);
}

export function personaPlaygroundCategoryLabel(category: PersonaPlaygroundCategory): string {
  switch (category) {
    case 'discover':
      return 'Discover';
    case 'versus':
      return 'Versus';
    case 'council':
      return 'Council';
    case 'roast':
      return 'Roast';
    case 'decide':
      return 'Decide';
    case 'forecast':
      return 'Forecast';
    case 'mosaic':
      return 'Mosaic';
  }
}

// ---------------------------------------------------------------------------
// Daily featured tool
// ---------------------------------------------------------------------------
// The playground rotates one tool per day to a "Today's pick" slot so the
// page feels alive on every visit. The pick is deterministic — same day →
// same entry — so SSR and shared URLs agree. The dismiss state is
// persisted in localStorage so a user can hide the banner for the rest of
// the day without it coming back on re-render.

export const FEATURED_KEY = 'arena:persona-playground:featured:v1';
export const FEATURED_STATE_VERSION = 1 as const;

export interface FeaturedDismissState {
  /** Schema version — bump if the shape changes. */
  readonly v: typeof FEATURED_STATE_VERSION;
  /** YYYY-MM-DD of the day the user dismissed the pick. */
  readonly dismissedOn: string;
}

/**
 * YYYY-MM-DD in the user's local timezone. Pure: given a Date, returns
 * the canonical date string. Used as the rotation key and the dismiss key.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 1–366 day-of-year for the given date. Local timezone.
 */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000) + 1;
}

/**
 * Deterministic pick from the catalog for the given date. Same day →
 * same entry, regardless of when in the day the function is called.
 */
export function pickFeaturedOfDay(
  date: Date,
  entries: readonly PersonaPlaygroundEntry[] = PERSONA_PLAYGROUND_ENTRIES,
): PersonaPlaygroundEntry | null {
  if (entries.length === 0) return null;
  const idx = dayOfYear(date) % entries.length;
  return entries[idx];
}

/**
 * True when the dismiss state is still valid for the given date.
 * A state is "valid" when it was dismissed on the same calendar day as
 * `today` — the next day the banner is allowed to show again.
 */
export function isDismissedFor(
  today: Date,
  state: FeaturedDismissState | null,
): boolean {
  if (!state) return false;
  if (state.v !== FEATURED_STATE_VERSION) return false;
  return state.dismissedOn === formatLocalDate(today);
}

/**
 * Read the dismiss state from localStorage. Returns null on any
 * failure (private mode, missing key, malformed JSON).
 */
export function readFeaturedDismissState(
  storage: Pick<Storage, 'getItem'> | null,
): FeaturedDismissState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FEATURED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeaturedDismissState;
    if (
      parsed?.v === FEATURED_STATE_VERSION &&
      typeof parsed.dismissedOn === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.dismissedOn)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write the dismiss state. Silent on storage failure (quota / private mode).
 */
export function writeFeaturedDismissState(
  storage: Pick<Storage, 'setItem'> | null,
  today: Date,
): void {
  if (!storage) return;
  const payload: FeaturedDismissState = {
    v: FEATURED_STATE_VERSION,
    dismissedOn: formatLocalDate(today),
  };
  try {
    storage.setItem(FEATURED_KEY, JSON.stringify(payload));
  } catch {
    /* silent */
  }
}

/**
 * Clear the dismiss state. Silent on storage failure.
 */
export function clearFeaturedDismissState(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(FEATURED_KEY);
  } catch {
    /* silent */
  }
}
