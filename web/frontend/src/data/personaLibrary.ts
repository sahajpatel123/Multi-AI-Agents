// Persona Library — curated public-facing prompt catalog.
// Each entry is a pre-written prompt designed to show off a specific
// Arena use case. Public to allow tests to import directly.

export type LibraryCategory =
  | 'strategy'
  | 'creativity'
  | 'analysis'
  | 'ethics'
  | 'learning'
  | 'product';

export interface PersonaLibraryEntry {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly category: LibraryCategory;
  readonly description: string;
  readonly suggestedPersonas?: ReadonlyArray<string>;
  readonly tone: 'sharp' | 'warm' | 'playful' | 'serious';
  readonly featured?: boolean;
}

export const PERSONA_LIBRARY_CATEGORIES: ReadonlyArray<{
  readonly id: LibraryCategory;
  readonly label: string;
  readonly description: string;
}> = [
  {
    id: 'strategy',
    label: 'Strategy',
    description: 'Plans, leverage, asymmetric moves.',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Break a problem down to its load-bearing pieces.',
  },
  {
    id: 'creativity',
    label: 'Creativity',
    description: 'New angles, naming, reframing.',
  },
  {
    id: 'ethics',
    label: 'Ethics',
    description: 'Who pays, who benefits, who has no seat.',
  },
  {
    id: 'learning',
    label: 'Learning',
    description: 'Explain a hard idea, simply.',
  },
  {
    id: 'product',
    label: 'Product',
    description: 'Build, ship, iterate.',
  },
];

export const PERSONA_LIBRARY_ENTRIES: ReadonlyArray<PersonaLibraryEntry> = [
  {
    id: 'lib-asymmetric-move',
    title: 'Find my asymmetric move',
    prompt:
      'I run a small SaaS for solo founders. We are competing with two well-funded incumbents. What is one asymmetric move I can make in the next 90 days that they cannot easily copy?',
    category: 'strategy',
    description:
      'A strategist-led prompt designed to surface leverage points a big player would not bother with.',
    suggestedPersonas: ['strategist', 'contrarian', 'engineer'],
    tone: 'sharp',
    featured: true,
  },
  {
    id: 'lib-shitty-first-draft',
    title: 'Roast my landing page',
    prompt:
      'Here is my landing page draft (paste below). What is the single biggest reason a skeptical visitor would close the tab in under 5 seconds?',
    category: 'analysis',
    description:
      'A contrarian-leaning prompt that asks for the one critique that matters.',
    suggestedPersonas: ['analyst', 'contrarian', 'optimist'],
    tone: 'sharp',
    featured: true,
  },
  {
    id: 'lib-second-order',
    title: 'Name the second-order effects',
    prompt:
      'If my city bans short-term rentals next year, what are the second-order effects on housing, restaurants, and tourism over the next five years?',
    category: 'analysis',
    description:
      'A futurist-led prompt that trains the panel to extrapolate consequences.',
    suggestedPersonas: ['futurist', 'economist', 'historian'],
    tone: 'serious',
  },
  {
    id: 'lib-first-principles',
    title: 'Tear my assumption down',
    prompt:
      'I believe "users want more features". Find the load-bearing assumption in that sentence and tell me what survives without it.',
    category: 'creativity',
    description:
      'A first-principles prompt that strips a claim to its substrate.',
    suggestedPersonas: ['firstprinciples', 'philosopher', 'analyst'],
    tone: 'sharp',
    featured: true,
  },
  {
    id: 'lib-hard-idea',
    title: 'Explain recursion to a 12-year-old',
    prompt:
      'Explain recursion to a smart 12-year-old who already knows what a function is. Use one analogy and one example. No math notation.',
    category: 'learning',
    description:
      'An empath-led prompt that tests whether the panel can translate, not just explain.',
    suggestedPersonas: ['empath', 'engineer', 'optimist'],
    tone: 'warm',
  },
  {
    id: 'lib-ship-this-week',
    title: 'Cut scope to ship this week',
    prompt:
      'We have 5 days to ship a v1. The full spec has 14 features. Cut it to the smallest version that still proves the loop. Be ruthless.',
    category: 'product',
    description:
      'A pragmatist-led prompt that pressures the panel to choose.',
    suggestedPersonas: ['pragmatist', 'engineer', 'strategist'],
    tone: 'sharp',
  },
  {
    id: 'lib-who-pays',
    title: 'Who is the hidden cost on?',
    prompt:
      "I am launching a productivity app that helps people reclaim 30 minutes a day. Who is the hidden party paying for that time?",
    category: 'ethics',
    description:
      'An ethicist-led prompt that names the people the framing left out.',
    suggestedPersonas: ['ethicist', 'empath', 'economist'],
    tone: 'serious',
  },
  {
    id: 'lib-reframe-the-pitch',
    title: 'Reframe my pitch',
    prompt:
      'My one-line pitch is "We make email better." Reframe it three different ways for three different audiences: investors, end users, and a skeptical journalist.',
    category: 'creativity',
    description:
      'A philosopher-led prompt that tests the panel\'s reframing range.',
    suggestedPersonas: ['philosopher', 'strategist', 'pragmatist'],
    tone: 'playful',
  },
  {
    id: 'lib-bottleneck',
    title: 'What breaks first at scale?',
    prompt:
      'My product is at 1k users today and growing 20% week-over-week. What breaks first at 10k users, and what is the cheapest way to find out before it does?',
    category: 'product',
    description:
      'An engineer-led prompt that hunts the next bottleneck.',
    suggestedPersonas: ['engineer', 'strategist', 'analyst'],
    tone: 'serious',
  },
  {
    id: 'lib-data-vs-story',
    title: 'Data vs. story on the same question',
    prompt:
      'How would a scientist and a historian each answer: "Is the current generation more or less kind than the one before?"',
    category: 'analysis',
    description:
      'A panel-versus-panel prompt that compares two reasoning styles side by side.',
    suggestedPersonas: ['scientist', 'historian', 'empath'],
    tone: 'serious',
  },
  {
    id: 'lib-defend-the-unpopular',
    title: 'Defend the unpopular read',
    prompt:
      'Make the strongest case you can for a position most people would dismiss as obviously wrong. Pick the position yourself.',
    category: 'creativity',
    description:
      'A devil\'s-advocate prompt that tests the panel\'s steelmanning range.',
    suggestedPersonas: ['devilsadvocate', 'contrarian', 'philosopher'],
    tone: 'sharp',
    featured: true,
  },
  {
    id: 'lib-who-decides',
    title: 'Who should decide this?',
    prompt:
      'Should AI assistants be allowed to refuse user requests that the assistant judges harmful? Who should decide what "harmful" means?',
    category: 'ethics',
    description:
      'An ethics-led prompt that brings multiple frameworks to a live question.',
    suggestedPersonas: ['ethicist', 'stoic', 'philosopher'],
    tone: 'serious',
  },
];

/** Build a deep link into the Arena app with the prompt pre-filled. */
export function libraryArenaLink(origin: string, prompt: string): string {
  return `${origin}/app?prompt=${encodeURIComponent(prompt)}`;
}

/** Build a share URL for a library entry. */
export function libraryShareUrl(origin: string, entryId: string): string {
  return `${origin}/persona-library?entry=${encodeURIComponent(entryId)}`;
}

/** Pure — filter entries by category. */
export function entriesByCategory(
  entries: ReadonlyArray<PersonaLibraryEntry>,
  category: LibraryCategory | null,
): ReadonlyArray<PersonaLibraryEntry> {
  if (!category) return entries;
  return entries.filter((e) => e.category === category);
}

/** Pure — get featured entries first, then the rest. */
export function entriesFeaturedFirst(
  entries: ReadonlyArray<PersonaLibraryEntry>,
): ReadonlyArray<PersonaLibraryEntry> {
  return [...entries].sort((a, b) => {
    const af = a.featured ? 0 : 1;
    const bf = b.featured ? 0 : 1;
    return af - bf;
  });
}