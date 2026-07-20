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
    const start = container.querySelector(
      '.pricing-tier-card--explorer .pricing-tier-card__cta',
    ) as HTMLButtonElement;
    expect(start).toHaveTextContent('Start for free');
    expect(container.querySelector('.pricing-tier-card--explorer')?.textContent).not.toContain(
      'Current plan',
    );
    fireEvent.click(start);
    expect(setRedirectIntentMock).toHaveBeenCalledWith('/app');
    expect(navigateMock).toHaveBeenCalledWith('/signin?tab=signup');
  });

  it('renders three plan cards with their tier names', () => {
    const { container } = renderPage();
    const names = Array.from(
      container.querySelectorAll('.pricing-tier-card__intro h3'),
    ).map((el) => el.textContent?.trim() ?? '');
    expect(names).toEqual(['Explorer', 'Plus', 'Pro']);
  });

  it('keeps paid CTA icons inside the plan action buttons', () => {
    const { container } = renderPage();
    for (const [plan, name] of [
      ['plus', 'Plus'],
      ['pro', 'Pro'],
    ] as const) {
      const button = container.querySelector(
        `.pricing-tier-card--${plan} .pricing-tier-card__cta`,
      );
      expect(button).toHaveTextContent(`Get ${name}`);
      expect(button?.querySelector('svg')).toBeInTheDocument();
    }
  });

  it('renders the comparison matrix heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /nothing important hidden behind checkout/i }),
    ).toBeInTheDocument();
  });

  it('renders at least one FAQ item', () => {
    renderPage();
    expect(screen.getByText(/which minds are included with explorer/i)).toBeInTheDocument();
  });

  it('renders plan feature lists with the current BEM classes', () => {
    const { container } = renderPage();
    const lists = container.querySelectorAll('.pricing-tier-card__features');
    expect(lists).toHaveLength(3);
    const rows = container.querySelectorAll('.pricing-tier-card__features li');
    expect(rows.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.pricing-tier-card__features svg').length).toBeGreaterThan(0);
  });

  it('updates the access preview when a different depth is focused', () => {
    const { container } = renderPage();
    const options = container.querySelectorAll('.pricing-depth-instrument__options button');
    expect(options).toHaveLength(3);
    fireEvent.click(options[0]);
    expect(screen.getByText('06 / 16 minds')).toBeInTheDocument();
    expect(screen.getByText(/current fit \/ explorer/i)).toBeInTheDocument();
  });

  it('exposes the main landmark with id="main-content"', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
  });
});