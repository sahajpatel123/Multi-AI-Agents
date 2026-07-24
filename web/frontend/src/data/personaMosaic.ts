// Persona Mosaic — pure helpers for the 4-persona combination surface.
// Given any 4 distinct personas, generates a deterministic "house style":
// name, tagline, manifesto bullets, and a best-question prompt. Pure
// functions only — no randomness — so a shared URL always renders the
// same combo for every visitor.

import { PERSONAS } from './personas';

export interface PersonaMosaicManifesto {
  readonly headline: string;
  readonly bullet: string;
}

export interface PersonaMosaic {
  readonly personaIds: ReadonlyArray<string>;
  readonly houseName: string;
  readonly tagline: string;
  readonly meanTemp: number;
  readonly tempLabel: 'ice-cold' | 'cool' | 'warm' | 'incendiary';
  readonly manifesto: ReadonlyArray<PersonaMosaicManifesto>;
  readonly bestQuestion: string;
}

// Temperature buckets map a panel's mean temperature to a label.
function bucketTemp(meanTemp: number): PersonaMosaic['tempLabel'] {
  if (meanTemp <= 0.3) return 'ice-cold';
  if (meanTemp <= 0.55) return 'cool';
  if (meanTemp <= 0.75) return 'warm';
  return 'incendiary';
}

const TEMP_PREFIX: Record<PersonaMosaic['tempLabel'], string> = {
  'ice-cold': 'Ice-cold',
  cool: 'Cool-headed',
  warm: 'Warm-blooded',
  incendiary: 'Incendiary',
};

// House-style templates — chosen by the dominant "flavor" of the 4
// personas. The flavor is a coarse tag derived from which persona ids
// are present; if no flavor matches, falls back to "balanced".

type MosaicFlavor =
  | 'skeptic'
  | 'optimist'
  | 'philosopher'
  | 'strategist'
  | 'contrarian'
  | 'engineer'
  | 'empath'
  | 'balanced';

function deriveFlavor(ids: ReadonlyArray<string>): MosaicFlavor {
  const set = new Set(ids);
  // Contrarian cluster — check first so a contrarian + optimist + empath
  // combo is recognized as contrarian rather than optimistic.
  if (['contrarian', 'devilsadvocate'].filter((id) => set.has(id)).length >= 2) {
    return 'contrarian';
  }
  // Skeptics cluster around analyst / scientist / stoic / firstprinciples.
  if (['analyst', 'scientist', 'stoic', 'firstprinciples'].some((id) => set.has(id))
    && set.size >= 3) {
    return 'skeptic';
  }
  // Optimists lean on optimist / empath / futurist.
  if (['optimist', 'empath', 'futurist'].filter((id) => set.has(id)).length >= 2) {
    return 'optimist';
  }
  // Philosopher cluster: philosopher / historian / ethicist.
  if (['philosopher', 'historian', 'ethicist'].filter((id) => set.has(id)).length >= 2) {
    return 'philosopher';
  }
  // Strategist cluster: strategist / economist / engineer.
  if (['strategist', 'economist', 'engineer'].filter((id) => set.has(id)).length >= 2) {
    return 'strategist';
  }
  // Engineer cluster.
  if (set.has('engineer') && set.has('pragmatist')) {
    return 'engineer';
  }
  // Empath cluster.
  if (set.has('empath') && set.has('ethicist')) {
    return 'empath';
  }
  return 'balanced';
}

const FLAVOR_HOUSE_NAMES: Record<MosaicFlavor, ReadonlyArray<string>> = {
  skeptic: ['The Skeptic Council', 'The Doubt Chamber', 'The Audit Committee'],
  optimist: ['The Possibility Engine', 'The Yes-And Society', 'The Optimist Circle'],
  philosopher: ['The Question Keepers', 'The Premise Society', 'The Long Table'],
  strategist: ['The Asymmetric Council', 'The Leverage Lab', 'The Position Room'],
  contrarian: ['The Spite Engine', 'The Contrary Cabinet', 'The Heretics Table'],
  engineer: ['The Constraint Room', 'The Failure-Mode Squad', 'The Build Bench'],
  empath: ['The Front Row', 'The Quiet Side', 'The Names-Left-Out Circle'],
  balanced: ['The Round Table', 'The Mosaic', 'The Mixed Panel'],
};

const FLAVOR_TAGLINES: Record<MosaicFlavor, ReadonlyArray<string>> = {
  skeptic: [
    'Strongest assumption breaks first.',
    'You will leave with fewer beliefs than you arrived with.',
  ],
  optimist: [
    'Every problem is a mechanism waiting to be named.',
    'The upside is real — and they will prove it.',
  ],
  philosopher: [
    'The right question is rarely the one you asked.',
    'Long view. Slow burn. Worth the wait.',
  ],
  strategist: [
    'Position before persuasion. Timing before effort.',
    'They will find the move nobody else is looking for.',
  ],
  contrarian: [
    'They will say the thing the room agreed not to.',
    'Consensus is just a polite disagreement they have not started yet.',
  ],
  engineer: [
    'Bottleneck found. Spec cut. Ship.',
    'Failure modes first, polish later.',
  ],
  empath: [
    'They will name the people the framing left out.',
    'Before answers, they ask who is paying.',
  ],
  balanced: [
    'Four minds, four angles, one honest read.',
    'No single flavor — that is the point.',
  ],
};

const FLAVOR_BEST_QUESTIONS: Record<MosaicFlavor, ReadonlyArray<string>> = {
  skeptic: [
    'What is the strongest reason this plan might already be wrong?',
    'Which of your assumptions is least defensible if pressed?',
  ],
  optimist: [
    'What mechanism could make this real by next year?',
    'Why is this harder than the optimists keep saying?',
  ],
  philosopher: [
    'Is the question you are asking actually the right one?',
    'Where has this kind of decision been made before?',
  ],
  strategist: [
    'What is the asymmetric move nobody else is making?',
    'Where does leverage live in this situation?',
  ],
  contrarian: [
    'What is the case no one in the room is brave enough to make?',
    'What consensus is failing in real time?',
  ],
  engineer: [
    'What is the first thing that breaks at scale?',
    'Which constraint should we remove to ship this week?',
  ],
  empath: [
    'Who is hurt most by the framing we just accepted?',
    'What does the loudest voice in the room leave out?',
  ],
  balanced: [
    'Where do your four angles actually agree?',
    'Which question would each of you ask first?',
  ],
};

interface FlavorBullets {
  readonly headline: string;
  readonly bullets: ReadonlyArray<string>;
}

const FLAVOR_BULLETS: Record<MosaicFlavor, ReadonlyArray<FlavorBullets>> = {
  skeptic: [
    {
      headline: 'They attack the load-bearing wall.',
      bullets: [
        'Every claim must survive three rounds of doubt before they sign off.',
        'Disagreement is a feature, not a failure of the meeting.',
      ],
    },
    {
      headline: 'They name what the others are being polite about.',
      bullets: [
        'Strong language is on the table — they will not soften a finding to spare a feeling.',
        'If a number is missing, they say so out loud and ask for the source.',
      ],
    },
  ],
  optimist: [
    {
      headline: 'They name the mechanism, not just the outcome.',
      bullets: [
        'Hopeful but specific — they will not let "it will work" stand without a why.',
        'They are quick to credit the people doing the work.',
      ],
    },
    {
      headline: 'They are allergic to cynicism theater.',
      bullets: [
        'They will push back on doomscroll culture as a default register.',
        'They prefer one careful yes to ten easy nos.',
      ],
    },
  ],
  philosopher: [
    {
      headline: 'They reframe before they answer.',
      bullets: [
        'A direct answer is a sign they did not yet understand the question.',
        'They will ask for the precedent before they give the take.',
      ],
    },
    {
      headline: 'They trade speed for accuracy.',
      bullets: [
        'Expect the long view — they will name the second-order effects.',
        'They are comfortable saying "it depends" if it actually does.',
      ],
    },
  ],
  strategist: [
    {
      headline: 'They pick the move, not the work.',
      bullets: [
        'Asks "where is the leverage?" before "how hard is it?"',
        'Timing and positioning beat raw effort — every time.',
      ],
    },
    {
      headline: 'They will not mistake motion for progress.',
      bullets: [
        'A small bet with a clear kill criterion is better than a long grind.',
        'If you cannot name the opponent, they will not start.',
      ],
    },
  ],
  contrarian: [
    {
      headline: 'They say what everyone is thinking and no one is typing.',
      bullets: [
        'Consensus is a hypothesis to test, not a destination.',
        'They will take the spicy position even if they personally disagree.',
      ],
    },
    {
      headline: 'They punch up, never down.',
      bullets: [
        'Targets the lazy argument and the lazy thinker, not the person.',
        'Will defend the unpopular read if the evidence supports it.',
      ],
    },
  ],
  engineer: [
    {
      headline: 'They find the bottleneck before they pick the tool.',
      bullets: [
        'Will not optimize a non-bottleneck, no matter how fun it looks.',
        'Specs are cut, not negotiated — they decide what we are not shipping.',
      ],
    },
    {
      headline: 'They treat failure modes as features.',
      bullets: [
        'If it cannot fail in a boring way, it is not yet understood.',
        'They will ask for the worst plausible test before the happy path.',
      ],
    },
  ],
  empath: [
    {
      headline: 'They name the person before the argument.',
      bullets: [
        'Every position is checked against who it harms and who it ignores.',
        'They will not let the loudest voice set the agenda.',
      ],
    },
    {
      headline: 'They prefer slower, kinder decisions.',
      bullets: [
        'Will delay to consult the affected party rather than apologize later.',
        'Comfort is not a weakness — it is a design choice.',
      ],
    },
  ],
  balanced: [
    {
      headline: 'They cover the angles you missed.',
      bullets: [
        'Four minds that disagree productively produce better answers.',
        'Each member brings a different failure mode to the table.',
      ],
    },
    {
      headline: 'They are honest about the seams.',
      bullets: [
        'Where two of them agree, it is signal. Where they disagree, it is a question worth naming.',
        'The synthesis is in the tension, not the average.',
      ],
    },
  ],
};

/**
 * Build a mosaic for a 4-persona combo. Pure — given the same 4 ids in
 * the same order, returns the same mosaic. Order matters: the first id
 * is the "lead" and biases the flavor detection.
 */
export function buildMosaic(ids: ReadonlyArray<string>): PersonaMosaic | null {
  if (ids.length !== 4) return null;
  // Validate distinct + known ids.
  const known = new Set(PERSONAS.map((p) => p.id));
  const distinct = new Set(ids);
  if (distinct.size !== 4) return null;
  for (const id of ids) {
    if (!known.has(id)) return null;
  }

  const personaRecords = ids.map((id) => PERSONAS.find((p) => p.id === id)!);
  const meanTemp =
    personaRecords.reduce((sum, p) => sum + p.temperature, 0) / personaRecords.length;
  const tempLabel = bucketTemp(meanTemp);
  const tempPrefix = TEMP_PREFIX[tempLabel];

  const flavor = deriveFlavor(ids);
  const houseNames = FLAVOR_HOUSE_NAMES[flavor];
  const taglines = FLAVOR_TAGLINES[flavor];
  const bestQuestions = FLAVOR_BEST_QUESTIONS[flavor];

  // Use a deterministic hash of the sorted ids so the same combo always
  // picks the same template index, regardless of click order.
  const sortedKey = [...ids].sort().join(',');
  const seedHash = simpleHash(sortedKey);
  const houseName = houseNames[seedHash % houseNames.length];
  const tagline = taglines[seedHash % taglines.length];
  const bestQuestion = bestQuestions[seedHash % bestQuestions.length];

  const flavorBullets = FLAVOR_BULLETS[flavor];
  const bulletPick = flavorBullets[seedHash % flavorBullets.length];

  return {
    personaIds: ids,
    houseName: `${tempPrefix} ${houseName}`,
    tagline: tagline,
    meanTemp,
    tempLabel,
    manifesto: bulletPick.bullets.map((b) => ({ headline: bulletPick.headline, bullet: b })),
    bestQuestion,
  };
}

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Build a shareable URL for a mosaic. */
export function mosaicShareUrl(
  origin: string,
  ids: ReadonlyArray<string>,
): string {
  return `${origin}/persona-mosaic?p=${ids.join(',')}`;
}