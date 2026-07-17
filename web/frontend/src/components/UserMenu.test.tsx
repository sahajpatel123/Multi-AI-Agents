import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { UserMenu } from './UserMenu';
import type { User } from '../types';

function makeUser(tier: 'FREE' | 'PLUS' | 'PRO' = 'FREE'): User {
  return {
    id: 1,
    email: 'u@example.com',
    name: 'Test User',
    tier,
    prompt_count_today: 2,
  };
}

function installMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reduce : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

describe('UserMenu', () => {
  it('renders the Sign in button when user is null and not loading', () => {
    installMatchMedia(false);
    const onSignInClick = vi.fn();
    const { getByText } = render(
      <UserMenu
        user={null}
        isLoading={false}
        onSignInClick={onSignInClick}
        onLogout={() => {}}
      />,
    );
    const btn = getByText(/Sign in/i);
    fireEvent.click(btn);
    expect(onSignInClick).toHaveBeenCalled();
  });

  it('does not render the menu until the avatar is clicked', () => {
    installMatchMedia(false);
    const { queryByRole } = render(
      <UserMenu
        user={makeUser('PRO')}
        isLoading={false}
        onSignInClick={() => {}}
        onLogout={() => {}}
      />,
    );
    // The avatar button has aria-haspopup="menu" but the menu itself
    // (aria-label="Account menu" or similar) isn't open yet.
    expect(queryByRole('menu')).toBeNull();
  });

  it('opens the menu when the avatar is clicked', () => {
    installMatchMedia(false);
    const { getByLabelText, getByRole } = render(
      <UserMenu
        user={makeUser('PRO')}
        isLoading={false}
        onSignInClick={() => {}}
        onLogout={() => {}}
      />,
    );
    fireEvent.click(getByLabelText(/Account menu/i));
    expect(getByRole('menu')).not.toBeNull();
  });

  it('aria-expanded toggles with menu state', () => {
    installMatchMedia(false);
    const { getByLabelText } = render(
      <UserMenu
        user={makeUser('PRO')}
        isLoading={false}
        onSignInClick={() => {}}
        onLogout={() => {}}
      />,
    );
    const avatar = getByLabelText(/Account menu/i);
    expect(avatar).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(avatar);
    expect(avatar).toHaveAttribute('aria-expanded', 'true');
  });

  it('Escape closes the menu', () => {
    installMatchMedia(false);
    const { getByLabelText, queryByRole } = render(
      <UserMenu
        user={makeUser('PRO')}
        isLoading={false}
        onSignInClick={() => {}}
        onLogout={() => {}}
      />,
    );
    const avatar = getByLabelText(/Account menu/i);
    fireEvent.click(avatar);
    expect(queryByRole('menu')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryByRole('menu')).toBeNull();
  });

  it('calls onLogout when the Sign out menuitem is clicked', () => {
    installMatchMedia(false);
    const onLogout = vi.fn();
    const { getByLabelText, getByText } = render(
      <UserMenu
        user={makeUser('PRO')}
        isLoading={false}
        onSignInClick={() => {}}
        onLogout={onLogout}
      />,
    );
    fireEvent.click(getByLabelText(/Account menu/i));
    fireEvent.click(getByText(/Sign out/i));
    expect(onLogout).toHaveBeenCalled();
  });
});