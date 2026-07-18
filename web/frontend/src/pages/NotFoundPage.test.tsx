import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';

const authState = {
  isAuthenticated: false,
  user: null as null | { email: string },
  loading: false,
  isLoading: false,
};

const copyMock = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('../components/Navbar', () => ({
  Navbar: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyMock(...args),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.user = null;
    copyMock.mockReset();
    copyMock.mockResolvedValue(true);
  });

  it('renders recovery actions for guests', () => {
    renderAt('/missing');
    expect(screen.getByRole('heading', { name: /isn't in the arena/i })).toBeInTheDocument();
    expect(screen.getByText('/missing')).toBeInTheDocument();
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

  it('exposes main landmark and recovery group', () => {
    renderAt('/nope');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('group', { name: /recovery options/i })).toBeInTheDocument();
  });

  it('copies the requested path', async () => {
    renderAt('/missing-page');
    fireEvent.click(screen.getByRole('button', { name: /copy requested path/i }));
    await waitFor(() => {
      expect(copyMock).toHaveBeenCalledWith('/missing-page');
    });
    expect(await screen.findByRole('button', { name: /path copied/i })).toBeInTheDocument();
  });
});
