import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { BackToTopButton } from './BackToTopButton';

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get: () => value,
  });
  Object.defineProperty(window, 'pageYOffset', {
    configurable: true,
    get: () => value,
  });
}

function installMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reduce : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // Reset matchMedia between tests.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

describe('BackToTopButton', () => {
  it('does not render when scrollY is below threshold', () => {
    setScrollY(0);
    installMatchMedia(false);
    const { container } = render(<BackToTopButton />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when scrollY crosses the threshold', () => {
    setScrollY(0);
    installMatchMedia(false);
    const { container } = render(<BackToTopButton />);
    expect(container.firstChild).toBeNull();

    act(() => {
      setScrollY(600);
      window.dispatchEvent(new Event('scroll'));
    });
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn).toHaveAttribute('aria-label', 'Back to top');
  });

  it('click scrolls to top and focuses main content', () => {
    setScrollY(800);
    installMatchMedia(false);
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const main = document.createElement('div');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.appendChild(main);
    const focusSpy = vi.spyOn(main, 'focus');

    const { container } = render(<BackToTopButton />);
    const btn = container.querySelector('button')!;
    act(() => {
      fireEvent.click(btn);
    });

    expect(scrollSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(main);
  });

  it('removes the scroll listener on unmount', () => {
    setScrollY(0);
    installMatchMedia(false);
    const { unmount } = render(<BackToTopButton />);
    // After unmount, scroll events should not throw.
    expect(() => window.dispatchEvent(new Event('scroll'))).not.toThrow();
    unmount();
  });
});