import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { EmptyState } from './EmptyState';

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

describe('EmptyState', () => {
  it('renders title and description', () => {
    installMatchMedia(false);
    const { getByText, getByRole } = render(
      <EmptyState title="Nothing here" description="Try adding something." />,
    );
    expect(getByText(/nothing here/i)).toBeInTheDocument();
    expect(getByText(/try adding/i)).toBeInTheDocument();
    expect(getByRole('status')).toHaveClass('arena-empty-state');
  });

  it('uses alert role for error variant', () => {
    installMatchMedia(false);
    const { getByRole } = render(
      <EmptyState title="Failed" variant="error" />,
    );
    expect(getByRole('alert')).toHaveClass('arena-empty-state--error');
  });

  it('renders icon and actions', () => {
    installMatchMedia(false);
    const onClick = vi.fn();
    const { getByRole, getByText } = render(
      <EmptyState
        title="Empty"
        icon={<span data-testid="ico">★</span>}
        actions={
          <button type="button" className="arena-btn" onClick={onClick}>
            Retry
          </button>
        }
      />,
    );
    expect(getByText('★')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: /retry/i }));
    expect(onClick).toHaveBeenCalled();
  });

  it('applies card and filter variants', () => {
    installMatchMedia(false);
    const { container, rerender } = render(
      <EmptyState title="A" variant="card" />,
    );
    expect(container.querySelector('.arena-empty-state--card')).not.toBeNull();
    rerender(<EmptyState title="B" variant="filter" />);
    expect(container.querySelector('.arena-empty-state--filter')).not.toBeNull();
  });

  it('honors reduced motion static class', () => {
    installMatchMedia(true);
    const { container } = render(<EmptyState title="Quiet" />);
    expect(container.querySelector('.arena-empty-state')).toHaveClass(
      'arena-empty-state--static',
    );
  });
});
