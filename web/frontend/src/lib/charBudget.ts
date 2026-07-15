/** Character budget helpers for compose surfaces (matches backend 2000-char caps). */

export const AGENT_TASK_MAX_CHARS = 2000;
export const AGENT_TASK_MIN_CHARS = 10;

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
