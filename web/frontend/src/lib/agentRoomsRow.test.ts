import { describe, expect, it } from 'vitest';
import {
  formatAgentRoomMetaLine,
  resolveRoomActivityAt,
  roomActivityTitle,
  roomInvitePath,
  roomInviteUrl,
} from './agentRoomsRow';

const NOW = Date.parse('2026-07-16T12:00:00Z');

describe('resolveRoomActivityAt', () => {
  it('prefers activityAt then synthesis then created', () => {
    expect(
      resolveRoomActivityAt({
        activityAt: '2026-07-16T11:00:00Z',
        created_at: '2026-07-01T00:00:00Z',
      }),
    ).toBe('2026-07-16T11:00:00Z');
    expect(
      resolveRoomActivityAt({
        synthesis_updated_at: '2026-07-16T10:00:00Z',
        created_at: '2026-07-01T00:00:00Z',
      }),
    ).toBe('2026-07-16T10:00:00Z');
  });
});

describe('formatAgentRoomMetaLine', () => {
  it('builds members · tasks · relative · attention', () => {
    const line = formatAgentRoomMetaLine(
      {
        member_count: 3,
        task_count: 1,
        activityAt: '2026-07-16T11:30:00Z',
      },
      { nowMs: NOW, needsAttention: true },
    );
    expect(line).toBe('3 members · 1 task · 30m ago · New synthesis');
  });

  it('handles singular member/task', () => {
    expect(
      formatAgentRoomMetaLine({ memberCount: 1, taskCount: 1 }, { nowMs: NOW }),
    ).toBe('1 member · 1 task');
  });
});

describe('roomActivityTitle', () => {
  it('formats absolute UTC', () => {
    expect(roomActivityTitle({ activityAt: '2026-07-16T11:30:00Z' })).toBe(
      '2026-07-16 11:30 UTC',
    );
  });
});

describe('roomInvitePath / roomInviteUrl', () => {
  it('builds invite URLs', () => {
    expect(roomInvitePath('my-room')).toBe('/room/my-room');
    expect(roomInviteUrl('my-room', 'https://arena.example')).toBe(
      'https://arena.example/room/my-room',
    );
    expect(roomInvitePath('')).toBe('');
  });
});
