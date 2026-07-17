import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UpgradeModal } from './UpgradeModal';

const useAuthMock = vi.fn();
const useTierMock = vi.fn();

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock('../context/TierContext', () => ({
  useTier: () => useTierMock(),
}));

// Stub RazorpayCheckout so the modal doesn't try to load the real
// Razorpay SDK in jsdom.
vi.mock('./RazorpayCheckout', () => ({
  RazorpayCheckout: () => <div data-testid="razorpay-checkout-stub" />,
}));

function makeAuthValue(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    refreshUser: vi.fn().mockResolvedValue(undefined),
    user: { id: 1, email: 'u@example.com', tier: 'FREE', name: 'U' },
    ...overrides,
  };
}

function makeTierValue() {
  return {
    tier: 'FREE',
    refreshTier: vi.fn().mockResolvedValue(undefined),
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof UpgradeModal>> = {}) {
  useAuthMock.mockReturnValue(makeAuthValue());
  useTierMock.mockReturnValue(makeTierValue());
  return render(
    <MemoryRouter>
      <UpgradeModal isOpen onClose={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe('UpgradeModal', () => {
  it('renders nothing when isOpen is false', () => {
    useAuthMock.mockReturnValue(makeAuthValue());
    useTierMock.mockReturnValue(makeTierValue());
    const { container } = render(
      <MemoryRouter>
        <UpgradeModal isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container.querySelector('.upgrade-modal-overlay')).toBeNull();
  });

  it('renders the modal dialog when isOpen is true', () => {
    const { container } = renderModal();
    expect(container.querySelector('.upgrade-modal-overlay')).not.toBeNull();
  });

  it('lists the upgrade feature items', () => {
    const { getAllByText } = renderModal();
    // The feature items appear in the markup (possibly more than once
    // because the subtitle also mentions 'Debate mode'). Use
    // getAllByText to assert presence without caring about count.
    expect(getAllByText(/Debate mode/i).length).toBeGreaterThan(0);
    expect(getAllByText(/16 personas/i).length).toBeGreaterThan(0);
    expect(getAllByText(/Memory across sessions/i).length).toBeGreaterThan(0);
  });

  it('clicking the overlay fires onClose', async () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });
    // Click the overlay (not the inner content).
    const overlay = container.querySelector('.upgrade-modal-overlay')!;
    fireEvent.click(overlay);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Escape key fires onClose', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});