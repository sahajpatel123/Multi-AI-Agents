import { describe, expect, it } from 'vitest';
import {
  discoverRoomAriaLabel,
  discoverRoomEmptyTitle,
  discoverRoomMeta,
  discoverRoomStatus,
  type DiscoverRoomLike,
} from './roomsDiscover';

describe('discoverRoomMeta', () => {
  it('formats plural counts', () => {
    expect(discoverRoomMeta({ id: 1, member_count: 3, task_count: 5 })).toBe('3 members · 5 tasks');
  });

  it('uses singular labels', () => {
    expect(discoverRoomMeta({ id: 1, member_count: 1, task_count: 1 })).toBe('1 member · 1 task');
  });

  it('tolerates missing or non-finite counts', () => {
    expect(discoverRoomMeta({ id: 1 })).toBe('0 members · 0 tasks');
    expect(discoverRoomMeta({ id: 1, member_count: null, task_count: undefined })).toBe(
      '0 members · 0 tasks',
    );
    expect(discoverRoomMeta(null)).toBe('0 members · 0 tasks');
    expect(discoverRoomMeta(undefined)).toBe('0 members · 0 tasks');
  });
});

describe('discoverRoomStatus', () => {
  it('reports synthesis when a timestamp exists', () => {
    expect(
      discoverRoomStatus({ id: 1, synthesis_updated_at: '2026-08-12T10:00:00' }),
    ).toBe('New synthesis');
  });

  it('reports no synthesis for missing or empty timestamps', () => {
    expect(discoverRoomStatus({ id: 1 })).toBe('No synthesis yet');
    expect(discoverRoomStatus({ id: 1, synthesis_updated_at: null })).toBe('No synthesis yet');
    expect(discoverRoomStatus(null)).toBe('No synthesis yet');
  });
});

describe('discoverRoomAriaLabel', () => {
  it('builds a descriptive label', () => {
    const room: DiscoverRoomLike = {
      id: 7,
      name: 'Quantum investing',
      member_count: 2,
      task_count: 4,
      synthesis_updated_at: '2026-08-12T10:00:00',
    };
    expect(discoverRoomAriaLabel(room)).toBe(
      'Open room Quantum investing — 2 members · 4 tasks, New synthesis',
    );
  });

  it('falls back for empty names and missing rooms', () => {
    expect(discoverRoomAriaLabel({ id: 1, name: '   ' })).toContain('Untitled room');
    expect(discoverRoomAriaLabel(null)).toBe('Open room');
  });
});

describe('discoverRoomEmptyTitle', () => {
  it('mentions the active query on a search miss', () => {
    expect(discoverRoomEmptyTitle('quantum')).toBe('No rooms match “quantum”');
  });

  it('trims and falls back to a feed-level message', () => {
    expect(discoverRoomEmptyTitle('   ')).toBe('No rooms to discover right now');
    expect(discoverRoomEmptyTitle('')).toBe('No rooms to discover right now');
  });
});
