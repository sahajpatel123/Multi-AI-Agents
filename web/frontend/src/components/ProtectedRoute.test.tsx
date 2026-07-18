import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Stub MicroLoader and useAuth so we can drive the three branches
// (loading, no-user, has-user) without booting the real AuthContext.
vi.mock('./MicroLoader', () => ({
  default: () => <div data-testid="micro-loader" />,
}));

const useAuthMock = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

// setRedirectIntent is a no-op side effect; just import the real
// module and let it run. We do NOT mock the redirectIntent util
// because ProtectedRoute's effect calls it — fine, it's a real
// localStorage write but vitest sets up a clean jsdom.

import ProtectedRoute from './ProtectedRoute';

function renderRoute(opts: {
  loading: boolean;
  hasUser: boolean;
  initialPath?: string;
}) {
  useAuthMock.mockReturnValue({
    user: opts.hasUser
      ? { id: 1, email: 'u@example.com', tier: 'PRO', name: 'U' }
      : null,
    loading: opts.loading,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={[opts.initialPath ?? '/protected']}>
      <Routes>
        <Route path="/signin" element={<div data-testid="signin">Sign in</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">Protected!</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('renders the MicroLoader while auth is loading', () => {
    const { getByTestId, queryByTestId, container } = renderRoute({
      loading: true,
      hasUser: false,
    });
    expect(getByTestId('micro-loader')).not.toBeNull();
    expect(queryByTestId('protected-content')).toBeNull();
    expect(container.querySelector('.auth-gate')).not.toBeNull();
    expect(container.querySelector('.auth-gate__wordmark')?.textContent).toMatch(/Arena/);
  });

  it('redirects to /signin when no user is present', () => {
    const { queryByTestId, getByTestId } = renderRoute({
      loading: false,
      hasUser: false,
    });
    // Protected content is NOT rendered.
    expect(queryByTestId('protected-content')).toBeNull();
    // The router redirected to /signin (Navigate, replace).
    expect(getByTestId('signin')).not.toBeNull();
  });

  it('renders the protected children when a user is present', () => {
    const { getByTestId } = renderRoute({
      loading: false,
      hasUser: true,
    });
    expect(getByTestId('protected-content')).not.toBeNull();
  });
});