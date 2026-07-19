import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AccountPage } from './AccountPage';

const navigateMock = vi.fn();
const openModalMock = vi.fn();

const profileModalState: {
  isOpen: boolean;
  closing: boolean;
  openModal: ReturnType<typeof vi.fn>;
} = {
  isOpen: false,
  closing: false,
  openModal: openModalMock,
};

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<AccountPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AccountPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    openModalMock.mockReset();
    profileModalState.isOpen = false;
    profileModalState.closing = false;
  });

  it('opens the profile modal on mount with the account tab', () => {
    renderPage();
    expect(openModalMock).toHaveBeenCalledWith('top-right', 'account');
  });

  it('renders the "Opening account settings" loading shell', () => {
    renderPage();
    // The shell is a role="status" with aria-label for screen readers.
    const shell = screen.getByRole('status', { name: /opening account settings/i });
    expect(shell).toBeInTheDocument();
    expect(shell).toHaveAttribute('aria-busy', 'true');
    expect(shell).toHaveAttribute('aria-live', 'polite');
  });

  it('renders the "Skip to Agent" button as an escape hatch', () => {
    renderPage();
    const skipButton = screen.getByRole('button', { name: /skip to agent/i });
    expect(skipButton).toBeInTheDocument();
  });

  it('navigates to /agent when the Skip to Agent button is clicked', async () => {
    renderPage();
    const skipButton = screen.getByRole('button', { name: /skip to agent/i });
    skipButton.click();
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/agent', { replace: true });
    });
  });

  it('uses the BEM class tree (account-route-shell + __card + __brand + __name + __copy)', () => {
    const { container } = renderPage();
    expect(container.querySelector('.account-route-shell')).toBeTruthy();
    expect(container.querySelector('.account-route-shell__card')).toBeTruthy();
    expect(container.querySelector('.account-route-shell__brand')).toBeTruthy();
    expect(container.querySelector('.account-route-shell__name')).toBeTruthy();
    expect(container.querySelector('.account-route-shell__copy')).toBeTruthy();
  });
});
