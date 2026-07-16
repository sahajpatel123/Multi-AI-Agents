import { describe, expect, it } from 'vitest';
import { formatSavedTakeExport, formatSavedTakesListExport } from './savedTakeExport';

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

describe('formatSavedTakesListExport', () => {
  it('formats a bulk list with counts and takes', () => {
    const md = formatSavedTakesListExport({
      totalCount: 2,
      items: [
        {
          agentName: 'The Analyst',
          prompt: 'Ship today?',
          oneLiner: 'Ship small.',
          score: 90,
          timestamp: '2026-07-01T12:00:00Z',
        },
        {
          agentName: 'The Skeptic',
          prompt: 'Wait?',
          oneLiner: 'Not yet.',
          verdict: 'Need more evidence before shipping.',
        },
      ],
    });
    expect(md).toContain('# Arena · Saved takes');
    expect(md).toContain('**2** saved takes');
    expect(md).toContain('## 1. The Analyst');
    expect(md).toContain('Ship today?');
    expect(md).toContain('Ship small.');
    expect(md).toContain('Score 90');
    expect(md).toContain('## 2. The Skeptic');
    expect(md).toContain('Need more evidence');
    expect(md).toMatch(/Shared from Arena \(saved takes\)/);
  });

  it('notes filtered empty views honestly', () => {
    const md = formatSavedTakesListExport({
      totalCount: 5,
      filterNote: 'search “quantum”',
      items: [],
    });
    expect(md).toContain('_Filtered view: search “quantum”_');
    expect(md).toMatch(/No saved takes match this filter/i);
    expect(md).toContain('**0** of **5** saved takes');
  });
});
