import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Reveal } from './Reveal';

type IoCallback = IntersectionObserverCallback;

let latestCallback: IoCallback | null = null;
let observed: Element[] = [];

beforeEach(() => {
  observed = [];
  latestCallback = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IoCallback) {
        latestCallback = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds = [];
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reveal', () => {
  it('starts hidden and becomes visible when intersecting', () => {
    render(
      <Reveal data-testid="reveal">
        Section
      </Reveal>,
    );
    const node = screen.getByTestId('reveal');
    expect(node).toHaveClass('arena-reveal');
    expect(node).not.toHaveClass('is-visible');
    expect(observed).toHaveLength(1);

    act(() => {
      latestCallback?.(
        [
          {
            isIntersecting: true,
            target: node,
            intersectionRatio: 1,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: 0,
          },
        ],
        {} as IntersectionObserver,
      );
    });

    expect(node).toHaveClass('is-visible');
  });
});
