// Persona Duel — pure helpers for the single-elimination bracket at
// /persona-duel. Deterministic bracket from a seed so the same
// matchups play the same way every time. Pure functions only — no
// backend, no random — every bracket can be deep-linked via ?seed=
// and replayed exactly.

import { PERSONAS } from './personas';

export interface DuelMatchup {
  readonly id: string;
  readonly leftId: string;
  readonly rightId: string;
  readonly winnerId: string | null;
}

export interface DuelRound {
  readonly name: string;
  readonly index: number;
  readonly matchups: ReadonlyArray<DuelMatchup>;
}

export interface DuelBracket {
  readonly seed: string;
  readonly rounds: ReadonlyArray<DuelRound>;
  readonly championId: string | null;
}

/**
 * Standard March-Madness-style seeding: 1 vs N, 2 vs (N-1), etc.
 * Pure — produces a stable ordering regardless of the persona
 * catalog.
 */
function standardSeedOrder(ids: ReadonlyArray<string>): ReadonlyArray<string> {
  const n = ids.length;
  if (n < 2) return [...ids];
  if (n === 2) return [ids[0], ids[1]];
  // Recursive: take half, mirror it.
  const half = standardSeedOrder(ids.slice(0, Math.ceil(n / 2)));
  const other = ids.slice(Math.ceil(n / 2));
  const result: string[] = [];
  for (let i = 0; i < other.length; i++) {
    result.push(half[i] ?? ids[i]);
    result.push(other[i]);
  }
  // Tail if half had extra (odd count).
  if (half.length > other.length) {
    result.push(half[half.length - 1]);
  }
  return result;
}

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Pure — pick the seeded persona order from a seed string. Stable:
 * the same seed always produces the same bracket ordering.
 */
function seededPersonaOrder(seed: string): ReadonlyArray<string> {
  const all = PERSONAS.map((p) => p.id);
  // Shuffle the catalog with a deterministic hash per index.
  const indices = all.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = simpleHash(`${seed}:${i}`) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.map((i) => all[i]);
}

/**
 * Pure — build a full bracket from a seed. The bracket has the
 * right number of rounds to handle any even-sized persona list.
 */
export function buildBracket(seed: string): DuelBracket {
  const seedOrder = seededPersonaOrder(seed);
  const orderedForSeed = standardSeedOrder(seedOrder);
  const rounds: DuelRound[] = [];
  // Round 1
  const round1Matchups: DuelMatchup[] = [];
  for (let i = 0; i < orderedForSeed.length; i += 2) {
    const left = orderedForSeed[i];
    const right = orderedForSeed[i + 1];
    if (!left || !right) continue;
    round1Matchups.push({
      id: `r0-m${i / 2}`,
      leftId: left,
      rightId: right,
      winnerId: null,
    });
  }
  rounds.push({
    name: 'Round of 16',
    index: 0,
    matchups: round1Matchups,
  });

  // Subsequent rounds: pair up the previous round's matchups.
  let prev = round1Matchups;
  let roundIdx = 1;
  const roundNames = ['Quarterfinals', 'Semifinals', 'Final'];
  while (prev.length > 1 && prev.length % 2 === 0) {
    const next: DuelMatchup[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const m1 = prev[i];
      const m2 = prev[i + 1];
      if (!m1 || !m2) continue;
      next.push({
        id: `r${roundIdx}-m${i / 2}`,
        // Initial slot placeholders; the real personas are filled in
        // once the previous round's winners are known.
        leftId: m1.winnerId ?? m1.leftId,
        rightId: m2.winnerId ?? m2.rightId,
        winnerId: null,
      });
    }
    rounds.push({
      name: roundNames[roundIdx - 1] ?? `Round ${roundIdx + 1}`,
      index: roundIdx,
      matchups: next,
    });
    prev = next;
    roundIdx += 1;
  }

  return {
    seed,
    rounds,
    championId: null,
  };
}

/**
 * Pure — apply a winner pick to a bracket and return a new bracket
 * with the affected matchup's winner set, plus the next round's
 * matchup slots updated.
 */
export function applyPick(
  bracket: DuelBracket,
  matchupId: string,
  winnerId: string,
): DuelBracket {
  // Find the round + index of the matchup.
  let targetRoundIdx = -1;
  let targetMatchupIdx = -1;
  for (let r = 0; r < bracket.rounds.length; r++) {
    const idx = bracket.rounds[r].matchups.findIndex((m) => m.id === matchupId);
    if (idx >= 0) {
      targetRoundIdx = r;
      targetMatchupIdx = idx;
      break;
    }
  }
  if (targetRoundIdx === -1) return bracket;

  // Validate the winner is one of the two participants.
  const target = bracket.rounds[targetRoundIdx].matchups[targetMatchupIdx];
  if (!target) return bracket;
  if (winnerId !== target.leftId && winnerId !== target.rightId) return bracket;

  const rounds = bracket.rounds.map((round, r) => {
    if (r !== targetRoundIdx) return round;
    return {
      ...round,
      matchups: round.matchups.map((m, i) =>
        i === targetMatchupIdx ? { ...m, winnerId } : m,
      ),
    };
  });

  // Cascade: update the next round's slot pair if this matchup feeds it.
  if (targetRoundIdx + 1 < rounds.length) {
    const nextRound = rounds[targetRoundIdx + 1];
    const targetSlotIdx = Math.floor(targetMatchupIdx / 2);
    const isLeftSlot = targetMatchupIdx % 2 === 0;
    rounds[targetRoundIdx + 1] = {
      ...nextRound,
      matchups: nextRound.matchups.map((m, i) => {
        if (i !== targetSlotIdx) return m;
        return isLeftSlot
          ? { ...m, leftId: winnerId }
          : { ...m, rightId: winnerId };
      }),
    };
  }

  // Compute champion if the final round is fully picked.
  const finalRound = rounds[rounds.length - 1];
  const champion =
    finalRound.matchups.length === 1 && finalRound.matchups[0].winnerId
      ? finalRound.matchups[0].winnerId
      : null;

  return {
    seed: bracket.seed,
    rounds,
    championId: champion,
  };
}

/** Pure — current champion if decided, else null. */
export function currentChampion(bracket: DuelBracket): string | null {
  return bracket.championId;
}

/** Pure — count of picks the user has made so far. */
export function pickCount(bracket: DuelBracket): number {
  let count = 0;
  for (const round of bracket.rounds) {
    for (const m of round.matchups) {
      if (m.winnerId) count += 1;
    }
  }
  return count;
}

/** Pure — total matchups the user has to make. */
export function totalMatchups(bracket: DuelBracket): number {
  let count = 0;
  for (const round of bracket.rounds) {
    count += round.matchups.length;
  }
  return count;
}

/** Build a shareable URL for a bracket. */
export function duelShareUrl(origin: string, seed: string): string {
  return `${origin}/persona-duel?seed=${encodeURIComponent(seed)}`;
}

/** Pure — generate a new random seed. */
export function generateSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Pure — compose a short "house description" for the champion using
 * the persona's quote + temperature.
 */
export function championDescription(personaId: string): string {
  const p = PERSONAS.find((x) => x.id === personaId);
  if (!p) return '';
  const tempLabel =
    p.temperature >= 0.75
      ? 'incendiary'
      : p.temperature >= 0.55
      ? 'warm'
      : p.temperature >= 0.3
      ? 'cool'
      : 'ice-cold';
  return `${p.quote} — a ${tempLabel} mind, voted winner by you.`;
}
// Champion's journey — pure derivation of the path a champion took
// to win, round by round. Each entry lists the opponent they beat
// and the matchup id.

export interface ChampionJourneyRound {
  readonly roundName: string;
  readonly opponentId: string;
  readonly matchupId: string;
}

export function championJourney(
  bracket: DuelBracket,
  championId: string,
): ReadonlyArray<ChampionJourneyRound> {
  if (!championId) return [];
  const journey: ChampionJourneyRound[] = [];
  let emergingFromId: string | null = null;
  for (const round of bracket.rounds) {
    const match = round.matchups.find((m) => {
      if (m.winnerId !== championId) return false;
      if (emergingFromId !== null && m.id !== emergingFromId) return false;
      return true;
    });
    if (!match) continue;
    const opponentId =
      match.leftId === championId ? match.rightId : match.leftId;
    journey.push({
      roundName: round.name,
      opponentId,
      matchupId: match.id,
    });
    emergingFromId = mIdOfNextMatch(bracket, match.id, round.index);
  }
  return journey;
}

function mIdOfNextMatch(
  bracket: DuelBracket,
  matchupId: string,
  currentRoundIdx: number,
): string | null {
  const currentMatchIdx = bracket.rounds[currentRoundIdx].matchups.findIndex(
    (m) => m.id === matchupId,
  );
  if (currentMatchIdx === -1) return null;
  if (currentRoundIdx + 1 >= bracket.rounds.length) return null;
  const nextSlotIdx = Math.floor(currentMatchIdx / 2);
  return bracket.rounds[currentRoundIdx + 1].matchups[nextSlotIdx]?.id ?? null;
}

// Bracket history (localStorage)

export interface DuelHistoryEntry {
  readonly id: string;
  readonly date: string;
  readonly seed: string;
  readonly championId: string;
  readonly savedAt: string;
}

const HISTORY_KEY = 'arena:persona-duel:history:v1';
const HISTORY_LIMIT = 12;

export function readDuelHistory(): ReadonlyArray<DuelHistoryEntry> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DuelHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.date === 'string' &&
          typeof e.championId === 'string',
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function appendDuelHistory(entry: DuelHistoryEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readDuelHistory().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, HISTORY_LIMIT);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* silent */
  }
}

export function clearDuelHistory() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* silent */
  }
}

/** Today's date as YYYY-MM-DD in local timezone. */
export function duelTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
