/**
 * MoodMatcher — pure helpers that pair user-stated moods with
 * concrete persona-tool recommendations. Lives outside React so
 * the algorithm can be unit-tested without a DOM and reused by
 * future surfaces (e.g. onboarding, the empty-state CTA).
 *
 * Each mood maps to one default tool + a short pitch. The
 * "default" tool is the highest-traffic choice for that mood;
 * the mood also has a category fallback so a future surface can
 * filter the whole grid by mood rather than jumping straight to
 * one tool.
 */

import type { PersonaPlaygroundCategory } from '../data/personaPlayground';

export type MoodId = 'stuck' | 'curious' | 'verdict' | 'inspired' | 'exploring';

export interface Mood {
  /** Stable id used in URLs / storage. */
  readonly id: MoodId;
  /** Short label shown on the chip. */
  readonly label: string;
  /** One-line description of the mood. */
  readonly description: string;
  /** Default tool path. */
  readonly toolPath: string;
  /** Default tool name (resolved at runtime against the catalog). */
  readonly toolNameFallback: string;
  /** Default category for grid-filter fallback. */
  readonly category: PersonaPlaygroundCategory;
  /** One-line pitch shown next to the recommended tool. */
  readonly pitch: string;
}

export const MOODS: readonly Mood[] = [
  {
    id: 'stuck',
    label: "I'm stuck",
    description: 'Need a second opinion to break the logjam.',
    toolPath: '/persona-battle',
    toolNameFallback: 'Persona Battle',
    category: 'versus',
    pitch: 'Two minds, one decision. Best when you keep going in circles.',
  },
  {
    id: 'curious',
    label: 'Just curious',
    description: 'Want to peek inside how a mind reasons.',
    toolPath: '/persona-confessional',
    toolNameFallback: 'Persona Confessional',
    category: 'roast',
    pitch: 'Read an Arena mind reflecting on its own answer.',
  },
  {
    id: 'verdict',
    label: 'Need a verdict',
    description: "Have to pick — help me adjudicate.",
    toolPath: '/persona-dilemma',
    toolNameFallback: 'Persona Dilemma',
    category: 'decide',
    pitch: 'Pair-of-A-vs-B framework built for hard calls.',
  },
  {
    id: 'inspired',
    label: 'Want inspiration',
    description: 'Kickstart the next sentence.',
    toolPath: '/persona-mosaic',
    toolNameFallback: 'Persona Mosaic',
    category: 'mosaic',
    pitch: 'Pick a mind, get its unfiltered first take.',
  },
  {
    id: 'exploring',
    label: 'Just exploring',
    description: 'Show me what the playground can do.',
    toolPath: '/persona-wheel',
    toolNameFallback: 'Persona Wheel',
    category: 'discover',
    pitch: 'Spin the wheel and see where a random mind lands.',
  },
];

export function getMood(id: MoodId): Mood {
  const m = MOODS.find((entry) => entry.id === id);
  if (!m) throw new Error(`Unknown mood: ${id}`);
  return m;
}

export function isMoodId(value: unknown): value is MoodId {
  return typeof value === 'string' && MOODS.some((m) => m.id === value);
}

export const MOOD_IDS: readonly MoodId[] = MOODS.map((m) => m.id);