// Persona Mosaic Roast — pure helpers for the AI-output-critique
// surface at /persona-mosaic-roast. Paste a 4-persona mosaic's
// output (or any AI answer); 4 different minds critique it + give
// a 0-10 score. Pure functions only.

import { PERSONAS } from './personas';

export type CritiqueVerdict = 'sharp' | 'mixed' | 'soft';

export interface MosaicRoastCritique {
  readonly personaId: string;
  readonly angle: string;
  readonly verdict: CritiqueVerdict;
  readonly take: string;
  readonly score: number;
}

export interface PersonaMosaicRoast {
  readonly output: string;
  readonly critiques: ReadonlyArray<MosaicRoastCritique>;
  readonly averageScore: number;
  readonly dominantVerdict: CritiqueVerdict;
}

const VERDICT_LABELS: Record<CritiqueVerdict, string> = {
  sharp: 'thinks it landed',
  mixed: 'sees strengths and gaps',
  soft: 'wants more from it',
};

// Per-persona critique templates. Each persona has 1 take + 1 score
// per verdict bucket — picked deterministically by output text.

const PERSONA_CRITIQUES: Record<
  string,
  { sharp: MosaicRoastCritique; mixed: MosaicRoastCritique; soft: MosaicRoastCritique }
> = {
  analyst: {
    sharp: {
      personaId: 'analyst',
      angle: 'The Analyst',
      verdict: 'sharp',
      take: 'The output holds up under scrutiny. The reasoning is clean and the assumptions are visible.',
      score: 9,
    },
    mixed: {
      personaId: 'analyst',
      angle: 'The Analyst',
      verdict: 'mixed',
      take: 'The output has a sound structure but skips a load-bearing assumption. Name it before you trust the rest.',
      score: 5,
    },
    soft: {
      personaId: 'analyst',
      angle: 'The Analyst',
      verdict: 'soft',
      take: 'The output is too smooth to be useful. Where is the data the conclusion rests on?',
      score: 3,
    },
  },
  philosopher: {
    sharp: {
      personaId: 'philosopher',
      angle: 'The Philosopher',
      verdict: 'sharp',
      take: 'The output asks the right question. Most outputs do not. That is the difference.',
      score: 9,
    },
    mixed: {
      personaId: 'philosopher',
      angle: 'The Philosopher',
      verdict: 'mixed',
      take: 'The output answers the question, but is it the right question? Check the framing before trusting the conclusion.',
      score: 5,
    },
    soft: {
      personaId: 'philosopher',
      angle: 'The Philosopher',
      verdict: 'soft',
      take: 'The output is a confident answer to a vague question. Vague question, vague answer.',
      score: 3,
    },
  },
  pragmatist: {
    sharp: {
      personaId: 'pragmatist',
      angle: 'The Pragmatist',
      verdict: 'sharp',
      take: 'You can act on this on Monday morning. That is the test most outputs fail.',
      score: 9,
    },
    mixed: {
      personaId: 'pragmatist',
      angle: 'The Pragmatist',
      verdict: 'mixed',
      take: 'The output is well-shaped but not actionable. Convert one of its claims into a verb you can do this week.',
      score: 5,
    },
    soft: {
      personaId: 'pragmatist',
      angle: 'The Pragmatist',
      verdict: 'soft',
      take: 'The output is theoretical. Strip one sentence and you can ship it; without that sentence, do not bother.',
      score: 3,
    },
  },
  strategist: {
    sharp: {
      personaId: 'strategist',
      angle: 'The Strategist',
      verdict: 'sharp',
      take: 'The output picks a move, not a vibe. That is the difference between a strategy and a sentence.',
      score: 9,
    },
    mixed: {
      personaId: 'strategist',
      angle: 'The Strategist',
      verdict: 'mixed',
      take: 'The output has a position but no kill criterion. What is the signal that would make you change your mind?',
      score: 5,
    },
    soft: {
      personaId: 'strategist',
      angle: 'The Strategist',
      verdict: 'soft',
      take: 'The output is symmetrical. Both sides have a point. Pick one. The cost of false balance is a decision never made.',
      score: 3,
    },
  },
};

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Pure — pick 4 distinct personas from the output text. */
function pickCritics(seed: string): ReadonlyArray<string> {
  const all = PERSONAS.map((p) => p.id);
  const indices = all.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = simpleHash(`${seed}:${i}`) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  // Prefer personas with full critique coverage.
  const preferred = ['analyst', 'philosopher', 'pragmatist', 'strategist'];
  const picked: string[] = [];
  for (const id of preferred) {
    if (picked.length >= 4) break;
    if (all.includes(id)) picked.push(id);
  }
  if (picked.length < 4) {
    for (const i of indices) {
      if (picked.length >= 4) break;
      const personaId = all[i];
      if (personaId && !picked.includes(personaId)) picked.push(personaId);
    }
  }
  return picked.slice(0, 4);
}

const ALL_VERDICTS: ReadonlyArray<CritiqueVerdict> = ['sharp', 'mixed', 'soft'];

/**
 * Pure — build a mosaic-roast for an output. Each critic's verdict
 * is picked deterministically from the output text so shared
 * links never break.
 */
export function buildMosaicRoast(output: string): PersonaMosaicRoast {
  const normalized = output.trim();
  const critics = pickCritics(normalized);
  const critiques: MosaicRoastCritique[] = critics.map((personaId, idx) => {
    const pool = PERSONA_CRITIQUES[personaId];
    if (!pool) {
      return {
        personaId,
        angle: PERSONAS.find((p) => p.id === personaId)?.name ?? personaId,
        verdict: 'mixed',
        take: 'I have no view on this output.',
        score: 5,
      };
    }
    const verdict: CritiqueVerdict =
      ALL_VERDICTS[simpleHash(`${normalized}:${personaId}:${idx}`) % ALL_VERDICTS.length];
    return pool[verdict];
  });
  const totalScore = critiques.reduce((sum, c) => sum + c.score, 0);
  const averageScore = critiques.length > 0 ? totalScore / critiques.length : 0;
  // Dominant verdict by count.
  const counts: Record<CritiqueVerdict, number> = { sharp: 0, mixed: 0, soft: 0 };
  for (const c of critiques) counts[c.verdict] += 1;
  const dominantVerdict: CritiqueVerdict = (
    Object.entries(counts) as Array<[CritiqueVerdict, number]>
  ).sort((a, b) => b[1] - a[1])[0][0];
  return {
    output: normalized,
    critiques,
    averageScore: Math.round(averageScore * 10) / 10,
    dominantVerdict,
  };
}

export { VERDICT_LABELS };

/** Pure — verify a mosaic-roast's critiques reference real personas. */
export function mosaicRoastValid(roast: PersonaMosaicRoast): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const c of roast.critiques) {
    if (!known.has(c.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a mosaic-roast. */
export function mosaicRoastShareUrl(origin: string, output: string): string {
  return `${origin}/persona-mosaic-roast?o=${encodeURIComponent(output)}`;
}