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
    const { getByRole } = renderModal();
    expect(getByRole('dialog')).toBeInTheDocument();
    expect(getByRole('dialog')).toHaveAccessibleName(/plus feature/i);
  });

  it('lists the upgrade feature items', () => {
    const { getAllByText, getByRole } = renderModal();
    expect(getByRole('list', { name: /plus includes/i })).toBeInTheDocument();
    expect(getAllByText(/Debate mode/i).length).toBeGreaterThan(0);
    expect(getAllByText(/16 personas/i).length).toBeGreaterThan(0);
    expect(getAllByText(/Memory across sessions/i).length).toBeGreaterThan(0);
  });

  it('clicking the overlay fires onClose', async () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });
    const overlay = container.querySelector('.upgrade-modal-overlay')!;
    fireEvent.click(overlay);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Escape key fires onClose', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('close button dismisses the modal', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = renderModal({ onClose });
    fireEvent.click(getByLabelText(/^close$/i));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('Maybe later dismisses the modal', async () => {
    const onClose = vi.fn();
    const { getByRole } = renderModal({ onClose });
    fireEvent.click(getByRole('button', { name: /maybe later/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('upgrade CTA launches checkout stub for authenticated users', async () => {
    const { getByRole, findByTestId } = renderModal();
    fireEvent.click(getByRole('button', { name: /upgrade to plus/i }));
    expect(await findByTestId('razorpay-checkout-stub')).toBeInTheDocument();
  });
});
