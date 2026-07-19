import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileModal } from './ProfileModal';
import { ProfileModalProvider, useProfileModal } from '../context/ProfileModalContext';

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
    days: [],
    totals: { questions: 0, characters: 0, agent_runs: 0, savings: 0 },
  }),
  getCalibrationStats: vi.fn().mockResolvedValue({
    score: null,
    coverage: 0,
    avg_gap: null,
  }),
  getRecentAgentFeedback: vi.fn().mockResolvedValue({ items: [] }),
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
  getCalibrationStats: hoistedMocks.getCalibrationStats,
  getRecentAgentFeedback: hoistedMocks.getRecentAgentFeedback,
  getUserAnswerFeedbackStats: hoistedMocks.getUserAnswerFeedbackStats,
  getMcpIntegrations: hoistedMocks.getMcpIntegrations,
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

/** Test helper that mounts the modal already open via the context. */
function ModalHarness() {
  const { openModal } = useProfileModal();
  // Open on mount so the portal renders synchronously by the time the test asserts.
  // Using a layout effect would also work; React's commit phase fires before
  // testing-library queries, so a render-phase call is fine here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
