import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';

const authState = {
  isAuthenticated: false,
  user: null as null | { email: string },
  loading: false,
  isLoading: false,
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('../components/Navbar', () => ({
  Navbar: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  it('renders recovery actions for guests', () => {
    authState.isAuthenticated = false;
    renderAt('/missing');
    expect(screen.getByText(/isn't in the arena/i)).toBeInTheDocument();
    expect(screen.getByText(/Requested: \/missing/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try arena/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /how it works/i })).toBeInTheDocument();
  });

  it('offers Agent and Watchlist when signed in', () => {
    authState.isAuthenticated = true;
    authState.user = { email: 'a@b.com' };
    renderAt('/gone');
    expect(screen.getByRole('button', { name: /open arena/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /agent mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /watchlist/i })).toBeInTheDocument();
  });
});
