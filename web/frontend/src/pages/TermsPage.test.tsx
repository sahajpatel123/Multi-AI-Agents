import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TermsPage } from './TermsPage';

vi.mock('../components/Navbar', () => ({
  Navbar: () => <header data-testid="navbar" />,
}));

vi.mock('../components/Footer', () => ({
  Footer: () => <footer data-testid="footer" />,
}));

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/terms']}>
      <TermsPage />
    </MemoryRouter>,
  );
}

describe('TermsPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/terms');
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the shared chrome and labelled main landmark', () => {
    renderPage();

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(main).toHaveAttribute('aria-labelledby', 'terms-title');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Service' }),
    ).toBeInTheDocument();
  });

  it('presents document control metadata and a non-substitutive reading notice', () => {
    renderPage();

    const control = screen.getByRole('complementary', {
      name: 'Document control',
    });
    expect(within(control).getByText('Published')).toBeInTheDocument();
    expect(within(control).getByText('July 2026')).toBeInTheDocument();
    expect(within(control).getByText('Website + web app')).toBeInTheDocument();
    expect(within(control).getByText('10')).toBeInTheDocument();
    expect(
      within(control).getByText(/summaries are navigation aids, not substitutes/i),
    ).toBeInTheDocument();
  });

  it('renders four plain-language signals while identifying the clauses as controlling', () => {
    renderPage();

    const section = screen
      .getByRole('heading', { name: 'Four signals worth holding' })
      .closest('section');
    expect(section).not.toBeNull();

    const signalScope = within(section as HTMLElement);
    expect(signalScope.getAllByRole('listitem')).toHaveLength(4);
    expect(signalScope.getByRole('heading', { name: 'Access' })).toBeInTheDocument();
    expect(signalScope.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(signalScope.getByRole('heading', { name: 'Payment' })).toBeInTheDocument();
    expect(signalScope.getByRole('heading', { name: 'Output' })).toBeInTheDocument();
    expect(
      signalScope.getByText(/numbered clauses below are the agreement/i),
    ).toBeInTheDocument();
  });

  it('renders the complete ten-clause agreement in stable order', () => {
    const { container } = renderPage();
    const clauses = Array.from(container.querySelectorAll('article.terms-clause'));

    expect(clauses).toHaveLength(10);
    expect(clauses.map((clause) => clause.id)).toEqual([
      'acceptance',
      'acceptable-use',
      'accounts',
      'billing',
      'content-and-ip',
      'ai-output',
      'availability',
      'suspension',
      'liability',
      'changes-and-contact',
    ]);

    expect(
      screen.getByRole('heading', { level: 3, name: 'Acceptance of these terms' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'AI output and reliance' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Changes to these terms and contact',
      }),
    ).toBeInTheDocument();
  });

  it('preserves accurate product-specific billing and account terms', () => {
    renderPage();

    expect(
      screen.getByText(/Agent Mode add-on available to Plus members/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/paid access remains available through the current paid period/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Arena does not store full card numbers on its servers/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/email, a hashed password, session and prompt history/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pricing page' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('states the AI-output and ownership boundaries without overclaiming', () => {
    renderPage();

    expect(
      screen.getByText(/comparative product signal; it is not independent factual verification/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Arena does not claim ownership of AI-generated responses/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/depends on applicable law, provider terms, and third-party rights/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/responses belong to no one/i)).not.toBeInTheDocument();
  });

  it('exposes a ten-link clause index with an initial current location', () => {
    renderPage();

    const navigation = screen.getByRole('navigation', { name: 'Terms clauses' });
    const links = within(navigation).getAllByRole('link');
    expect(links).toHaveLength(10);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#acceptance',
      '#acceptable-use',
      '#accounts',
      '#billing',
      '#content-and-ip',
      '#ai-output',
      '#availability',
      '#suspension',
      '#liability',
      '#changes-and-contact',
    ]);
    expect(within(navigation).getByRole('link', { name: /Acceptance/ })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('synchronizes the current clause with direct and changed URL hashes', () => {
    window.history.replaceState({}, '', '/terms#billing');
    renderPage();

    const navigation = screen.getByRole('navigation', { name: 'Terms clauses' });
    expect(within(navigation).getByRole('link', { name: /Billing/ })).toHaveAttribute(
      'aria-current',
      'location',
    );

    act(() => {
      window.history.pushState({}, '', '/terms#ai-output');
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(within(navigation).getByRole('link', { name: /AI output/ })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(within(navigation).getByRole('link', { name: /Billing/ })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('provides actionable Pricing, Privacy, and project contact links', () => {
    renderPage();

    const privacyLinks = screen.getAllByRole('link', { name: /Privacy/ });
    expect(privacyLinks.some((link) => link.getAttribute('href') === '/privacy')).toBe(true);

    const repository = screen.getByRole('link', { name: 'GitHub repository' });
    expect(repository).toHaveAttribute(
      'href',
      'https://github.com/sahajpatel123/Multi-AI-Agents',
    );
    expect(repository).toHaveAttribute('target', '_blank');
    expect(repository).toHaveAttribute('rel', 'noreferrer');
  });

  it('removes entrance animation when reduced motion is requested', () => {
    setReducedMotion(true);
    const { container } = renderPage();

    expect(container.querySelector('.terms-page')).not.toHaveClass('terms-page--motion');
  });
});
