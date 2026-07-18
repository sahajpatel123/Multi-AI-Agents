import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CapabilitiesPage } from './CapabilitiesPage';

const authState = {
  isAuthenticated: false,
};

const navigateMock = vi.fn();

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
  setRedirectIntent: vi.fn(),
}));

vi.mock('../components/Navbar', () => ({
  Navbar: () => <header data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

describe('CapabilitiesPage', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    navigateMock.mockReset();
  });

  it('renders topologies and pipeline', () => {
    render(
      <MemoryRouter>
        <CapabilitiesPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /everything arena can/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /debate mode/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /focus mode/i })).toBeInTheDocument();
    expect(screen.getByText(/8-stage research matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/planner/i)).toBeInTheDocument();
  });

  it('links product overview and pricing', () => {
    render(
      <MemoryRouter>
        <CapabilitiesPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /product overview/i }));
    expect(navigateMock).toHaveBeenCalledWith('/product');
    fireEvent.click(screen.getByRole('button', { name: /^pricing$/i }));
    expect(navigateMock).toHaveBeenCalledWith('/pricing');
  });
});
