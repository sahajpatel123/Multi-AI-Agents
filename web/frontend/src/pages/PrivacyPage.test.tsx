import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from './PrivacyPage';

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

/** Make the route inspector report as in-view so autoplay can run in jsdom. */
function stubInspectorVisible() {
  class VisibleIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin = '0px';
    readonly thresholds: ReadonlyArray<number> = [0];
    private readonly callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.callback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            target,
          } as IntersectionObserverEntry,
        ],
        this,
      );
    }

    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', VisibleIntersectionObserver);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/privacy']}>
      <PrivacyPage />
    </MemoryRouter>,
  );
}

describe('PrivacyPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/privacy');
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders shared chrome and a labelled, focusable main landmark', () => {
    renderPage();

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(main).toHaveAttribute('aria-labelledby', 'privacy-title');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeInTheDocument();
    expect(screen.getByText('REVISION 2026.07')).toBeInTheDocument();
  });

  it('marks four plain-language posture cards as reading aids', () => {
    renderPage();

    const section = screen
      .getByRole('heading', { name: 'Four points to carry forward' })
      .closest('section');
    expect(section).not.toBeNull();

    const scope = within(section as HTMLElement);
    expect(scope.getAllByRole('listitem')).toHaveLength(4);
    expect(scope.getByRole('heading', { name: 'No sale' })).toBeInTheDocument();
    expect(scope.getByRole('heading', { name: 'Context travels' })).toBeInTheDocument();
    expect(scope.getByRole('heading', { name: 'Cards stay out' })).toBeInTheDocument();
    expect(scope.getByRole('heading', { name: 'Controls vary' })).toBeInTheDocument();
    expect(scope.getByText(/these cards summarize the posture/i)).toBeInTheDocument();
  });

  it('exposes five data-route controls with Account selected by default', () => {
    renderPage();

    const selector = screen.getByRole('group', { name: 'Select a data route' });
    const controls = within(selector).getAllByRole('button');
    expect(controls).toHaveLength(5);
    expect(controls.map((control) => control.textContent?.replace(/\s+/g, ''))).toEqual([
      '01Account',
      '02Conversation',
      '03Billing',
      '04Integrations',
      '05Localwork',
    ]);
    expect(
      within(selector).getByRole('button', { name: /01\s*Account/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('heading', { name: 'Identity and profile' }),
    ).toBeInTheDocument();
  });

  it('auto-advances data routes while the inspector is in view', () => {
    stubInspectorVisible();
    vi.useFakeTimers();
    renderPage();

    const selector = screen.getByRole('group', { name: 'Select a data route' });
    expect(
      within(selector).getByRole('button', { name: /01\s*Account/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(
      within(selector).getByRole('button', { name: /02\s*Conversation/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('heading', { name: 'Prompts, context, and answers' }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(
      within(selector).getByRole('button', { name: /03\s*Billing/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    vi.useRealTimers();
  });

  it('pauses autoplay after a manual route pick', () => {
    stubInspectorVisible();
    vi.useFakeTimers();
    renderPage();

    const selector = screen.getByRole('group', { name: 'Select a data route' });
    const billing = within(selector).getByRole('button', { name: /03\s*Billing/i });
    fireEvent.click(billing);

    expect(billing).toHaveAttribute('aria-pressed', 'true');

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(billing).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(selector).getByRole('button', { name: /04\s*Integrations/i }),
    ).toHaveAttribute('aria-pressed', 'false');

    vi.useRealTimers();
  });

  it('animates route panel stages when motion is allowed', () => {
    stubInspectorVisible();
    renderPage();

    const stage = document.querySelector('.privacy-route-panel__stage');
    expect(stage).toHaveClass('is-entering');
    expect(stage).toHaveAttribute('data-direction', 'forward');
  });

  it('updates route content and pressed state when a data class is selected', () => {
    renderPage();

    const selector = screen.getByRole('group', { name: 'Select a data route' });
    const billing = within(selector).getByRole('button', { name: /03\s*Billing/i });
    const account = within(selector).getByRole('button', {
      name: /01\s*Account/i,
    });

    fireEvent.click(billing);

    expect(billing).toHaveAttribute('aria-pressed', 'true');
    expect(account).toHaveAttribute('aria-pressed', 'false');
    const panel = screen.getByRole('region', { name: /03\s*Billing/i });
    expect(
      within(panel).getByRole('heading', { name: 'Subscription and payment' }),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/Razorpay handles the payment instrument/i)).toBeInTheDocument();
    expect(within(panel).getByText(/does not store full card numbers/i)).toBeInTheDocument();
  });

  it('renders a focusable, labelled five-row data inventory', () => {
    renderPage();

    const inventory = screen.getByRole('region', {
      name: 'Scrollable data inventory table',
    });
    expect(inventory).toHaveAttribute('tabindex', '0');

    const table = within(inventory).getByRole('table', {
      name: 'Current Arena data inventory by category',
    });
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(table).getByRole('rowheader', { name: /Account \+ profile/i })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /Tools \+ handoffs/i })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /Browser \+ transient/i })).toBeInTheDocument();
    expect(within(table).getByText(/guest IP, usage, timing/i)).toBeInTheDocument();
  });

  it('renders the complete ten-chapter policy in stable order', () => {
    const { container } = renderPage();
    const chapters = Array.from(container.querySelectorAll('article.privacy-chapter'));

    expect(chapters).toHaveLength(10);
    expect(chapters.map((chapter) => chapter.id)).toEqual([
      'scope',
      'data-we-hold',
      'data-we-do-not',
      'uses',
      'model-providers',
      'payments',
      'integrations-condura',
      'security-retention',
      'choices-deletion',
      'changes-contact',
    ]);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Data Arena receives and creates' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Storage, security, and retention' }),
    ).toBeInTheDocument();
  });

  it('describes feature-dependent model context without a prompt-only overclaim', () => {
    renderPage();

    expect(
      screen.getByText(/content you submit plus context needed to produce the requested response/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/conversation history, prior model responses, selected memory summaries/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/attachment text or images, profile or expertise instructions/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/optional provider route is unavailable.*fall back to an Anthropic model/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/up to three in an Agent research stage/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/exact upstream search service can vary/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not intentionally send your password, authentication token/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/only the text of your prompts is transmitted/i)).not.toBeInTheDocument();
  });

  it('links every named model processor and Razorpay to its policy', () => {
    renderPage();

    for (const name of ['Anthropic', 'OpenAI', 'xAI', 'DeepSeek']) {
      const link = screen.getByRole('link', { name: new RegExp(name, 'i') });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }

    expect(screen.getByRole('link', { name: /DeepSeek/i })).toHaveAttribute(
      'href',
      'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html',
    );
    expect(
      screen.getByRole('link', { name: /Read Razorpay’s privacy policy/i }),
    ).toHaveAttribute('href', 'https://razorpay.com/privacy/');
  });

  it('states payment, integration, and local-execution boundaries precisely', () => {
    renderPage();

    expect(
      screen.getByText(/sends the account email and an Arena user identifier/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Connected MCP credentials are encrypted at rest/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/marks the connection inactive but retains the encrypted credential record/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/web service cannot directly open desktop applications, write files, or control your device/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/separately installed Condura daemon/i),
    ).toBeInTheDocument();
  });

  it('discloses browser, transient, font, and legacy-password storage accurately', () => {
    renderPage();

    expect(screen.getByText(/Persistent relational records use managed PostgreSQL/i)).toBeInTheDocument();
    expect(screen.getByText(/temporary server storage.*two-hour expiration/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 30 daily backups configured/i)).toBeInTheDocument();
    expect(screen.getByText(/recent prompt snippets.*localStorage/i)).toBeInTheDocument();
    expect(screen.getByText(/private signing key is kept in sessionStorage/i)).toBeInTheDocument();
    expect(screen.getByText(/page also loads Source Serif 4 from Google Fonts/i)).toBeInTheDocument();
    expect(screen.getByText(/legacy direct-bcrypt rows remain readable/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read Google’s privacy policy/i })).toHaveAttribute(
      'href',
      'https://policies.google.com/privacy',
    );
  });

  it('does not promise a universal retention period or self-service account deletion', () => {
    renderPage();

    expect(
      screen.getByText(/does not publish one fixed retention period/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/History window ≠ deletion schedule/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not currently expose a self-service endpoint for deleting the entire account/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/some records may be retained where reasonably necessary/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/resetting a panel replaces its choices with defaults/i)).toBeInTheDocument();
    expect(screen.getByText(/deleting a room deactivates the room record/i)).toBeInTheDocument();
    expect(screen.getAllByText(/does not currently publish a dedicated private privacy inbox/i)).not.toHaveLength(0);
    expect(screen.getByText(/do not place an account email, prompts, credentials/i)).toBeInTheDocument();
    expect(screen.queryByText(/all associated data at any time/i)).not.toBeInTheDocument();
  });

  it('exposes a ten-link chapter index and synchronizes URL hashes', () => {
    window.history.replaceState({}, '', '/privacy#model-providers');
    renderPage();

    const navigation = screen.getByRole('navigation', { name: 'Privacy chapters' });
    const links = within(navigation).getAllByRole('link');
    expect(links).toHaveLength(10);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#scope',
      '#data-we-hold',
      '#data-we-do-not',
      '#uses',
      '#model-providers',
      '#payments',
      '#integrations-condura',
      '#security-retention',
      '#choices-deletion',
      '#changes-contact',
    ]);
    expect(
      within(navigation).getByRole('link', { name: /Model providers/i }),
    ).toHaveAttribute('aria-current', 'location');

    act(() => {
      window.history.pushState({}, '', '/privacy#choices-deletion');
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(
      within(navigation).getByRole('link', { name: /Choices \+ deletion/i }),
    ).toHaveAttribute('aria-current', 'location');
    expect(
      within(navigation).getByRole('link', { name: /Model providers/i }),
    ).not.toHaveAttribute('aria-current');
  });

  it('uses canonical contact and companion links without an unlinked LinkedIn path', () => {
    renderPage();

    const repositoryLinks = screen.getAllByRole('link', { name: /GitHub/i });
    expect(repositoryLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of repositoryLinks) {
      expect(link).toHaveAttribute(
        'href',
        'https://github.com/sahajpatel123/Multi-AI-Agents',
      );
    }
    expect(screen.getAllByRole('link', { name: /Terms/ }).some(
      (link) => link.getAttribute('href') === '/terms',
    )).toBe(true);
    expect(screen.queryByText(/LinkedIn/i)).not.toBeInTheDocument();
  });

  it('removes entrance animation when reduced motion is requested', () => {
    setReducedMotion(true);
    const { container } = renderPage();

    expect(container.querySelector('.privacy-page')).not.toHaveClass(
      'privacy-page--motion',
    );
  });
});
