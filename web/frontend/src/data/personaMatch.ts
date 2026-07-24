// Persona Match quiz data. Each question maps a behavioral choice to one or
// more personas via weighted scores. The match algorithm sums weights across
// all answers and returns the highest-scoring persona.
//
// Public to allow tests to import the question schema directly.

export interface PersonaMatchOption {
  readonly id: string;
  readonly label: string;
  /** Persona -> weight. Multiple personas can score per option. */
  readonly weights: Readonly<Record<string, number>>;
}

export interface PersonaMatchQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly helper: string;
  readonly options: ReadonlyArray<PersonaMatchOption>;
}

export const PERSONA_MATCH_QUESTIONS: ReadonlyArray<PersonaMatchQuestion> = [
  {
    id: 'q1_decision',
    prompt: 'A friend asks for your take on a tough decision. What do you do first?',
    helper: 'Reveal the move you make before you speak.',
    options: [
      {
        id: 'analyze',
        label: 'List the assumptions that could break, then attack each one.',
        weights: { analyst: 3, scientist: 2, engineer: 1 },
      },
      {
        id: 'reframe',
        label: 'Ask whether the question itself is the right question.',
        weights: { philosopher: 3, firstprinciples: 2, devilsadvocate: 1 },
      },
      {
        id: 'ship',
        label: 'Suggest a tiny test they can run this week.',
        weights: { pragmatist: 3, engineer: 1, optimist: 1 },
      },
      {
        id: 'challenge',
        label: 'Tell them what everyone else is afraid to say.',
        weights: { contrarian: 3, devilsadvocate: 2, strategist: 1 },
      },
    ],
  },
  {
    id: 'q2_failure',
    prompt: 'A project you believed in just collapsed. Your first internal reaction?',
    helper: 'Honest first instinct — not the polished one.',
    options: [
      {
        id: 'evidence',
        label: 'Pull the data. What evidence did we ignore?',
        weights: { scientist: 3, analyst: 2, economist: 1 },
      },
      {
        id: 'precedent',
        label: 'This has happened before. Find the closest parallel.',
        weights: { historian: 3, philosopher: 1 },
      },
      {
        id: 'incentive',
        label: 'Trace who was paid — and who was exposed — for the outcome.',
        weights: { economist: 3, ethicist: 2, strategist: 1 },
      },
      {
        id: 'people',
        label: 'Who is taking the worst hit from this? Reach out first.',
        weights: { empath: 3, ethicist: 2, stoic: 1 },
      },
    ],
  },
  {
    id: 'q3_priority',
    prompt: 'A team has 10 days to ship. You get to remove one constraint. Which one?',
    helper: 'Pick the single thing that would unlock the most speed.',
    options: [
      {
        id: 'complexity',
        label: 'Cut the spec. Ship the smallest version that proves the loop.',
        weights: { engineer: 3, pragmatist: 2, strategist: 1 },
      },
      {
        id: 'morale',
        label: 'Protect the team. Burnout kills more timelines than bugs.',
        weights: { empath: 3, stoic: 2, optimist: 1 },
      },
      {
        id: 'positioning',
        label: 'Cut the noise. Make the next user feel like the only user.',
        weights: { strategist: 3, contrarian: 1, futurist: 1 },
      },
      {
        id: 'cadence',
        label: 'Stop debating. Make every day smaller and observable.',
        weights: { engineer: 2, pragmatist: 2, scientist: 1, stoic: 1 },
      },
    ],
  },
  {
    id: 'q4_news',
    prompt: 'A big headline drops. Which version of you wakes up first?',
    helper: 'The angle you defend when nobody is watching.',
    options: [
      {
        id: 'stew',
        label: 'The outrage is real, but the incentives explain more.',
        weights: { stoic: 3, ethicist: 1, economist: 1 },
      },
      {
        id: 'icy',
        label: 'What is the colder read the consensus will not allow?',
        weights: { contrarian: 3, devilsadvocate: 2, scientist: 1 },
      },
      {
        id: 'od',
        label: 'Write down the second-order effects first. The headline is already priced in.',
        weights: { futurist: 3, strategist: 2, economist: 1 },
      },
      {
        id: 'heart',
        label: 'Name the person the lede left out.',
        weights: { empath: 3, ethicist: 2, historian: 1 },
      },
    ],
  },
  {
    id: 'q5_advice',
    prompt: 'A younger you asks for one piece of advice. What do you give?',
    helper: 'The line you keep returning to.',
    options: [
      {
        id: 'prune',
        label: 'Cut everything that does not compound. The rest is decoration.',
        weights: { stoic: 3, firstprinciples: 2, engineer: 1 },
      },
      {
        id: 'audit',
        label: 'Keep a log of every decision you were wrong about. Read it monthly.',
        weights: { scientist: 3, analyst: 2, philosopher: 1 },
      },
      {
        id: 'leverage',
        label: 'Find the asymmetric move. Skill plus timing beats effort.',
        weights: { strategist: 3, economist: 2, contrarian: 1 },
      },
      {
        id: 'people',
        label: 'Choose who you walk with. Everything else is downstream.',
        weights: { empath: 3, optimist: 2, ethicist: 1 },
      },
    ],
  },
];

export interface PersonaMatchResult {
  readonly personaId: string;
  readonly score: number;
  readonly rank: number;
}

/** Pure scoring function. Returns every persona that scored > 0, ranked. */
export function scorePersonaMatch(
  answers: Readonly<Record<string, string>>,
): ReadonlyArray<PersonaMatchResult> {
  const totals: Record<string, number> = {};
  for (const question of PERSONA_MATCH_QUESTIONS) {
    const chosen = answers[question.id];
    if (!chosen) continue;
    const option = question.options.find((opt) => opt.id === chosen);
    if (!option) continue;
    for (const [personaId, weight] of Object.entries(option.weights)) {
      totals[personaId] = (totals[personaId] ?? 0) + weight;
    }
  }
  const ranked = Object.entries(totals)
    .map(([personaId, score]) => ({ personaId, score, rank: 0 }))
    .sort((a, b) => b.score - a.score);
  return ranked.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Pick the top match. Returns null if no answers were given. */
export function topPersonaMatch(
  answers: Readonly<Record<string, string>>,
): PersonaMatchResult | null {
  const ranked = scorePersonaMatch(answers);
  return ranked.length > 0 ? ranked[0] : null;
}
