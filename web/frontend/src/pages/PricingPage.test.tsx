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

  it('recommends Plus by fit without making an unsupported popularity claim', () => {
    renderPage();
    expect(screen.getByText(/best fit for ongoing decisions/i)).toBeInTheDocument();
    expect(screen.queryByText(/most popular/i)).not.toBeInTheDocument();
  });

  it('shows exact annual totals alongside effective monthly prices', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /annual charged yearly/i }));

    expect(
      container.querySelector('.pricing-tier-card--plus .pricing-tier-card__price'),
    ).toHaveTextContent('742');
    expect(container.querySelector('.pricing-tier-card--plus')).toHaveTextContent(
      '₹8,899 charged yearly',
    );
    expect(
      container.querySelector('.pricing-tier-card--pro .pricing-tier-card__price'),
    ).toHaveTextContent('1,650');
    expect(container.querySelector('.pricing-tier-card--pro')).toHaveTextContent(
      '₹19,800 charged yearly',
    );
  });

  it('puts Agent access and the comparison before the persona proof', () => {
    const { container } = renderPage();
    const agent = container.querySelector('.pricing-agent-bridge');
    const comparison = container.querySelector('.pricing-comparison-ledger');
    const minds = container.querySelector('.pricing-mind-access');

    expect(agent).toBeTruthy();
    expect(comparison).toBeTruthy();
    expect(minds).toBeTruthy();
    expect(agent?.compareDocumentPosition(comparison as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(comparison?.compareDocumentPosition(minds as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('resolves every section aria-labelledby reference', () => {
    const { container } = renderPage();
    for (const selector of [
      '.pricing-agent-bridge',
      '.pricing-comparison-ledger',
      '.pricing-mind-access',
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

  it('marks the seven visible Agent Mode stages as an ordered list', () => {
    renderPage();
    const pipeline = screen.getByRole('list', {
      name: /seven visible agent mode stages/i,
    });
    expect(pipeline.querySelectorAll('li')).toHaveLength(7);
  });
});