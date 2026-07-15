import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MicroLoader from '../components/MicroLoader';
import {
  ApiError,
  deleteAgentWatchlist,
  getAgentWatchlist,
  patchAgentWatchlist,
  type AgentWatchlistItem,
} from '../api';
import { useTier } from '../context/TierContext';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import {
  WATCHLIST_INTERVALS,
  type WatchlistIntervalHours,
} from '../lib/watchlistIntervals';
import { formatWatchlistExport } from '../lib/watchlistExport';
import { watchlistBodyMode } from '../lib/watchlistView';

type WatchlistStatusFilter = 'all' | 'active' | 'paused';

function formatRelativePast(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  let sec = Math.round((Date.now() - t) / 1000);
  if (sec < 0) sec = 0;
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatRelativeFuture(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  const sec = Math.round((t - Date.now()) / 1000);
  if (sec < 0) return 'due now';
  if (sec < 60) return 'in <1m';
  const min = Math.floor(sec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `in ${hr}h`;
  const day = Math.floor(hr / 24);
  return `in ${day}d`;
}

function intervalBadge(hours: number): { num: string; unit: string } {
  if (hours === 168) return { num: '7', unit: 'DAYS' };
  if (hours === 72) return { num: '3', unit: 'DAYS' };
  return { num: String(hours), unit: 'HRS' };
}

export function WatchlistPage() {
  const navigate = useNavigate();
  const { canUseFeature } = useTier();
  const canWatchlist = canUseFeature('agent_watchlist');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [items, setItems] = useState<AgentWatchlistItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [activeCap, setActiveCap] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [cadenceBusyId, setCadenceBusyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WatchlistStatusFilter>('all');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const errorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const copyStatusTimerRef = useRef<number | null>(null);
  const reducedMotion = prefersReducedMotion();

  const load = useCallback(async () => {
    if (!canWatchlist) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await getAgentWatchlist();
      setItems(data.items);
      setActiveCount(data.active_count);
      setActiveCap(data.active_cap);
      setLoadFailed(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load watchlist');
      setItems([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [canWatchlist]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (!pendingDeleteId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDeleteId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingDeleteId]);

  const onToggle = async (item: AgentWatchlistItem) => {
    try {
      setError(null);
      const updated = await patchAgentWatchlist(item.id, { is_active: !item.is_active });
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
      const data = await getAgentWatchlist();
      setActiveCount(data.active_count);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed');
    }
  };

  const onCadence = async (item: AgentWatchlistItem, hours: WatchlistIntervalHours) => {
    if (item.interval_hours === hours || cadenceBusyId === item.id) return;
    setCadenceBusyId(item.id);
    setError(null);
    try {
      const updated = await patchAgentWatchlist(item.id, { interval_hours: hours });
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update schedule');
    } finally {
      setCadenceBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    try {
      setError(null);
      await deleteAgentWatchlist(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      setPendingDeleteId(null);
      const data = await getAgentWatchlist();
      setActiveCount(data.active_count);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  };

  const bodyMode = watchlistBodyMode({
    loading,
    loadFailed,
    itemCount: items.length,
  });

  const filteredItems = useMemo(() => {
    const byStatus =
      statusFilter === 'all'
        ? items
        : items.filter((item) =>
            statusFilter === 'active' ? item.is_active : !item.is_active,
          );
    return filterBySearchQuery(byStatus, searchQuery, (item) => [
      item.question,
      item.latest_task?.title,
    ]);
  }, [items, searchQuery, statusFilter]);

  useEffect(() => {
    return () => {
      if (copyStatusTimerRef.current != null) {
        window.clearTimeout(copyStatusTimerRef.current);
      }
    };
  }, []);

  const flashCopyStatus = (status: 'copied' | 'failed') => {
    if (copyStatusTimerRef.current != null) {
      window.clearTimeout(copyStatusTimerRef.current);
    }
    setCopyStatus(status);
    copyStatusTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
      copyStatusTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  const copyWatchlist = async () => {
    const filterBits: string[] = [];
    if (statusFilter !== 'all') filterBits.push(`status: ${statusFilter}`);
    const q = searchQuery.trim();
    if (q) filterBits.push(`search: “${q}”`);
    const markdown = formatWatchlistExport({
      items: filteredItems.map((item) => ({
        question: item.question,
        intervalHours: item.interval_hours,
        isActive: item.is_active,
        runCount: item.run_count,
        lastRunAt: item.last_run_at,
        nextRunAt: item.next_run_at,
        latestTitle: item.latest_task?.title,
        latestScore: item.latest_task?.final_score,
        expertiseLevel: item.expertise_level,
        expertiseDomain: item.expertise_domain,
      })),
      activeCount,
      activeCap,
      filterNote: filterBits.length > 0 ? filterBits.join(' · ') : undefined,
    });
    const ok = await copyToClipboard(markdown);
    if (ok) {
      flashCopyStatus('copied');
    } else {
      flashCopyStatus('failed');
      setError('Could not copy watchlist — try again or copy from a notes app after export.');
    }
  };

  if (!canWatchlist) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#F5F0E8',
          padding: '48px 20px',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#4A3728' }}>Watchlist is available on Arena Plus and Pro.</p>
          <button
            type="button"
            className="arena-btn arena-btn--primary arena-btn--md"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/pricing')}
          >
            View plans →
          </button>
          <button
            type="button"
            className="arena-btn arena-btn--ghost arena-btn--md"
            style={{ marginTop: 8 }}
            onClick={() => navigate('/agent')}
          >
            Back to Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F0E8', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          height: '52px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          background: 'rgba(245, 240, 232, 0.72)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/agent')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            color: '#8C7355',
            fontFamily: 'Georgia, serif',
          }}
        >
          ← Agent
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1A1714' }}>Watchlist</span>
            <span style={{ fontSize: 11, color: '#A89070' }}>
              {activeCount}/{activeCap} active
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#8C7355' }}>Tasks that research themselves.</span>
        </div>
        {bodyMode === 'list' && items.length > 0 ? (
          <button
            type="button"
            onClick={() => void copyWatchlist()}
            title="Copy current view as markdown"
            aria-label={
              copyStatus === 'copied'
                ? 'Watchlist copied'
                : copyStatus === 'failed'
                  ? 'Copy failed'
                  : 'Copy watchlist as markdown'
            }
            style={{
              flexShrink: 0,
              background: 'none',
              border: '0.5px solid #D4C4B0',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 11,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color:
                copyStatus === 'failed'
                  ? '#D85A30'
                  : copyStatus === 'copied'
                    ? '#5A8C6A'
                    : '#8C7355',
              cursor: 'pointer',
              fontFamily: 'Georgia, serif',
            }}
          >
            {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
          </button>
        ) : null}
      </header>

      <main style={{ flex: 1, padding: '24px 16px 48px', overflowY: 'auto' }}>
        <p style={{
          fontSize: '14px',
          color: '#8C7355',
          fontStyle: 'italic',
          marginBottom: '24px',
          lineHeight: '1.6',
          maxWidth: 680,
          margin: '0 auto 24px',
        }}>
          Watched tasks re-run automatically on your chosen schedule. Arena compares new findings to the original answer and notifies you when something meaningful changes.
        </p>
        {error && bodyMode !== 'load_error' ? (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            style={{
              color: '#D85A30',
              fontSize: 13,
              textAlign: 'center',
              marginBottom: 16,
              outline: 'none',
            }}
          >
            {error}
          </div>
        ) : null}

        {bodyMode === 'loading' ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <MicroLoader label="Loading watchlist" />
          </div>
        ) : bodyMode === 'load_error' ? (
          <div
            className="arena-empty-state"
            role="alert"
            ref={errorRef}
            tabIndex={-1}
            style={{ outline: 'none' }}
          >
            <p style={{ fontSize: 15, color: '#4A3728', fontWeight: 500, marginBottom: 0 }}>
              Could not load watchlist
            </p>
            <p style={{ fontSize: 13, color: '#8C7355', marginTop: 8, maxWidth: 340, lineHeight: 1.6 }}>
              {error || 'Something went wrong reaching the server. Your watched tasks are safe — try again.'}
            </p>
            <button
              type="button"
              className="arena-btn arena-btn--primary arena-btn--md"
              style={{ marginTop: 20 }}
              onClick={() => void load()}
            >
              Retry
            </button>
            <button
              type="button"
              className="arena-btn arena-btn--ghost arena-btn--md"
              style={{ marginTop: 8 }}
              onClick={() => navigate('/agent')}
            >
              Back to Agent
            </button>
          </div>
        ) : bodyMode === 'empty' ? (
          <div className="arena-empty-state">
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: '#D4C4B0' }}>
              <path
                d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p style={{ fontSize: 15, color: '#4A3728', fontWeight: 500, marginTop: 16, marginBottom: 0 }}>
              No watched tasks yet
            </p>
            <p style={{ fontSize: 13, color: '#8C7355', marginTop: 8, maxWidth: 340, lineHeight: 1.6 }}>
              Run a research task in Agent Mode, then watch it — Arena re-checks on your schedule
              and only notifies you when findings actually change.
            </p>
            <button
              type="button"
              className="arena-btn arena-btn--primary arena-btn--md"
              style={{ marginTop: 20 }}
              onClick={() => navigate('/agent')}
            >
              Start a research task →
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxWidth: 680,
              margin: '0 auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Filter by status">
                  {(
                    [
                      { id: 'all' as const, label: 'All' },
                      { id: 'active' as const, label: 'Active' },
                      { id: 'paused' as const, label: 'Paused' },
                    ] as const
                  ).map((opt) => {
                    const selected = statusFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setStatusFilter(opt.id)}
                        aria-pressed={selected}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 999,
                          border: selected ? 'none' : '0.5px solid #D4C4B0',
                          background: selected ? '#C4956A' : 'transparent',
                          color: selected ? '#FAF7F2' : '#8C7355',
                          fontSize: 12,
                          fontFamily: 'Georgia, serif',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: 11, color: '#A89070' }}>
                  {filteredItems.length}
                  {searchQuery.trim() || statusFilter !== 'all' ? ` / ${items.length}` : ''}
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  ref={searchRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search watched questions…"
                  aria-label="Search watched questions"
                  autoComplete="off"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: 13,
                    fontFamily: 'Georgia, serif',
                    color: '#2C1810',
                    background: '#FAF7F2',
                    border: '0.5px solid #E0D5C5',
                    borderRadius: 10,
                    padding: '10px 32px 10px 12px',
                    outline: 'none',
                  }}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchQuery('');
                      searchRef.current?.focus();
                    }}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 16,
                      color: '#A89070',
                      lineHeight: 1,
                      padding: 4,
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div
                className="arena-empty-state"
                style={{ padding: '2.5rem 1rem' }}
              >
                <p style={{ fontSize: 15, color: '#4A3728', fontWeight: 500, margin: 0 }}>
                  No matches
                </p>
                <p style={{ fontSize: 13, color: '#8C7355', marginTop: 8, maxWidth: 320, lineHeight: 1.6 }}>
                  {searchQuery.trim()
                    ? `Nothing matches “${searchQuery.trim()}”${statusFilter !== 'all' ? ` in ${statusFilter} watches` : ''}.`
                    : statusFilter === 'active'
                      ? 'No active watches right now — resume a paused one or start a new research task.'
                      : 'No paused watches.'}
                </p>
                <button
                  type="button"
                  className="arena-btn arena-btn--ghost arena-btn--md"
                  style={{ marginTop: 16 }}
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    searchRef.current?.focus();
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
            filteredItems.map((item) => {
              const badge = intervalBadge(item.interval_hours);
              return (
                <div
                  key={item.id}
                  style={{
                    background: '#FAF7F2',
                    border: '0.5px solid #E0D5C5',
                    borderRadius: 10,
                    padding: '16px 18px',
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 10,
                      background: '#F0E8DC',
                      border: '0.5px solid #D4C4B0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 500, color: '#C4956A' }}>{badge.num}</span>
                    <span style={{ fontSize: 9, color: '#A89070', textTransform: 'uppercase' }}>{badge.unit}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#2C1810',
                        lineHeight: 1.4,
                        marginBottom: 5,
                      }}
                    >
                      {item.question}
                    </div>
                    <div style={{ fontSize: 12, color: '#8C7355', lineHeight: 1.5 }}>
                      Run {item.run_count} times · Last ran {formatRelativePast(item.last_run_at)} · Next:{' '}
                      {item.is_active ? formatRelativeFuture(item.next_run_at) : 'paused'}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Re-check cadence"
                      style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}
                    >
                      {WATCHLIST_INTERVALS.map(({ hours, label, short }) => {
                        const selected = item.interval_hours === hours;
                        const busy = cadenceBusyId === item.id;
                        return (
                          <button
                            key={hours}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={short}
                            disabled={busy}
                            onClick={() => void onCadence(item, hours)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              border: selected ? 'none' : '0.5px solid #D4C4B0',
                              cursor: busy ? 'wait' : 'pointer',
                              fontSize: 11,
                              fontFamily: 'Georgia, serif',
                              background: selected ? '#C4956A' : 'transparent',
                              color: selected ? '#FAF7F2' : '#8C7355',
                              opacity: busy && !selected ? 0.55 : 1,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {item.latest_task_id && item.latest_task ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/agent?task_id=${encodeURIComponent(item.latest_task!.task_id)}`)
                        }
                        style={{
                          marginTop: 8,
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 11,
                          color: '#C4956A',
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
                        }}
                      >
                        Latest result →
                      </button>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.is_active}
                      aria-label={item.is_active ? 'Pause watch' : 'Resume watch'}
                      onClick={() => void onToggle(item)}
                      style={{
                        width: 32,
                        height: 18,
                        borderRadius: 9,
                        border: 'none',
                        padding: 2,
                        cursor: 'pointer',
                        background: item.is_active ? '#C4956A' : '#D4C4B0',
                        position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: '#FAF7F2',
                          marginLeft: item.is_active ? 14 : 0,
                          transition: reducedMotion ? 'none' : 'margin 0.15s ease',
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (pendingDeleteId === item.id) {
                          void onDelete(item.id);
                          return;
                        }
                        setPendingDeleteId(item.id);
                      }}
                      aria-label={
                        pendingDeleteId === item.id
                          ? 'Confirm remove from watchlist'
                          : 'Remove from watchlist'
                      }
                      style={{
                        background: pendingDeleteId === item.id ? 'rgba(216, 90, 48, 0.1)' : 'none',
                        border:
                          pendingDeleteId === item.id
                            ? '0.5px solid rgba(216, 90, 48, 0.45)'
                            : 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: pendingDeleteId === item.id ? 11 : 14,
                        color: pendingDeleteId === item.id ? '#D85A30' : '#C4A882',
                        padding: pendingDeleteId === item.id ? '3px 8px' : 0,
                        lineHeight: 1,
                        fontFamily: 'Georgia, serif',
                      }}
                      onMouseEnter={(e) => {
                        if (pendingDeleteId !== item.id) e.currentTarget.style.color = '#D85A30';
                      }}
                      onMouseLeave={(e) => {
                        if (pendingDeleteId !== item.id) e.currentTarget.style.color = '#C4A882';
                      }}
                    >
                      {pendingDeleteId === item.id ? 'Remove?' : '×'}
                    </button>
                  </div>
                </div>
              );
            })
            )}
          </div>
        )}
      </main>
    </div>
  );
}
