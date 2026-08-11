import { useState } from 'react';
import { HighlightQuery } from './HighlightQuery';
import { EmptyState } from './EmptyState';
import MicroLoader from './MicroLoader';
import {
  discoverRoomAriaLabel,
  discoverRoomEmptyTitle,
  discoverRoomMeta,
  discoverRoomStatus,
  type DiscoverRoomLike,
} from '../lib/roomsDiscover';

type RoomsDiscoverPanelProps = {
  rooms: DiscoverRoomLike[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  loadMoreFailed: boolean;
  failed: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSubmitSearch: () => void;
  onClearSearch: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpen: (slug: string) => void;
};

/**
 * Discover feed for shared research rooms: searchable list of active
 * rooms the caller has not joined yet. Presentational — the parent
 * owns fetching /api/rooms/discover and navigation.
 */
export function RoomsDiscoverPanel({
  rooms,
  total,
  loading,
  loadingMore,
  loadMoreFailed,
  failed,
  searchQuery,
  onSearchChange,
  onSubmitSearch,
  onClearSearch,
  onRetry,
  onLoadMore,
  onOpen,
}: RoomsDiscoverPanelProps) {
  const [submittedQuery, setSubmittedQuery] = useState(searchQuery);
  const hasQuery = searchQuery.trim().length > 0;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedQuery(searchQuery);
    onSubmitSearch();
  };

  const handleClear = () => {
    setSubmittedQuery('');
    onClearSearch();
  };

  if (loading) {
    return (
      <div style={{ padding: '20px 4px', display: 'flex', justifyContent: 'center' }} role="status">
        <MicroLoader label="Finding rooms to discover" />
      </div>
    );
  }

  if (failed) {
    return (
      <EmptyState
        variant="error"
        title="Could not load discoverable rooms"
        description="Your connection may have hiccuped. Try again."
        actions={
          <button
            type="button"
            className="arena-btn arena-btn--ghost arena-btn--sm"
            onClick={onRetry}
          >
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}
        role="search"
      >
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search rooms by name"
          aria-label="Search discoverable rooms"
          style={{
            flex: 1,
            minWidth: 0,
            background: '#F7F3EC',
            border: '0.5px solid #E0D5C5',
            borderRadius: 6,
            padding: '6px 9px',
            fontSize: 12,
            color: '#1F2A24',
            fontFamily: 'var(--vp-font-sans)',
          }}
        />
        <button
          type="submit"
          className="arena-btn arena-btn--ghost arena-btn--sm"
          aria-label="Apply room search"
        >
          Search
        </button>
        {hasQuery ? (
          <button
            type="button"
            className="arena-btn arena-btn--ghost arena-btn--sm"
            aria-label="Clear room search"
            onClick={handleClear}
          >
            Clear
          </button>
        ) : null}
      </form>

      {rooms.length === 0 ? (
        <EmptyState
          variant="compact"
          title={discoverRoomEmptyTitle(submittedQuery || searchQuery)}
          description={
            hasQuery
              ? 'Try a different name — rooms you already joined are hidden here.'
              : 'When other users create active rooms they will appear here for you to join.'
          }
          actions={
            hasQuery ? (
              <button
                type="button"
                className="arena-btn arena-btn--ghost arena-btn--sm"
                onClick={handleClear}
              >
                Clear search
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rooms.map((room) => {
              const slug = room.slug || '';
              const name = (room.name || 'Untitled room').trim();
              return (
                <div
                  key={room.id}
                  className="agent-hover-surface agent-hover-surface--row"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 4,
                    borderRadius: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(slug)}
                    aria-label={discoverRoomAriaLabel(room)}
                    title={discoverRoomAriaLabel(room)}
                    style={{
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '6px 4px 6px 8px',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 6,
                      flex: 1,
                      minWidth: 0,
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        title={name}
                        style={{
                          fontSize: 13,
                          color: '#F3F0E7',
                          fontWeight: 400,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <HighlightQuery text={name} query={searchQuery} />
                      </div>
                      <div style={{ fontSize: 10, color: '#A0A39A', marginTop: 2 }}>
                        {discoverRoomMeta(room)} ·{' '}
                        <span style={{ color: room.synthesis_updated_at ? '#5A8C6A' : '#A0A39A' }}>
                          {discoverRoomStatus(room)}
                        </span>
                      </div>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        color: '#A0A39A',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        paddingTop: 5,
                      }}
                    >
                      Open
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <div
            style={{
              margin: '8px 2px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 6,
            }}
          >
            {total > rooms.length ? (
              <p style={{ fontSize: 10, color: '#A0A39A', margin: 0 }}>
                Showing {rooms.length} of {total} discoverable rooms
              </p>
            ) : null}
            {loadMoreFailed ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  color: '#C96A5A',
                }}
              >
                <span>Could not load more rooms.</span>
                <button
                  type="button"
                  className="arena-btn arena-btn--ghost arena-btn--sm"
                  onClick={onLoadMore}
                >
                  Retry
                </button>
              </div>
            ) : total > rooms.length ? (
              <button
                type="button"
                className="arena-btn arena-btn--ghost arena-btn--sm"
                onClick={onLoadMore}
                disabled={loadingMore}
                aria-label="Load more discoverable rooms"
              >
                {loadingMore ? 'Loading more…' : 'Load more'}
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
