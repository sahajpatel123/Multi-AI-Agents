import { describe, expect, it } from 'vitest';
import {
  canOfferDebateFollowUp,
  canStartDebateRound,
  debateMaxRounds,
} from './debateRounds';

describe('debateRounds policy', () => {
  it('caps at 3 until follow-up is unlocked', () => {
    expect(debateMaxRounds(false)).toBe(3);
    expect(debateMaxRounds(true)).toBe(4);
  });

  it('allows rounds under the cap when not streaming', () => {
    expect(canStartDebateRound(2, false, false)).toBe(true);
    expect(canStartDebateRound(3, false, false)).toBe(false);
    expect(canStartDebateRound(3, true, false)).toBe(true);
    expect(canStartDebateRound(2, false, true)).toBe(false);
  });

  it('offers follow-up only after round 3 and before unlock', () => {
    expect(canOfferDebateFollowUp(3, false, false)).toBe(true);
    expect(canOfferDebateFollowUp(3, true, false)).toBe(false);
    expect(canOfferDebateFollowUp(2, false, false)).toBe(false);
    expect(canOfferDebateFollowUp(3, false, true)).toBe(false);
  });
});
