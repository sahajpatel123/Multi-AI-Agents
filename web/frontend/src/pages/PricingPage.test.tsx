import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PricingPage } from './PricingPage';

const authState: {
  isAuthenticated: boolean;
  user: { id: string; email: string } | null;
  isLoading: boolean;
} = {
  isAuthenticated: false,
  user: null,
  isLoading: false,
};

const tierState: {
  tier: string;
  creditsRemaining: number;
  creditsDaily: number;
  setTier: ReturnType<typeof vi.fn>;
  refreshTier: ReturnType<typeof vi.fn>;
} = {
  tier: 'free',
  creditsRemaining: 25000,
  creditsDaily: 25000,
  setTier: vi.fn(),
  refreshTier: vi.fn(),
};

const profileModalState: {
  isOpen: boolean;
  openModal: ReturnType<typeof vi.fn>;
  closeModal: ReturnType<typeof vi.fn>;
} = {
  isOpen: false,
  openModal: vi.fn(),
  closeModal: vi.fn(),
};

const navigateMock = vi.fn();
const setRedirectIntentMock = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('../context/TierContext', () => ({
  useTier: () => tierState,
}));

vi.mock('../context/ProfileModalContext', () => ({
  useProfileModal: () => profileModalState,
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

vi.mock('../api', () => ({
  getSubscriptionStatus: vi.fn().mockResolvedValue({ active: false }),
}));

vi.mock('../components/Navbar', () => ({
  Navbar: () => <header data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <div data-testid="footer" />,
}));

vi.mock('../components/RazorpayCheckout', () => ({
  RazorpayCheckout: () => null,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <PricingPage />
    </MemoryRouter>,
  );
}

describe('PricingPage', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.user = null;
    tierState.tier = 'free';
    navigateMock.mockReset();
    setRedirectIntentMock.mockReset();
  });

  it('offers guests a functional Start for free CTA', () => {
    const { container } = renderPage();
    const start = screen.getByRole('button', { name: /start for free/i });
    expect(start.querySelector('.arena-btn__label')).toHaveTextContent('Start for free');
    expect(container.querySelector('.pricing-plan-card')?.textContent).not.toContain('Current plan');
    fireEvent.click(start);
    expect(setRedirectIntentMock).toHaveBeenCalledWith('/app');
    expect(navigateMock).toHaveBeenCalledWith('/signin?tab=signup');
  });

  it('renders three plan cards with their tier names', () => {
    const { container } = renderPage();
    const names = Array.from(
      container.querySelectorAll('.pricing-plan-card__name'),
    ).map((el) => el.textContent?.trim() ?? '');
    expect(names).toEqual(['Explorer', 'Plus', 'Pro']);
  });

  it('keeps paid CTA icons inside the inheriting button wrappers', () => {
    renderPage();
    for (const name of [/get plus/i, /get pro/i]) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('.arena-btn__icon svg')).toBeInTheDocument();
    }
  });

  it('renders the comparison matrix header', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /compare/i })).toBeInTheDocument();
  });

  it('renders at least one FAQ item', () => {
    renderPage();
    expect(screen.getByText(/which minds do i get for free/i)).toBeInTheDocument();
  });

  it('renders feature lists with BEM classes', () => {
    const { container } = renderPage();
    const lists = container.querySelectorAll('.pricing-feature-list');
    expect(lists.length).toBeGreaterThanOrEqual(3); // one per plan card
    const rows = container.querySelectorAll('.pricing-feature-list__row');
    expect(rows.length).toBeGreaterThan(0);
    const dots = container.querySelectorAll('.pricing-feature-list__dot');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('renders sub-feature rows with the --sub modifier', () => {
    const { container } = renderPage();
    const subRows = container.querySelectorAll('.pricing-feature-list__row--sub');
    expect(subRows.length).toBeGreaterThan(0);
  });

  it('exposes the main landmark with id="main-content"', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
  });
});