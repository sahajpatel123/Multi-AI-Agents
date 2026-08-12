import { describe, expect, it } from 'vitest';
import {
  sidebarChatsSortLabel,
  sortSidebarChats,
} from './sidebarChatsSort';

describe('sortSidebarChats', () => {
  const sample = [
    {
      session_id: 'chat-1',
      title: 'Zebra planning',
      last_prompt: 'Should we launch?',
      turn_count: 2,
      last_active: '2026-01-01T00:00:00Z',
    },
    {
      session_id: 'chat-2',
      title: 'Alpha review',
      last_prompt: 'Review the roadmap',
      turn_count: 7,
      last_active: '2026-03-01T00:00:00Z',
    },
    {
      session_id: 'chat-3',
      title: null,
      last_prompt: null,
      primary_topic: 'Beta launch',
      turn_count: null,
      last_active: '2026-02-01T00:00:00Z',
    },
  ];

  it('sorts newest first', () => {
    expect(sortSidebarChats(sample, 'newest').map((c) => c.session_id)).toEqual([
      'chat-2',
      'chat-3',
      'chat-1',
    ]);
  });

  it('sorts oldest first', () => {
    expect(sortSidebarChats(sample, 'oldest').map((c) => c.session_id)).toEqual([
      'chat-1',
      'chat-3',
      'chat-2',
    ]);
  });

  it('sorts by display title alphabetically', () => {
    expect(sortSidebarChats(sample, 'title').map((c) => c.session_id)).toEqual([
      'chat-2',
      'chat-3',
      'chat-1',
    ]);
  });

  it('sorts by turn count with unknown counts last', () => {
    expect(sortSidebarChats(sample, 'turns').map((c) => c.session_id)).toEqual([
      'chat-2',
      'chat-1',
      'chat-3',
    ]);
  });

  it('keeps pinned chats above unpinned chats in every sort mode', () => {
    const withPin = sample.map((chat, i) =>
      i === 2 ? { ...chat, pinned: true } : chat,
    );
    expect(sortSidebarChats(withPin, 'title').map((c) => c.session_id)).toEqual([
      'chat-3',
      'chat-2',
      'chat-1',
    ]);
  });

  it('does not mutate the input list', () => {
    const input = [...sample];
    const sorted = sortSidebarChats(input, 'turns');
    expect(input.map((c) => c.session_id)).toEqual(['chat-1', 'chat-2', 'chat-3']);
    expect(sorted).not.toBe(input);
  });

  it('labels sorts', () => {
    expect(sidebarChatsSortLabel('title')).toBe('Title A–Z');
    expect(sidebarChatsSortLabel('turns')).toBe('Most turns');
    expect(sidebarChatsSortLabel('oldest')).toBe('Oldest');
  });
});
