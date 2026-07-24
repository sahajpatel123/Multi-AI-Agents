// Persona Roast — pure helpers for the prompt-critique surface at
// /persona-roast. Given any user-supplied prompt, picks a flavor of
// critique and generates deterministic roast lines that read as if
// each persona's angle had its say.

import { PERSONAS } from './personas';

export type RoastFlavor =
  | 'shallow'
  | 'overloaded'
  | 'vague'
  | 'leading'
  | 'meta'
  | 'balanced';

export interface RoastPick {
  readonly flavor: RoastFlavor;
  readonly headline: string;
  readonly lede: string;
  readonly angles: ReadonlyArray<{
    readonly personaId: string;
    readonly angle: string;
    readonly bite: string;
  }>;
}

// Heuristic — derive a roast flavor from the prompt's content.
// Pure — same prompt in = same flavor + headlines every time.
export function deriveRoastFlavor(prompt: string): RoastFlavor {
  const trimmed = prompt.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  const lower = trimmed.toLowerCase();
  const leadingWords = [
    'why', 'how come', 'should', 'isn\'t it', 'aren\'t', 'don\'t you think',
  ];
  const metaWords = [
    'you are', 'act as', 'pretend', 'imagine you', 'roleplay', 'persona',
  ];

  if (words === 0) return 'shallow';
  if (words < 4) return 'shallow';
  if (words > 80) return 'overloaded';
  if (leadingWords.some((w) => lower.startsWith(w))) return 'leading';
  if (metaWords.some((w) => lower.includes(w))) return 'meta';
  if (/\b(thing|stuff|whatever|something)\b/.test(lower)) return 'vague';
  return 'balanced';
}

const ROAST_TEMPLATES: Record<
  RoastFlavor,
  {
    readonly headline: string;
    readonly lede: string;
    readonly angles: ReadonlyArray<{
      readonly personaId: string;
      readonly angle: string;
      readonly bite: string;
    }>;
  }
> = {
  shallow: {
    headline: 'Three words is not a prompt.',
    lede: 'You handed us a stub. Here is what every persona wishes you had said.',
    angles: [
      {
        personaId: 'analyst',
        angle: 'The Analyst',
        bite: 'The weakest assumption in this prompt is the prompt itself — it does not exist yet.',
      },
      {
        personaId: 'philosopher',
        angle: 'The Philosopher',
        bite: 'Before answering, I have to ask: is the question you are asking even the right one?',
      },
      {
        personaId: 'pragmatist',
        angle: 'The Pragmatist',
        bite: 'What would you test this week if you actually had a real prompt?',
      },
      {
        personaId: 'contrarian',
        angle: 'The Contrarian',
        bite: 'Short prompts are honest. Long prompts are a way to avoid saying what you actually want.',
      },
    ],
  },
  overloaded: {
    headline: 'You asked ten questions in one breath.',
    lede: 'The panel can answer one of these well or all of them badly. Cut.',
    angles: [
      {
        personaId: 'engineer',
        angle: 'The Engineer',
        bite: 'Which constraint will kill this prompt first — context length, ambiguity, or your reader?',
      },
      {
        personaId: 'strategist',
        angle: 'The Strategist',
        bite: 'You do not have ten questions. You have one question and nine fears.',
      },
      {
        personaId: 'firstprinciples',
        angle: 'First Principles',
        bite: 'Strip the second clause. Then the third. Stop when only one load-bearing question is left.',
      },
      {
        personaId: 'analyst',
        angle: 'The Analyst',
        bite: 'The probability that any single one of those ten gets a good answer just dropped below 10%.',
      },
    ],
  },
  vague: {
    headline: 'Vague enough to be meaningless. Tighten it.',
    lede: 'Your prompt is a fog. Below is what each mind does when handed a fog.',
    angles: [
      {
        personaId: 'scientist',
        angle: 'The Scientist',
        bite: 'Define "thing". Then define "stuff". Then define "whatever". Repeat until nothing is left.',
      },
      {
        personaId: 'ethicist',
        angle: 'The Ethicist',
        bite: 'A vague prompt invites the answer you already wanted. That is not inquiry, it is confirmation.',
      },
      {
        personaId: 'pragmatist',
        angle: 'The Pragmatist',
        bite: 'If I cannot tell what you would do with my answer, I cannot give you one worth having.',
      },
      {
        personaId: 'philosopher',
        angle: 'The Philosopher',
        bite: 'The unfocused question is the most honest: it admits you do not know what you want.',
      },
    ],
  },
  leading: {
    headline: 'You wrote a question, but you meant an instruction.',
    lede: 'Leading questions get leading answers. Try this instead.',
    angles: [
      {
        personaId: 'contrarian',
        angle: 'The Contrarian',
        bite: 'I will not. The question already tells me what conclusion you want — so I will pick the other one.',
      },
      {
        personaId: 'devilsadvocate',
        angle: "Devil's Advocate",
        bite: 'The strongest case against your own framing is the one you are most afraid to read.',
      },
      {
        personaId: 'analyst',
        angle: 'The Analyst',
        bite: 'If "isn\'t it true" is in the prompt, the answer cannot surprise you.',
      },
      {
        personaId: 'stoic',
        angle: 'The Stoic',
        bite: 'You have already decided. The prompt is a ceremony, not a question.',
      },
    ],
  },
  meta: {
    headline: 'You are asking the panel to perform, not to answer.',
    lede: 'Roleplay prompts trade depth for theater. Here is what you lose.',
    angles: [
      {
        personaId: 'philosopher',
        angle: 'The Philosopher',
        bite: 'The mask is always thinner than the face. Drop the costume and ask the question plainly.',
      },
      {
        personaId: 'empath',
        angle: 'The Empath',
        bite: 'You are asking for a costume, not for help. Who is the costume for?',
      },
      {
        personaId: 'ethicist',
        angle: 'The Ethicist',
        bite: 'When you ask the AI to play a role, the role answers — not the work.',
      },
      {
        personaId: 'pragmatist',
        angle: 'The Pragmatist',
        bite: 'If you needed a character, you would have hired one. You need an answer. Ask for the answer.',
      },
    ],
  },
  balanced: {
    headline: 'A real prompt. Here is what the panel actually thinks.',
    lede: 'Four minds, four angles, one prompt. Pick the read that fits your context.',
    angles: [
      {
        personaId: 'analyst',
        angle: 'The Analyst',
        bite: 'The strongest assumption in your prompt is that you have framed the problem correctly.',
      },
      {
        personaId: 'empath',
        angle: 'The Empath',
        bite: 'Before the panel answers, ask who is affected by the question and who is not in the room.',
      },
      {
        personaId: 'futurist',
        angle: 'The Futurist',
        bite: 'The right answer today is often the wrong answer in 18 months. Look for the trajectory.',
      },
      {
        personaId: 'optimist',
        angle: 'The Optimist',
        bite: 'The mechanism behind your best-case scenario is the same one behind your realistic plan.',
      },
    ],
  },
};

/**
 * Pure — produce a RoastPick for a given prompt. Same prompt always
 * yields the same flavor + headlines (no randomness in the template
 * picker, only in the angle-order presentation via angle-key sorting).
 */
export function buildRoast(prompt: string): RoastPick {
  const flavor = deriveRoastFlavor(prompt);
  const template = ROAST_TEMPLATES[flavor];
  // Sort angles by persona temperature so the roast reads from
  // cold-to-hot (analyst first, optimist last) for natural flow.
  const sortedAngles = [...template.angles].sort((a, b) => {
    const pa = PERSONAS.find((p) => p.id === a.personaId);
    const pb = PERSONAS.find((p) => p.id === b.personaId);
    return (pa?.temperature ?? 0) - (pb?.temperature ?? 0);
  });
  return {
    flavor,
    headline: template.headline,
    lede: template.lede,
    angles: sortedAngles,
  };
}

/** Build a shareable URL that encodes the user's prompt. */
export function roastShareUrl(origin: string, prompt: string): string {
  return `${origin}/persona-roast?prompt=${encodeURIComponent(prompt)}`;
}

/** Map a flavor to a label for the result card. */
export function roastFlavorLabel(flavor: RoastFlavor): string {
  switch (flavor) {
    case 'shallow':
      return 'Shallow';
    case 'overloaded':
      return 'Overloaded';
    case 'vague':
      return 'Vague';
    case 'leading':
      return 'Leading';
    case 'meta':
      return 'Performance';
    case 'balanced':
      return 'Balanced';
  }
}