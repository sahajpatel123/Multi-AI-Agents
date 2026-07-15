import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SharePage } from './SharePage';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    loading: false,
    isLoading: false,
  }),
}));

vi.mock('../components/Navbar', () => ({
  Navbar: () => <div data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

function renderShare(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/share${search}`]}>
      <Routes>
        <Route path="/share" element={<SharePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SharePage', () => {
  it('shows empty state when params are missing', () => {
    renderShare('');
    expect(screen.getByText(/share link is empty or expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try arena/i })).toBeInTheDocument();
  });

  it('renders shared take content from query params', () => {
    const qs =
      '?agent=agent_1&prompt=' +
      encodeURIComponent('Should I ship today?') +
      '&response=' +
      encodeURIComponent('Ship the smallest honest slice.');
    renderShare(qs);
    expect(screen.getByText('The Analyst')).toBeInTheDocument();
    expect(screen.getByText('Should I ship today?')).toBeInTheDocument();
    expect(screen.getByText('Ship the smallest honest slice.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try this in arena/i })).toBeInTheDocument();
  });
});
