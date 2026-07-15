/** Debate length policy — 3 standard rounds, optional 4th when unlocked. */

export const DEBATE_STANDARD_ROUNDS = 3;
export const DEBATE_BONUS_ROUNDS = 4;

export function debateMaxRounds(followUpUnlocked: boolean): number {
  return followUpUnlocked ? DEBATE_BONUS_ROUNDS : DEBATE_STANDARD_ROUNDS;
}

export function canStartDebateRound(
  currentRound: number,
  followUpUnlocked: boolean,
  phaseStreaming: boolean,
): boolean {
  if (phaseStreaming) return false;
  return currentRound < debateMaxRounds(followUpUnlocked);
}

export function canOfferDebateFollowUp(
  currentRound: number,
  followUpUnlocked: boolean,
  phaseStreaming: boolean,
): boolean {
  if (phaseStreaming || followUpUnlocked) return false;
  return currentRound === DEBATE_STANDARD_ROUNDS;
}
