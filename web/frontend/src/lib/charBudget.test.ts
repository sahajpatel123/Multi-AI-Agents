import { describe, expect, it } from 'vitest';
import {
  AGENT_TASK_MAX_CHARS,
  charBudgetLabel,
  charBudgetTone,
  clampToMax,
} from './charBudget';

describe('charBudget', () => {
  it('tones by remaining budget', () => {
    expect(charBudgetTone(0)).toBe('muted');
    expect(charBudgetTone(10)).toBe('ready');
    expect(charBudgetTone(Math.floor(AGENT_TASK_MAX_CHARS * 0.9))).toBe('warn');
    expect(charBudgetTone(AGENT_TASK_MAX_CHARS + 1)).toBe('danger');
  });

  it('labels remaining and over-limit', () => {
    expect(charBudgetLabel(0)).toContain('max');
    expect(charBudgetLabel(42)).toBe('42 / 2000');
    expect(charBudgetLabel(2005)).toBe('5 over limit');
  });

  it('clamps to max without padding short text', () => {
    expect(clampToMax('hi')).toBe('hi');
    expect(clampToMax('x'.repeat(2500)).length).toBe(AGENT_TASK_MAX_CHARS);
  });
});
