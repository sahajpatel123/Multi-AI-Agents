/** Motion decisions for Arena agent cards (pure). */

export function agentCardLoadingAnimation(
  isLoading: boolean,
  isWinner: boolean,
  reducedMotion: boolean,
): string {
  if (reducedMotion) return 'none';
  if (isLoading) return 'shimmer 1.5s infinite';
  if (isWinner) return 'winnerPulse 400ms ease-out';
  return 'none';
}

export function agentCardLoadingBackgroundSize(
  isLoading: boolean,
  reducedMotion: boolean,
): string {
  if (isLoading && !reducedMotion) return '200% 100%';
  return 'auto';
}

/** Whether thinking-phrase rotation timers should run. */
export function shouldRotateThinkingPhrases(
  showThinking: boolean,
  reducedMotion: boolean,
): boolean {
  return showThinking && !reducedMotion;
}
