/** Classify Agent Mode toast copy for live-region a11y. */

export type AgentToastKind = 'success' | 'error';

const ERROR_HINT =
  /could not|couldn’t|couldn't|failed|error|limit|not found|forbidden|timed out|timeout|denied/i;

export function agentToastKind(message: string): AgentToastKind {
  const m = (message || '').trim();
  if (!m) return 'success';
  if (ERROR_HINT.test(m)) return 'error';
  return 'success';
}

export function agentToastRole(kind: AgentToastKind): 'status' | 'alert' {
  return kind === 'error' ? 'alert' : 'status';
}

export function agentToastAriaLive(kind: AgentToastKind): 'polite' | 'assertive' {
  return kind === 'error' ? 'assertive' : 'polite';
}
