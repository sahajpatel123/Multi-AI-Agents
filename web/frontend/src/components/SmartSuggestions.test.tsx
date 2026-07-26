import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SmartSuggestions } from './SmartSuggestions';
import { suggestTools } from '../lib/smartSuggestions';
import { toggleFavorite } from '../lib/favorites';
import { recordRecentTool } from '../lib/recentTools';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

describe('smartSuggestions (pure helpers)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns [] when no storage is provided', () => {
    expect(suggestTools(null)).toEqual([]);
  });

  it('returns [] on cold start (no favorites, no recent)', () => {
    expect(suggestTools(window.localStorage)).toEqual([]);
  });

  it('suggests tools from the strongest category after a favorite is recorded', () => {
    // Favorite 2 decide tools; one decide tool stays unfavorited so
    // the algorithm has something to recommend.
    const decideTools = PERSONA_PLAYGROUND_ENTRIES.filter(
      (e) => e.category === 'decide',
    );
    toggleFavorite(window.localStorage, decideTools[0].path);
    toggleFavorite(window.localStorage, decideTools[1].path);
    // Drop a few non-decide favorites so decide stays dominant.
    toggleFavorite(window.localStorage, '/persona-battle');
    const out = suggestTools(window.localStorage);
    expect(out.length).toBeGreaterThan(0);
    // Strongest category should be 'decide'.
    expect(out[0].category).toBe('decide');
    for (const s of out) {
      expect(s.category).toBe('decide');
    }
  });

  it('does not suggest tools the user has already favorited', () => {
    const tool = PERSONA_PLAYGROUND_ENTRIES.find((e) => e.category === 'decide');
    if (!tool) throw new Error('no decide tool in catalog');
    toggleFavorite(window.localStorage, tool.path);
    toggleFavorite(window.localStorage, '/persona-battle'); // different category for affinity
    const out = suggestTools(window.localStorage);
    for (const s of out) {
      expect(s.entry.path).not.toBe(tool.path);
    }
  });

  it('honors the limit option', () => {
    const decideTools = PERSONA_PLAYGROUND_ENTRIES.filter(
      (e) => e.category === 'decide',
    );
    for (const t of decideTools) {
      toggleFavorite(window.localStorage, t.path);
    }
    const out = suggestTools(window.localStorage, { limit: 1 });
    expect(out.length).toBeLessThanOrEqual(1);
  });
});

describe('SmartSuggestions', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders nothing on cold start', () => {
    const { container } = render(
      <MemoryRouter>
        <SmartSuggestions />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a suggestion card after a favorite is recorded', () => {
    const decideTools = PERSONA_PLAYGROUND_ENTRIES.filter(
      (e) => e.category === 'decide',
    );
    toggleFavorite(window.localStorage, decideTools[0].path);
    toggleFavorite(window.localStorage, decideTools[1].path);
    toggleFavorite(window.localStorage, '/persona-battle');
    recordRecentTool(window.localStorage, decideTools[0].path);
    render(
      <MemoryRouter>
        <SmartSuggestions />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Based on what you/i)).toBeInTheDocument();
  });

  it('surfaces a Why-this hint with the strongest category', () => {
    const decideTools = PERSONA_PLAYGROUND_ENTRIES.filter(
      (e) => e.category === 'decide',
    );
    toggleFavorite(window.localStorage, decideTools[0].path);
    toggleFavorite(window.localStorage, decideTools[1].path);
    toggleFavorite(window.localStorage, '/persona-battle');
    render(
      <MemoryRouter>
        <SmartSuggestions />
      </MemoryRouter>,
    );
    const why = screen.getByText(/Why\?/i);
    expect(why.getAttribute('title')).toMatch(/strongest category/i);
  });

  it('renders a Show all button when more eligible tools exist', () => {
    const decideTools = PERSONA_PLAYGROUND_ENTRIES.filter(
      (e) => e.category === 'decide',
    );
    // Favorite 1 of 3 decide tools; the rest (2) are eligible. With
    // limit=1 (default is 2), initial=1 < all=2 → button shows.
    toggleFavorite(window.localStorage, decideTools[0].path);
    toggleFavorite(window.localStorage, '/persona-battle');
    render(
      <MemoryRouter>
        <SmartSuggestions limit={1} />
      </MemoryRouter>,
    );
    const button = screen.getByRole('button', { name: /Show all/i });
    expect(button).toBeInTheDocument();
  });
});