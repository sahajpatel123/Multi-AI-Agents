import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToolSearchPalette } from './ToolSearchPalette';
import {
  clampIndex,
  filterForPalette,
  isPaletteOpenKey,
} from '../lib/commandPalette';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

describe('commandPalette (pure helpers)', () => {
  it('returns the full catalog in catalog order for empty query', () => {
    const out = filterForPalette(PERSONA_PLAYGROUND_ENTRIES, '');
    expect(out.length).toBe(PERSONA_PLAYGROUND_ENTRIES.length);
    expect(out.map((m) => m.entry.path)).toEqual(
      PERSONA_PLAYGROUND_ENTRIES.map((e) => e.path),
    );
  });

  it('returns no matches for unrelated query', () => {
    const out = filterForPalette(PERSONA_PLAYGROUND_ENTRIES, 'zzzzzz-no-such-thing');
    expect(out.length).toBe(0);
  });

  it('finds tools by name fragment', () => {
    const out = filterForPalette(PERSONA_PLAYGROUND_ENTRIES, 'mosaic');
    expect(out.length).toBeGreaterThan(0);
    for (const m of out) {
      expect(
        `${m.entry.name} ${m.entry.tagline} ${m.entry.blurb} ${m.entry.format}`
          .toLowerCase()
          .includes('mosaic'),
      ).toBe(true);
    }
  });

  it('promotes name-prefix matches over tagline hits', () => {
    const out = filterForPalette(PERSONA_PLAYGROUND_ENTRIES, 'per');
    expect(out.length).toBeGreaterThan(0);
    // Every name-prefix tool ("Persona …") should rank above any
    // tagline/blurb-only hit. Tie-broken alphabetically.
    const topName = out[0].entry.name;
    expect(topName.startsWith('Persona')).toBe(true);
  });

  it('is deterministic across repeated calls', () => {
    const a = filterForPalette(PERSONA_PLAYGROUND_ENTRIES, 'arena');
    const b = filterForPalette(PERSONA_PLAYGROUND_ENTRIES, 'arena');
    expect(a.map((m) => m.entry.path)).toEqual(b.map((m) => m.entry.path));
  });

  it('clamps index with wrap-around in both directions', () => {
    expect(clampIndex(-1, 5, 0)).toBe(4);
    expect(clampIndex(0, 5, 0)).toBe(0);
    expect(clampIndex(5, 5, 0)).toBe(0);
    expect(clampIndex(6, 5, 0)).toBe(1);
    expect(clampIndex(0, 0, 2)).toBe(2);
  });

  it('detects Cmd/Ctrl-K and bare K as palette open keys', () => {
    expect(isPaletteOpenKey({ key: 'k', metaKey: true } as KeyboardEvent)).toBe(true);
    expect(isPaletteOpenKey({ key: 'K', ctrlKey: true } as KeyboardEvent)).toBe(true);
    expect(isPaletteOpenKey({ key: 'k' } as KeyboardEvent)).toBe(true);
    expect(isPaletteOpenKey({ key: 'K', shiftKey: true } as KeyboardEvent)).toBe(true);
    expect(isPaletteOpenKey({ key: 'a' } as KeyboardEvent)).toBe(false);
    expect(isPaletteOpenKey({ key: 'k', altKey: true } as KeyboardEvent)).toBe(false);
  });
});

describe('ToolSearchPalette', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render the palette until Cmd/Ctrl-K fires', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on bare K keydown outside a field', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on Escape after opening', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the default heading', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByText(/Jump to a tool/i)).toBeInTheDocument();
  });

  it('honors a custom heading and placeholder', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette heading="Find anything" placeholder="Search…" />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByText('Find anything')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
  });

  it('filters the catalog as the user types', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mosaic' } });
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    for (const opt of options) {
      expect(opt.textContent?.toLowerCase()).toContain('mosaic');
    }
  });

  it('shows an empty-state message when no tool matches', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'zzzzzz-no-such-thing' } });
    expect(screen.getByRole('status').textContent).toMatch(/No tools match/i);
  });

  it('clamps the active row when the user keeps arrowing past the end', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    const initial = screen.getAllByRole('option').length;
    expect(initial).toBeGreaterThan(1);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // No throw means wrap-around kept the active row inside bounds.
    expect(screen.getAllByRole('option').length).toBe(initial);
  });

  it('highlights the matching substring inside name and tagline', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mosaic' } });
    const marks = document.querySelectorAll('.palette-row mark');
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of Array.from(marks)) {
      expect(mark.textContent?.toLowerCase()).toContain('mosaic');
    }
  });

  it('does not render any marks for an empty query', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    expect(document.querySelectorAll('.palette-row mark').length).toBe(0);
  });

  it('renders exactly one selected option after the first ArrowDown', () => {
    render(
      <MemoryRouter>
        <ToolSearchPalette />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'k' });
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const selected = screen.getAllByRole('option', { selected: true });
    expect(selected.length).toBe(1);
  });
});
