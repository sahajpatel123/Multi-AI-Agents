import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearRoomLeft, markRoomLeft, roomWasLeft } from './roomLeave';

describe('room leave intent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns false for rooms the user never left', () => {
    expect(roomWasLeft(1, 'quantum-lab')).toBe(false);
  });

  it('persists a left room per user and clears it on rejoin', () => {
    markRoomLeft(1, 'quantum-lab');
    markRoomLeft(2, 'quantum-lab');

    expect(roomWasLeft(1, 'quantum-lab')).toBe(true);
    expect(roomWasLeft(2, 'quantum-lab')).toBe(true);

    clearRoomLeft(1, 'quantum-lab');

    expect(roomWasLeft(1, 'quantum-lab')).toBe(false);
    expect(roomWasLeft(2, 'quantum-lab')).toBe(true);
  });

  it('treats malformed storage as no leave history', () => {
    localStorage.setItem('arena:left-rooms:v1:7', '{not-json');
    expect(roomWasLeft(7, 'quantum-lab')).toBe(false);
    markRoomLeft(7, 'quantum-lab');
    expect(roomWasLeft(7, 'quantum-lab')).toBe(true);
  });

  it('ignores blank slugs', () => {
    markRoomLeft(1, '');
    expect(roomWasLeft(1, '')).toBe(false);
  });
});
