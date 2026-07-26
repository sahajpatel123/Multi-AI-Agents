import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Favorites } from './Favorites';
import {
  readFavorites,
  toggleFavorite,
  clearFavorites,
} from '../lib/favorites';

function writeFavorites(values: string[]) {
  window.localStorage.setItem(
    'arena:persona-playground:favorites:v1',
    JSON.stringify(values),
  );
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Favorites widget', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when there are no favorites', () => {
    const { container } = renderWithRouter(<Favorites />);
    expect(container.firstChild).toBeNull();
  });

  it('lists favorited tools with a tagline', () => {
    writeFavorites(['/persona-battle', '/persona-roast']);
    renderWithRouter(<Favorites />);
    expect(screen.getByText(/Persona Battle/i)).toBeInTheDocument();
    expect(screen.getByText(/Persona Roast/i)).toBeInTheDocument();
  });

  it('renders a View all link with a Shift + F shortcut chip', () => {
    writeFavorites(['/persona-battle']);
    renderWithRouter(<Favorites />);
    const link = screen.getByRole('link', { name: /view all/i });
    expect(link.getAttribute('href')).toBe('/persona-playground/favorites');
    expect(link.textContent).toContain('Shift + F');
  });

  it('removes a favorite when the unstar button is clicked', () => {
    writeFavorites(['/persona-battle']);
    renderWithRouter(<Favorites />);
    const btn = screen.getByRole('button', { name: /remove persona battle/i });
    btn.click();
    expect(readFavorites(window.localStorage)).toEqual([]);
  });

  it('toggleFavorite round-trips through Favorites', () => {
    toggleFavorite(window.localStorage, '/persona-battle');
    expect(readFavorites(window.localStorage)).toContain('/persona-battle');
    clearFavorites(window.localStorage);
  });
});