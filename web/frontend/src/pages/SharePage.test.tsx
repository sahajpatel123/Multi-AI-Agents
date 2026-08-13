import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: /copy take/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('renders a shared round with all takes from round query params', () => {
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent('Should we ship today?') +
      '&winner=philosopher' +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.') +
      '&t1=' +
      encodeURIComponent('philosopher|87|Enough is when desire ends.');
    renderShare(qs);
    expect(screen.getByText('Four minds.')).toBeInTheDocument();
    expect(screen.getByText('Should we ship today?')).toBeInTheDocument();
    expect(screen.getByText('The Analyst')).toBeInTheDocument();
    expect(screen.getByText('Ship the smallest honest slice.')).toBeInTheDocument();
    expect(screen.getByText('The Philosopher')).toBeInTheDocument();
    expect(screen.getByText('Enough is when desire ends.')).toBeInTheDocument();
    expect(screen.getAllByText(/Arena take/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Arena winner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy round/i })).toBeInTheDocument();
  });

  it('expands and collapses a long shared round prompt', () => {
    const longPrompt = 'p'.repeat(200);
    const qs =
      '?round=1&prompt=' +
      encodeURIComponent(longPrompt) +
      '&t0=' +
      encodeURIComponent('analyst|84|Ship the smallest honest slice.');
    renderShare(qs);

    const promptText = screen.getByText(longPrompt);
    expect(promptText.className).toContain('is-clamped');

    fireEvent.click(screen.getByRole('button', { name: /show full question/i }));
    expect(promptText.className).not.toContain('is-clamped');

    fireEvent.click(screen.getByRole('button', { name: /show less/i }));
    expect(promptText.className).toContain('is-clamped');
  });

  it('shows the empty state instead of a single-take card for a malformed round link', () => {
    renderShare('?round=1&prompt=' + encodeURIComponent('Question only, no takes'));
    expect(screen.getByText(/share link is empty or expired/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy take/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy round/i })).not.toBeInTheDocument();
  });
});
