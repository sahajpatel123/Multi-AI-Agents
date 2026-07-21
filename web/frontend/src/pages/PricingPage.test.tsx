import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PricingPage } from './PricingPage';

const authState: {
  isAuthenticated: boolean;
  user: { id: string; email: string; tier?: string } | null;
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
  isPlus: boolean;
  isPro: boolean;
  setTier: ReturnType<typeof vi.fn>;
  refreshTier: ReturnType<typeof vi.fn>;
} = {
  tier: 'free',
  creditsRemaining: 25000,
  creditsDaily: 25000,
  isPlus: false,
  isPro: false,
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
    tierState.isPlus = false;
    tierState.isPro = false;
    navigateMock.mockReset();
    setRedirectIntentMock.mockReset();
    profileModalState.openModal.mockReset();
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
      container.querySelectorAll('.pricing-tier-card__top h3'),
    ).map((el) => el.textContent?.trim() ?? '');
    expect(names).toEqual(['Explorer', 'Plus', 'Pro']);
    expect(container.textContent).not.toMatch(/four minds\. one judge/i);
    expect(container.textContent).not.toMatch(/the room that remembers/i);
    expect(container.textContent).not.toMatch(/when the question needs a research pipeline/i);
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
      screen.getByRole('heading', { name: /every limit, before checkout/i }),
    ).toBeInTheDocument();
  });

  it('renders FAQ honesty anchors for Agent Mode and Condura', () => {
    renderPage();
    expect(screen.getByText(/which minds are included with explorer/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /what is agent mode/i }));
    expect(screen.getByText(/seven visible research stages/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /does agent mode control my computer/i }));
    expect(screen.getByText(/arena is web-only/i)).toBeInTheDocument();
    expect(screen.getByText(/require condura/i)).toBeInTheDocument();
  });

  it('renders plan feature lists with the current BEM classes', () => {
    const { container } = renderPage();
    const lists = container.querySelectorAll('.pricing-tier-card__features');
    expect(lists).toHaveLength(3);
    const rows = container.querySelectorAll('.pricing-tier-card__features li');
    expect(rows.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.pricing-tier-card__features svg').length).toBeGreaterThan(0);
  });

  it('removes Agent Mode and Minds marketing sections from the paywall', () => {
    const { container } = renderPage();
    expect(container.querySelector('.pricing-agent-bridge')).toBeNull();
    expect(container.querySelector('.pricing-mind-access')).toBeNull();
    expect(container.querySelector('.pricing-depth-instrument')).toBeNull();
    expect(container.querySelector('.pricing-ladder')).toBeNull();
    expect(container.querySelector('.pricing-paywall-hero')).toBeTruthy();
  });

  it('exposes the main landmark with id="main-content"', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
  });

  it('recommends Plus by fit without making an unsupported popularity claim', () => {
    renderPage();
    expect(screen.getByText(/^recommended$/i)).toBeInTheDocument();
    expect(screen.queryByText(/most popular/i)).not.toBeInTheDocument();
  });

  it('shows exact annual totals alongside effective monthly prices', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^annual/i }));

    expect(
      container.querySelector('.pricing-tier-card--plus .pricing-tier-card__price'),
    ).toHaveTextContent('742');
    expect(container.querySelector('.pricing-tier-card--plus')).toHaveTextContent(
      '₹8,899 / year',
    );
    expect(
      container.querySelector('.pricing-tier-card--pro .pricing-tier-card__price'),
    ).toHaveTextContent('1,650');
    expect(container.querySelector('.pricing-tier-card--pro')).toHaveTextContent(
      '₹19,800 / year',
    );
  });

  it('keeps comparison before FAQ', () => {
    const { container } = renderPage();
    const comparison = container.querySelector('.pricing-comparison-ledger');
    const faq = container.querySelector('.pricing-faq-studio');

    expect(comparison).toBeTruthy();
    expect(faq).toBeTruthy();
    expect(comparison?.compareDocumentPosition(faq as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('resolves every section aria-labelledby reference', () => {
    const { container } = renderPage();
    for (const selector of [
      '.pricing-paywall-plans',
      '.pricing-comparison-ledger',
      '.pricing-faq-studio',
    ]) {
      const section = container.querySelector(selector);
      const labelledBy = section?.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy as string)).toBeInTheDocument();
    }
  });

  it('shows the Pro rolling window in the full comparison ledger', () => {
    renderPage();
    expect(screen.getByRole('rowheader', { name: /pro rolling window/i })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /45 \/ 5h/i })).toBeInTheDocument();
  });

  it('does not offer a second Plus checkout to paid users in the close', () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'plus-user', email: 'plus@example.com', tier: 'plus' };
    tierState.tier = 'plus';
    tierState.isPlus = true;

    const { container } = renderPage();
    const close = container.querySelector('.pricing-studio-close');
    const manage = Array.from(close?.querySelectorAll('button') ?? []).find((button) =>
      /manage plus/i.test(button.textContent ?? ''),
    );

    expect(manage).toBeInTheDocument();
    expect(close).not.toHaveTextContent('Get Plus');
    fireEvent.click(manage as HTMLButtonElement);
    expect(profileModalState.openModal).toHaveBeenCalledWith('top-right', 'plan');
  });

  it('shows an active-plan action instead of a Plus downgrade for Pro users', () => {
    authState.isAuthenticated = true;
    authState.user = { id: 'pro-user', email: 'pro@example.com', tier: 'pro' };
    tierState.tier = 'pro';
    tierState.isPro = true;

    const { container } = renderPage();
    const close = container.querySelector('.pricing-studio-close');
    expect(close).toHaveTextContent('Pro is active');
    expect(close).not.toHaveTextContent('Get Plus');
  });
});
