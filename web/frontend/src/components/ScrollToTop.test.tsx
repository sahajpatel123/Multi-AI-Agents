import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { render } from '@testing-library/react';
import { ScrollToTop } from './ScrollToTop';

function NavOnMount({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
}

describe('ScrollToTop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing (it has no DOM output)', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('scrolls to top on path change', () => {
    const scrollSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/start']}>
        <ScrollToTop />
        <NavOnMount to="/end" />
      </MemoryRouter>,
    );
    // The NavOnMount effect should have fired and ScrollToTop's effect
    // should have called window.scrollTo({top:0,...}).
    expect(scrollSpy).toHaveBeenCalled();
    const lastCall = scrollSpy.mock.calls[scrollSpy.mock.calls.length - 1];
    expect(lastCall[0]).toMatchObject({ top: 0, left: 0 });
    expect((lastCall[0] as ScrollToOptions).behavior).toBeDefined();
  });

  it('hash navigation scrolls to the matching element when present', () => {
    // Stub scrollIntoView at the prototype level so the polyfill
    // applies regardless of when the target is created (jsdom
    // doesn't implement it natively, and requestAnimationFrame
    // doesn't fire in jsdom — so we replace the implementation
    // directly so the test observes the call).
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const target = document.createElement('div');
    target.id = 'how-it-works';
    document.body.appendChild(target);

    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <ScrollToTop />
        <NavOnMount to="/#how-it-works" />
      </MemoryRouter>,
    );

    expect(scrollIntoViewMock).toHaveBeenCalled();
    document.body.removeChild(target);
  });
});