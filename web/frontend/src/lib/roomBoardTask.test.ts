import { describe, expect, it } from 'vitest';
import {
  formatRoomBoardRelative,
  roomBoardTaskAnswerText,
  roomBoardTaskQuestionText,
  roomBoardTimeTitle,
  roomMemberOnline,
} from './roomBoardTask';

const NOW = Date.parse('2026-07-16T12:00:00Z');

describe('roomBoardTaskQuestionText', () => {
  it('prefers question over title', () => {
    expect(
      roomBoardTaskQuestionText({
        question: 'What is X?',
        title: 'Short',
      }),
    ).toBe('What is X?');
  });

  it('falls back to task_text then title', () => {
    expect(roomBoardTaskQuestionText({ task_text: '  From text  ' })).toBe('From text');
    expect(roomBoardTaskQuestionText({ title: 'Only title' })).toBe('Only title');
    expect(roomBoardTaskQuestionText({})).toBe('');
  });
});

describe('roomBoardTaskAnswerText', () => {
  it('returns plain answers', () => {
    expect(roomBoardTaskAnswerText({ final_answer: 'Hello world' })).toBe('Hello world');
  });

  it('joins JSON sentence synthesis', () => {
    const body = JSON.stringify({
      sentences: [{ text: 'One.' }, { text: 'Two.' }],
    });
    expect(roomBoardTaskAnswerText({ final_answer: body })).toBe('One.\n\nTwo.');
  });

  it('empty when missing', () => {
    expect(roomBoardTaskAnswerText({})).toBe('');
  });
});

describe('formatRoomBoardRelative', () => {
  it('renders relative with injected now', () => {
    expect(formatRoomBoardRelative('2026-07-16T11:30:00Z', NOW)).toBe('30m ago');
  });
});

describe('roomBoardTimeTitle', () => {
  it('formats absolute UTC', () => {
    expect(roomBoardTimeTitle('2026-07-16T11:30:00Z')).toBe('2026-07-16 11:30 UTC');
  });
});

describe('roomMemberOnline', () => {
  it('true within 5 minutes', () => {
    expect(roomMemberOnline('2026-07-16T11:58:00Z', NOW)).toBe(true);
  });

  it('false when stale or invalid', () => {
    expect(roomMemberOnline('2026-07-16T11:00:00Z', NOW)).toBe(false);
    expect(roomMemberOnline(null, NOW)).toBe(false);
    expect(roomMemberOnline('nope', NOW)).toBe(false);
  });
});
