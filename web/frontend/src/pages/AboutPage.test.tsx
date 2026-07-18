import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AboutPage } from './AboutPage';

const authState: {
  isAuthenticated: boolean;
  user: { id: string; email: string } | null;
  isLoading: boolean;
} = {
  isAuthenticated: false,
  user: null,
  isLoading: false,
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
      <AboutPage />
    </MemoryRouter>,
  );
}

describe('AboutPage', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.user = null;
    navigateMock.mockReset();
    setRedirectIntentMock.mockReset();
  });

  it('renders the hero, story grid, and CTA in semantic order', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: /reasoning/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /what arena actually is/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/arena is live and free to try/i),
    ).toBeInTheDocument();
    // Three numbered story cards.
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
  });

  it('exposes the main landmark with id="main-content"', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('aria-labelledby', 'about-title');
  });

  it('Try Arena routes to /app when authenticated', () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'u1', email: 'a@b.com' };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /try arena/i }));
    expect(navigateMock).toHaveBeenCalledWith('/app');
    expect(setRedirectIntentMock).not.toHaveBeenCalled();
  });

  it('Try Arena captures redirect intent and routes to /signin when guest', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /try arena/i }));
    await waitFor(() => {
      expect(setRedirectIntentMock).toHaveBeenCalledWith('/app');
    });
    expect(navigateMock).toHaveBeenCalledWith('/signin');
  });

  it('How it works routes to /product', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /how it works/i }));
    expect(navigateMock).toHaveBeenCalledWith('/product');
  });

  it('Pricing routes to /pricing', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^pricing$/i }));
    expect(navigateMock).toHaveBeenCalledWith('/pricing');
  });

  it('renders three story cards with distinct visual variants', () => {
    renderPage();
    expect(document.querySelector('.about-story-card--beige')).toBeTruthy();
    expect(document.querySelector('.about-story-card--paper')).toBeTruthy();
    expect(document.querySelector('.about-story-card--ink')).toBeTruthy();
  });
});