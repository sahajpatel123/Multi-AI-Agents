import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { RoomsDiscoverPanel } from './RoomsDiscoverPanel';

function renderPanel(overrides: Partial<Parameters<typeof RoomsDiscoverPanel>[0]> = {}) {
  const props = {
    rooms: [],
    total: 0,
    loading: false,
    failed: false,
    searchQuery: '',
    onSearchChange: vi.fn(),
    onSubmitSearch: vi.fn(),
    onClearSearch: vi.fn(),
    onRetry: vi.fn(),
    onOpen: vi.fn(),
    ...overrides,
  };
  const utils = render(<RoomsDiscoverPanel {...props} />);
  return { ...utils, props };
}

describe('RoomsDiscoverPanel', () => {
  it('renders a loading state', () => {
    const { getByLabelText } = renderPanel({ loading: true });
    expect(getByLabelText('Finding rooms to discover')).toBeTruthy();
  });

  it('renders a retry action on failure', () => {
    const { getByRole, props } = renderPanel({ failed: true });
    fireEvent.click(getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders an empty message without a query', () => {
    const { getByText } = renderPanel();
    expect(getByText('No rooms to discover right now')).toBeTruthy();
  });

  it('mentions the query in the empty message and offers clear', () => {
    const { getByText, getByRole, props } = renderPanel({ searchQuery: 'quantum' });
    expect(getByText('No rooms match “quantum”')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'Clear search' }));
    expect(props.onClearSearch).toHaveBeenCalledTimes(1);
  });

  it('submits the search from the form', () => {
    const { getByRole, props } = renderPanel({ searchQuery: 'quantum' });
    fireEvent.submit(getByRole('search'));
    expect(props.onSubmitSearch).toHaveBeenCalledTimes(1);
  });

  it('lists discoverable rooms with meta and synthesis status', () => {
    const rooms = [
      {
        id: 1,
        name: 'Quantum investing',
        slug: 'quantum-investing',
        member_count: 2,
        task_count: 4,
        synthesis_updated_at: '2026-08-12T10:00:00',
      },
      {
        id: 2,
        name: 'Sourdough science',
        slug: 'sourdough-science',
        member_count: 1,
        task_count: 0,
        synthesis_updated_at: null,
      },
    ];
    const { container } = renderPanel({ rooms, total: 12 });
    expect(container.textContent).toContain('2 members · 4 tasks · New synthesis');
    expect(container.textContent).toContain('1 member · 0 tasks · No synthesis yet');
    expect(container.textContent).toContain('Showing 2 of 12 discoverable rooms');
  });

  it('opens a room by slug', () => {
    const { getByRole, props } = renderPanel({
      rooms: [
        {
          id: 1,
          name: 'Quantum investing',
          slug: 'quantum-investing',
          member_count: 2,
          task_count: 4,
        },
      ],
      total: 1,
    });
    fireEvent.click(
      getByRole('button', { name: /Open room Quantum investing — 2 members · 4 tasks/ }),
    );
    expect(props.onOpen).toHaveBeenCalledWith('quantum-investing');
  });
});
