import { describe, expect, it } from 'vitest';
import { roomsListBodyMode } from './roomsListView';

describe('roomsListBodyMode', () => {
  it('prefers loading, then error, then empty vs list', () => {
    expect(roomsListBodyMode({ loading: true, loadFailed: true, itemCount: 0 })).toBe('loading');
    expect(roomsListBodyMode({ loading: false, loadFailed: true, itemCount: 0 })).toBe('load_error');
    expect(roomsListBodyMode({ loading: false, loadFailed: false, itemCount: 0 })).toBe('empty');
    expect(roomsListBodyMode({ loading: false, loadFailed: false, itemCount: 2 })).toBe('list');
  });
});
