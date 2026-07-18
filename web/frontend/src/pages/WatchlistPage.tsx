import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MicroLoader from '../components/MicroLoader';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
import { HighlightQuery } from '../components/HighlightQuery';
import { EmptyState } from '../components/EmptyState';
import { MotionButton } from '../components/MotionButton';
import {
  ApiError,
  deleteAgentWatchlist,
  getAgentWatchlist,
  getAgentWatchlistHistory,
  patchAgentWatchlist,
  type AgentWatchlistHistoryResponse,
  type AgentWatchlistItem,
} from '../api';
import { useTier } from '../context/TierContext';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { prefersReducedMotion } from '../lib/motion';
import {
  formatWatchlistHistoryExport,
  formatWatchlistHistoryStats,
  watchlistScoreTrend,
} from '../lib/watchlistHistory';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import { isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';
import {
  WATCHLIST_INTERVALS,
  type WatchlistIntervalHours,
} from '../lib/watchlistIntervals';
import {
  formatWatchlistExport,
  formatWatchlistItemCopy,
  formatWatchlistQuestionCopy,
} from '../lib/watchlistExport';
import {
  WATCHLIST_SORT_OPTIONS,
  sortWatchlistItems,
  watchlistSortLabel,
  type WatchlistSort,
} from '../lib/watchlistSort';
import {
  AGENT_HISTORY_SCORE_OPTIONS,
  agentHistoryScoreFilterUseful,
  agentHistoryScoreLabel,
  filterAgentHistoryByScore,
  type AgentHistoryScoreFilter,
} from '../lib/agentHistoryScoreFilter';
import {
  WATCHLIST_CADENCE_OPTIONS,
  filterWatchlistByCadence,
  watchlistCadenceFilterUseful,
  watchlistCadenceLabel,
  type WatchlistCadenceFilter,
} from '../lib/watchlistCadenceFilter';
import {
  WATCHLIST_URGENCY_OPTIONS,
  filterWatchlistByUrgency,
  watchlistUrgencyBucket,
  watchlistUrgencyFilterUseful,
  watchlistUrgencyLabel,
  type WatchlistUrgencyFilter,
} from '../lib/watchlistUrgencyFilter';
import {
  WATCHLIST_EXPERTISE_ALL,
  collectWatchlistExpertiseOptions,
  filterWatchlistByExpertise,
  watchlistExpertiseFilterUseful,
  watchlistExpertiseLabel,
  type WatchlistExpertiseFilter,
} from '../lib/watchlistExpertiseFilter';
import {
  WATCHLIST_DOMAIN_ALL,
  collectWatchlistDomainOptions,
  filterWatchlistByDomain,
  watchlistDomainFilterUseful,
  watchlistDomainLabel,
  type WatchlistDomainFilter,
} from '../lib/watchlistDomainFilter';
import { formatRelativeFuture, formatRelativePast } from '../lib/relativeTime';
import { watchlistBodyMode } from '../lib/watchlistView';

type WatchlistStatusFilter = 'all' | 'active' | 'paused';

function intervalBadge(hours: number): { num: string; unit: string } {
  if (hours === 168) return { num: '7', unit: 'DAYS' };
  if (hours === 72) return { num: '3', unit: 'DAYS' };
  return { num: String(hours), unit: 'HRS' };
}

export function WatchlistPage() {
  const navigate = useNavigate();
  const { canUseFeature } = useTier();
  const canWatchlist = canUseFeature('agent_watchlist');
  /** Tick every 60s so “in 5m / 2h ago” stay accurate without a full reload. */
  const [nowMs, setNowMs] = useState(() => Date.now());
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
  const [scoreFilter, setScoreFilter] = useState<AgentHistoryScoreFilter>('all');
  const [cadenceFilter, setCadenceFilter] = useState<WatchlistCadenceFilter>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<WatchlistUrgencyFilter>('all');
  const [expertiseFilter, setExpertiseFilter] =
    useState<WatchlistExpertiseFilter>(WATCHLIST_EXPERTISE_ALL);
  const [domainFilter, setDomainFilter] = useState<WatchlistDomainFilter>(WATCHLIST_DOMAIN_ALL);
  const [listSort, setListSort] = useState<WatchlistSort>('next_soon');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  /** Per-card copy: which item id last acted, and which action. */
  const [itemCopyId, setItemCopyId] = useState<string | null>(null);
  const [itemCopyKind, setItemCopyKind] = useState<'watch' | 'question' | null>(null);
  const [itemCopyStatus, setItemCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const itemCopyTimerRef = useRef<number | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [historyCache, setHistoryCache] = useState<
    Record<
      string,
      | { status: 'loading' }
      | { status: 'error'; message: string }
      | { status: 'ready'; data: AgentWatchlistHistoryResponse }
    >
  >({});
  const [historyCopyStatus, setHistoryCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [historyDownloadStatus, setHistoryDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const historyCopyTimerRef = useRef<number | null>(null);
  const historyDownloadTimerRef = useRef<number | null>(null);
  const historyCacheRef = useRef(historyCache);
  historyCacheRef.current = historyCache;
  const errorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const copyStatusTimerRef = useRef<number | null>(null);
  const downloadStatusTimerRef = useRef<number | null>(null);
  const reducedMotion = prefersReducedMotion();

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const watchRelativePast = useCallback(
    (iso: string | null | undefined) =>
      formatRelativePast(iso, { fallback: '—', localeAfterDays: 0, now: nowMs }),
    [nowMs],
  );
  const watchRelativeFuture = useCallback(
    (iso: string | null | undefined) =>
      formatRelativeFuture(iso, { fallback: '—', now: nowMs }),
    [nowMs],
  );

  const loadWatchHistory = useCallback(async (itemId: string, force = false) => {
    if (!force) {
      const existing = historyCacheRef.current[itemId];
      if (existing && (existing.status === 'ready' || existing.status === 'loading')) return;
    }
    setHistoryCache((prev) => ({ ...prev, [itemId]: { status: 'loading' } }));
    try {
      const data = await getAgentWatchlistHistory(itemId, 30);
      setHistoryCache((prev) => ({ ...prev, [itemId]: { status: 'ready', data } }));
    } catch (e) {
      setHistoryCache((prev) => ({
        ...prev,
        [itemId]: {
          status: 'error',
          message: e instanceof ApiError ? e.message : 'Could not load run history',
        },
      }));
    }
  }, []);

  const toggleWatchHistory = useCallback(
    (itemId: string) => {
      if (historyOpenId === itemId) {
        setHistoryOpenId(null);
        return;
      }
      setHistoryOpenId(itemId);
      void loadWatchHistory(itemId);
    },
    [historyOpenId, loadWatchHistory],
  );

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
      setHistoryCache({});
      setHistoryOpenId(null);
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

  // `/` focuses watchlist search when not typing in another field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBareSlashKey(e) || !shouldCaptureSlashFocus(e.target)) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    const byCadence = filterWatchlistByCadence(byStatus, cadenceFilter);
    const byUrgency = filterWatchlistByUrgency(byCadence, urgencyFilter);
    const byExpertise = filterWatchlistByExpertise(byUrgency, expertiseFilter);
    const byDomain = filterWatchlistByDomain(byExpertise, domainFilter);
    const byScore = filterAgentHistoryByScore(
      byDomain.map((item) => ({
        ...item,
        score: item.latest_task?.final_score ?? null,
      })),
      scoreFilter,
    );
    const searched = filterBySearchQuery(byScore, searchQuery, (item) => [
      item.question,
      item.latest_task?.title,
      item.expertise_level,
      item.expertise_domain,
    ]);
    return sortWatchlistItems(
      searched.map((item) => ({
        ...item,
        isActive: item.is_active,
        nextRunAt: item.next_run_at,
        lastRunAt: item.last_run_at,
        runCount: item.run_count,
        latestScore: item.latest_task?.final_score ?? null,
      })),
      listSort,
    );
  }, [
    items,
    searchQuery,
    statusFilter,
    listSort,
    scoreFilter,
    cadenceFilter,
    urgencyFilter,
    expertiseFilter,
    domainFilter,
  ]);

  const scoreFilterUseful = useMemo(
    () =>
      agentHistoryScoreFilterUseful(
        items.map((item) => ({ score: item.latest_task?.final_score ?? null })),
      ),
    [items],
  );

  const cadenceFilterUseful = useMemo(
    () => watchlistCadenceFilterUseful(items),
    [items],
  );

  const urgencyFilterUseful = useMemo(
    () => watchlistUrgencyFilterUseful(items),
    [items],
  );

  const expertiseOptions = useMemo(
    () => collectWatchlistExpertiseOptions(items),
    [items],
  );

  const expertiseFilterUseful = useMemo(
    () => watchlistExpertiseFilterUseful(items),
    [items],
  );

  const domainOptions = useMemo(() => collectWatchlistDomainOptions(items), [items]);

  const domainFilterUseful = useMemo(() => watchlistDomainFilterUseful(items), [items]);

  // Drop expertise filter when that level no longer appears.
  useEffect(() => {
    if (expertiseFilter === WATCHLIST_EXPERTISE_ALL) return;
    if (!expertiseOptions.some((o) => o.value === expertiseFilter)) {
      setExpertiseFilter(WATCHLIST_EXPERTISE_ALL);
    }
  }, [expertiseFilter, expertiseOptions]);

  // Drop domain filter when that domain no longer appears.
  useEffect(() => {
    if (domainFilter === WATCHLIST_DOMAIN_ALL) return;
    if (!domainOptions.some((o) => o.value === domainFilter)) {
      setDomainFilter(WATCHLIST_DOMAIN_ALL);
    }
  }, [domainFilter, domainOptions]);

  useEffect(() => {
    return () => {
      if (copyStatusTimerRef.current != null) {
        window.clearTimeout(copyStatusTimerRef.current);
      }
      if (downloadStatusTimerRef.current != null) {
        window.clearTimeout(downloadStatusTimerRef.current);
      }
      if (historyCopyTimerRef.current != null) {
        window.clearTimeout(historyCopyTimerRef.current);
      }
      if (itemCopyTimerRef.current != null) {
        window.clearTimeout(itemCopyTimerRef.current);
      }
      if (historyDownloadTimerRef.current != null) {
        window.clearTimeout(historyDownloadTimerRef.current);
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

  const flashDownloadStatus = (status: 'done' | 'failed') => {
    if (downloadStatusTimerRef.current != null) {
      window.clearTimeout(downloadStatusTimerRef.current);
    }
    setDownloadStatus(status);
    downloadStatusTimerRef.current = window.setTimeout(() => {
      setDownloadStatus('idle');
      downloadStatusTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  const flashHistoryCopyStatus = (status: 'copied' | 'failed') => {
    if (historyCopyTimerRef.current != null) {
      window.clearTimeout(historyCopyTimerRef.current);
    }
    setHistoryCopyStatus(status);
    historyCopyTimerRef.current = window.setTimeout(() => {
      setHistoryCopyStatus('idle');
      historyCopyTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  const flashItemCopy = (
    itemId: string,
    kind: 'watch' | 'question',
    status: 'copied' | 'failed',
  ) => {
    if (itemCopyTimerRef.current != null) {
      window.clearTimeout(itemCopyTimerRef.current);
    }
    setItemCopyId(itemId);
    setItemCopyKind(kind);
    setItemCopyStatus(status);
    itemCopyTimerRef.current = window.setTimeout(() => {
      setItemCopyStatus('idle');
      setItemCopyId(null);
      setItemCopyKind(null);
      itemCopyTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  const copyWatchItem = async (item: AgentWatchlistItem, kind: 'watch' | 'question') => {
    const text =
      kind === 'question'
        ? formatWatchlistQuestionCopy(item.question)
        : formatWatchlistItemCopy({
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
          });
    if (!text) {
      flashItemCopy(item.id, kind, 'failed');
      setError(
        kind === 'question'
          ? 'Nothing to copy — this watch has no question text.'
          : 'Nothing to copy on this watch.',
      );
      return;
    }
    const ok = await copyToClipboard(text);
    flashItemCopy(item.id, kind, ok ? 'copied' : 'failed');
    if (!ok) {
      setError(
        kind === 'question'
          ? 'Could not copy question — try again.'
          : 'Could not copy this watch — try the list Copy export.',
      );
    }
  };

  const flashHistoryDownloadStatus = (status: 'done' | 'failed') => {
    if (historyDownloadTimerRef.current != null) {
      window.clearTimeout(historyDownloadTimerRef.current);
    }
    setHistoryDownloadStatus(status);
    historyDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryDownloadStatus('idle');
      historyDownloadTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  const exportOpenWatchHistory = async (mode: 'copy' | 'download', question: string, itemId: string) => {
    const hist = historyCacheRef.current[itemId];
    if (!hist || hist.status !== 'ready') return;
    const trend = watchlistScoreTrend(hist.data.items);
    const md = formatWatchlistHistoryExport({
      question,
      stats: hist.data.stats,
      items: hist.data.items,
      trend,
    });
    if (mode === 'copy') {
      const ok = await copyToClipboard(md);
      flashHistoryCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) setError('Could not copy run history — try Download instead.');
      return;
    }
    const stem = `watch-history-${question.slice(0, 40) || itemId}`;
    const ok = downloadMarkdownFile(md, stem);
    flashHistoryDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) setError('Could not download run history — try Copy instead.');
  };

  const buildWatchlistMarkdown = () => {
    const filterBits: string[] = [];
    if (statusFilter !== 'all') filterBits.push(`status: ${statusFilter}`);
    if (cadenceFilter !== 'all') {
      filterBits.push(`cadence: ${watchlistCadenceLabel(cadenceFilter)}`);
    }
    if (urgencyFilter !== 'all') {
      filterBits.push(`timing: ${watchlistUrgencyLabel(urgencyFilter)}`);
    }
    if (scoreFilter !== 'all') {
      filterBits.push(`score: ${agentHistoryScoreLabel(scoreFilter)}`);
    }
    if (expertiseFilter !== WATCHLIST_EXPERTISE_ALL) {
      filterBits.push(
        `expertise: ${watchlistExpertiseLabel(expertiseFilter, expertiseOptions)}`,
      );
    }
    if (domainFilter !== WATCHLIST_DOMAIN_ALL) {
      filterBits.push(`domain: ${watchlistDomainLabel(domainFilter, domainOptions)}`);
    }
    const q = searchQuery.trim();
    if (q) filterBits.push(`search: “${q}”`);
    if (listSort !== 'next_soon') filterBits.push(`sort: ${watchlistSortLabel(listSort)}`);
    return formatWatchlistExport({
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
  };

  const copyWatchlist = async () => {
    const markdown = buildWatchlistMarkdown();
    const ok = await copyToClipboard(markdown);
    if (ok) {
      flashCopyStatus('copied');
    } else {
      flashCopyStatus('failed');
      setError('Could not copy watchlist — try again or copy from a notes app after export.');
    }
  };

  const downloadWatchlist = () => {
    const markdown = buildWatchlistMarkdown();
    const ok = downloadMarkdownFile(markdown, 'agent-watchlist');
    if (ok) {
      flashDownloadStatus('done');
    } else {
      flashDownloadStatus('failed');
      setError('Could not download watchlist — try Copy instead.');
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
          <MotionButton
            type="button"
            variant="primary"
            size="md"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/pricing')}
          >
            View plans →
          </MotionButton>
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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
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
            <button
              type="button"
              onClick={() => downloadWatchlist()}
              title="Download current view as markdown"
              aria-label={
                downloadStatus === 'done'
                  ? 'Watchlist downloaded'
                  : downloadStatus === 'failed'
                    ? 'Download failed'
                    : 'Download watchlist as markdown'
              }
              style={{
                background: 'none',
                border: '0.5px solid #D4C4B0',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 11,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color:
                  downloadStatus === 'failed'
                    ? '#D85A30'
                    : downloadStatus === 'done'
                      ? '#5A8C6A'
                      : '#8C7355',
                cursor: 'pointer',
                fontFamily: 'Georgia, serif',
              }}
            >
              {downloadStatus === 'done'
                ? 'Downloaded'
                : downloadStatus === 'failed'
                  ? 'Failed'
                  : 'Download .md'}
            </button>
          </div>
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
          <div ref={errorRef} tabIndex={-1} style={{ outline: 'none' }}>
            <EmptyState
              variant="error"
              alert
              title="Could not load watchlist"
              description={
                error ||
                'Something went wrong reaching the server. Your watched tasks are safe — try again.'
              }
              actions={
                <>
                  <MotionButton
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => void load()}
                  >
                    Retry
                  </MotionButton>
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--md"
                    onClick={() => navigate('/agent')}
                  >
                    Back to Agent
                  </button>
                </>
              }
            />
          </div>
        ) : bodyMode === 'empty' ? (
          <EmptyState
            title="No watched tasks yet"
            description="Run a research task in Agent Mode, then watch it — Arena re-checks on your schedule and only notifies you when findings actually change."
            icon={
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            actions={
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={() => navigate('/agent')}
              >
                Start a research task →
              </MotionButton>
            }
          />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={listSort}
                    onChange={(e) => setListSort(e.target.value as WatchlistSort)}
                    aria-label="Sort watchlist"
                    title="Sort watchlist"
                    style={{
                      fontSize: 12,
                      fontFamily: 'Georgia, serif',
                      color: '#4A3728',
                      background: '#FAF7F2',
                      border: '0.5px solid #D4C4B0',
                      borderRadius: 8,
                      padding: '5px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {WATCHLIST_SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: '#A89070' }}>
                    {filteredItems.length}
                    {searchQuery.trim() ||
                    statusFilter !== 'all' ||
                    scoreFilter !== 'all' ||
                    cadenceFilter !== 'all' ||
                    urgencyFilter !== 'all' ||
                    expertiseFilter !== WATCHLIST_EXPERTISE_ALL ||
                    domainFilter !== WATCHLIST_DOMAIN_ALL
                      ? ` / ${items.length}`
                      : ''}
                  </span>
                </div>
              </div>
              {urgencyFilterUseful ? (
                <div
                  role="group"
                  aria-label="Filter by due timing"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                >
                  {WATCHLIST_URGENCY_OPTIONS.map((opt) => {
                    const selected = urgencyFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setUrgencyFilter(opt.value)}
                        aria-pressed={selected}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 999,
                          border: selected ? 'none' : '0.5px solid #D4C4B0',
                          background: selected
                            ? opt.value === 'overdue'
                              ? '#B85C38'
                              : '#C4956A'
                            : 'transparent',
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
              ) : null}
              {cadenceFilterUseful ? (
                <div
                  role="group"
                  aria-label="Filter by re-check cadence"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                >
                  {WATCHLIST_CADENCE_OPTIONS.map((opt) => {
                    const selected = cadenceFilter === opt.value;
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setCadenceFilter(opt.value)}
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
              ) : null}
              {scoreFilterUseful ? (
                <div
                  role="group"
                  aria-label="Filter by latest score"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                >
                  {AGENT_HISTORY_SCORE_OPTIONS.map((opt) => {
                    const selected = scoreFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setScoreFilter(opt.value)}
                        aria-pressed={selected}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 999,
                          border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                          background: selected ? '#F0E6DA' : 'transparent',
                          color: selected ? '#4A3728' : '#8C7355',
                          fontSize: 11,
                          fontFamily: 'Georgia, serif',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {expertiseFilterUseful ? (
                <div
                  role="group"
                  aria-label="Filter by expertise level"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                >
                  {expertiseOptions.map((opt) => {
                    const selected = expertiseFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setExpertiseFilter(opt.value)}
                        aria-pressed={selected}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 999,
                          border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                          background: selected ? '#F0E6DA' : 'transparent',
                          color: selected ? '#4A3728' : '#8C7355',
                          fontSize: 11,
                          fontFamily: 'Georgia, serif',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {domainFilterUseful ? (
                <div
                  role="group"
                  aria-label="Filter by expertise domain"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                >
                  {domainOptions.map((opt) => {
                    const selected = domainFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDomainFilter(opt.value)}
                        aria-pressed={selected}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 999,
                          border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                          background: selected ? '#F0E6DA' : 'transparent',
                          color: selected ? '#4A3728' : '#8C7355',
                          fontSize: 11,
                          fontFamily: 'Georgia, serif',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
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
              <EmptyState
                variant="filter"
                title="No matches"
                description={
                  searchQuery.trim()
                    ? `Nothing matches “${searchQuery.trim()}”${statusFilter !== 'all' ? ` in ${statusFilter} watches` : ''}${
                        urgencyFilter !== 'all' ? ` · ${watchlistUrgencyLabel(urgencyFilter)}` : ''
                      }${cadenceFilter !== 'all' ? ` · ${watchlistCadenceLabel(cadenceFilter)}` : ''}${
                        scoreFilter !== 'all' ? ` · ${agentHistoryScoreLabel(scoreFilter)}` : ''
                      }${
                        expertiseFilter !== WATCHLIST_EXPERTISE_ALL
                          ? ` · ${watchlistExpertiseLabel(expertiseFilter, expertiseOptions)}`
                          : ''
                      }${
                        domainFilter !== WATCHLIST_DOMAIN_ALL
                          ? ` · ${watchlistDomainLabel(domainFilter, domainOptions)}`
                          : ''
                      }.`
                    : urgencyFilter === 'overdue'
                      ? 'Nothing is overdue right now — you’re caught up on re-checks.'
                      : urgencyFilter === 'due_soon'
                        ? 'Nothing due in the next 24 hours.'
                        : urgencyFilter === 'later'
                          ? 'No active watches scheduled further out.'
                          : domainFilter !== WATCHLIST_DOMAIN_ALL &&
                              expertiseFilter === WATCHLIST_EXPERTISE_ALL &&
                              cadenceFilter === 'all' &&
                              scoreFilter === 'all' &&
                              urgencyFilter === 'all' &&
                              statusFilter === 'all'
                            ? `No watches in ${watchlistDomainLabel(domainFilter, domainOptions)}.`
                            : expertiseFilter !== WATCHLIST_EXPERTISE_ALL &&
                                cadenceFilter === 'all' &&
                                scoreFilter === 'all' &&
                                urgencyFilter === 'all' &&
                                statusFilter === 'all' &&
                                domainFilter === WATCHLIST_DOMAIN_ALL
                              ? `No ${watchlistExpertiseLabel(expertiseFilter, expertiseOptions).toLowerCase()} watches.`
                              : cadenceFilter !== 'all' && scoreFilter !== 'all'
                                ? `No ${watchlistCadenceLabel(cadenceFilter).toLowerCase()} watches with latest score ${agentHistoryScoreLabel(scoreFilter)}.`
                                : cadenceFilter !== 'all'
                                  ? `No ${watchlistCadenceLabel(cadenceFilter).toLowerCase()} watches${
                                      statusFilter !== 'all' ? ` that are ${statusFilter}` : ''
                                    }.`
                                  : scoreFilter !== 'all'
                                    ? `No watches with latest score ${agentHistoryScoreLabel(scoreFilter)}.`
                                    : statusFilter === 'active'
                                      ? 'No active watches right now — resume a paused one or start a new research task.'
                                      : statusFilter === 'paused'
                                        ? 'No paused watches.'
                                        : 'No matches.'
                }
                actions={
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--md"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setScoreFilter('all');
                      setCadenceFilter('all');
                      setUrgencyFilter('all');
                      setExpertiseFilter(WATCHLIST_EXPERTISE_ALL);
                      setDomainFilter(WATCHLIST_DOMAIN_ALL);
                      setListSort('next_soon');
                      searchRef.current?.focus();
                    }}
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
            filteredItems.map((item) => {
              const badge = intervalBadge(item.interval_hours);
              const urgency = watchlistUrgencyBucket(item);
              const urgencyBorder =
                urgency === 'overdue'
                  ? '#B85C38'
                  : urgency === 'due_soon'
                    ? '#C4956A'
                    : '#E0D5C5';
              return (
                <div
                  key={item.id}
                  style={{
                    background: '#FAF7F2',
                    border: `0.5px solid ${urgencyBorder}`,
                    borderLeft:
                      urgency === 'overdue' || urgency === 'due_soon'
                        ? `3px solid ${urgencyBorder}`
                        : `0.5px solid ${urgencyBorder}`,
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
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginBottom: 5,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#2C1810',
                          lineHeight: 1.4,
                        }}
                      >
                        <HighlightQuery text={item.question} query={searchQuery} />
                      </span>
                      {item.latest_task?.final_score != null ? (
                        <span
                          title={`Latest run scored ${item.latest_task.final_score}/100`}
                          aria-label={`Latest score ${item.latest_task.final_score} out of 100`}
                          style={{
                            fontSize: 11,
                            borderRadius: 999,
                            padding: '1px 7px',
                            background:
                              item.latest_task.final_score >= 80
                                ? 'rgba(138,168,153,0.18)'
                                : item.latest_task.final_score >= 60
                                  ? 'rgba(196,149,106,0.18)'
                                  : 'rgba(229,115,115,0.15)',
                            color:
                              item.latest_task.final_score >= 80
                                ? '#3F6B4A'
                                : item.latest_task.final_score >= 60
                                  ? '#8C5A2C'
                                  : '#9C2F2A',
                            flexShrink: 0,
                          }}
                        >
                          {item.latest_task.final_score}/100
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: '#8C7355', lineHeight: 1.5 }}>
                      Run {item.run_count} times · Last ran {watchRelativePast(item.last_run_at)} · Next:{' '}
                      {item.is_active ? watchRelativeFuture(item.next_run_at) : 'paused'}
                      {urgency === 'overdue' ? (
                        <span style={{ color: '#B85C38', fontWeight: 500 }}> · Overdue</span>
                      ) : urgency === 'due_soon' ? (
                        <span style={{ color: '#A67C52', fontWeight: 500 }}> · Due soon</span>
                      ) : null}
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
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12,
                        alignItems: 'center',
                        marginTop: 8,
                      }}
                    >
                      {item.latest_task_id && item.latest_task ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/agent?task_id=${encodeURIComponent(item.latest_task!.task_id)}`,
                            )
                          }
                          style={{
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
                      {item.run_count > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleWatchHistory(item.id)}
                          aria-expanded={historyOpenId === item.id}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontSize: 11,
                            color: '#8C7355',
                            cursor: 'pointer',
                            fontFamily: 'Georgia, serif',
                          }}
                        >
                          {historyOpenId === item.id ? 'Hide run history' : 'Run history'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void copyWatchItem(item, 'watch')}
                        title="Copy this watch as markdown"
                        aria-label={`Copy watch: ${item.question.slice(0, 80) || 'watched question'}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 11,
                          color:
                            itemCopyId === item.id &&
                            itemCopyKind === 'watch' &&
                            itemCopyStatus === 'failed'
                              ? '#993C1D'
                              : itemCopyId === item.id &&
                                  itemCopyKind === 'watch' &&
                                  itemCopyStatus === 'copied'
                                ? '#3F6B4A'
                                : '#C4956A',
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
                        }}
                      >
                        {itemCopyId === item.id &&
                        itemCopyKind === 'watch' &&
                        itemCopyStatus === 'copied'
                          ? 'Copied watch'
                          : itemCopyId === item.id &&
                              itemCopyKind === 'watch' &&
                              itemCopyStatus === 'failed'
                            ? 'Copy failed'
                            : 'Copy watch'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyWatchItem(item, 'question')}
                        title="Copy the watched question only"
                        aria-label={`Copy question: ${item.question.slice(0, 80) || 'watched question'}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 11,
                          color:
                            itemCopyId === item.id &&
                            itemCopyKind === 'question' &&
                            itemCopyStatus === 'failed'
                              ? '#993C1D'
                              : itemCopyId === item.id &&
                                  itemCopyKind === 'question' &&
                                  itemCopyStatus === 'copied'
                                ? '#3F6B4A'
                                : '#8C7355',
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
                        }}
                      >
                        {itemCopyId === item.id &&
                        itemCopyKind === 'question' &&
                        itemCopyStatus === 'copied'
                          ? 'Copied question'
                          : itemCopyId === item.id &&
                              itemCopyKind === 'question' &&
                              itemCopyStatus === 'failed'
                            ? 'Copy failed'
                            : 'Copy question'}
                      </button>
                    </div>
                    {historyOpenId === item.id ? (
                      <div
                        style={{
                          marginTop: 10,
                          padding: '10px 12px',
                          background: '#F7F1E8',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 10,
                        }}
                      >
                        {(() => {
                          const hist = historyCache[item.id];
                          if (!hist || hist.status === 'loading') {
                            return (
                              <p style={{ margin: 0, fontSize: 12, color: '#A89070' }}>
                                Loading run history…
                              </p>
                            );
                          }
                          if (hist.status === 'error') {
                            return (
                              <div>
                                <p style={{ margin: 0, fontSize: 12, color: '#993C1D' }}>
                                  {hist.message}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void loadWatchHistory(item.id, true)}
                                  style={{
                                    marginTop: 6,
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    fontSize: 11,
                                    color: '#C4956A',
                                    cursor: 'pointer',
                                    fontFamily: 'Georgia, serif',
                                  }}
                                >
                                  Retry
                                </button>
                              </div>
                            );
                          }
                          const { data } = hist;
                          const statsLabel = formatWatchlistHistoryStats(data.stats);
                          const trend = watchlistScoreTrend(data.items);
                          const trendColor =
                            !trend
                              ? '#8C7355'
                              : trend.delta > 0
                                ? '#3F6B4A'
                                : trend.delta < 0
                                  ? '#9C2F2A'
                                  : '#8C7355';
                          return (
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  alignItems: 'center',
                                  marginBottom: 8,
                                  justifyContent: 'space-between',
                                }}
                              >
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                  {statsLabel ? (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: '#8C7355',
                                        letterSpacing: '0.02em',
                                      }}
                                    >
                                      {statsLabel}
                                    </span>
                                  ) : null}
                                  {trend ? (
                                    <span
                                      title={`Latest ${trend.latest} vs prior ${trend.previous}`}
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 500,
                                        color: trendColor,
                                        fontFamily: 'Georgia, serif',
                                      }}
                                    >
                                      {trend.label}
                                    </span>
                                  ) : null}
                                </div>
                                {data.items.length > 0 ? (
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      type="button"
                                      onClick={() => void exportOpenWatchHistory('copy', item.question, item.id)}
                                      style={{
                                        background: 'none',
                                        border: '0.5px solid #D4C4B0',
                                        borderRadius: 999,
                                        padding: '2px 10px',
                                        fontSize: 11,
                                        color:
                                          historyCopyStatus === 'failed'
                                            ? '#993C1D'
                                            : historyCopyStatus === 'copied'
                                              ? '#3F6B4A'
                                              : '#8C7355',
                                        cursor: 'pointer',
                                        fontFamily: 'Georgia, serif',
                                      }}
                                    >
                                      {historyCopyStatus === 'copied'
                                        ? 'Copied'
                                        : historyCopyStatus === 'failed'
                                          ? 'Copy failed'
                                          : 'Copy history'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void exportOpenWatchHistory('download', item.question, item.id)
                                      }
                                      style={{
                                        background: 'none',
                                        border: '0.5px solid #D4C4B0',
                                        borderRadius: 999,
                                        padding: '2px 10px',
                                        fontSize: 11,
                                        color:
                                          historyDownloadStatus === 'failed'
                                            ? '#993C1D'
                                            : historyDownloadStatus === 'done'
                                              ? '#3F6B4A'
                                              : '#8C7355',
                                        cursor: 'pointer',
                                        fontFamily: 'Georgia, serif',
                                      }}
                                    >
                                      {historyDownloadStatus === 'done'
                                        ? 'Downloaded'
                                        : historyDownloadStatus === 'failed'
                                          ? 'Failed'
                                          : 'Download .md'}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                              {data.items.length === 0 ? (
                                <p style={{ margin: 0, fontSize: 12, color: '#A89070' }}>
                                  No runs recorded yet.
                                </p>
                              ) : (
                                <ul
                                  style={{
                                    listStyle: 'none',
                                    margin: 0,
                                    padding: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                  }}
                                >
                                  {data.items.map((run) => {
                                    const score = run.final_score;
                                    const tone =
                                      score == null
                                        ? { bg: 'rgba(168,144,112,0.18)', fg: '#6B6460' }
                                        : score >= 80
                                          ? { bg: 'rgba(138,168,153,0.18)', fg: '#3F6B4A' }
                                          : score >= 60
                                            ? { bg: 'rgba(196,149,106,0.18)', fg: '#8C5A2C' }
                                            : { bg: 'rgba(217,83,79,0.15)', fg: '#9C2F2A' };
                                    return (
                                      <li key={run.task_id}>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            navigate(
                                              `/agent?task_id=${encodeURIComponent(run.task_id)}`,
                                            )
                                          }
                                          style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            background: 'transparent',
                                            border: '0.5px solid #E0D5C5',
                                            borderRadius: 8,
                                            padding: '8px 10px',
                                            cursor: 'pointer',
                                            fontFamily: 'Georgia, serif',
                                          }}
                                        >
                                          <div
                                            style={{
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              gap: 8,
                                              alignItems: 'baseline',
                                            }}
                                          >
                                            <span
                                              style={{
                                                fontSize: 12,
                                                color: '#2C1810',
                                                fontWeight: 500,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                              }}
                                            >
                                              {run.title?.trim() || 'Research run'}
                                            </span>
                                            <span
                                              style={{
                                                fontSize: 11,
                                                borderRadius: 999,
                                                padding: '1px 7px',
                                                background: tone.bg,
                                                color: tone.fg,
                                                flexShrink: 0,
                                              }}
                                            >
                                              {score != null ? `${score}/100` : '—'}
                                            </span>
                                          </div>
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: '#A89070',
                                            marginTop: 2,
                                          }}
                                        >
                                          {watchRelativePast(run.created_at)}
                                          {run.user_feedback
                                            ? ` · ${String(run.user_feedback)}`
                                            : ''}
                                        </div>
                                      </button>
                                    </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          );
                        })()}
                      </div>
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

      <KeyboardShortcutsHelp surface="watchlist" />
    </div>
  );
}
