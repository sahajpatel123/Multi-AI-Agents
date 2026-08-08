/**
 * Pin the contract that PersonaPlaygroundStats derives its
 * "deep-link pages" tile from PERSONA_PLAYGROUND_SITEMAP rather than a
 * hardcoded constant. Adds / moves to the sitemap auto-update the
 * stats widget; the test below fails if anyone re-introduces a stale
 * literal.
 *
 * Also asserts every stats tile has a value AND a label so a future
 * refactor that drops either surfaces in CI.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PersonaPlaygroundStats } from './PersonaPlaygroundStats';
import { PERSONA_PLAYGROUND_SITEMAP } from '../data/personaPlayground';

describe('PersonaPlaygroundStats', () => {
  it('deep-link pages tile mirrors PERSONA_PLAYGROUND_SITEMAP.length', () => {
    render(
      <MemoryRouter>
        <PersonaPlaygroundStats />
      </MemoryRouter>,
    );
    // Find the tile whose label is "deep-link pages".
    const tiles = screen.getAllByRole('listitem');
    const deepLinkTile = tiles.find((tile) =>
      tile.textContent?.toLowerCase().includes('deep-link pages'),
    );
    expect(deepLinkTile).toBeDefined();
    expect(deepLinkTile!.textContent).toContain(String(PERSONA_PLAYGROUND_SITEMAP.length));
  });

  it('renders every tile with both a value and a label', () => {
    render(
      <MemoryRouter>
        <PersonaPlaygroundStats />
      </MemoryRouter>,
    );
    const tiles = screen.getAllByRole('listitem');
    expect(tiles.length).toBeGreaterThanOrEqual(5);
    for (const tile of tiles) {
      // Each tile contains a numeric value + a lowercase label.
      expect(tile.textContent).toMatch(/\d/);
      expect(tile.textContent!.length).toBeGreaterThan(2);
    }
  });
});