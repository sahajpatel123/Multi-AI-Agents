import { describe, expect, it } from 'vitest';
import {
  collapsiblePromptAriaLabel,
  collapsiblePromptHint,
  COLLAPSIBLE_PROMPT_THRESHOLD,
  isCollapsiblePrompt,
} from './collapsiblePrompt';

describe('collapsiblePrompt', () => {
  it('detects long prompts past the threshold', () => {
    expect(isCollapsiblePrompt('short')).toBe(false);
    expect(isCollapsiblePrompt('x'.repeat(COLLAPSIBLE_PROMPT_THRESHOLD))).toBe(false);
    expect(isCollapsiblePrompt('x'.repeat(COLLAPSIBLE_PROMPT_THRESHOLD + 1))).toBe(true);
  });

  it('labels expand and collapse for assistive tech', () => {
    expect(collapsiblePromptAriaLabel(false)).toMatch(/expand/i);
    expect(collapsiblePromptAriaLabel(true)).toMatch(/collapse/i);
    expect(collapsiblePromptHint(false)).toContain('Read full');
    expect(collapsiblePromptHint(true)).toContain('Collapse');
  });
});
