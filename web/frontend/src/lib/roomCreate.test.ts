import { describe, expect, it } from 'vitest';
import {
  ROOM_NAME_MAX,
  ROOM_NAME_MIN,
  roomCreateButtonLabel,
  roomCreateCaughtErrorMessage,
  roomNameIssueMessage,
  validateRoomName,
} from './roomCreate';

describe('roomCreate', () => {
  it('validates name length and emptiness', () => {
    expect(validateRoomName('')).toBe('name_required');
    expect(validateRoomName('  ')).toBe('name_required');
    expect(validateRoomName('A')).toBe('name_too_short');
    expect(validateRoomName('AI')).toBeNull();
    expect(validateRoomName('x'.repeat(ROOM_NAME_MAX))).toBeNull();
    expect(validateRoomName('x'.repeat(ROOM_NAME_MAX + 1))).toBe('name_too_long');
    expect(ROOM_NAME_MIN).toBe(2);
  });

  it('maps issues and errors to human copy', () => {
    expect(roomNameIssueMessage('name_required')).toMatch(/name/i);
    expect(roomNameIssueMessage('name_too_short')).toMatch(/2/);
    expect(roomCreateCaughtErrorMessage(new Error('Server down'))).toBe('Server down');
    expect(roomCreateCaughtErrorMessage({})).toMatch(/try again/i);
    expect(roomCreateButtonLabel(true)).toBe('Creating…');
    expect(roomCreateButtonLabel(false)).toMatch(/Create room/);
  });
});
