import { describe, expect, it } from 'vitest';
import {
  formatSavedTakeExport,
  formatSavedTakesJsonExport,
  formatSavedTakesListExport,
} from './savedTakeExport';

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

describe('formatSavedTakesJsonExport', () => {
  it('serializes a filtered saved list as pretty JSON', () => {
    const json = formatSavedTakesJsonExport({
      totalCount: 2,
      filterNote: 'pinned only',
      exportedAt: '2026-08-07T00:00:00.000Z',
      items: [
        {
          agentName: 'The Analyst',
          prompt: 'Ship today?',
          oneLiner: 'Ship small.',
          verdict: 'Risk is bounded if scope is tight.',
          score: 90,
          timestamp: '2026-07-01T12:00:00Z',
          pinned: true,
          personaId: 'analyst',
        },
      ],
    });
    const parsed = JSON.parse(json);
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.exported_at).toBe('2026-08-07T00:00:00.000Z');
    expect(parsed.total_saved).toBe(2);
    expect(parsed.filter_note).toBe('pinned only');
    expect(parsed.count).toBe(1);
    expect(parsed.items[0]).toMatchObject({
      agentName: 'The Analyst',
      prompt: 'Ship today?',
      oneLiner: 'Ship small.',
      verdict: 'Risk is bounded if scope is tight.',
      score: 90,
      timestamp: '2026-07-01T12:00:00Z',
      pinned: true,
      personaId: 'analyst',
    });
    expect(json).toContain('\n');
  });

  it('normalizes missing fields for JSON output', () => {
    const json = formatSavedTakesJsonExport({
      exportedAt: '2026-08-07T00:00:00.000Z',
      items: [
        {
          agentName: '',
          prompt: '',
          oneLiner: '',
          verdict: '',
          score: null,
          timestamp: null,
        },
      ],
    });
    const parsed = JSON.parse(json);
    expect(parsed.items[0]).toMatchObject({
      agentName: 'Arena mind',
      prompt: '(no prompt)',
      oneLiner: null,
      verdict: null,
      score: null,
      timestamp: null,
      pinned: false,
      personaId: null,
    });
    expect(parsed.filter_note).toBeNull();
  });
});
