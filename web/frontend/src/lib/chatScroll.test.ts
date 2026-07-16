import { describe, expect, it } from 'vitest';
import { isScrollNearBottom, shouldAutoScrollChat } from './chatScroll';

describe('isScrollNearBottom', () => {
  it('treats missing element as near bottom', () => {
    expect(isScrollNearBottom(null)).toBe(true);
    expect(isScrollNearBottom(undefined)).toBe(true);
  });

  it('is true when at or near the bottom', () => {
    expect(
      isScrollNearBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }, 50),
    ).toBe(true);
    expect(
      isScrollNearBottom({ scrollHeight: 1000, scrollTop: 950, clientHeight: 100 }, 50),
    ).toBe(true);
  });

  it('is false when scrolled up past the threshold', () => {
    expect(
      isScrollNearBottom({ scrollHeight: 1000, scrollTop: 200, clientHeight: 100 }, 50),
    ).toBe(false);
  });

  it('treats non-scrollable content as near bottom', () => {
    expect(
      isScrollNearBottom({ scrollHeight: 80, scrollTop: 0, clientHeight: 100 }, 50),
    ).toBe(true);
  });
});

describe('shouldAutoScrollChat', () => {
  it('follows when stickToBottom is set', () => {
    expect(shouldAutoScrollChat({ stickToBottom: true, isNearBottom: false })).toBe(true);
  });

  it('follows when already near bottom even if stick flag is off', () => {
    expect(shouldAutoScrollChat({ stickToBottom: false, isNearBottom: true })).toBe(true);
  });

  it('does not yank when user has scrolled up', () => {
    expect(shouldAutoScrollChat({ stickToBottom: false, isNearBottom: false })).toBe(false);
  });
});
