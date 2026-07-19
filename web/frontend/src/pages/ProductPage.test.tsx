import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductPage } from './ProductPage';

const authState = {
  isAuthenticated: false,
  user: null as null | { id: number },
};

const navigateMock = vi.fn();
const setRedirectIntentMock = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../utils/redirectIntent', () => ({
  setRedirectIntent: (...args: unknown[]) => setRedirectIntentMock(...args),
}));

vi.mock('../components/Navbar', () => ({
  Navbar: () => <header data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductPage />
    </MemoryRouter>,
  );
}

describe('ProductPage', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    navigateMock.mockReset();
    setRedirectIntentMock.mockReset();
  });

  it('renders Arena and Agent mode cards', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /two ways to/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /arena mode/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /agent mode/i })).toBeInTheDocument();
  });

  it('renders the interactive two-engine showcase and changes scenarios', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /see the difference in the output/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/market entry brief/i)).toBeInTheDocument();
    expect(screen.getByText(/4 responses · 1 judge/i)).toBeInTheDocument();
    expect(screen.getByText(/7 visible stages · illustrative/i)).toBeInTheDocument();
    expect(screen.getByText(/illustrative output/i)).toBeInTheDocument();

    const scenarios = screen.getByRole('group', { name: /product showcase scenario/i });
    const strategy = within(scenarios).getByRole('button', { name: /strategy/i });
    const research = within(scenarios).getByRole('button', { name: /research/i });
    expect(strategy).toHaveAttribute('aria-pressed', 'true');
    expect(research).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(research);
    expect(strategy).toHaveAttribute('aria-pressed', 'false');
    expect(research).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(/should advanced ai be treated as critical infrastructure/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/policy evidence dossier/i)).toBeInTheDocument();
  });

  it('renders the routing matrix and complete product surface', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /choose by the work/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /verdict is only the beginning/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('ARENA / DEBATE')).toBeInTheDocument();
    expect(screen.getByText('AGENT / WATCHLIST')).toBeInTheDocument();
  });

  it('routes guests through sign-in for Arena', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /arena mode/i }));
    expect(setRedirectIntentMock).toHaveBeenCalledWith('/app');
    expect(navigateMock).toHaveBeenCalledWith('/signin?tab=signup');
  });

  it('links to capabilities and pricing', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /see all capabilities/i }));
    expect(navigateMock).toHaveBeenCalledWith('/capabilities');
    fireEvent.click(screen.getByRole('button', { name: /^pricing$/i }));
    expect(navigateMock).toHaveBeenCalledWith('/pricing');
  });
});
