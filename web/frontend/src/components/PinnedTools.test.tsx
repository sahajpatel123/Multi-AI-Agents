import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PinnedTools } from './PinnedTools';
import {
  readPinnedTools,
  togglePinnedTool,
  PINNED_TOOLS_LIMIT,
} from '../lib/pinnedTools';

function writePinned(values: string[]) {
  window.localStorage.setItem(
    'arena:persona-playground:pinned-tools:v1',
    JSON.stringify(values),
  );
}

describe('pinnedTools (pure helpers)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty list for missing storage', () => {
    expect(readPinnedTools(null)).toEqual([]);
  });

  it('round-trips a single pin', () => {
    togglePinnedTool(window.localStorage, '/persona-battle');
    expect(readPinnedTools(window.localStorage)).toEqual(['/persona-battle']);
  });

  it('round-trips a remove', () => {
    togglePinnedTool(window.localStorage, '/persona-battle');
    togglePinnedTool(window.localStorage, '/persona-battle');
    expect(readPinnedTools(window.localStorage)).toEqual([]);
  });

  it('rejects paths outside the persona catalog', () => {
    togglePinnedTool(window.localStorage, '/not-a-tool');
    expect(readPinnedTools(window.localStorage)).toEqual([]);
  });

  it('caps pins at 3 — adding a 4th returns false', () => {
    togglePinnedTool(window.localStorage, '/persona-battle');
    togglePinnedTool(window.localStorage, '/persona-match');
    togglePinnedTool(window.localStorage, '/persona-council');
    expect(readPinnedTools(window.localStorage).length).toBe(PINNED_TOOLS_LIMIT);
    const ok = togglePinnedTool(window.localStorage, '/persona-dilemma');
    expect(ok).toBe(false);
    expect(readPinnedTools(window.localStorage).length).toBe(PINNED_TOOLS_LIMIT);
  });

  it('filters out invalid entries on read', () => {
    writePinned(['/persona-battle', '/not-a-tool', 42, '/persona-match']);
    expect(readPinnedTools(window.localStorage)).toEqual([
      '/persona-battle',
      '/persona-match',
    ]);
  });
});

describe('PinnedTools', () => {
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
        <PinnedTools />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a chip per pinned tool', () => {
    writePinned(['/persona-battle', '/persona-match']);
    render(
      <MemoryRouter>
        <PinnedTools />
      </MemoryRouter>,
    );
    expect(screen.getByText('Persona Battle')).toBeInTheDocument();
    expect(screen.getByText('Persona Match')).toBeInTheDocument();
  });

  it('unpins a tool when its X is clicked', () => {
    writePinned(['/persona-battle']);
    const { container } = render(
      <MemoryRouter>
        <PinnedTools />
      </MemoryRouter>,
    );
    expect(container.firstChild).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Unpin Persona Battle/i }));
    expect(readPinnedTools(window.localStorage)).toEqual([]);
    expect(container.firstChild).toBeNull();
  });

  it('clear-all empties the bar', () => {
    writePinned(['/persona-battle', '/persona-match']);
    render(
      <MemoryRouter>
        <PinnedTools />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Unpin all tools/i }));
    expect(readPinnedTools(window.localStorage)).toEqual([]);
  });
});