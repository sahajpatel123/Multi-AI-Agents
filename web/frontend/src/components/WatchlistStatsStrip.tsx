import { watchlistStatTiles, type WatchlistStatisticsLike } from '../lib/watchlistStatistics';

type WatchlistStatsStripProps = {
  stats: WatchlistStatisticsLike | null;
  downloadBusy?: boolean;
  downloadStatus?: 'idle' | 'done' | 'failed';
  onDownload?: () => void;
};

/**
 * Compact overview of watchlist health: active watches, run totals,
 * score summary, and a full-stats CSV download.
 */
export function WatchlistStatsStrip({
  stats,
  downloadBusy = false,
  downloadStatus = 'idle',
  onDownload,
}: WatchlistStatsStripProps) {
  if (!stats) return null;
  const tiles = watchlistStatTiles(stats);
  return (
    <section className="watchlist-stats" aria-label="Watchlist overview statistics">
      <div className="watchlist-stats__head">
        <span className="watchlist-stats__title">Overview</span>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadBusy || !onDownload}
          title="Download full watchlist statistics as CSV (Shift+F)"
          aria-keyshortcuts="Shift+F"
          aria-label={
            downloadStatus === 'done'
              ? 'Watchlist statistics downloaded'
              : downloadStatus === 'failed'
                ? 'Watchlist statistics download failed'
                : 'Download watchlist statistics as CSV'
          }
          className={[
            'watchlist-stats__download',
            downloadStatus === 'done' ? 'watchlist-stats__download--ok' : '',
            downloadStatus === 'failed' ? 'watchlist-stats__download--err' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {downloadBusy
            ? 'Exporting…'
            : downloadStatus === 'done'
              ? 'Stats downloaded'
              : downloadStatus === 'failed'
                ? 'Stats failed'
                : 'Stats .csv'}
        </button>
      </div>
      <div className="watchlist-stats__grid">
        {tiles.map((tile) => (
          <div className="watchlist-stats__tile" key={tile.key}>
            <span className="watchlist-stats__value">{tile.value}</span>
            <span className="watchlist-stats__label">{tile.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
