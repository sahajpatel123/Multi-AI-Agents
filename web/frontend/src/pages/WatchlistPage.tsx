import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/watchlist-page.css';
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
      <div className="watchlist-gate">
        <div className="watchlist-gate__card">
          <p className="watchlist-gate__kicker">
            <span className="watchlist-gate__kicker-dot" aria-hidden="true" />
            Plus feature
          </p>
          <h1 className="watchlist-gate__title">Watchlist</h1>
          <p className="watchlist-gate__body">
            Recurring research checks are available on Arena Plus and Pro. Upgrade to pin questions
            and get notified when findings actually change.
          </p>
          <div className="watchlist-gate__actions">
            <MotionButton
              type="button"
              variant="primary"
              size="md"
              onClick={() => navigate('/pricing')}
            >
              View plans →
            </MotionButton>
            <MotionButton
              type="button"
              variant="ghost"
              size="md"
              onClick={() => navigate('/agent')}
            >
              Back to Agent
            </MotionButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="watchlist-page">
      <header className="watchlist-page__header">
        <button
          type="button"
          onClick={() => navigate('/agent')}
          className="watchlist-page__back"
        >
          ← Agent
        </button>
        <div className="watchlist-page__title-block">
          <div className="watchlist-page__title-row">
            <span className="watchlist-page__title">Watchlist</span>
            <span className="watchlist-page__title-count">
              {activeCount}/{activeCap} active
            </span>
          </div>
          <span className="watchlist-page__lede">Tasks that research themselves.</span>
        </div>
        {bodyMode === 'list' && items.length > 0 ? (
          <div className="watchlist-page__header-actions">
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
              className={[
                'watchlist-header-btn',
                copyStatus === 'copied' ? 'watchlist-header-btn--ok' : '',
                copyStatus === 'failed' ? 'watchlist-header-btn--err' : '',
              ]
                .filter(Boolean)
                .join(' ')}
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
              className={[
                'watchlist-header-btn',
                downloadStatus === 'done' ? 'watchlist-header-btn--ok' : '',
                downloadStatus === 'failed' ? 'watchlist-header-btn--err' : '',
              ]
                .filter(Boolean)
                .join(' ')}
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

      <main className="watchlist-page__main">
        <p className="watchlist-page__intro">
          Watched tasks re-run automatically on your chosen schedule. Arena compares new findings to the original answer and notifies you when something meaningful changes.
        </p>
        {error && bodyMode !== 'load_error' ? (
          <div
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="watchlist-page__error"
          >
            {error}
          </div>
        ) : null}

        {bodyMode === 'loading' ? (
          <div className="watchlist-page__loader">
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
            <div className="watchlist-page__filters">
              <div className="watchlist-page__filters-head">
                <div className="watchlist-pill-row" role="group" aria-label="Filter by status">
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
                        className={[
                          'watchlist-pill',
                          selected ? 'watchlist-pill--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div className="watchlist-page__filters-controls">
                  <select
                    value={listSort}
                    onChange={(e) => setListSort(e.target.value as WatchlistSort)}
                    aria-label="Sort watchlist"
                    title="Sort watchlist"
                    className="watchlist-page__sort-select"
                  >
                    {WATCHLIST_SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="watchlist-page__count">
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
                  className="watchlist-pill-row"
                  role="group"
                  aria-label="Filter by due timing"
                >
                  {WATCHLIST_URGENCY_OPTIONS.map((opt) => {
                    const selected = urgencyFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setUrgencyFilter(opt.value)}
                        aria-pressed={selected}
                        className={[
                          'watchlist-pill',
                          selected ? 'watchlist-pill--active' : '',
                          opt.value === 'overdue' ? 'watchlist-pill--overdue' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {cadenceFilterUseful ? (
                <div
                  className="watchlist-pill-row"
                  role="group"
                  aria-label="Filter by re-check cadence"
                >
                  {WATCHLIST_CADENCE_OPTIONS.map((opt) => {
                    const selected = cadenceFilter === opt.value;
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setCadenceFilter(opt.value)}
                        aria-pressed={selected}
                        className={[
                          'watchlist-pill',
                          selected ? 'watchlist-pill--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {scoreFilterUseful ? (
                <div
                  className="watchlist-pill-row"
                  role="group"
                  aria-label="Filter by latest score"
                >
                  {AGENT_HISTORY_SCORE_OPTIONS.map((opt) => {
                    const selected = scoreFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setScoreFilter(opt.value)}
                        aria-pressed={selected}
                        className={[
                          'watchlist-pill',
                          'watchlist-pill--score',
                          selected ? 'watchlist-pill--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {expertiseFilterUseful ? (
                <div
                  className="watchlist-pill-row"
                  role="group"
                  aria-label="Filter by expertise level"
                >
                  {expertiseOptions.map((opt) => {
                    const selected = expertiseFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setExpertiseFilter(opt.value)}
                        aria-pressed={selected}
                        className={[
                          'watchlist-pill',
                          'watchlist-pill--score',
                          selected ? 'watchlist-pill--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {domainFilterUseful ? (
                <div
                  className="watchlist-pill-row"
                  role="group"
                  aria-label="Filter by expertise domain"
                >
                  {domainOptions.map((opt) => {
                    const selected = domainFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDomainFilter(opt.value)}
                        aria-pressed={selected}
                        className={[
                          'watchlist-pill',
                          'watchlist-pill--score',
                          selected ? 'watchlist-pill--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
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
              return (
                <div
                  key={item.id}
                  className={[
                    'watchlist-item',
                    urgency === 'overdue' ? 'watchlist-item--overdue' : '',
                    urgency === 'due_soon' ? 'watchlist-item--due-soon' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="watchlist-item__badge">
                    <span className="watchlist-item__badge-num">{badge.num}</span>
                    <span className="watchlist-item__badge-unit">{badge.unit}</span>
                  </div>
                  <div className="watchlist-item__body">
                    <div className="watchlist-item__title-row">
                      <span className="watchlist-item__title">
                        <HighlightQuery text={item.question} query={searchQuery} />
                      </span>
                      {item.latest_task?.final_score != null ? (
                        <span
                          title={`Latest run scored ${item.latest_task.final_score}/100`}
                          aria-label={`Latest score ${item.latest_task.final_score} out of 100`}
                          className={[
                            'watchlist-score-chip',
                            item.latest_task.final_score >= 80
                              ? 'watchlist-score-chip--high'
                              : item.latest_task.final_score >= 60
                                ? 'watchlist-score-chip--mid'
                                : 'watchlist-score-chip--low',
                          ].join(' ')}
                        >
                          {item.latest_task.final_score}/100
                        </span>
                      ) : null}
                    </div>
                    <div className="watchlist-item__meta">
                      Run {item.run_count} times · Last ran {watchRelativePast(item.last_run_at)} · Next:{' '}
                      {item.is_active ? watchRelativeFuture(item.next_run_at) : 'paused'}
                      {urgency === 'overdue' ? (
                        <span className="watchlist-item__meta--overdue"> · Overdue</span>
                      ) : urgency === 'due_soon' ? (
                        <span className="watchlist-item__meta--due-soon"> · Due soon</span>
                      ) : null}
                    </div>
                    <div
                      className="watchlist-item__cadence-row"
                      role="radiogroup"
                      aria-label="Re-check cadence"
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
                            className={[
                              'watchlist-item__cadence-pill',
                              selected ? 'watchlist-item__cadence-pill--active' : '',
                              busy && !selected ? 'watchlist-item__cadence-pill--busy' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="watchlist-item__actions">
                      {item.latest_task_id && item.latest_task ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/agent?task_id=${encodeURIComponent(item.latest_task!.task_id)}`,
                            )
                          }
                          className="watchlist-link watchlist-link--accent"
                        >
                          Latest result →
                        </button>
                      ) : null}
                      {item.run_count > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleWatchHistory(item.id)}
                          aria-expanded={historyOpenId === item.id}
                          className="watchlist-link"
                        >
                          {historyOpenId === item.id ? 'Hide run history' : 'Run history'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void copyWatchItem(item, 'watch')}
                        title="Copy this watch as markdown"
                        aria-label={`Copy watch: ${item.question.slice(0, 80) || 'watched question'}`}
                        className={[
                          'watchlist-link',
                          'watchlist-link--accent',
                          itemCopyId === item.id &&
                          itemCopyKind === 'watch' &&
                          itemCopyStatus === 'copied'
                            ? 'watchlist-link--ok'
                            : '',
                          itemCopyId === item.id &&
                          itemCopyKind === 'watch' &&
                          itemCopyStatus === 'failed'
                            ? 'watchlist-link--err'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
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
                        className={[
                          'watchlist-link',
                          itemCopyId === item.id &&
                          itemCopyKind === 'question' &&
                          itemCopyStatus === 'copied'
                            ? 'watchlist-link--ok'
                            : '',
                          itemCopyId === item.id &&
                          itemCopyKind === 'question' &&
                          itemCopyStatus === 'failed'
                            ? 'watchlist-link--err'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
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
                      <div className="watchlist-history">
                        {(() => {
                          const hist = historyCache[item.id];
                          if (!hist || hist.status === 'loading') {
                            return (
                              <p className="watchlist-history__empty">Loading run history…</p>
                            );
                          }
                          if (hist.status === 'error') {
                            return (
                              <div>
                                <p className="watchlist-history__empty" style={{ color: '#993C1D' }}>
                                  {hist.message}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => void loadWatchHistory(item.id, true)}
                                  className="watchlist-link watchlist-link--accent"
                                  style={{ marginTop: 6 }}
                                >
                                  Retry
                                </button>
                              </div>
                            );
                          }
                          const { data } = hist;
                          const statsLabel = formatWatchlistHistoryStats(data.stats);
                          const trend = watchlistScoreTrend(data.items);
                          return (
                            <div>
                              <div className="watchlist-history__head">
                                <div className="watchlist-history__stats">
                                  {statsLabel ? (
                                    <span className="watchlist-history__stats-label">
                                      {statsLabel}
                                    </span>
                                  ) : null}
                                  {trend ? (
                                    <span
                                      title={`Latest ${trend.latest} vs prior ${trend.previous}`}
                                      className={[
                                        'watchlist-history__trend',
                                        trend.delta > 0
                                          ? 'watchlist-history__trend--up'
                                          : trend.delta < 0
                                            ? 'watchlist-history__trend--down'
                                            : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    >
                                      {trend.label}
                                    </span>
                                  ) : null}
                                </div>
                                {data.items.length > 0 ? (
                                  <div className="watchlist-history__actions">
                                    <button
                                      type="button"
                                      onClick={() => void exportOpenWatchHistory('copy', item.question, item.id)}
                                      className={[
                                        'watchlist-history-btn',
                                        historyCopyStatus === 'copied' ? 'watchlist-history-btn--ok' : '',
                                        historyCopyStatus === 'failed' ? 'watchlist-history-btn--err' : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
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
                                      className={[
                                        'watchlist-history-btn',
                                        historyDownloadStatus === 'done' ? 'watchlist-history-btn--ok' : '',
                                        historyDownloadStatus === 'failed' ? 'watchlist-history-btn--err' : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
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
                                <p className="watchlist-history__empty">No runs recorded yet.</p>
                              ) : (
                                <ul className="watchlist-history__list">
                                  {data.items.map((run) => {
                                    const score = run.final_score;
                                    return (
                                      <li key={run.task_id}>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            navigate(
                                              `/agent?task_id=${encodeURIComponent(run.task_id)}`,
                                            )
                                          }
                                          className="watchlist-history__run"
                                        >
                                          <div className="watchlist-history__run-row">
                                            <span className="watchlist-history__run-title">
                                              {run.title?.trim() || 'Research run'}
                                            </span>
                                            <span
                                              className={[
                                                'watchlist-score-chip',
                                                score == null
                                                  ? 'watchlist-score-chip--neutral'
                                                  : score >= 80
                                                    ? 'watchlist-score-chip--high'
                                                    : score >= 60
                                                      ? 'watchlist-score-chip--mid'
                                                      : 'watchlist-score-chip--low',
                                              ].join(' ')}
                                            >
                                              {score != null ? `${score}/100` : '—'}
                                            </span>
                                          </div>
                                          <div className="watchlist-history__run-meta">
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
                  <div className="watchlist-item__controls">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.is_active}
                      aria-label={item.is_active ? 'Pause watch' : 'Resume watch'}
                      onClick={() => void onToggle(item)}
                      className={[
                        'watchlist-toggle',
                        item.is_active ? 'watchlist-toggle--on' : '',
                        reducedMotion ? 'watchlist-toggle--static' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="watchlist-toggle__knob" />
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
                      className={[
                        'watchlist-remove',
                        pendingDeleteId === item.id ? 'watchlist-remove--confirm' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
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
