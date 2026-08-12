import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_CHATS_PIN_ALL,
  SIDEBAR_CHATS_PIN_ONLY,
  filterChatsByPin,
  sidebarChatsPinFilterLabel,
} from './sidebarChatsPinFilter';

describe('filterChatsByPin', () => {
  const sample = [
    { session_id: 'chat-1', pinned: false },
    { session_id: 'chat-2', pinned: true },
    { session_id: 'chat-3', pinned: undefined },
    { session_id: 'chat-4', pinned: true },
  ];

  it('keeps every chat for the all filter', () => {
    expect(
      filterChatsByPin(sample, SIDEBAR_CHATS_PIN_ALL).map((s) => s.session_id),
    ).toEqual(['chat-1', 'chat-2', 'chat-3', 'chat-4']);
  });

  it('keeps only pinned chats for the pinned filter', () => {
    expect(
      filterChatsByPin(sample, SIDEBAR_CHATS_PIN_ONLY).map((s) => s.session_id),
    ).toEqual(['chat-2', 'chat-4']);
  });

  it('excludes chats whose pin state is missing or false', () => {
    expect(
      filterChatsByPin(
        [
          { session_id: 'chat-a', pinned: undefined },
          { session_id: 'chat-b', pinned: null as never },
          { session_id: 'chat-c', pinned: false },
        ],
        SIDEBAR_CHATS_PIN_ONLY,
      ),
    ).toEqual([]);
  });

  it('returns a new array and tolerates missing input', () => {
    expect(filterChatsByPin(undefined as never, SIDEBAR_CHATS_PIN_ONLY)).toEqual([]);
    const source = [...sample];
    const filtered = filterChatsByPin(source, SIDEBAR_CHATS_PIN_ONLY);
    expect(source).toHaveLength(sample.length);
    expect(filtered).not.toBe(source);
  });

  it('labels filters', () => {
    expect(sidebarChatsPinFilterLabel(SIDEBAR_CHATS_PIN_ALL)).toBe('All chats');
    expect(sidebarChatsPinFilterLabel(SIDEBAR_CHATS_PIN_ONLY)).toBe('Pinned only');
  });
});
