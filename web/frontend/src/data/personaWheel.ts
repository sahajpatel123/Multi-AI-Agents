// Persona Wheel — pure helpers for the spin-to-discover surface at
// /persona-wheel. Picks uniformly from the persona catalog and provides
// deterministic shareable URLs.

import { PERSONAS } from './personas';

export type WheelMode = 'single' | 'pair' | 'trio';

/** Pick `count` distinct personas uniformly at random. */
export function spinPersonas(count: number): ReadonlyArray<string> {
  if (count <= 0 || PERSONAS.length === 0) return [];
  const pool = PERSONAS.map((p) => p.id);
  // Fisher–Yates shuffle, partial.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/**
 * Deterministic seed → persona id. Used to make shareable wheel URLs
 * reproducible without trusting the client. The seed can be any short
 * string; we fold it into a stable hash, then index modulo the catalog.
 */
export function personaFromSeed(seed: string, personaIds: ReadonlyArray<string>): string {
  const ids = personaIds.length > 0 ? personaIds : PERSONAS.map((p) => p.id);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % ids.length;
  return ids[idx];
}

/** Pick `count` distinct personas by combining the deterministic seed
 *  with each persona's ordinal index. Used when ?seed= is present so
 *  a shared URL always lands on the same combo. */
export function deterministicSpin(seed: string, count: number): ReadonlyArray<string> {
  const ids = PERSONAS.map((p) => p.id);
  if (count <= 0 || ids.length === 0) return [];
  const pool = [...ids];
  // Multiple hash passes for distinct picks.
  const picks: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = personaFromSeed(`${seed}:${i}`, pool);
    picks.push(id);
    const idx = pool.indexOf(id);
    if (idx >= 0) pool.splice(idx, 1);
    if (pool.length === 0) break;
  }
  return picks;
}

/** Build a shareable URL string for a wheel result. */
export function wheelShareUrl(
  origin: string,
  mode: WheelMode,
  personaIds: ReadonlyArray<string>,
  seed: string,
): string {
  const params = new URLSearchParams();
  params.set('mode', mode);
  params.set('seed', seed);
  params.set('p', personaIds.join(','));
  return `${origin}/persona-wheel?${params.toString()}`;
}

/** Build the wheel CTA URL for a single persona → /persona-match deep link. */
export function wheelMatchLink(origin: string, personaId: string): string {
  return `${origin}/persona-match?p=${personaId}`;
}

/** Build the wheel CTA URL for a pair → /persona-battle deep link. */
export function wheelBattleLink(
  origin: string,
  leftId: string,
  rightId: string,
): string {
  return `${origin}/persona-battle?left=${leftId}&right=${rightId}`;
}

/** Build the wheel CTA URL for a trio → Arena deep link (used post-auth). */
export function wheelArenaLink(personaIds: ReadonlyArray<string>): string {
  const seed = personaIds.map((id) => `seedPersona=${id}`).join('&');
  return `/app?${seed}`;
}