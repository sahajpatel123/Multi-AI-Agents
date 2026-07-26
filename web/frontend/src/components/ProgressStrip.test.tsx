import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgressStrip } from './ProgressStrip';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

function writeLocalStorage(values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) {
    window.localStorage.setItem(k, v);
  }
}

describe('ProgressStrip', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders nothing on a cold start', () => {
    const { container } = render(
      <MemoryRouter>
        <ProgressStrip />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders after a recent tool is recorded', () => {
    writeLocalStorage({
      'arena:persona-playground:recent-tools:v1': JSON.stringify([
        { path: '/persona-match', at: Date.now() },
      ]),
    });
    render(
      <MemoryRouter>
        <ProgressStrip />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Your playground progress/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('counts unique paths across recent and favorites', () => {
    const path = '/persona-battle';
    writeLocalStorage({
      'arena:persona-playground:recent-tools:v1': JSON.stringify([
        { path, at: Date.now() },
        { path: '/persona-match', at: Date.now() },
      ]),
      'arena:persona-playground:favorites:v1': JSON.stringify([
        { path, at: Date.now() },
        { path: '/persona-council', at: Date.now() },
      ]),
    });
    render(
      <MemoryRouter>
        <ProgressStrip />
      </MemoryRouter>,
    );
    // 3 unique tried (battle, match, council), 2 favorited
    const tried = screen.getByLabelText(/tools tried out of/i);
    expect(tried.textContent).toContain('3');
    const favorited = screen.getByLabelText(/tools favorited/i);
    expect(favorited.textContent).toContain('2');
  });

  it('ignores paths outside the persona catalog', () => {
    writeLocalStorage({
      'arena:persona-playground:recent-tools:v1': JSON.stringify([
        { path: '/not-a-tool', at: Date.now() },
        { path: '/persona-match', at: Date.now() },
      ]),
      'arena:persona-playground:favorites:v1': JSON.stringify([
        '/admin/secret',
        '/persona-battle',
      ]),
    });
    render(
      <MemoryRouter>
        <ProgressStrip />
      </MemoryRouter>,
    );
    const tried = screen.getByLabelText(/tools tried out of/i);
    expect(tried.textContent).toContain('2');
  });

  it('renders a progressbar with the correct percentage', () => {
    writeLocalStorage({
      'arena:persona-playground:favorites:v1': JSON.stringify(
        PERSONA_PLAYGROUND_ENTRIES.slice(0, 5).map((entry) => ({
          path: entry.path,
          at: Date.now(),
        })),
      ),
    });
    render(
      <MemoryRouter>
        <ProgressStrip />
      </MemoryRouter>,
    );
    const bar = screen.getByRole('progressbar');
    const total = PERSONA_PLAYGROUND_ENTRIES.length;
    const expected = Math.round((5 / total) * 100);
    expect(bar.getAttribute('aria-valuenow')).toBe(String(expected));
  });

  it('fires the onJumpTried handler when the tried card is clicked', () => {
    writeLocalStorage({
      'arena:persona-playground:favorites:v1': JSON.stringify([
        { path: '/persona-battle', at: Date.now() },
      ]),
    });
    const onJumpTried = vi.fn();
    render(
      <MemoryRouter>
        <ProgressStrip onJumpTried={onJumpTried} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText(/tools tried out of/i));
    expect(onJumpTried).toHaveBeenCalledTimes(1);
  });

  it('shows a different message for high coverage', () => {
    writeLocalStorage({
      'arena:persona-playground:favorites:v1': JSON.stringify(
        PERSONA_PLAYGROUND_ENTRIES.map((entry) => ({
          path: entry.path,
          at: Date.now(),
        })),
      ),
    });
    render(
      <MemoryRouter>
        <ProgressStrip />
      </MemoryRouter>,
    );
    expect(screen.getByText(/every tool in the playground/i)).toBeInTheDocument();
  });

  it('marks the strip complete and disables the untried card at 100%', () => {
    writeLocalStorage({
      'arena:persona-playground:favorites:v1': JSON.stringify(
        PERSONA_PLAYGROUND_ENTRIES.map((entry) => ({
          path: entry.path,
          at: Date.now(),
        })),
      ),
    });
    render(
      <MemoryRouter>
        <ProgressStrip />
      </MemoryRouter>,
    );
    const untried = screen.getByLabelText(/tools not yet tried/i);
    expect(untried).toBeDisabled();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('announces the tier message via aria-live', () => {
    writeLocalStorage({
      'arena:persona-playground:favorites:v1': JSON.stringify([
        { path: '/persona-match', at: Date.now() },
      ]),
    });
    render(
      <MemoryRouter>
        <ProgressStrip />
      </MemoryRouter>,
    );
    const msg = screen.getByText(/keep building/i);
    expect(msg.getAttribute('aria-live')).toBe('polite');
  });
});