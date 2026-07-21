import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RouteEnter } from './RouteEnter';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <RouteEnter>
              <div>Route body</div>
            </RouteEnter>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RouteEnter', () => {
  it('uses full page-enter on public marketing routes', () => {
    const { container } = renderAt('/pricing');
    const wrap = container.querySelector('.page-enter');
    expect(wrap).not.toBeNull();
    expect(wrap).not.toHaveClass('page-enter--quiet');
    expect(screen.getByText('Route body')).toBeInTheDocument();
  });

  it.each(['/app', '/agent', '/agent/watchlist', '/account', '/room/abc'])(
    'uses quiet enter on dense shell route %s',
    (path) => {
      const { container } = renderAt(path);
      const wrap = container.querySelector('.page-enter');
      expect(wrap).toHaveClass('page-enter--quiet');
    },
  );
});
