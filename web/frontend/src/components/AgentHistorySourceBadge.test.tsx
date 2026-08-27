import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentHistorySourceBadge } from './AgentHistorySourceBadge';

describe('AgentHistorySourceBadge', () => {
  it.each([
    [{ task_id: 'manual' }, 'standalone', 'Standalone'],
    [{ task_id: 'watch', watchlist_item_id: 'watch-1' }, 'watchlist', 'Watchlist'],
    [
      { task_id: 'orchestration', orchestration_id: 'orch-1' },
      'orchestration',
      'Orchestration',
    ],
  ])('shows provenance for %s tasks', (item, source, label) => {
    render(<AgentHistorySourceBadge item={item} />);

    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute('data-source', source);
    expect(badge).toHaveAccessibleName(expect.stringContaining(`Source: ${label}`));
    expect(badge).toHaveAttribute('title', expect.stringContaining('Started'));
  });

  it('gives watchlist provenance priority for legacy rows carrying both ids', () => {
    render(
      <AgentHistorySourceBadge
        item={{ watchlistItemId: 'watch-1', orchestrationId: 'orch-1' }}
      />,
    );

    expect(screen.getByText('Watchlist')).toHaveAttribute('data-source', 'watchlist');
    expect(screen.queryByText('Orchestration')).not.toBeInTheDocument();
  });
});
