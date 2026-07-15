import { describe, expect, it } from 'vitest';
import { formatSavedTakeExport } from './savedTakeExport';

describe('formatSavedTakeExport', () => {
  it('formats question, one-liner, and verdict', () => {
    const md = formatSavedTakeExport({
      agentName: 'The Analyst',
      prompt: 'Should I ship today?',
      oneLiner: 'Ship the smallest honest slice.',
      verdict: 'Risk is bounded if scope is tight.',
      score: 88.2,
    });
    expect(md).toContain('The Analyst · Saved on Arena');
    expect(md).toContain('Should I ship today?');
    expect(md).toContain('Ship the smallest honest slice.');
    expect(md).toContain('Risk is bounded');
    expect(md).toContain('88');
    expect(md).toContain('Shared from Arena');
  });

  it('handles missing optional fields', () => {
    const md = formatSavedTakeExport({
      agentName: '',
      prompt: '',
      oneLiner: 'Enough.',
    });
    expect(md).toContain('Arena mind');
    expect(md).toContain('(no prompt)');
    expect(md).toContain('Enough.');
  });
});
