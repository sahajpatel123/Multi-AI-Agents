import { describe, expect, it } from 'vitest';
import {
  agentCardLoadingAnimation,
  agentCardLoadingBackgroundSize,
  shouldRotateThinkingPhrases,
} from './agentCardMotion';

describe('agentCardMotion', () => {
  it('disables shimmer when reduced motion is preferred', () => {
    expect(agentCardLoadingAnimation(true, false, true)).toBe('none');
    expect(agentCardLoadingAnimation(true, false, false)).toContain('shimmer');
    expect(agentCardLoadingAnimation(false, true, false)).toContain('winnerPulse');
    expect(agentCardLoadingAnimation(false, true, true)).toBe('none');
  });

  it('keeps background static under reduced motion', () => {
    expect(agentCardLoadingBackgroundSize(true, true)).toBe('auto');
    expect(agentCardLoadingBackgroundSize(true, false)).toBe('200% 100%');
  });

  it('skips thinking phrase rotation when reduced motion is on', () => {
    expect(shouldRotateThinkingPhrases(true, true)).toBe(false);
    expect(shouldRotateThinkingPhrases(true, false)).toBe(true);
    expect(shouldRotateThinkingPhrases(false, false)).toBe(false);
  });
});
