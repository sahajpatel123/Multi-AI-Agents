import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileModal } from './ProfileModal';
import { ProfileModalProvider, useProfileModal } from '../context/ProfileModalContext';
import { downloadBlobFile } from '../lib/downloadTextFile';

const navigateMock = vi.fn();
const refreshUserMock = vi.fn().mockResolvedValue(undefined);
const refreshTierMock = vi.fn().mockResolvedValue(undefined);

const authState = {
  isAuthenticated: true,
  user: {
    id: 'user-1',
    email: 'sahaj@example.com',
    name: 'Sahaj Patel',
    full_name: 'Sahaj Patel',
    tier: 'PLUS',
    expertise_level: 'expert',
    expertise_domain: 'finance',
    agent_addon_active: false,
    agent_addon_cancelling: false,
  },
  refreshUser: refreshUserMock,
};

const tierState = {
  tier: 'PLUS',
  canUseFeature: vi.fn().mockReturnValue(true),
  refreshTier: refreshTierMock,
};

const hoistedMocks = vi.hoisted(() => ({
  getSubscriptionStatus: vi.fn().mockResolvedValue({
    active: true,
    status: 'active',
    amount: 99900,
    current_end: '2026-08-19T00:00:00Z',
    billing_period: 'monthly',
    has_subscription: true,
    plan: 'plus',
  }),
  getUserUsage: vi.fn().mockResolvedValue({
    credits_used_today: 0,
    credits_remaining_today: 0,
    daily_limit: 0,
    credits_used_week: 0,
    credits_remaining_week: 0,
    weekly_limit: 0,
    total_tasks_month: 0,
    usage_history: [],
  }),
  getAnalyticsActivity: vi.fn().mockResolvedValue({
    window_days: 30,
    start_date: '2026-07-13',
    end_date: '2026-08-11',
    activity: [],
    totals: { prompts: 42, debates: 3, discusses: 5, agent_runs: 7 },
    active_days: 9,
    current_streak: 2,
    longest_streak: 6,
    busiest_day: '2026-08-10',
    busiest_day_count: 8,
  }),
  getAnalyticsPersonaWinRate: vi.fn().mockResolvedValue({
    window_days: 30,
    window_start: '2026-07-13',
    window_end: '2026-08-11',
    min_appearances: 1,
    include_fallback: false,
    low_confidence_threshold: 5,
    scored_exchanges: 10,
    unattributed_exchanges: 0,
    fallback_exchanges: 0,
    personas: [
      {
        persona_id: 'analyst',
        name: 'The Analyst',
        color: '#F0B84E',
        appearances: 8,
        wins: 6,
        win_rate: 0.75,
        low_confidence: false,
      },
      {
        persona_id: 'philosopher',
        name: 'The Philosopher',
        color: '#8C7355',
        appearances: 3,
        wins: 2,
        win_rate: 0.667,
        low_confidence: true,
      },
    ],
    best_persona_id: 'analyst',
    best_win_rate: 0.75,
  }),
  getCalibrationStats: vi.fn().mockResolvedValue({
    score: null,
    coverage: 0,
    avg_gap: null,
  }),
  getRecentAgentFeedback: vi.fn().mockResolvedValue([]),
  getUserAnswerFeedbackStats: vi.fn().mockResolvedValue({
    total: 0,
    accurate: 0,
    partial: 0,
    inaccurate: 0,
    rate: null,
  }),
  getMcpIntegrations: vi.fn().mockResolvedValue({ integrations: [] }),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('../context/TierContext', () => ({
  useTier: () => tierState,
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

vi.mock('../api', () => ({
  getSubscriptionStatus: hoistedMocks.getSubscriptionStatus,
  getUserUsage: hoistedMocks.getUserUsage,
  getAnalyticsActivity: hoistedMocks.getAnalyticsActivity,
  getAnalyticsPersonaWinRate: hoistedMocks.getAnalyticsPersonaWinRate,
  getCalibrationStats: hoistedMocks.getCalibrationStats,
  getRecentAgentFeedback: hoistedMocks.getRecentAgentFeedback,
  getUserAnswerFeedbackStats: hoistedMocks.getUserAnswerFeedbackStats,
  getMcpIntegrations: hoistedMocks.getMcpIntegrations,
  exportAnalyticsActivityCsv: vi.fn().mockResolvedValue(new Blob(['date,prompts'], { type: 'text/csv' })),
  exportAnalyticsActivityJson: vi.fn().mockResolvedValue({
    blob: new Blob(['{"activity":[]}'], { type: 'application/json' }),
    filename: 'arena-activity-2026-08-05-to-2026-08-11.json',
  }),
  exportAnalyticsActivityMarkdown: vi.fn().mockResolvedValue({
    blob: new Blob(['# Arena — activity timeline'], { type: 'text/markdown' }),
    filename: 'arena-activity-2026-08-05-to-2026-08-11.md',
  }),
  exportUserUsageCsv: vi.fn().mockResolvedValue(new Blob(['date,tokens'], { type: 'text/csv' })),
  exportUserUsageJson: vi.fn().mockResolvedValue({
    blob: new Blob(['{"history":[]}'], { type: 'application/json' }),
    filename: 'arena-usage-2026-07-29-to-2026-08-11.json',
  }),
  patchUserProfile: vi.fn().mockResolvedValue({ ok: true }),
  cancelSubscription: vi.fn().mockResolvedValue({ ok: true }),
  reactivateSubscription: vi.fn().mockResolvedValue({ ok: true }),
  cancelAgentAddon: vi.fn().mockResolvedValue({ ok: true }),
  reactivateAgentAddon: vi.fn().mockResolvedValue({ ok: true }),
  postMcpManualConnect: vi.fn().mockResolvedValue({ ok: true }),
  deleteMcpIntegration: vi.fn().mockResolvedValue({ ok: true }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('../lib/downloadTextFile', () => ({
  downloadBlobFile: vi.fn(() => true),
}));

/** Test helper that mounts the modal already open via the context. */
function ModalHarness() {
  const { openModal } = useProfileModal();
  // Open on mount so the portal renders synchronously by the time the test asserts.
  // Using a layout effect would also work; React's commit phase fires before
  // testing-library queries, so a render-phase call is fine here.
  if (typeof window !== 'undefined' && !(window as { __profileModalOpened?: boolean }).__profileModalOpened) {
    (window as { __profileModalOpened?: boolean }).__profileModalOpened = true;
    queueMicrotask(() => openModal('top-right'));
  }
  return <ProfileModal />;
}

function renderModal() {
  return render(
    <MemoryRouter>
      <ProfileModalProvider>
        <ModalHarness />
      </ProfileModalProvider>
    </MemoryRouter>,
  );
}

describe('ProfileModal', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    refreshUserMock.mockClear();
    refreshTierMock.mockClear();
    vi.mocked(hoistedMocks.getAnalyticsActivity).mockClear();
    vi.mocked(hoistedMocks.getAnalyticsPersonaWinRate).mockClear();
    vi.mocked(downloadBlobFile).mockClear();
    (window as { __profileModalOpened?: boolean }).__profileModalOpened = false;
  });

  it('renders the Account section by default', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const accountHeadings = screen.getAllByText('Account');
    // The tab button + the section h2 both read "Account".
    expect(accountHeadings.length).toBeGreaterThanOrEqual(2);
  });

  it('applies the .profile-modal__field-label BEM class to form field labels', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const labels = document.querySelectorAll('.profile-modal__field-label');
    // Full name, Email address, Password, Your expertise background.
    expect(labels.length).toBe(4);
    // Spot-check the first label has the right class list (no inline style).
    const firstLabel = labels[0] as HTMLElement;
    expect(firstLabel.className).toBe('profile-modal__field-label');
    expect(firstLabel.style.fontSize).toBe('');
  });

  it('renders the analytics activity export button', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const usageTab = screen.getByRole('button', { name: /usage/i });
    usageTab.click();
    expect(
      await screen.findByRole('button', { name: /activity export/i }),
    ).toBeInTheDocument();
  });

  it('renders and downloads the analytics activity JSON export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /activity json export/i });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-activity-2026-08-05-to-2026-08-11.json',
      );
    });
  });

  it('renders and downloads the analytics activity Markdown export', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /activity markdown export/i });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-activity-2026-08-05-to-2026-08-11.md',
      );
    });
  });

  it('renders the usage history export button', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const usageTab = screen.getByRole('button', { name: /usage/i });
    usageTab.click();
    expect(
      await screen.findByRole('button', { name: /usage history export/i }),
    ).toBeInTheDocument();
  });

  it('renders the usage JSON export button', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const usageTab = screen.getByRole('button', { name: /usage/i });
    usageTab.click();
    expect(
      await screen.findByRole('button', { name: /usage json export/i }),
    ).toBeInTheDocument();
  });

  it('renders activity highlights from the live timeline', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(await screen.findByText('2 days')).toBeInTheDocument();
    expect(screen.getByText('6 days')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/busiest day/i)).toHaveTextContent('2026-08-10');
    expect(
      screen.getByRole('group', { name: /activity highlights/i }),
    ).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsActivity).toHaveBeenCalledWith(30);
  });

  it('shows a fallback message when activity highlights fail to load', async () => {
    hoistedMocks.getAnalyticsActivity.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByText('Could not load activity highlights'),
    ).toBeInTheDocument();
  });

  it('retries activity highlights after a failed load', async () => {
    hoistedMocks.getAnalyticsActivity.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const retry = await screen.findByRole('button', {
      name: /retry loading activity highlights/i,
    });
    retry.click();

    expect(await screen.findByText('2 days')).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsActivity).toHaveBeenCalledTimes(2);
  });

  it('renders persona win rates from the live endpoint', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const group = await screen.findByRole('group', { name: /persona win rates/i });
    expect(within(group).getAllByText('The Analyst').length).toBeGreaterThan(0);
    expect(within(group).getByText('The Philosopher')).toBeInTheDocument();
    expect(within(group).getByText('75%')).toBeInTheDocument();
    expect(within(group).getByText(/best:/i)).toHaveTextContent('The Analyst');
    expect(within(group).getByText('low sample')).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenCalledWith(30);
  });

  it('shows a fallback message when persona win rates fail to load', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    expect(
      await screen.findByText('Could not load persona win rates'),
    ).toBeInTheDocument();
  });

  it('retries persona win rates after a failed load', async () => {
    hoistedMocks.getAnalyticsPersonaWinRate.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();

    const retry = await screen.findByRole('button', {
      name: /retry loading persona win rates/i,
    });
    retry.click();

    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(hoistedMocks.getAnalyticsPersonaWinRate).toHaveBeenCalledTimes(2);
  });

  it('downloads usage JSON with the server-provided filename', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: /usage/i }).click();
    const button = await screen.findByRole('button', { name: /usage json export/i });
    button.click();

    await waitFor(() => {
      expect(downloadBlobFile).toHaveBeenCalledWith(
        expect.any(Blob),
        'arena-usage-2026-07-29-to-2026-08-11.json',
      );
    });
  });

  it('applies the .profile-modal__input BEM class with --readonly variant on the disabled email', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // findByDisplayValue auto-waits for the value attribute to be set;
    // the email input's value comes from `user.email` (synchronous on
    // the auth state object), so it should be present on first paint.
    const email = (await screen.findByDisplayValue('sahaj@example.com')) as HTMLInputElement;
    expect(email.disabled).toBe(true);
    expect(email.className).toContain('profile-modal__input');
    expect(email.className).toContain('profile-modal__input--readonly');
  });

  it('applies the .profile-modal__input class without --readonly on the editable full name', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // The full-name input's value is set from `user.name` via a useEffect
    // after the dialog mounts. In CI's slower event loop the effect can
    // lag the first paint, so use the async findBy* query to wait.
    const fullName = (await screen.findByDisplayValue('Sahaj Patel')) as HTMLInputElement;
    expect(fullName.disabled).toBe(false);
    expect(fullName.className).toBe('profile-modal__input');
  });

  it('applies the .profile-modal__section-heading BEM class to the Plan tab heading after click', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // The Plan tab is one of the 5 tab buttons.
    const planTab = screen.getByRole('button', { name: /plan/i });
    planTab.click();
    await waitFor(() => {
      expect(
        document.querySelector('.profile-modal__section-heading'),
      ).toBeTruthy();
    });
    const heading = document.querySelector('.profile-modal__section-heading');
    expect(heading?.textContent).toBe('Your plan');
    // The heading has the BEM class and no inline style overrides.
    expect((heading as HTMLElement).style.fontSize).toBe('');
  });

  it('applies .profile-modal__plan-heading to the plan name + .profile-modal__plan-billing to the line under it', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const planTab = screen.getByRole('button', { name: /plan/i });
    planTab.click();
    await waitFor(() => {
      expect(document.querySelector('.profile-modal__plan-heading')).toBeTruthy();
    });
    const planHeading = document.querySelector('.profile-modal__plan-heading');
    const planBilling = document.querySelector('.profile-modal__plan-billing');
    expect(planHeading).toBeTruthy();
    expect(planBilling).toBeTruthy();
    expect((planHeading as HTMLElement).style.fontSize).toBe('');
    expect((planBilling as HTMLElement).style.fontSize).toBe('');
  });
});
