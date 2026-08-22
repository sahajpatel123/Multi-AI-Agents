// Persona Battle preset matchups — curated 2-persona pairings with
// suggested topics. Public to allow tests to import directly.

export interface PersonaBattlePreset {
  readonly id: string;
  readonly leftId: string;
  readonly rightId: string;
  readonly topic: string;
  readonly tagline: string;
}

export const PERSONA_BATTLE_PRESETS: ReadonlyArray<PersonaBattlePreset> = [
  {
    id: 'contrarian-optimist-glass',
    leftId: 'contrarian',
    rightId: 'optimist',
    topic: 'Is the glass half empty or half full?',
    tagline: 'Spite vs. hope',
  },
  {
    id: 'philosopher-engineer-ai',
    leftId: 'philosopher',
    rightId: 'engineer',
    topic: 'Can a machine ever understand what it is doing?',
    tagline: 'Premise vs. mechanism',
  },
  {
    id: 'analyst-futurist-crypto',
    leftId: 'analyst',
    rightId: 'futurist',
    topic: 'Will decentralized money replace central banks?',
    tagline: 'Failure modes vs. second-order effects',
  },
  {
    id: 'stoic-empath-mercy',
    leftId: 'stoic',
    rightId: 'empath',
    topic: 'Should you comfort someone in avoidable pain?',
    tagline: 'Control vs. care',
  },
  {
    id: 'pragmatist-firstprinciples-strategy',
    leftId: 'pragmatist',
    rightId: 'firstprinciples',
    topic: 'How should a startup pick its first market?',
    tagline: 'What works vs. what is true',
  },
  {
    id: 'ethicist-strategist-negotiation',
    leftId: 'ethicist',
    rightId: 'strategist',
    topic: 'Is it ethical to bluff in a high-stakes negotiation?',
    tagline: 'Who pays vs. who wins',
  },
];

/** Pure helper — return the 2-persona preset that matches the URL key, if any. */
export function findBattlePreset(id: string | null): PersonaBattlePreset | null {
  if (!id) return null;
  return PERSONA_BATTLE_PRESETS.find((p) => p.id === id) ?? null;
}

// Topic suggestions — debate-ready questions for any 2-persona pairing.
// Used by the "Suggest a topic" button on the battle page. Pure client-side
// so it never blocks on a network round-trip and always feels instant.

export interface PersonaTopicSuggestion {
  readonly topic: string;
  readonly tone: 'spicy' | 'serious' | 'playful';
}

/**
 * Deterministic-ish topic pool per persona. The pool intentionally overlaps
 * (e.g. contrarian + optimist share the "is this good?" set) so the topic
 * picker can match the *union* of two personas' pools.
 */
const TOPIC_POOL: Record<string, ReadonlyArray<PersonaTopicSuggestion>> = {
  analyst: [
    { topic: 'Where is the weakest assumption in modern productivity advice?', tone: 'serious' },
    { topic: 'Is the four-day work week a productivity hack or survivorship bias?', tone: 'spicy' },
    { topic: 'What evidence would change your mind about remote work?', tone: 'serious' },
  ],
  philosopher: [
    { topic: 'Is "authenticity" a virtue or just ego with better branding?', tone: 'spicy' },
    { topic: 'If a decision can be reversed, does it matter who makes it?', tone: 'serious' },
    { topic: 'What does it mean to "understand" something?', tone: 'serious' },
  ],
  pragmatist: [
    { topic: 'When does quitting beat pushing through?', tone: 'spicy' },
    { topic: 'Is planning a waste of time or just cheap insurance?', tone: 'serious' },
    { topic: 'Should you optimize for what works today or what scales tomorrow?', tone: 'serious' },
  ],
  contrarian: [
    { topic: 'What is the consensus you refuse to defend in public?', tone: 'spicy' },
    { topic: 'Are mission statements doing more harm than good?', tone: 'spicy' },
    { topic: 'Why is everyone wrong about hustle culture?', tone: 'spicy' },
  ],
  scientist: [
    { topic: 'Where does intuition outperform data in everyday decisions?', tone: 'serious' },
    { topic: 'Is the replication crisis overblown or understated?', tone: 'spicy' },
    { topic: 'What would falsify your belief in meritocracy?', tone: 'serious' },
  ],
  historian: [
    { topic: 'Which modern technology is most likely to collapse like the Roman Empire?', tone: 'serious' },
    { topic: 'Are we in a renaissance or a repetition?', tone: 'serious' },
    { topic: 'What does the fall of every empire teach us about startups?', tone: 'spicy' },
  ],
  economist: [
    { topic: 'Are subscription models a tax on forgetfulness?', tone: 'spicy' },
    { topic: 'Who actually pays for free products?', tone: 'serious' },
    { topic: 'Is universal basic income a fix or a sedative?', tone: 'spicy' },
  ],
  ethicist: [
    { topic: 'Is it ethical to optimize for engagement at the cost of attention?', tone: 'spicy' },
    { topic: 'Who pays the hidden cost of every convenience?', tone: 'serious' },
    { topic: 'Should AI ever be allowed to say no?', tone: 'serious' },
  ],
  stoic: [
    { topic: 'Which part of your daily stress is actually within your control?', tone: 'serious' },
    { topic: 'Is ambition a virtue or a trap dressed in a turtleneck?', tone: 'spicy' },
    { topic: 'When is acceptance just surrender with a meditation app?', tone: 'spicy' },
  ],
  futurist: [
    { topic: 'Which 2020 assumption looks the dumbest by 2035?', tone: 'spicy' },
    { topic: 'What is the second-order effect of AI assistants on loneliness?', tone: 'serious' },
    { topic: 'Will the next decade belong to generalists or specialists?', tone: 'serious' },
  ],
  strategist: [
    { topic: 'What asymmetric move is your competitor too proud to copy?', tone: 'spicy' },
    { topic: 'Is speed a real advantage or just a story founders tell themselves?', tone: 'spicy' },
    { topic: 'Where is the leverage nobody is talking about?', tone: 'serious' },
  ],
  engineer: [
    { topic: 'Which constraint will kill your project first — people, time, or complexity?', tone: 'serious' },
    { topic: 'Is technical debt ever a feature?', tone: 'spicy' },
    { topic: 'When is "good enough" actually good enough?', tone: 'serious' },
  ],
  optimist: [
    { topic: 'What mechanism makes the next decade measurably better than the last?', tone: 'serious' },
    { topic: 'Is toxic positivity worse than honest pessimism?', tone: 'spicy' },
    { topic: 'Why do the doomers keep being wrong?', tone: 'spicy' },
  ],
  empath: [
    { topic: 'Who is hurt most by the framing we just accepted without question?', tone: 'serious' },
    { topic: 'When is honesty cruelty dressed in confidence?', tone: 'spicy' },
    { topic: 'What does the loudest voice in the room leave out?', tone: 'serious' },
  ],
  firstprinciples: [
    { topic: 'What assumption is everyone arguing about without questioning?', tone: 'serious' },
    { topic: 'Is "common sense" just bias that survived?', tone: 'spicy' },
    { topic: 'What remains true after every convention is removed?', tone: 'serious' },
  ],
  devilsadvocate: [
    { topic: 'What is the strongest case against your own position?', tone: 'serious' },
    { topic: 'Why might the thing everyone praises actually be a mistake?', tone: 'spicy' },
    { topic: 'What is the polite lie your field keeps telling itself?', tone: 'spicy' },
  ],
};

/**
 * Pick a topic for the given pairing. Pure — depends only on inputs and
 * `Math.random` for variety. Returns the first overlapping suggestion in the
 * union of the two persona pools, falling back to a random pick from either
 * pool if there is no overlap.
 */
export function suggestBattleTopic(leftId: string, rightId: string): string {
  const left = TOPIC_POOL[leftId] ?? [];
  const right = TOPIC_POOL[rightId] ?? [];
  // Try direct overlap first (deterministic if both have the same topic).
  const overlap = left.find((l) => right.some((r) => r.topic === l.topic));
  if (overlap) return overlap.topic;
  // Then fall back to a union pick. Prefer spicy topics if neither pool
  // already produced a match — they make the best social share bait.
  const union = [...left, ...right];
  if (union.length === 0) {
    return 'Pick a question only two minds would answer differently.';
  }
  const spicy = union.filter((u) => u.tone === 'spicy');
  const pool = spicy.length > 0 ? spicy : union;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick.topic;
}
