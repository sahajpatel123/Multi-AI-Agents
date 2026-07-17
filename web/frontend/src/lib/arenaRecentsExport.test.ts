import { describe, expect, it } from 'vitest';
import {
  formatArenaRecentItemCopy,
  formatArenaRecentPromptCopy,
  formatArenaRecentsExport,
} from './arenaRecentsExport';

describe('formatArenaRecentsExport', () => {
  it('formats filtered recents with titles and winners', () => {
    const md = formatArenaRecentsExport({
      totalCount: 3,
      filterNote: 'category Question',
      items: [
        {
          title: 'Ship plan',
          prompt: 'Should we ship today?',
          category: 'question',
          winnerName: 'The Analyst',
          timestamp: '2026-07-01T12:00:00Z',
          turnId: 'turn-1',
        },
        {
          prompt: 'List risks of launching without QA',
          category: 'task',
          winnerName: 'The Skeptic',
        },
      ],
    });

    expect(md).toContain('# Arena · Recents');
    expect(md).toContain('**2** of **3** turns in this view');
    expect(md).toContain('_Filtered view: category Question_');
    expect(md).toContain('## 1. Ship plan');
    expect(md).toContain('**Prompt:** Should we ship today?');
    expect(md).toContain('Question · Winner: The Analyst');
    expect(md).toContain('Turn `turn-1`');
    expect(md).toContain('## 2. List risks of launching without QA');
    expect(md).toMatch(/Shared from Arena recents/);
  });

  it('handles empty filtered views honestly', () => {
    const md = formatArenaRecentsExport({
      totalCount: 4,
      filterNote: 'search “quantum”',
      items: [],
    });
    expect(md).toMatch(/No recent turns match this filter/i);
    expect(md).toContain('_Filtered view: search “quantum”_');
  });

  it('handles empty recents', () => {
    const md = formatArenaRecentsExport({ items: [] });
    expect(md).toMatch(/No recent Arena turns yet/i);
  });
});

describe('formatArenaRecentItemCopy', () => {
  it('snapshots one recent turn', () => {
    const md = formatArenaRecentItemCopy({
      title: 'Ship plan',
      prompt: 'Should we ship today?',
      category: 'question',
      winnerName: 'The Analyst',
      timestamp: '2026-07-01T12:00:00Z',
      turnId: 'turn-1',
    });
    expect(md).toContain('# Ship plan');
    expect(md).toContain('**Prompt:** Should we ship today?');
    expect(md).toContain('Winner: The Analyst');
    expect(md).toContain('Turn `turn-1`');
    expect(md).toContain('Shared from Arena recents');
  });

  it('returns empty when both title and prompt blank', () => {
    expect(formatArenaRecentItemCopy({ title: '  ', prompt: '' })).toBe('');
  });
});

describe('formatArenaRecentPromptCopy', () => {
  it('returns trimmed prompt with trailing newline', () => {
    expect(formatArenaRecentPromptCopy('  Ship today?  ')).toBe('Ship today?\n');
  });

  it('returns empty for blank', () => {
    expect(formatArenaRecentPromptCopy('   ')).toBe('');
  });
});
