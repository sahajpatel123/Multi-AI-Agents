import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SignInPage } from './SignInPage';

const navigateMock = vi.fn();
const loginMock = vi.fn();
const registerMock = vi.fn();

const authState: {
  user: { id: string; email: string } | null;
  login: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  isLoading: boolean;
} = {
  user: null,
  login: loginMock,
  register: registerMock,
  isLoading: false,
};

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => authState,
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
  getRedirectIntent: vi.fn().mockReturnValue('/app'),
  clearRedirectIntent: vi.fn(),
  describeRedirectDestination: vi.fn().mockReturnValue('Arena'),
  DEFAULT_REDIRECT_INTENT: '/app',
}));

vi.mock('../lib/authFormMessages', () => ({
  authCaughtErrorMessage: (_err: unknown, fallback: string) => fallback,
  signupClientIssueMessage: (issue: string) => `Client issue: ${issue}`,
  validateSignupFields: (input: {
    name: string;
    password: string;
    confirmPassword: string;
  }) => {
    if (!input.name) return 'name-required';
    if (input.password !== input.confirmPassword) return 'passwords-mismatch';
    return null;
  },
}));

function renderPage(initialEntry = '/signin') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Returns the currently-visible <form> element. The page renders one of
 *  two forms at a time depending on the active tab, so scoping to the
 *  form element avoids label-name collisions across the inactive one. */
function activeForm(): HTMLFormElement {
  const form = document.querySelector('form.auth-page__form');
  if (!form) throw new Error('No active form rendered');
  return form as HTMLFormElement;
}

describe('SignInPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    loginMock.mockReset();
    registerMock.mockReset();
    authState.user = null;
    authState.isLoading = false;
  });

  it('renders the signin form by default with email + password fields', () => {
    renderPage();
    const form = activeForm();
    expect(within(form).getByLabelText('Email')).toBeInTheDocument();
    expect(within(form).getByLabelText('Password')).toBeInTheDocument();
    // Signin form does NOT show the full-name or confirm-password fields.
    expect(within(form).queryByLabelText('Name')).toBeNull();
    expect(within(form).queryByLabelText('Confirm password')).toBeNull();
    // Submit button text.
    expect(
      within(form).getByRole('button', { name: /sign in to arena/i }),
    ).toBeInTheDocument();
  });

  it('renders the signup form when the Sign up tab is clicked', () => {
    renderPage();
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Sign up' }));
    const form = activeForm();
    expect(within(form).getByLabelText('Name')).toBeInTheDocument();
    expect(within(form).getByLabelText('Email')).toBeInTheDocument();
    expect(within(form).getByLabelText('Password')).toBeInTheDocument();
    expect(within(form).getByLabelText('Confirm password')).toBeInTheDocument();
    // Submit button text.
    expect(
      within(form).getByRole('button', { name: /create free account/i }),
    ).toBeInTheDocument();
  });

  it('uses the BEM class tree (auth-page + auth-page__form etc.)', () => {
    const { container } = renderPage();
    expect(container.querySelector('.auth-page')).toBeTruthy();
    expect(container.querySelector('.auth-page__form')).toBeTruthy();
    expect(container.querySelector('.auth-page__headline')).toBeTruthy();
  });

  it('exposes the page brand column with the ARENA logo', () => {
    const { container } = renderPage();
    const brandCol = container.querySelector('.auth-page__brand-col');
    expect(brandCol).toBeTruthy();
    expect(brandCol?.textContent).toMatch(/ARENA/);
  });

  it('switches back to signin when the "Sign up free" link is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /sign up/i }));
    expect(within(activeForm()).getByLabelText('Name')).toBeInTheDocument();
    // The signin form's link lives in the signup form's switch row.
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(within(activeForm()).queryByLabelText('Name')).toBeNull();
    expect(within(activeForm()).getByLabelText('Password')).toBeInTheDocument();
  });

  it('calls login() with the entered email + password on signin submit', async () => {
    loginMock.mockResolvedValue(undefined);
    renderPage();
    const form = activeForm();
    const emailInput = within(form).getByLabelText('Email') as HTMLInputElement;
    const passwordInput = within(form).getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'sahaj@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'correct-horse' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('sahaj@example.com', 'correct-horse');
    });
  });

  it('shows the fallback error message when login() throws', async () => {
    loginMock.mockRejectedValue(new Error('network down'));
    renderPage();
    const form = activeForm();
    const emailInput = within(form).getByLabelText('Email') as HTMLInputElement;
    const passwordInput = within(form).getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'sahaj@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'pw' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/sign in failed/i);
    });
  });

  it('validates the signup form client-side: name required, passwords must match', async () => {
    registerMock.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /sign up/i }));
    const form = activeForm();

    // Empty name -> client-side error, register() not called.
    fireEvent.change(within(form).getByLabelText('Email'), {
      target: { value: 'sahaj@example.com' },
    });
    fireEvent.change(within(form).getByLabelText('Password'), {
      target: { value: 'longenough123' },
    });
    fireEvent.change(within(form).getByLabelText('Confirm password'), {
      target: { value: 'longenough123' },
    });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/name-required/i);
    });
    expect(registerMock).not.toHaveBeenCalled();

    // Passwords mismatch -> client-side error.
    fireEvent.change(within(form).getByLabelText('Name'), {
      target: { value: 'Sahaj' },
    });
    fireEvent.change(within(form).getByLabelText('Confirm password'), {
      target: { value: 'different123' },
    });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/passwords-mismatch/i);
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('calls register() once signup validation passes', async () => {
    registerMock.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /sign up/i }));
    const form = activeForm();
    fireEvent.change(within(form).getByLabelText('Name'), {
      target: { value: 'Sahaj' },
    });
    fireEvent.change(within(form).getByLabelText('Email'), {
      target: { value: 'sahaj@example.com' },
    });
    fireEvent.change(within(form).getByLabelText('Password'), {
      target: { value: 'longenough123' },
    });
    fireEvent.change(within(form).getByLabelText('Confirm password'), {
      target: { value: 'longenough123' },
    });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith(
        'Sahaj',
        'sahaj@example.com',
        'longenough123',
      );
    });
  });

  it('shows the password-strength indicator only on signup', () => {
    // Single render — two `render()` calls in the same test would both
    // attach to document.body and produce duplicate tablists in the DOM.
    const { container } = renderPage();
    // Default (signin) — no strength bar, even after typing a password.
    const signinForm = activeForm();
    fireEvent.change(within(signinForm).getByLabelText('Password'), {
      target: { value: 'longenough123' },
    });
    expect(container.querySelector('.auth-page__strength')).toBeNull();

    // Switch to signup, type a password — strength bar renders.
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Sign up' }));
    const signupForm = activeForm();
    fireEvent.change(within(signupForm).getByLabelText('Password'), {
      target: { value: 'longenough123' },
    });
    expect(container.querySelector('.auth-page__strength')).toBeTruthy();
  });
});
