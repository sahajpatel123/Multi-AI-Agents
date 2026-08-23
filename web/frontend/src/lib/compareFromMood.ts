/**
 * CompareFromMood — given the user's active mood, surface 1-2
 * alternative persona tools from the same category that the user
 * could compare against. Pure helpers; the widget lives at
 * components/CompareFromMood.tsx and is rendered inside the
 * MoodMatcher's pick panel.
 *
 * Returns the mood's primary recommended tool plus up to `limit`
 * alternative tools in the same category, excluding the primary
 * so the user always sees something they haven't picked yet.
 */

import {
  PERSONA_PLAYGROUND_ENTRIES,
  type PersonaPlaygroundCategory,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';
import { MOODS } from './moodMatcher';

export interface CompareFromMoodOptions {
  /** Max alternative tools to return. Default 2. */
  limit?: number;
}

export function compareAlternativesForMood(
  moodId: string,
  options: CompareFromMoodOptions = {},
): readonly PersonaPlaygroundEntry[] {
  const limit = options.limit ?? 2;
  const mood = MOODS.find((m) => m.id === moodId);
  if (!mood) return [];
  return PERSONA_PLAYGROUND_ENTRIES.filter(
    (entry) =>
      entry.category === mood.category && entry.path !== mood.toolPath,
  ).slice(0, limit);
}

export function compareUrlForMood(
  moodId: string,
  options: CompareFromMoodOptions = {},
): string | null {
  const mood = MOODS.find((m) => m.id === moodId);
  if (!mood) return null;
  const alts = compareAlternativesForMood(moodId, options);
  const target = alts[0];
  if (!target) return null;
  const params = new URLSearchParams({
    a: mood.toolPath,
    b: target.path,
  });
  return `/persona-playground/compare?${params.toString()}`;
}

export type { PersonaPlaygroundCategory };
