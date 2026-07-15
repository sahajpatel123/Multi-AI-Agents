/**
 * Decide whether to warn the user before leaving the tab/window.
 * Pure — callers own when work is in flight (streams, research pipeline, etc.).
 */
export function shouldWarnOnLeave(busy: boolean): boolean {
  return Boolean(busy);
}

/** Default browser leave message (browsers often ignore custom text). */
export const BUSY_LEAVE_MESSAGE =
  'Work is still in progress. Leaving may cancel the run.';

/**
 * Arena leave-guard: pipeline, streaming, scoring, or focused mind chat.
 */
export function arenaWorkInFlight(opts: {
  isLoading?: boolean;
  isStreaming?: boolean;
  isFocusedChatStreaming?: boolean;
}): boolean {
  return Boolean(opts.isLoading || opts.isStreaming || opts.isFocusedChatStreaming);
}

/**
 * Agent Mode leave-guard: primary research run, refine, or challenge pass.
 */
export function agentWorkInFlight(opts: {
  isRunning?: boolean;
  isRefining?: boolean;
  isChallengingAnswer?: boolean;
}): boolean {
  return Boolean(opts.isRunning || opts.isRefining || opts.isChallengingAnswer);
}
