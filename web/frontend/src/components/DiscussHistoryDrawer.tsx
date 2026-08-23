import { useCallback, useEffect, useState } from 'react';
import {
  deleteDiscussThread,
  getDiscussThread,
  listDiscussThreads,
  type DiscussThreadDetail,
  type DiscussThreadSummary,
} from '../api';

// Same relative-time idiom as SessionCard and ExportPresetsPanel.
function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return '';
  const then = new Date(timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface DiscussHistoryDrawerProps {
  /** Bump to make the drawer refetch (e.g. right after a fresh save). */
  refreshTick?: number;
  /** Called when the user presses Escape inside the drawer. */
  onClose?: () => void;
  /** Resume a saved thread in the live chat (receives its full body). */
  onContinue?: (thread: DiscussThreadDetail) => void;
  /** Why continuing is currently blocked, or falsy when allowed. */
  continueBlockedReason?: string;
}

/**
 * Read-only browser for saved 1-on-1 discuss threads. Lists the user's
 * most recent threads, expands one into its full message body on demand,
 * and deletes rows — every server refusal surfaced verbatim.
 */
export function DiscussHistoryDrawer({
  refreshTick = 0,
  onClose,
  onContinue,
  continueBlockedReason,
}: DiscussHistoryDrawerProps) {
  const [threads, setThreads] = useState<DiscussThreadSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<number, DiscussThreadDetail>>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  // Search commits on Enter (the filter editors' keyboard contract); the
  // applied value is what the server sees, the input is just the draft.
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [resultTotal, setResultTotal] = useState(0);
  // Bumping this forces a refetch even if the tick value is unchanged.
  const [reloadTick, setReloadTick] = useState(0);

  const handleDrawerKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    },
    [onClose],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    listDiscussThreads({
      perPage: 20,
      search: appliedSearch.trim() || undefined,
    })
      .then((result) => {
        if (!cancelled) {
          setThreads(result.threads);
          setResultTotal(result.total);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setThreads(null);
        setLoadError(
          error instanceof Error && error.message
            ? error.message
            : 'Could not load saved discussions — try again.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick, refreshTick, appliedSearch]);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setAppliedSearch('');
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        setAppliedSearch(searchInput.trim());
      } else if (event.key === 'Escape') {
        // First Escape clears an active search; only with nothing to
        // clear does the drawer's own close handler take over.
        if (searchInput.trim() || appliedSearch) {
          event.stopPropagation();
          clearSearch();
        }
      }
    },
    [appliedSearch, clearSearch, searchInput],
  );

  // One search row shared by every state that can show it, so a query can
  // always be refined in place — including from the no-match state, which
  // used to force clear-then-retype.
  const searchRow = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
      <input
        type="text"
        value={searchInput}
        maxLength={128}
        placeholder="Search titles…"
        aria-label="Search saved discussions by title"
        onChange={(event) => setSearchInput(event.target.value)}
        onKeyDown={handleSearchKeyDown}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11,
          color: '#4A3728',
          background: '#FAF7F4',
          border: '0.5px solid #E0D8D0',
          borderRadius: 5,
          padding: '3px 7px',
          fontFamily: 'var(--vp-font-sans)',
        }}
      />
      {appliedSearch ? (
        <>
          <span style={{ fontSize: 10, color: '#A0A39A', alignSelf: 'center' }}>
            {resultTotal} match{resultTotal === 1 ? '' : 'es'}
          </span>
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearSearch}
            title={`Showing titles matching “${appliedSearch}”`}
            style={{
              background: 'none',
              border: '0.5px solid #E0D8D0',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 10,
              color: '#5A8C6A',
              cursor: 'pointer',
              fontFamily: 'var(--vp-font-sans)',
            }}
          >
            Clear
          </button>
        </>
      ) : null}
    </div>
  );

  const handleToggleRow = useCallback(
    async (thread: DiscussThreadSummary) => {
      setActionError(null);
      setDetailError(null);
      // Opening another row cancels a pending delete on the old one.
      setConfirmingDeleteId(null);
      if (openId === thread.id) {
        setOpenId(null);
        return;
      }
      setOpenId(thread.id);
      if (details[thread.id]) return;
      setBusyId(thread.id);
      try {
        const detail = await getDiscussThread(thread.id);
        setDetails((current) => ({ ...current, [thread.id]: detail }));
      } catch (error) {
        // Collapse on failure so a stale spinner never lingers.
        setOpenId(null);
        setDetailError(
          error instanceof Error && error.message
            ? error.message
            : 'Could not open that discussion — try again.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [details, openId],
  );

  // Deletion is permanent and the server has no undo, so the first click
  // only arms an inline confirm — the row must say so before anything is
  // sent.
  const handleDeleteRequest = useCallback((thread: DiscussThreadSummary) => {
    setActionError(null);
    setConfirmingDeleteId(thread.id);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setConfirmingDeleteId(null);
  }, []);

  const handleDeleteConfirm = useCallback(
    async (thread: DiscussThreadSummary) => {
      setActionError(null);
      setConfirmingDeleteId(null);
      setBusyId(thread.id);
      try {
        await deleteDiscussThread(thread.id);
        // State only changes after the server accepts the deletion, so a
        // failed request leaves the list exactly as it was.
        setThreads((current) =>
          current ? current.filter((item) => item.id !== thread.id) : current,
        );
        setDetails((current) => {
          const next = { ...current };
          delete next[thread.id];
          return next;
        });
        if (openId === thread.id) setOpenId(null);
      } catch (error) {
        setActionError(
          error instanceof Error && error.message
            ? error.message
            : 'Could not delete that discussion — try again.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [openId],
  );

  if (loadError) {
    return (
      <div
        style={{
          border: '0.5px solid #E0D8D0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <p role="alert" style={{ fontSize: 12, color: '#993C1D', margin: '0 0 8px' }}>
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => setReloadTick((tick) => tick + 1)}
          style={{
            fontSize: 12,
            color: '#4A3728',
            background: 'none',
            border: '0.5px solid #E0D8D0',
            borderRadius: 999,
            padding: '4px 10px',
            cursor: 'pointer',
            fontFamily: 'var(--vp-font-sans)',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (threads === null) {
    return (
      <div
        style={{
          border: '0.5px solid #E0D8D0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
          fontSize: 12,
          color: '#A0A39A',
        }}
      >
        Loading saved discussions…
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div
        style={{
          border: '0.5px solid #E0D8D0',
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
          fontSize: 12,
          color: '#A0A39A',
        }}
      >
        {searchRow}
        <p style={{ margin: 0 }}>
          {appliedSearch ? (
            <>
              No saved discussions match “{appliedSearch}”.{' '}
              <button
                type="button"
                onClick={clearSearch}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 12,
                  color: '#5A8C6A',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontFamily: 'var(--vp-font-sans)',
                }}
              >
                Clear search
              </button>
            </>
          ) : (
            <>No saved discussions yet — click “Save thread” to keep a conversation.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Saved discussions"
      onKeyDown={handleDrawerKeyDown}
      style={{
        border: '0.5px solid #E0D8D0',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {actionError ? (
        <p role="alert" style={{ fontSize: 12, color: '#993C1D', margin: '0 0 8px' }}>
          {actionError}
        </p>
      ) : null}
      {detailError ? (
        <p role="alert" style={{ fontSize: 12, color: '#993C1D', margin: '0 0 8px' }}>
          {detailError}
        </p>
      ) : null}
      {searchRow}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {threads.map((thread) => {
          const isOpen = openId === thread.id;
          const detail = details[thread.id];
          const busy = busyId === thread.id;
          return (
            <li key={thread.id} style={{ borderTop: '0.5px solid #F0EBE4', padding: '6px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => void handleToggleRow(thread)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: busy ? 'wait' : 'pointer',
                    fontFamily: 'var(--vp-font-sans)',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#1A1714',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {thread.title || 'Untitled discussion'}
                  </span>
                  <span style={{ display: 'block', fontSize: 10, color: '#A0A39A' }}>
                    {thread.agentId || 'unknown agent'}
                    {thread.lastMessageAt ? ` · ${formatTimeAgo(thread.lastMessageAt)}` : ''}
                    {` · ${thread.messageCount} message${thread.messageCount === 1 ? '' : 's'}`}
                  </span>
                </button>
                {confirmingDeleteId === thread.id ? (
                  <>
                    <span style={{ fontSize: 10, color: '#993C1D' }}>Delete forever?</span>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      aria-label={`Confirm deleting ${thread.title || 'Untitled discussion'}`}
                      onClick={() => void handleDeleteConfirm(thread)}
                      style={{
                        background: 'none',
                        border: '0.5px solid #D85A30',
                        borderRadius: 6,
                        color: busy ? '#A0A39A' : '#993C1D',
                        cursor: busyId !== null ? 'wait' : 'pointer',
                        padding: '2px 7px',
                        fontSize: 10,
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                    >
                      {busy ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      aria-label={`Keep ${thread.title || 'Untitled discussion'}`}
                      onClick={handleDeleteCancel}
                      style={{
                        background: 'none',
                        border: '0.5px solid #E0D8D0',
                        borderRadius: 6,
                        color: '#4A3728',
                        cursor: busyId !== null ? 'wait' : 'pointer',
                        padding: '2px 7px',
                        fontSize: 10,
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-busy={busy}
                    aria-label={`Delete saved discussion ${thread.title || 'Untitled discussion'}`}
                    onClick={() => handleDeleteRequest(thread)}
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 6,
                      color: busy ? '#A0A39A' : '#D85A30',
                      cursor: busyId !== null ? 'wait' : 'pointer',
                      padding: '2px 7px',
                      fontSize: 10,
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
              {isOpen ? (
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: '0.5px dashed #E0D8D0',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  {busy && !detail ? (
                    <span style={{ fontSize: 11, color: '#A0A39A' }}>Opening…</span>
                  ) : null}
                  {detail ? (
                    <>
                      {detail.originalPrompt ? (
                        <p
                          style={{
                            fontSize: 11,
                            color: '#A0A39A',
                            margin: 0,
                            fontStyle: 'italic',
                          }}
                        >
                          From: {detail.originalPrompt.slice(0, 140)}
                          {detail.originalPrompt.length > 140 ? '…' : ''}
                        </p>
                      ) : null}
                      {detail.messages.map((message, index) => (
                        <div key={index}>
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: message.role === 'agent' ? '#5A8C6A' : '#A0A39A',
                            }}
                          >
                            {message.role === 'agent' ? thread.agentId || 'Agent' : 'You'}
                          </span>
                          <p
                            style={{
                              fontSize: 11,
                              color: '#4A3728',
                              margin: '1px 0 0',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {message.content}
                          </p>
                        </div>
                      ))}
                      {onContinue && detail.messages.length > 0 ? (
                        <button
                          type="button"
                          disabled={Boolean(continueBlockedReason)}
                          aria-label={`Continue discussion ${thread.title || 'Untitled discussion'}`}
                          onClick={() => onContinue(detail)}
                          // A disabled control explains itself rather than
                          // silently no-oping mid-stream.
                          title={
                            continueBlockedReason || 'Resume this conversation in the chat'
                          }
                          style={{
                            justifySelf: 'start',
                            marginTop: 2,
                            background: 'none',
                            border: '0.5px solid #E0D8D0',
                            borderRadius: 999,
                            padding: '3px 9px',
                            fontSize: 11,
                            color: continueBlockedReason ? '#A0A39A' : '#5A8C6A',
                            cursor: continueBlockedReason ? 'not-allowed' : 'pointer',
                            opacity: continueBlockedReason ? 0.55 : 1,
                            fontFamily: 'var(--vp-font-sans)',
                          }}
                        >
                          Continue this discussion
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
