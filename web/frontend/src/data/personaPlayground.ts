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
 * Aggregated summary per category — used by the
 * /persona-playground/categories page. Each entry has a 1-line
 * description that tells the reader what kind of tools to expect.
 */
export interface CategorySummary {
  readonly category: PersonaPlaygroundCategory;
  readonly label: string;
  readonly count: number;
  readonly description: string;
}

const CATEGORY_DESCRIPTIONS: Record<PersonaPlaygroundCategory, string> = {
  discover: 'Quizzes, spinners, and reference surfaces for finding the right mind.',
  versus: 'Two minds head-to-head — output A vs output B, two topics, two futures.',
  council: 'Many minds, one question — full panels, curated panels, Mosaic picks.',
  roast: 'Drop a prompt or output and watch four judges tear it apart.',
  decide: 'Forced-choice frameworks — two options, two dilemma framings, one verdict.',
  forecast: 'Future-scenario tools — name a future, name two, weigh the odds.',
  mosaic: 'Pick four of the sixteen minds and Arena names the house style they share.',
};

export function categorySummaries(): readonly CategorySummary[] {
  const seen = new Set<PersonaPlaygroundCategory>();
  const counts: Record<PersonaPlaygroundCategory, number> = {
    discover: 0,
    versus: 0,
    council: 0,
    roast: 0,
    decide: 0,
    forecast: 0,
    mosaic: 0,
  };
  for (const entry of PERSONA_PLAYGROUND_ENTRIES) {
    if (!seen.has(entry.category)) seen.add(entry.category);
    counts[entry.category] += 1;
  }
  // Stable order matches personaPlaygroundCategories() output.
  return personaPlaygroundCategories().map((category) => ({
    category,
    label: personaPlaygroundCategoryLabel(category),
    count: counts[category],
    description: CATEGORY_DESCRIPTIONS[category],
  }));
}

/**
 * Return up to `limit` related entries for the given path. Same-category
 * entries come first (in catalog order), then any other categories fill
 * the remaining slots (also in catalog order). The current path is
 * always excluded. Deterministic given a stable catalog. Returns [] when
 * the path is not in the catalog — callers should treat that as
 * "no related".
 */
export function relatedTools(
  path: string,
  limit: number = 3,
  entries: readonly PersonaPlaygroundEntry[] = PERSONA_PLAYGROUND_ENTRIES,
): readonly PersonaPlaygroundEntry[] {
  if (limit <= 0 || entries.length === 0) return [];
  const current = entries.find((e) => e.path === path);
  if (!current) return [];

  // Single pass: bucket each non-self entry into same- or other-category,
  // preserving catalog order (which is the deterministic "related" order).
  const sameCategory: PersonaPlaygroundEntry[] = [];
  const otherCategory: PersonaPlaygroundEntry[] = [];
  for (const e of entries) {
    if (e.path === path) continue;
    if (e.category === current.category) sameCategory.push(e);
    else otherCategory.push(e);
  }

  return [...sameCategory, ...otherCategory].slice(0, limit);
}

/**
 * Default heading for a "related tools" rail. Tells the reader *why*
 * they're seeing these specific picks — keyed off the current entry's
 * category label. Returns null when the path is unknown so the rail
 * can choose to hide the heading entirely.
 */
export function relatedToolsDefaultHeading(
  path: string,
  entries: readonly PersonaPlaygroundEntry[] = PERSONA_PLAYGROUND_ENTRIES,
): string | null {
  const current = entries.find((e) => e.path === path);
  if (!current) return null;
  const label = personaPlaygroundCategoryLabel(current.category);
  return `More ${label.toLowerCase()} tools`;
}

/**
 * Look up two entries by path for the compare page. Returns
 * [entryA, entryB] when both paths are valid catalog paths (paths may
 * match — comparing a tool to itself is allowed). Returns null when
 * either path is missing or invalid so the page can render an empty
 * state. Deterministic.
 */
export function compareEntries(
  a: string | null,
  b: string | null,
  entries: readonly PersonaPlaygroundEntry[] = PERSONA_PLAYGROUND_ENTRIES,
): readonly [PersonaPlaygroundEntry, PersonaPlaygroundEntry] | null {
  if (!a || !b) return null;
  // Single pass — both paths share the lookup, so capture each
  // match as we go. Avoids a second linear scan. The same path
  // on both sides is allowed (compare to itself) — when that
  // happens, both slots point to the same entry.
  let entryA: PersonaPlaygroundEntry | undefined;
  let entryB: PersonaPlaygroundEntry | undefined;
  for (const e of entries) {
    if (e.path === a) {
      entryA = e;
      if (!entryB && a === b) entryB = e;
    } else if (e.path === b) {
      entryB = e;
    }
    if (entryA && entryB) break;
  }
  if (!entryA || !entryB) return null;
  return [entryA, entryB];
}

/**
 * Build the canonical share URL for a compare pair. Pure: takes an
 * origin + two valid catalog paths, returns a URL with both params
 * encoded. Returns null when either path is missing or doesn't look
 * like a persona tool route so callers can skip the copy affordance.
 */
export function buildCompareShareUrl(
  origin: string,
  a: string | null,
  b: string | null,
): string | null {
  if (!a || !b) return null;
  if (!a.startsWith(PERSONA_PATH_PREFIX) || !b.startsWith(PERSONA_PATH_PREFIX)) {
    return null;
  }
  const base = origin.replace(/\/$/, '');
  return `${base}/persona-playground/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
}

/**
 * Curated matchups — pre-baked comparison pairs with strong narratives.
 * Each entry renders as a card on the hub that links to the compare
 * route with prefilled params. The narrative tells the reader *why*
 * this pair is worth comparing.
 */
export interface Matchup {
  readonly title: string;
  readonly summary: string;
  readonly paths: readonly [string, string];
}

export const MATCHUPS: readonly Matchup[] = [
  {
    title: 'Council vs Mosaic Council',
    summary:
      'Sixteen minds answering one question vs four minds hand-picked by you. Democratize vs curate.',
    paths: ['/persona-council', '/persona-mosaic-council'],
  },
  {
    title: 'Roast vs Mosaic Roast',
    summary:
      'Four Arena judges tear into your prompt vs four Mosaic-style judges who never met your taste. Catch the gap.',
    paths: ['/persona-roast', '/persona-mosaic-roast'],
  },
  {
    title: 'Dilemma vs Dilemma Council',
    summary:
      'Four minds break a two-option call vs eight minds voting on the same. Small panel vs a hung jury.',
    paths: ['/persona-dilemma', '/persona-dilemma-council'],
  },
  {
    title: 'Forecast vs Mosaic Forecast',
    summary:
      'Four minds predict a future vs four Mosaic-style minds picking between two futures. Open-ended vs head-to-head.',
    paths: ['/persona-forecast', '/persona-mosaic-forecast'],
  },
  {
    title: 'Battle vs Mosaic Battle',
    summary:
      'Two minds on any topic vs two Mosaic-style minds judging two outputs. Topic-driven vs output-driven.',
    paths: ['/persona-battle', '/persona-mosaic-battle'],
  },
  {
    title: 'Dilemma Forecast vs Mosaic Dilemma Forecast',
    summary:
      'Two dilemma framings go to a 4-mind panel vs an 8-mind Mosaic panel. Edge case vs stacked jury.',
    paths: ['/persona-dilemma-forecast', '/persona-mosaic-dilemma-forecast'],
  },
];

/**
 * Pick N catalog entries that are NOT in the given set of recent
 * paths. Deterministic for the same inputs — uses day-of-year as a
 * stable seed so different days surface different unvisited tools.
 * Returns [] when the catalog is empty, when the recent set covers
 * the whole catalog, or when the requested count is non-positive.
 */
export function unvisitedTools(
  recentPaths: readonly string[],
  count: number = 3,
  entries: readonly PersonaPlaygroundEntry[] = PERSONA_PLAYGROUND_ENTRIES,
  date: Date = new Date(),
): readonly PersonaPlaygroundEntry[] {
  if (count <= 0 || entries.length === 0) return [];
  const recent = new Set(recentPaths);
  const candidates = entries.filter((e) => !recent.has(e.path));
  if (candidates.length === 0) return [];
  // Stable seed: day-of-year. Rotates daily so consecutive days
  // surface different unvisited tools but the same day always picks
  // the same set.
  const start = dayOfYear(date) % candidates.length;
  const out: PersonaPlaygroundEntry[] = [];
  for (let offset = 0; offset < candidates.length && out.length < count; offset += 1) {
    out.push(candidates[(start + offset) % candidates.length]);
  }
  return out;
}
export function findMatchupByPaths(
  a: string | null,
  b: string | null,
  matchups: readonly Matchup[] = MATCHUPS,
): Matchup | null {
  if (!a || !b) return null;
  for (const m of matchups) {
    const [p1, p2] = m.paths;
    if ((a === p1 && b === p2) || (a === p2 && b === p1)) return m;
  }
  return null;
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
// What's new — curated changelog of recent playground improvements.
// Powers the /persona-playground/whats-new timeline. Pure data, no
// effects; deterministic for the same input. Add new entries to the
// top of the list so the freshest items surface first.

export interface WhatsNewEntry {
  /** YYYY-MM-DD of the cycle that shipped the change. */
  readonly date: string;
  /** One-line title of the change. */
  readonly title: string;
  /** One-sentence summary of what shipped and why. */
  readonly summary: string;
  /** Optional path to the surface the change is on. */
  readonly link?: string;
}

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  {
    date: '2026-07-25',
    title: 'Persona Playground hub',
    summary:
      'A single front door for all 27 Arena tools — search, filter, daily featured, surprise me, recent tools, recent comparisons, recent shares, favorites, unvisited tools, curated matchups, and a compare CTA.',
    link: '/persona-playground',
  },
  {
    date: '2026-07-25',
    title: 'Compare any two tools',
    summary:
      '/persona-playground/compare?a=…&b=… renders two tools side-by-side with category dots, name, tagline, blurb, format, and a Swap CTA. Copy the share URL with one click.',
    link: '/persona-playground/compare',
  },
  {
    date: '2026-07-25',
    title: 'Curated matchups gallery',
    summary:
      'Six pre-baked comparison pairs (Council vs Mosaic Council, Roast vs Mosaic Roast, etc.) with a one-line narrative explaining why the pair is worth comparing.',
    link: '/persona-playground',
  },
  {
    date: '2026-07-25',
    title: 'Daily streak with milestone badges',
    summary:
      'Track consecutive-day return visits. Hit 3, 7, 14, 30, or 100 days to earn the Curious / Committed / Devoted / Expert / Legend badges — and a glyph-led share text for the moment.',
    link: '/persona-playground',
  },
  {
    date: '2026-07-25',
    title: 'Favorites with a dedicated page',
    summary:
      'Star any tool from the hub cards; manage the collection on /persona-playground/favorites. Local-only, so your favorites list never leaves your browser.',
    link: '/persona-playground/favorites',
  },
  {
    date: '2026-07-25',
    title: 'Categories overview',
    summary:
      'Seven categories — Discover, Versus, Council, Roast, Decide, Forecast, Mosaic — each with a tool count and a one-line description. Deep-links to the hub with a ?cat=… filter.',
    link: '/persona-playground/categories',
  },
  {
    date: '2026-07-25',
    title: 'A-Z tool index',
    summary:
      'Alphabetical reference list of all 27 tools with format and category, grouped by first letter. A dense, no-frills alternative to the visual grid.',
    link: '/persona-playground/index',
  },
];


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
  return Math.floor(diff / MS_PER_DAY) + 1;
}

// Milliseconds in a 24-hour day. Used to compute day-of-year from
// the millisecond delta since Jan 1. Hoisted as a constant so the
// unit is named where the math is.
const MS_PER_DAY = 86_400_000;

// All tool paths share this prefix; buildCompareShareUrl uses it
// to reject non-persona routes (a defense against the share link
// silently pointing at an arbitrary user-supplied path).
const PERSONA_PATH_PREFIX = '/persona-';

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
 * Deterministic "Surprise me" pick for the given date. Returns a
 * catalog entry that is NOT the excluded path (defaults to today's
 * featured pick) so a "Surprise me" button can sit next to the
 * daily featured without duplicating it. Uses a day-of-year-derived
 * index that walks past the excluded slot. Returns null for empty
 * catalogs or when the only entry is the excluded one.
 */
export function pickSurpriseTool(
  date: Date,
  excludePath: string | null = null,
  entries: readonly PersonaPlaygroundEntry[] = PERSONA_PLAYGROUND_ENTRIES,
): PersonaPlaygroundEntry | null {
  if (entries.length === 0) return null;
  if (entries.length === 1) {
    return excludePath === entries[0].path ? null : entries[0];
  }
  // Use a different day-key (dayOfYear + 1) and modulo so consecutive
  // days get different picks but the same day always returns the same.
  const startIdx = (dayOfYear(date) + 1) % entries.length;
  for (let offset = 0; offset < entries.length; offset += 1) {
    const candidate = entries[(startIdx + offset) % entries.length];
    if (candidate.path !== excludePath) return candidate;
  }
  return null;
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
