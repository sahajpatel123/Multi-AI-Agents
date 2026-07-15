/** Character budget helpers for compose surfaces (matches backend 2000-char caps). */

export const AGENT_TASK_MAX_CHARS = 2000;
export const AGENT_TASK_MIN_CHARS = 10;
/** Same server sanitize cap as agent tasks (`input_pipeline` / prompt schema). */
export const ARENA_PROMPT_MAX_CHARS = 2000;
/** Discuss message sanitize cap (`DiscussRequest.message`). */
export const DISCUSS_MESSAGE_MAX_CHARS = 2000;
/** Debate interjection sanitize cap (`DebateRequest.user_interjection`). */
export const DEBATE_INTERJECTION_MAX_CHARS = 2000;

export type CharBudgetTone = 'muted' | 'warn' | 'danger' | 'ready';

export function charBudgetTone(length: number, max = AGENT_TASK_MAX_CHARS): CharBudgetTone {
  if (length > max) return 'danger';
  if (length >= Math.floor(max * 0.9)) return 'warn';
  if (length >= AGENT_TASK_MIN_CHARS) return 'ready';
  return 'muted';
}

export function charBudgetLabel(length: number, max = AGENT_TASK_MAX_CHARS): string {
  const n = Math.max(0, length);
  if (n > max) return `${n - max} over limit`;
  if (n === 0) return `${max} max`;
  return `${n} / ${max}`;
}

export function clampToMax(text: string, max = AGENT_TASK_MAX_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

/**
 * Hint when the user has started typing but is under the Agent min length.
 * Empty string when no hint should show.
 */
export function agentMinLengthHint(
  text: string,
  min = AGENT_TASK_MIN_CHARS,
): string {
  const n = text.trim().length;
  if (n === 0 || n >= min) return '';
  const need = min - n;
  return need === 1
    ? '1 more character to run'
    : `${need} more characters to run`;
}
