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
 * Spin history entry — the simplest record that captures "you met this
 * persona on the wheel" so the user can revisit past rolls and the
 * progress tracker can count distinct personas discovered.
 */
export interface WheelSpinEntry {
  readonly id: string;
  readonly mode: WheelMode;
  readonly personaIds: ReadonlyArray<string>;
  readonly seed: string;
  readonly savedAt: string;
}

const HISTORY_LIMIT = 24;

export function readSpinHistory(): ReadonlyArray<WheelSpinEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('arena:persona-wheel:history:v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WheelSpinEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.mode === 'string' &&
          Array.isArray(e.personaIds),
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function appendSpinHistory(entry: WheelSpinEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readSpinHistory().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, HISTORY_LIMIT);
    window.localStorage.setItem(
      'arena:persona-wheel:history:v1',
      JSON.stringify(next),
    );
  } catch {
    /* quota / private mode — silent */
  }
}

export function clearSpinHistory() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem('arena:persona-wheel:history:v1');
  } catch {
    /* silent */
  }
}

/**
 * Compute the set of distinct persona ids the user has rolled on the
 * wheel — fuels the "you've met N / 16 minds" progress bar.
 */
export function discoveredPersonas(
  history: ReadonlyArray<WheelSpinEntry>,
): ReadonlyArray<string> {
  const set = new Set<string>();
  for (const entry of history) {
    for (const id of entry.personaIds) set.add(id);
  }
  // Return in the canonical PERSONAS order so the progress UI is stable.
  const order = new Map(PERSONAS.map((p, i) => [p.id, i]));
  return [...set].sort(
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
  );
}

/**
 * Build a Web Audio API tick sound. Lazily creates an AudioContext so
 * browsers that block autoplay until user interaction still work — the
 * first tick is triggered by the user's first click on Spin, which
 * satisfies the gesture requirement.
 */
let _audioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_audioContext) return _audioContext;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    _audioContext = new Ctor();
    return _audioContext;
  } catch {
    return null;
  }
}

export function playTick(velocity = 0.4): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Some browsers create the context suspended; resume it on demand.
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 1200 + Math.random() * 200;
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(velocity * 0.04, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  osc.start(now);
  osc.stop(now + 0.07);
}

export function playLanding(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  // Two-tone landing chord.
  const tones = [659.25, 880.0];
  tones.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const now = ctx.currentTime + i * 0.04;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.55);
  });
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