import { describe, expect, it } from 'vitest';
import {
  formatRoomBoardExport,
  plainAnswerExcerpt,
  resolveRoomTaskAnswerBody,
  roomTaskAnswerExpandable,
} from './roomBoardExport';

describe('resolveRoomTaskAnswerBody', () => {
  it('returns plain markdown as-is', () => {
    expect(resolveRoomTaskAnswerBody('## Findings\n\nDetail here.')).toBe(
      '## Findings\n\nDetail here.',
    );
  });

  it('extracts final_answer from JSON payloads', () => {
    expect(
      resolveRoomTaskAnswerBody(JSON.stringify({ final_answer: 'Full answer body.' })),
    ).toBe('Full answer body.');
  });
});

describe('plainAnswerExcerpt', () => {
  it('strips markdown noise and truncates', () => {
    const text = plainAnswerExcerpt('## Hello\n**world** and more text '.repeat(20), 40);
    expect(text.length).toBeLessThanOrEqual(40);
    expect(text).not.toContain('**');
    expect(text).not.toMatch(/^#/);
  });

  it('reads JSON sentence payloads', () => {
    const text = plainAnswerExcerpt(
      JSON.stringify({ sentences: [{ text: 'First claim.' }, { text: 'Second claim.' }] }),
    );
    expect(text).toContain('First claim.');
    expect(text).toContain('Second claim.');
  });
});

describe('roomTaskAnswerExpandable', () => {
  it('is false for short answers', () => {
    expect(roomTaskAnswerExpandable('Short take.')).toBe(false);
  });

  it('is true when full body is much longer than the excerpt', () => {
    const long = 'Word '.repeat(80).trim();
    expect(roomTaskAnswerExpandable(long, 140)).toBe(true);
  });
});

describe('formatRoomBoardExport', () => {
  it('formats tasks with authors, scores, and excerpts', () => {
    const md = formatRoomBoardExport({
      roomName: 'Climate board',
      shareUrl: 'https://arena.example/room/climate',
      memberCount: 2,
      totalTaskCount: 2,
      tasks: [
        {
          title: 'Policy scan',
          author: 'Ada',
          score: 88,
          createdAt: '2026-07-01T12:00:00Z',
          excerpt: 'Carbon tax first…',
          taskId: 'abc-123',
        },
        {
          title: 'Market risks',
          author: 'Ben',
          score: 72,
          question: 'What are the market risks?',
          excerpt: 'Volatility remains high…',
        },
      ],
    });

    expect(md).toContain('# Climate board · Research board');
    expect(md).toContain('2 researchers · 2 tasks');
    expect(md).toContain('**Room:** https://arena.example/room/climate');
    expect(md).toContain('## 1. Policy scan');
    expect(md).toContain('Ada · 88/100 · 2026-07-01');
    expect(md).toContain('_Carbon tax first…_');
    expect(md).toContain('Task `abc-123`');
    expect(md).toContain('**Question:** What are the market risks?');
    expect(md).toMatch(/Shared from Arena Rooms/);
  });

  it('notes filtered empty views honestly', () => {
    const md = formatRoomBoardExport({
      roomName: 'Empty',
      totalTaskCount: 4,
      filterNote: 'search “quantum”',
      tasks: [],
    });
    expect(md).toMatch(/No research tasks match this filter/i);
    expect(md).toContain('_Filtered view: search “quantum”_');
    expect(md).toContain('0 of 4 tasks');
  });

  it('handles empty board', () => {
    const md = formatRoomBoardExport({ roomName: 'New room' });
    expect(md).toMatch(/No research tasks on the board yet/i);
  });
});
