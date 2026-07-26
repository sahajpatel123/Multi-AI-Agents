import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecentTools } from './RecentTools';
import {
  readRecentTools,
  recordRecentTool,
  clearRecentTools,
} from '../lib/recentTools';

function writeRecentTools(values: Array<{ path: string; at: number }>) {
  window.localStorage.setItem(
    'arena:persona-playground:recent-tools:v1',
    JSON.stringify(values),
  );
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('RecentTools widget', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when there is no history', () => {
    const { container } = renderWithRouter(<RecentTools />);
    expect(container.firstChild).toBeNull();
  });

  it('lists known catalog tools with a relative time', () => {
    writeRecentTools([{ path: '/persona-battle', at: Date.now() }]);
    renderWithRouter(<RecentTools />);
    expect(screen.getByText(/Recently visited tools/i)).toBeInTheDocument();
    expect(screen.getByText(/Persona Battle/i)).toBeInTheDocument();
  });

  it('always renders the Shift+T shortcut chip in the heading', () => {
    writeRecentTools([{ path: '/persona-battle', at: Date.now() }]);
    renderWithRouter(<RecentTools />);
    expect(screen.getByText('Shift + T')).toBeInTheDocument();
  });

  it('renders even when a stored path is no longer in the catalog (skips orphans)', () => {
    writeRecentTools([
      { path: '/persona-battle', at: Date.now() },
      { path: '/this-does-not-exist', at: Date.now() - 1000 },
    ]);
    renderWithRouter(<RecentTools />);
    expect(screen.getByText(/Persona Battle/i)).toBeInTheDocument();
    expect(screen.queryByText(/this-does-not-exist/i)).toBeNull();
  });

  it('respects the limit prop', () => {
    const entries = [
      { path: '/persona-battle', at: 5 },
      { path: '/persona-roast', at: 4 },
      { path: '/persona-duel', at: 3 },
      { path: '/persona-forecast', at: 2 },
      { path: '/persona-trivia', at: 1 },
    ];
    writeRecentTools(entries);
    renderWithRouter(<RecentTools limit={2} />);
    // Heading chip is always present, but only 2 cards should render.
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('clears history via the Clear button', () => {
    writeRecentTools([{ path: '/persona-battle', at: Date.now() }]);
    renderWithRouter(<RecentTools />);
    const clear = screen.getByRole('button', { name: /clear recently visited tools/i });
    clear.click();
    expect(readRecentTools(window.localStorage)).toEqual([]);
  });

  it('recordRecentTool appends an entry the widget can read back', () => {
    recordRecentTool(window.localStorage, '/persona-battle');
    const out = readRecentTools(window.localStorage);
    expect(out[0].path).toBe('/persona-battle');
    clearRecentTools(window.localStorage);
  });
});