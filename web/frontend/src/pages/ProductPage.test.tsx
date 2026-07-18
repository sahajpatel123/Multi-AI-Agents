import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
