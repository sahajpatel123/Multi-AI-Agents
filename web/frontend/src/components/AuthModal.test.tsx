import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { AuthModal } from './AuthModal';

function makeProps(overrides: Partial<React.ComponentProps<typeof AuthModal>> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onLogin: vi.fn().mockResolvedValue(undefined),
    onRegister: vi.fn().mockResolvedValue(undefined),
    defaultTab: 'login' as const,
    ...overrides,
  };
}

describe('AuthModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<AuthModal {...makeProps({ isOpen: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog when open', () => {
    const { getByRole } = render(<AuthModal {...makeProps()} />);
    expect(getByRole('dialog')).not.toBeNull();
  });

  it('renders signup name field only in signup mode', () => {
    // Login mode: no name field.
    const { queryByPlaceholderText: lp } = render(<AuthModal {...makeProps()} />);
    expect(lp(/Your name/i)).toBeNull();

    // Signup mode: name field is present.
    const { getByPlaceholderText: gp } = render(
      <AuthModal {...makeProps({ defaultTab: 'signup' })} />,
    );
    expect(gp(/Your name/i)).not.toBeNull();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(<AuthModal {...makeProps({ onClose })} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('resets form fields when reopening with a different defaultTab', () => {
    const { rerender, getByPlaceholderText } = render(
      <AuthModal {...makeProps()} />,
    );
    const email = getByPlaceholderText(/you@example/i) as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'previous@example.com' } });
    expect(email.value).toBe('previous@example.com');

    // Re-mount with signup tab — form must reset.
    rerender(<AuthModal {...makeProps({ defaultTab: 'signup' })} />);
    const emailAfter = getByPlaceholderText(/you@example/i) as HTMLInputElement;
    expect(emailAfter.value).toBe('');
  });

  it('calls onLogin with email + password on submit', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByRole } = render(
      <AuthModal {...makeProps({ onLogin })} />,
    );
    fireEvent.change(getByPlaceholderText(/you@example/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(getByPlaceholderText(/At least 8|•••/i), {
      target: { value: 'Strong1Pass' },
    });
    // Submit by clicking the submit button.
    const submit = getByRole('button', { name: /log in/i });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(onLogin).toHaveBeenCalledWith('user@example.com', 'Strong1Pass'),
    );
  });

  it('toggles password visibility', () => {
    const { getByLabelText, getByPlaceholderText } = render(
      <AuthModal {...makeProps()} />,
    );
    const input = getByPlaceholderText(/••••/i) as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(getByLabelText(/show password/i));
    expect(input.type).toBe('text');

    fireEvent.click(getByLabelText(/hide password/i));
    expect(input.type).toBe('password');
  });

  it('blocks empty signup name client-side', async () => {
    const onRegister = vi.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByRole, findByRole } = render(
      <AuthModal {...makeProps({ defaultTab: 'signup', onRegister })} />,
    );
    fireEvent.change(getByPlaceholderText(/you@example/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(getByPlaceholderText(/At least 8/i), {
      target: { value: 'longenough' },
    });
    // Leave name empty.
    fireEvent.click(getByRole('button', { name: /create account/i }));
    expect(await findByRole('alert')).toHaveTextContent(/name is required/i);
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('surfaces login API errors as alerts', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('Invalid credentials'));
    const { getByPlaceholderText, getByRole, findByRole } = render(
      <AuthModal {...makeProps({ onLogin })} />,
    );
    fireEvent.change(getByPlaceholderText(/you@example/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(getByPlaceholderText(/••••/i), {
      target: { value: 'wrong-pass' },
    });
    fireEvent.click(getByRole('button', { name: /log in/i }));
    expect(await findByRole('alert')).toHaveTextContent(/invalid credentials/i);
  });

  it('blocks invalid email client-side', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByRole, findByRole } = render(
      <AuthModal {...makeProps({ onLogin })} />,
    );
    fireEvent.change(getByPlaceholderText(/you@example/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(getByPlaceholderText(/••••/i), {
      target: { value: 'whatever' },
    });
    fireEvent.click(getByRole('button', { name: /log in/i }));
    expect(await findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('trims email before calling onLogin', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByRole } = render(
      <AuthModal {...makeProps({ onLogin })} />,
    );
    fireEvent.change(getByPlaceholderText(/you@example/i), {
      target: { value: '  user@example.com  ' },
    });
    fireEvent.change(getByPlaceholderText(/••••/i), {
      target: { value: 'Strong1Pass' },
    });
    fireEvent.click(getByRole('button', { name: /log in/i }));
    await waitFor(() =>
      expect(onLogin).toHaveBeenCalledWith('user@example.com', 'Strong1Pass'),
    );
  });
});
