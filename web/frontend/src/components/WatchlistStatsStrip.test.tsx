import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WatchlistStatsStrip } from './WatchlistStatsStrip';

const stats = {
  total_items: 2,
  active_items: 1,
  total_runs: 4,
  scored_runs: 3,
  avg_score: 87.5,
  min_score: 60,
  max_score: 92.4,
  success_rate: 75,
};

describe('WatchlistStatsStrip', () => {
  it('renders nothing without stats', () => {
    const { container } = render(<WatchlistStatsStrip stats={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders overview tiles and a CSV download button', () => {
    render(<WatchlistStatsStrip stats={stats} />);
    expect(screen.getByLabelText('Watchlist overview statistics')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('Research runs')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download watchlist statistics as CSV' })).toBeInTheDocument();
  });

  it('fires onDownload and shows busy label', () => {
    const onDownload = vi.fn();
    render(
      <WatchlistStatsStrip
        stats={stats}
        downloadBusy
        downloadStatus="idle"
        onDownload={onDownload}
      />,
    );
    const button = screen.getByRole('button', { name: 'Download watchlist statistics as CSV' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Exporting…')).toBeInTheDocument();
  });

  it('reports success and failure states', () => {
    const onDownload = vi.fn();
    const { rerender } = render(
      <WatchlistStatsStrip stats={stats} downloadStatus="done" onDownload={onDownload} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist statistics downloaded' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    rerender(<WatchlistStatsStrip stats={stats} downloadStatus="failed" onDownload={onDownload} />);
    expect(screen.getByRole('button', { name: 'Watchlist statistics download failed' })).toBeInTheDocument();
  });
});
