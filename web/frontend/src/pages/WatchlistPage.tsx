import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/watchlist-page.css';
import MicroLoader from '../components/MicroLoader';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
import { HighlightQuery } from '../components/HighlightQuery';
import { EmptyState } from '../components/EmptyState';
import { MotionButton } from '../components/MotionButton';
import { ExpertiseSelector } from '../components/ExpertiseSelector';
import {
  ApiError,
  createAgentTaskShare,
  deleteAgentWatchlistBulk,
  deleteAgentWatchlist,
  exportAgentWatchlistHistoryCsv,
  exportAgentWatchlistHistoryJson,
  exportAgentWatchlistStatisticsCsv,
  getAgentWatchlist,
  getAgentWatchlistHistory,
  getAgentWatchlistStatistics,
  patchAgentWatchlistBulk,
  patchAgentWatchlist,
  postAgentWatchlistDuplicate,
  postAgentWatchlistRun,
  type AgentWatchlistHistoryResponse,
  type AgentWatchlistHistoryRun,
  type AgentWatchlistItem,
  type AgentWatchlistStatistics,
} from '../api';
import { useTier } from '../context/TierContext';
import { copyToClipboard } from '../lib/clipboard';
import {
  downloadBlobFile,
  downloadMarkdownFile,
  downloadTextFile,
  withDownloadDate,
} from '../lib/downloadTextFile';
import { prefersReducedMotion } from '../lib/motion';
import {
  formatWatchlistHistoryExport,
  formatWatchlistHistoryStats,
  readableAgentAnswerText,
  watchlistScoreTrend,
} from '../lib/watchlistHistory';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import { isAriaModalOpen, isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';
import {
  isWatchlistCopyKey,
  isWatchlistCopyJsonKey,
  isWatchlistDownloadCsvKey,
  isWatchlistDownloadDigestKey,
  isWatchlistDownloadJsonKey,
  isWatchlistDownloadMarkdownKey,
  isWatchlistDownloadStatsCsvKey,
  isWatchlistRunAllKey,
} from '../lib/keyboardShortcuts';
import {
  formatWatchlistBulkRunNotice,
  runActiveWatchlistItems,
} from '../lib/watchlistBulkRun';
import {
  WATCHLIST_INTERVALS,
  type WatchlistIntervalHours,
} from '../lib/watchlistIntervals';
import {
  formatWatchlistExport,
  formatWatchlistCsvExport,
  formatWatchlistItemCopy,
  formatWatchlistJsonExport,
  formatWatchlistLatestResultCopy,
  formatWatchlistQuestionCopy,
  formatWatchlistResultsDigest,
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
import { WatchlistStatsStrip } from '../components/WatchlistStatsStrip';

type WatchlistStatusFilter = 'all' | 'active' | 'paused';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<'pause_all' | 'resume_all' | null>(null);
  const [runAllNotice, setRunAllNotice] = useState<string | null>(null);
  const [runAllBusy, setRunAllBusy] = useState(false);
  const [cadenceBusyId, setCadenceBusyId] = useState<string | null>(null);
  const [runNowBusyId, setRunNowBusyId] = useState<string | null>(null);
  const [duplicateBusyId, setDuplicateBusyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteArmed, setBulkDeleteArmed] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [editingItem, setEditingItem] = useState<AgentWatchlistItem | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editLevel, setEditLevel] = useState('curious');
  const [editDomain, setEditDomain] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
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
  const [csvDownloadStatus, setCsvDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [jsonDownloadStatus, setJsonDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [jsonCopyStatus, setJsonCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [digestCopyStatus, setDigestCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [digestDownloadStatus, setDigestDownloadStatus] = useState<
    'idle' | 'done' | 'failed'
  >('idle');
  /** Per-card copy: which item id last acted, and which action. */
  const [itemCopyId, setItemCopyId] = useState<string | null>(null);
  const [itemCopyKind, setItemCopyKind] = useState<
    'watch' | 'question' | 'result' | null
  >(null);
  const [itemCopyStatus, setItemCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const itemCopyTimerRef = useRef<number | null>(null);
  /** Per-card latest-result share: which item last acted, and with what result. */
  const [latestShareBusyId, setLatestShareBusyId] = useState<string | null>(null);
  const [latestShareId, setLatestShareId] = useState<string | null>(null);
  const [latestShareStatus, setLatestShareStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const latestShareTimerRef = useRef<number | null>(null);
  const latestShareBusyRef = useRef(false);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [historyMoreBusyId, setHistoryMoreBusyId] = useState<string | null>(null);
  const [historyMoreError, setHistoryMoreError] = useState<string | null>(null);
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
  const [historyJsonDownloadStatus, setHistoryJsonDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [historyCsvDownloadStatus, setHistoryCsvDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  /** Inline per-run answer expansion: which run is open, plus copy feedback. */
  const [historyAnswerTaskId, setHistoryAnswerTaskId] = useState<string | null>(null);
  const [historyAnswerCopyStatus, setHistoryAnswerCopyStatus] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');
  const historyCopyTimerRef = useRef<number | null>(null);
  const historyDownloadTimerRef = useRef<number | null>(null);
  const historyJsonDownloadTimerRef = useRef<number | null>(null);
  const historyCsvDownloadTimerRef = useRef<number | null>(null);
  const historyAnswerCopyTimerRef = useRef<number | null>(null);
  const [stats, setStats] = useState<AgentWatchlistStatistics | null>(null);
  const [statsDownloadBusy, setStatsDownloadBusy] = useState(false);
  const [statsDownloadStatus, setStatsDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const statsDownloadTimerRef = useRef<number | null>(null);
  const historyCacheRef = useRef(historyCache);
  historyCacheRef.current = historyCache;
  /** Bumped whenever the history cache is replaced (forced reload / page
   * refresh) so an in-flight "load older runs" response cannot append stale
   * rows or stale total/has_more flags onto a refreshed cache. */
  const loadMoreEpochRef = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const editQuestionRef = useRef<HTMLTextAreaElement | null>(null);
  const editDialogRef = useRef<HTMLDivElement | null>(null);
  const editTriggerRef = useRef<HTMLElement | null>(null);
  const watchlistExportActionsRef = useRef<{
    copyWatchlist: () => Promise<void>;
    copyWatchlistJson: () => Promise<void>;
    downloadWatchlist: () => void;
    downloadWatchlistCsv: () => void;
    downloadWatchlistJson: () => void;
    downloadDigest: () => void;
    downloadStatsCsv: (() => Promise<void>) | null;
    runAllNow: (() => void) | null;
  } | null>(null);
  const runAllBusyRef = useRef(false);
  const statsDownloadBusyRef = useRef(false);
  const copyStatusTimerRef = useRef<number | null>(null);
  const downloadStatusTimerRef = useRef<number | null>(null);
  const csvDownloadStatusTimerRef = useRef<number | null>(null);
  const jsonDownloadStatusTimerRef = useRef<number | null>(null);
  const jsonCopyStatusTimerRef = useRef<number | null>(null);
  const jsonCopyBusyRef = useRef(false);
  const digestCopyStatusTimerRef = useRef<number | null>(null);
  const digestCopyBusyRef = useRef(false);
  const digestDownloadStatusTimerRef = useRef<number | null>(null);
  const digestDownloadBusyRef = useRef(false);
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
    loadMoreEpochRef.current += 1;
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
        setHistoryAnswerTaskId(null);
        setHistoryAnswerCopyStatus('idle');
        return;
      }
      setHistoryOpenId(itemId);
      setHistoryMoreError(null);
      setHistoryAnswerTaskId(null);
      setHistoryAnswerCopyStatus('idle');
      void loadWatchHistory(itemId);
    },
    [historyOpenId, loadWatchHistory],
  );

  const toggleHistoryAnswer = useCallback((taskId: string) => {
    setHistoryAnswerTaskId((current) => (current === taskId ? null : taskId));
    setHistoryAnswerCopyStatus('idle');
  }, []);

  const loadMoreWatchHistory = useCallback(
    async (itemId: string) => {
      if (historyMoreBusyId === itemId) return;
      const hist = historyCacheRef.current[itemId];
      if (!hist || hist.status !== 'ready') return;
      const lastRun = hist.data.items[hist.data.items.length - 1];
      if (!lastRun) return;
      const epoch = loadMoreEpochRef.current;
      setHistoryMoreBusyId(itemId);
      setHistoryMoreError(null);
      try {
        // Cursor-based paging keeps load-more stable when new runs land
        // between pages; the offset is a fallback if the cursor row is gone.
        const next = await getAgentWatchlistHistory(
          itemId,
          50,
          hist.data.items.length,
          lastRun.task_id,
        );
        setHistoryCache((prev) => {
          const current = prev[itemId];
          if (!current || current.status !== 'ready') return prev;
          if (loadMoreEpochRef.current !== epoch) return prev;
          const seen = new Set(current.data.items.map((run) => run.task_id));
          const appended = next.items.filter((run) => !seen.has(run.task_id));
          return {
            ...prev,
            [itemId]: {
              status: 'ready',
              data: {
                items: [...current.data.items, ...appended],
                stats: next.stats,
                total: next.total,
                has_more: next.has_more,
              },
            },
          };
        });
      } catch (e) {
        setHistoryMoreError(
          e instanceof ApiError ? e.message : 'Could not load older runs',
        );
      } finally {
        setHistoryMoreBusyId(null);
      }
    },
    [historyMoreBusyId],
  );

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getAgentWatchlistStatistics());
    } catch {
      setStats(null);
    }
  }, []);

  const load = useCallback(async () => {
    if (!canWatchlist) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    setStats(null);
    try {
      const data = await getAgentWatchlist();
      setItems(data.items);
      setActiveCount(data.active_count);
      setActiveCap(data.active_cap);
      setTotalCount(data.total);
      setBulkNotice(null);
      setLoadFailed(false);
      loadMoreEpochRef.current += 1;
      setHistoryCache({});
      setHistoryOpenId(null);
      setHistoryAnswerTaskId(null);
      setHistoryAnswerCopyStatus('idle');
      setHistoryMoreBusyId(null);
      setHistoryMoreError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load watchlist');
      setItems([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
      void refreshStats();
    }
  }, [canWatchlist, refreshStats]);

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

  useEffect(() => {
    if (!editingItem) return;
    editQuestionRef.current?.focus();
    editQuestionRef.current?.select();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      const trigger = editTriggerRef.current;
      if (trigger) {
        trigger.focus();
        editTriggerRef.current = null;
      }
    };
  }, [editingItem]);

  useEffect(() => {
    if (!editingItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!editBusy) {
          e.preventDefault();
          setEditingItem(null);
          setEditError(null);
        }
        return;
      }
      if (e.key !== 'Tab' || !editDialogRef.current) return;

      const nodes = Array.from(
        editDialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => {
        if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !editDialogRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !editDialogRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingItem, editBusy]);

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
      setBulkNotice(null);
      const updated = await patchAgentWatchlist(item.id, { is_active: !item.is_active });
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
      const data = await getAgentWatchlist();
      setActiveCount(data.active_count);
      setTotalCount(data.total);
      void refreshStats();
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

  const onRunNow = async (item: AgentWatchlistItem) => {
    if (runNowBusyId === item.id) return;
    setRunNowBusyId(item.id);
    setError(null);
    setBulkNotice(null);
    try {
      const result = await postAgentWatchlistRun(item.id);
      setItems((prev) => prev.map((x) => (x.id === item.id ? result.item : x)));
      setBulkNotice('Re-check started — the latest result will update shortly.');
      void refreshStats();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start this re-check');
    } finally {
      setRunNowBusyId(null);
    }
  };

  const onRunAllNow = async () => {
    if (runAllBusyRef.current || runAllBusy || activeCount === 0) return;
    // The ref guards against a double click / repeated Shift+R landing
    // before React re-renders with `runAllBusy` true.
    runAllBusyRef.current = true;
    setRunAllBusy(true);
    setRunAllNotice(null);
    setError(null);
    setBulkNotice(null);
    try {
      const result = await runActiveWatchlistItems(items, async (item) => {
        const started = await postAgentWatchlistRun(item.id);
        setItems((prev) =>
          prev.map((x) => (x.id === item.id ? started.item : x)),
        );
      });
      setRunAllNotice(formatWatchlistBulkRunNotice(result));
      if (result.started.length > 0) {
        void refreshStats();
      }
    } catch (e) {
      setRunAllNotice(
        e instanceof ApiError
          ? e.message
          : 'Could not run watches — check your connection and try again.',
      );
    } finally {
      runAllBusyRef.current = false;
      setRunAllBusy(false);
    }
  };

  const onDuplicate = async (item: AgentWatchlistItem) => {
    if (duplicateBusyId === item.id) return;
    setDuplicateBusyId(item.id);
    setError(null);
    setBulkNotice(null);
    try {
      const copy = await postAgentWatchlistDuplicate(item.id);
      setItems((prev) => [copy, ...prev.filter((x) => x.id !== copy.id)]);
      setTotalCount((prev) => prev + 1);
      setActiveCount((prev) => prev + (copy.is_active ? 1 : 0));
      // The copy is deliberately paused; if the user was looking only at
      // active watches, show the full list so the new copy is not invisible.
      setStatusFilter((current) => (current === 'active' ? 'all' : current));
      setBulkNotice('Duplicated watch — the paused copy is ready to edit or resume.');
      void refreshStats();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not duplicate this watch');
    } finally {
      setDuplicateBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    try {
      setError(null);
      setBulkNotice(null);
      await deleteAgentWatchlist(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setPendingDeleteId(null);
      const data = await getAgentWatchlist();
      setActiveCount(data.active_count);
      setTotalCount(data.total);
      void refreshStats();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setBulkDeleteArmed(false);
  };

  const onBulkDeleteSelected = async () => {
    if (bulkDeleteBusy || selectedIds.size === 0) return;
    if (!bulkDeleteArmed) {
      setBulkDeleteArmed(true);
      return;
    }
    const ids = [...selectedIds];
    setBulkDeleteBusy(true);
    setError(null);
    setBulkNotice(null);
    try {
      const result = await deleteAgentWatchlistBulk(ids);
      setItems((prev) => prev.filter((x) => !result.deleted_ids.includes(x.id)));
      setSelectedIds(new Set());
      setBulkDeleteArmed(false);
      const skipped = result.requested - result.deleted;
      setBulkNotice(
        skipped > 0
          ? `Removed ${result.deleted} of ${result.requested} selected ${
              result.requested === 1 ? 'watch' : 'watches'
            }; ${skipped} no longer existed.`
          : `Removed ${result.deleted} selected ${
              result.deleted === 1 ? 'watch' : 'watches'
            }.`,
      );
      const data = await getAgentWatchlist();
      setActiveCount(data.active_count);
      setTotalCount(data.total);
      void refreshStats();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Bulk delete failed');
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const openEdit = (item: AgentWatchlistItem, trigger: HTMLElement | null = null) => {
    setError(null);
    setEditError(null);
    setEditingItem(item);
    setEditQuestion(item.question);
    setEditLevel((item.expertise_level || 'curious').trim().toLowerCase() || 'curious');
    setEditDomain(item.expertise_domain || '');
    editTriggerRef.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  };

  const closeEdit = () => {
    if (editBusy) return;
    setEditingItem(null);
    setEditError(null);
  };

  const onEditSave = async () => {
    if (!editingItem || editBusy) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await patchAgentWatchlist(editingItem.id, {
        question: editQuestion,
        expertise_level: editLevel,
        expertise_domain: editDomain,
      });
      setItems((prev) => prev.map((x) => (x.id === editingItem.id ? updated : x)));
      setEditingItem(null);
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : 'Could not save changes');
    } finally {
      setEditBusy(false);
    }
  };

  const onBulkStatusChange = async (action: 'pause_all' | 'resume_all') => {
    if (bulkBusy) return;
    setBulkBusy(action);
    setError(null);
    setBulkNotice(null);
    try {
      const result = await patchAgentWatchlistBulk(action);
      const data = await getAgentWatchlist();
      setItems(data.items);
      setActiveCount(data.active_count);
      setActiveCap(data.active_cap);
      setTotalCount(data.total);
      if (action === 'pause_all') {
        setBulkNotice(`Paused ${result.applied} active watch${result.applied === 1 ? '' : 'es'}.`);
      } else if (result.skipped > 0) {
        setBulkNotice(
          `Resumed ${result.applied} paused watch${result.applied === 1 ? '' : 'es'}; ${result.skipped} stayed paused because the ${result.active_cap}-watch active cap is full.`,
        );
      } else {
        setBulkNotice(`Resumed ${result.applied} paused watch${result.applied === 1 ? '' : 'es'}.`);
      }
      void refreshStats();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Bulk watchlist update failed');
    } finally {
      setBulkBusy(null);
    }
  };

  const pausedCount = Math.max(0, totalCount - activeCount);

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
      if (csvDownloadStatusTimerRef.current != null) {
        window.clearTimeout(csvDownloadStatusTimerRef.current);
      }
      if (jsonDownloadStatusTimerRef.current != null) {
        window.clearTimeout(jsonDownloadStatusTimerRef.current);
      }
      if (jsonCopyStatusTimerRef.current != null) {
        window.clearTimeout(jsonCopyStatusTimerRef.current);
      }
      if (digestCopyStatusTimerRef.current != null) {
        window.clearTimeout(digestCopyStatusTimerRef.current);
      }
      if (digestDownloadStatusTimerRef.current != null) {
        window.clearTimeout(digestDownloadStatusTimerRef.current);
      }
      if (historyCopyTimerRef.current != null) {
        window.clearTimeout(historyCopyTimerRef.current);
      }
      if (itemCopyTimerRef.current != null) {
        window.clearTimeout(itemCopyTimerRef.current);
      }
      if (latestShareTimerRef.current != null) {
        window.clearTimeout(latestShareTimerRef.current);
      }
      if (historyDownloadTimerRef.current != null) {
        window.clearTimeout(historyDownloadTimerRef.current);
      }
      if (historyJsonDownloadTimerRef.current != null) {
        window.clearTimeout(historyJsonDownloadTimerRef.current);
      }
      if (historyCsvDownloadTimerRef.current != null) {
        window.clearTimeout(historyCsvDownloadTimerRef.current);
      }
      if (historyAnswerCopyTimerRef.current != null) {
        window.clearTimeout(historyAnswerCopyTimerRef.current);
      }
      if (statsDownloadTimerRef.current != null) {
        window.clearTimeout(statsDownloadTimerRef.current);
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

  const flashCsvDownloadStatus = (status: 'done' | 'failed') => {
    if (csvDownloadStatusTimerRef.current != null) {
      window.clearTimeout(csvDownloadStatusTimerRef.current);
    }
    setCsvDownloadStatus(status);
    csvDownloadStatusTimerRef.current = window.setTimeout(() => {
      setCsvDownloadStatus('idle');
      csvDownloadStatusTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  const flashJsonDownloadStatus = (status: 'done' | 'failed') => {
    if (jsonDownloadStatusTimerRef.current != null) {
      window.clearTimeout(jsonDownloadStatusTimerRef.current);
    }
    setJsonDownloadStatus(status);
    jsonDownloadStatusTimerRef.current = window.setTimeout(() => {
      setJsonDownloadStatus('idle');
      jsonDownloadStatusTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  const flashJsonCopyStatus = (status: 'copied' | 'failed') => {
    if (jsonCopyStatusTimerRef.current != null) {
      window.clearTimeout(jsonCopyStatusTimerRef.current);
    }
    setJsonCopyStatus(status);
    jsonCopyStatusTimerRef.current = window.setTimeout(() => {
      setJsonCopyStatus('idle');
      jsonCopyStatusTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  const flashDigestCopyStatus = (status: 'copied' | 'failed') => {
    if (digestCopyStatusTimerRef.current != null) {
      window.clearTimeout(digestCopyStatusTimerRef.current);
    }
    setDigestCopyStatus(status);
    digestCopyStatusTimerRef.current = window.setTimeout(() => {
      setDigestCopyStatus('idle');
      digestCopyStatusTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  const flashDigestDownloadStatus = (status: 'done' | 'failed') => {
    if (digestDownloadStatusTimerRef.current != null) {
      window.clearTimeout(digestDownloadStatusTimerRef.current);
    }
    setDigestDownloadStatus(status);
    digestDownloadStatusTimerRef.current = window.setTimeout(() => {
      setDigestDownloadStatus('idle');
      digestDownloadStatusTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  const flashStatsDownloadStatus = (status: 'done' | 'failed') => {
    if (statsDownloadTimerRef.current != null) {
      window.clearTimeout(statsDownloadTimerRef.current);
    }
    setStatsDownloadStatus(status);
    statsDownloadTimerRef.current = window.setTimeout(() => {
      setStatsDownloadStatus('idle');
      statsDownloadTimerRef.current = null;
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
    kind: 'watch' | 'question' | 'result',
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

  const flashLatestShare = (itemId: string, status: 'copied' | 'failed') => {
    if (latestShareTimerRef.current != null) {
      window.clearTimeout(latestShareTimerRef.current);
    }
    setLatestShareId(itemId);
    setLatestShareStatus(status);
    latestShareTimerRef.current = window.setTimeout(() => {
      setLatestShareStatus('idle');
      setLatestShareId(null);
      latestShareTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  /** Publish (once) and copy the latest completed result's public link. */
  const shareLatestResult = async (item: AgentWatchlistItem) => {
    const latest = item.latest_task;
    if (!latest || !latest.is_complete || latestShareBusyRef.current) return;

    let shareUrl = latest.share_url;
    if (!shareUrl) {
      latestShareBusyRef.current = true;
      setLatestShareBusyId(item.id);
      try {
        const share = await createAgentTaskShare(latest.task_id);
        shareUrl = share.shareUrl;
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id && entry.latest_task
              ? {
                  ...entry,
                  latest_task: {
                    ...entry.latest_task,
                    is_shared: true,
                    share_url: share.shareUrl,
                  },
                }
              : entry,
          ),
        );
      } catch (e) {
        flashLatestShare(item.id, 'failed');
        setError(
          e instanceof ApiError
            ? e.message
            : 'Could not share this result — open it in Agent and try again.',
        );
        return;
      } finally {
        latestShareBusyRef.current = false;
        setLatestShareBusyId(null);
      }
    }

    const absoluteUrl = `${window.location.origin}${shareUrl}`;
    const ok = await copyToClipboard(absoluteUrl);
    flashLatestShare(item.id, ok ? 'copied' : 'failed');
    if (!ok) {
      setError('Could not copy the share link — try opening the latest result and sharing there.');
    }
  };

  const copyWatchItem = async (
    item: AgentWatchlistItem,
    kind: 'watch' | 'question' | 'result',
  ) => {
    const text =
      kind === 'question'
        ? formatWatchlistQuestionCopy(item.question)
        : kind === 'result'
          ? formatWatchlistLatestResultCopy({
              question: item.question,
              title: item.latest_task?.title,
              finalAnswer: item.latest_task?.final_answer,
              finalScore: item.latest_task?.final_score,
              createdAt: item.latest_task?.created_at,
              taskId: item.latest_task?.task_id,
            })
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
          : kind === 'result'
            ? 'No completed answer to copy — open it in Agent for details.'
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
          : kind === 'result'
            ? 'Could not copy this result — try again.'
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

  const flashHistoryJsonDownloadStatus = (status: 'done' | 'failed') => {
    if (historyJsonDownloadTimerRef.current != null) {
      window.clearTimeout(historyJsonDownloadTimerRef.current);
    }
    setHistoryJsonDownloadStatus(status);
    historyJsonDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryJsonDownloadStatus('idle');
      historyJsonDownloadTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  const flashHistoryCsvDownloadStatus = (status: 'done' | 'failed') => {
    if (historyCsvDownloadTimerRef.current != null) {
      window.clearTimeout(historyCsvDownloadTimerRef.current);
    }
    setHistoryCsvDownloadStatus(status);
    historyCsvDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryCsvDownloadStatus('idle');
      historyCsvDownloadTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  const flashHistoryAnswerCopyStatus = (status: 'copied' | 'failed') => {
    if (historyAnswerCopyTimerRef.current != null) {
      window.clearTimeout(historyAnswerCopyTimerRef.current);
    }
    setHistoryAnswerCopyStatus(status);
    historyAnswerCopyTimerRef.current = window.setTimeout(() => {
      setHistoryAnswerCopyStatus('idle');
      historyAnswerCopyTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  const copyHistoryAnswer = async (run: AgentWatchlistHistoryRun) => {
    const text = readableAgentAnswerText(run.final_answer);
    if (!text) {
      flashHistoryAnswerCopyStatus('failed');
      setError('No answer recorded for this run yet.');
      return;
    }
    const ok = await copyToClipboard(text);
    flashHistoryAnswerCopyStatus(ok ? 'copied' : 'failed');
    if (!ok) {
      setError('Could not copy this answer — try again.');
    }
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

  const downloadWatchHistoryJson = async (question: string, itemId: string) => {
    const stem = `watch-history-${question.slice(0, 40) || itemId}`;
    try {
      const blob = await exportAgentWatchlistHistoryJson(itemId, 100);
      const ok = downloadBlobFile(blob, `${withDownloadDate(stem)}.json`);
      flashHistoryJsonDownloadStatus(ok ? 'done' : 'failed');
      if (!ok) setError('Could not download run history JSON — try again.');
    } catch (e) {
      flashHistoryJsonDownloadStatus('failed');
      setError(
        e instanceof ApiError
          ? e.message
          : 'Could not download run history JSON — try again.',
      );
    }
  };

  const downloadWatchHistoryCsv = async (question: string, itemId: string) => {
    const stem = `watch-history-${question.slice(0, 40) || itemId}`;
    try {
      const blob = await exportAgentWatchlistHistoryCsv(itemId, 100);
      const ok = downloadBlobFile(blob, `${withDownloadDate(stem)}.csv`);
      flashHistoryCsvDownloadStatus(ok ? 'done' : 'failed');
      if (!ok) setError('Could not download run history CSV — try again.');
    } catch (e) {
      flashHistoryCsvDownloadStatus('failed');
      setError(
        e instanceof ApiError
          ? e.message
          : 'Could not download run history CSV — try again.',
      );
    }
  };

  const buildWatchlistExportItems = () =>
    filteredItems.map((item) => ({
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
    }));

  const buildWatchlistFilterNote = () => {
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
    return filterBits.length > 0 ? filterBits.join(' · ') : undefined;
  };

  const buildWatchlistMarkdown = () => {
    return formatWatchlistExport({
      items: buildWatchlistExportItems(),
      activeCount,
      activeCap,
      filterNote: buildWatchlistFilterNote(),
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

  const downloadWatchlistCsv = () => {
    const csv = formatWatchlistCsvExport(buildWatchlistExportItems());
    const ok = downloadTextFile(csv, {
      filename: `${withDownloadDate('agent-watchlist')}.csv`,
      mimeType: 'text/csv;charset=utf-8',
    });
    if (ok) {
      flashCsvDownloadStatus('done');
    } else {
      flashCsvDownloadStatus('failed');
      setError('Could not download watchlist CSV — try Copy instead.');
    }
  };

  const downloadWatchlistJson = () => {
    const json = formatWatchlistJsonExport({
      items: buildWatchlistExportItems(),
      activeCount,
      activeCap,
      filterNote: buildWatchlistFilterNote(),
    });
    const ok = downloadTextFile(json, {
      filename: `${withDownloadDate('agent-watchlist')}.json`,
      mimeType: 'application/json;charset=utf-8',
    });
    if (ok) {
      flashJsonDownloadStatus('done');
    } else {
      flashJsonDownloadStatus('failed');
      setError('Could not download watchlist JSON — try again.');
    }
  };

  const copyWatchlistJson = async () => {
    if (jsonCopyBusyRef.current) return;
    jsonCopyBusyRef.current = true;
    try {
      const json = formatWatchlistJsonExport({
        items: buildWatchlistExportItems(),
        activeCount,
        activeCap,
        filterNote: buildWatchlistFilterNote(),
      });
      const ok = await copyToClipboard(json);
      flashJsonCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setError('Could not copy watchlist JSON — try Download .json instead.');
      }
    } catch {
      flashJsonCopyStatus('failed');
      setError('Could not copy watchlist JSON — try Download .json instead.');
    } finally {
      jsonCopyBusyRef.current = false;
    }
  };

  const buildWatchlistDigestItems = () =>
    filteredItems.map((item) => ({
      question: item.question,
      title: item.latest_task?.title,
      finalAnswer: item.latest_task?.final_answer,
      finalScore: item.latest_task?.final_score,
      createdAt: item.latest_task?.created_at,
      taskId: item.latest_task?.task_id,
      isComplete: item.latest_task?.is_complete,
    }));

  const copyWatchlistDigest = async () => {
    if (digestCopyBusyRef.current) return;
    digestCopyBusyRef.current = true;
    try {
      const digest = formatWatchlistResultsDigest({
        items: buildWatchlistDigestItems(),
        activeCount,
        activeCap,
        filterNote: buildWatchlistFilterNote(),
      });
      if (!digest) {
        flashDigestCopyStatus('failed');
        setError(
          'No completed results in this view — a digest needs at least one finished answer.',
        );
        return;
      }
      const ok = await copyToClipboard(digest);
      flashDigestCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setError('Could not copy the results digest — try again.');
      }
    } catch {
      flashDigestCopyStatus('failed');
      setError('Could not copy the results digest — try again.');
    } finally {
      digestCopyBusyRef.current = false;
    }
  };

  const downloadWatchlistDigest = () => {
    if (digestDownloadBusyRef.current) return;
    digestDownloadBusyRef.current = true;
    try {
      const digest = formatWatchlistResultsDigest({
        items: buildWatchlistDigestItems(),
        activeCount,
        activeCap,
        filterNote: buildWatchlistFilterNote(),
      });
      if (!digest) {
        flashDigestDownloadStatus('failed');
        setError(
          'No completed results in this view — a digest needs at least one finished answer.',
        );
        return;
      }
      const ok = downloadMarkdownFile(digest, 'agent-watchlist-digest');
      flashDigestDownloadStatus(ok ? 'done' : 'failed');
      if (!ok) {
        setError('Could not download the results digest — try Copy digest instead.');
      }
    } catch {
      flashDigestDownloadStatus('failed');
      setError('Could not download the results digest — try Copy digest instead.');
    } finally {
      digestDownloadBusyRef.current = false;
    }
  };

  const downloadStatsCsv = async () => {
    if (statsDownloadBusyRef.current) return;
    statsDownloadBusyRef.current = true;
    setStatsDownloadBusy(true);
    try {
      const blob = await exportAgentWatchlistStatisticsCsv();
      const ok = downloadBlobFile(blob, `${withDownloadDate('arena-watchlist-stats')}.csv`);
      flashStatsDownloadStatus(ok ? 'done' : 'failed');
      if (!ok) setError('Could not download watchlist statistics — try again.');
    } catch (e) {
      flashStatsDownloadStatus('failed');
      setError(
        e instanceof ApiError
          ? e.message
          : 'Could not download watchlist statistics — try again.',
      );
    } finally {
      statsDownloadBusyRef.current = false;
      setStatsDownloadBusy(false);
    }
  };

  // The header/overview export controls only exist once the list has loaded
  // (and the stats strip has data), so keep the keyboard actions inert until
  // their visible counterpart can be triggered.
  watchlistExportActionsRef.current =
    bodyMode === 'list' && items.length > 0
      ? {
          copyWatchlist,
          copyWatchlistJson,
          downloadWatchlist,
          downloadWatchlistCsv,
          downloadWatchlistJson,
          downloadDigest: downloadWatchlistDigest,
          downloadStatsCsv: stats ? downloadStatsCsv : null,
          runAllNow: activeCount > 0 && !runAllBusy ? onRunAllNow : null,
        }
      : null;

  // Keyboard-first watchlist actions: Shift+C / Shift+D / Shift+E / Shift+J /
  // Shift+M / Shift+O / Shift+F mirror the export buttons, and Shift+R starts
  // every active watch.
  // Form controls are skipped so normal Shift+letter typing is never
  // swallowed, and open dialogs keep ownership of their keystrokes. The
  // actions ref is only populated when the matching visible control is
  // available.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isAriaModalOpen()) return;
      if (!shouldCaptureSlashFocus(e.target)) return;
      const actions = watchlistExportActionsRef.current;
      if (!actions) return;
      if (isWatchlistCopyKey(e)) {
        e.preventDefault();
        void actions.copyWatchlist();
      } else if (isWatchlistCopyJsonKey(e)) {
        e.preventDefault();
        void actions.copyWatchlistJson();
      } else if (isWatchlistDownloadMarkdownKey(e)) {
        e.preventDefault();
        actions.downloadWatchlist();
      } else if (isWatchlistDownloadCsvKey(e)) {
        e.preventDefault();
        actions.downloadWatchlistCsv();
      } else if (isWatchlistDownloadJsonKey(e)) {
        e.preventDefault();
        actions.downloadWatchlistJson();
      } else if (isWatchlistDownloadDigestKey(e)) {
        e.preventDefault();
        actions.downloadDigest();
      } else if (isWatchlistDownloadStatsCsvKey(e)) {
        if (!actions.downloadStatsCsv) return;
        e.preventDefault();
        void actions.downloadStatsCsv();
      } else if (isWatchlistRunAllKey(e)) {
        if (!actions.runAllNow) return;
        e.preventDefault();
        actions.runAllNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
              onClick={() => void onRunAllNow()}
              disabled={runAllBusy || activeCount === 0}
              title={
                activeCount === 0
                  ? 'No active watches to run'
                  : `Run all ${activeCount} active watch${activeCount === 1 ? '' : 'es'} now (Shift+R)`
              }
              aria-keyshortcuts="Shift+R"
              aria-label={
                activeCount === 0
                  ? 'Run all watches now (none active)'
                  : `Run all ${activeCount} active watch${activeCount === 1 ? '' : 'es'} now`
              }
              className="watchlist-header-btn"
            >
              {runAllBusy ? 'Starting…' : `Run all (${activeCount})`}
            </button>
            <button
              type="button"
              onClick={() => void onBulkStatusChange('pause_all')}
              disabled={bulkBusy !== null || activeCount === 0}
              title={
                activeCount === 0
                  ? 'No active watches to pause'
                  : `Pause all ${activeCount} active watch${activeCount === 1 ? '' : 'es'}`
              }
              aria-label={
                activeCount === 0
                  ? 'Pause all watches (none active)'
                  : `Pause all ${activeCount} active watch${activeCount === 1 ? '' : 'es'}`
              }
              className="watchlist-header-btn"
            >
              {bulkBusy === 'pause_all' ? 'Pausing…' : `Pause all (${activeCount})`}
            </button>
            <button
              type="button"
              onClick={() => void onBulkStatusChange('resume_all')}
              disabled={bulkBusy !== null || pausedCount === 0}
              title={
                pausedCount === 0
                  ? 'No paused watches to resume'
                  : `Resume ${pausedCount} paused watch${pausedCount === 1 ? '' : 'es'} up to the active cap`
              }
              aria-label={
                pausedCount === 0
                  ? 'Resume paused watches (none paused)'
                  : `Resume ${pausedCount} paused watch${pausedCount === 1 ? '' : 'es'}`
              }
              className="watchlist-header-btn"
            >
              {bulkBusy === 'resume_all' ? 'Resuming…' : `Resume paused (${pausedCount})`}
            </button>
            {selectedIds.size > 0 ? (
              <button
                type="button"
                onClick={() => void onBulkDeleteSelected()}
                disabled={bulkDeleteBusy}
                title={
                  bulkDeleteArmed
                    ? `Confirm removing ${selectedIds.size} selected watch${selectedIds.size === 1 ? '' : 'es'}`
                    : `Remove ${selectedIds.size} selected watch${selectedIds.size === 1 ? '' : 'es'}`
                }
                aria-label={
                  bulkDeleteArmed
                    ? `Confirm remove ${selectedIds.size} selected watches`
                    : `Remove ${selectedIds.size} selected watches`
                }
                className={[
                  'watchlist-header-btn',
                  bulkDeleteArmed ? 'watchlist-header-btn--danger' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {bulkDeleteBusy
                  ? 'Removing…'
                  : bulkDeleteArmed
                    ? `Remove ${selectedIds.size}?`
                    : `Remove selected (${selectedIds.size})`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void copyWatchlist()}
              title="Copy current view as markdown (Shift+C)"
              aria-keyshortcuts="Shift+C"
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
              title="Download current view as markdown (Shift+D)"
              aria-keyshortcuts="Shift+D"
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
            <button
              type="button"
              onClick={() => downloadWatchlistCsv()}
              title="Download current view as CSV (Shift+E)"
              aria-keyshortcuts="Shift+E"
              aria-label={
                csvDownloadStatus === 'done'
                  ? 'Watchlist CSV downloaded'
                  : csvDownloadStatus === 'failed'
                    ? 'CSV download failed'
                    : 'Download watchlist as CSV'
              }
              className={[
                'watchlist-header-btn',
                csvDownloadStatus === 'done' ? 'watchlist-header-btn--ok' : '',
                csvDownloadStatus === 'failed' ? 'watchlist-header-btn--err' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {csvDownloadStatus === 'done'
                ? 'Downloaded'
                : csvDownloadStatus === 'failed'
                  ? 'Failed'
                  : 'Download .csv'}
            </button>
            <button
              type="button"
              onClick={() => downloadWatchlistJson()}
              title="Download current view as JSON (Shift+J)"
              aria-keyshortcuts="Shift+J"
              aria-label={
                jsonDownloadStatus === 'done'
                  ? 'Watchlist JSON downloaded'
                  : jsonDownloadStatus === 'failed'
                    ? 'JSON download failed'
                    : 'Download watchlist as JSON'
              }
              className={[
                'watchlist-header-btn',
                jsonDownloadStatus === 'done' ? 'watchlist-header-btn--ok' : '',
                jsonDownloadStatus === 'failed' ? 'watchlist-header-btn--err' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {jsonDownloadStatus === 'done'
                ? 'Downloaded'
                : jsonDownloadStatus === 'failed'
                  ? 'Failed'
                  : 'Download .json'}
            </button>
            <button
              type="button"
              onClick={() => void copyWatchlistJson()}
              title="Copy current view as JSON (Shift+O)"
              aria-keyshortcuts="Shift+O"
              aria-label={
                jsonCopyStatus === 'copied'
                  ? 'Watchlist JSON copied'
                  : jsonCopyStatus === 'failed'
                    ? 'JSON copy failed'
                    : 'Copy watchlist as JSON'
              }
              className={[
                'watchlist-header-btn',
                jsonCopyStatus === 'copied' ? 'watchlist-header-btn--ok' : '',
                jsonCopyStatus === 'failed' ? 'watchlist-header-btn--err' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {jsonCopyStatus === 'copied'
                ? 'Copied'
                : jsonCopyStatus === 'failed'
                  ? 'Copy failed'
                  : 'Copy .json'}
            </button>
            <button
              type="button"
              onClick={() => void copyWatchlistDigest()}
              title="Copy every completed latest result in this view as one markdown digest"
              aria-label={
                digestCopyStatus === 'copied'
                  ? 'Results digest copied'
                  : digestCopyStatus === 'failed'
                    ? 'Digest copy failed'
                    : 'Copy all completed results as a markdown digest'
              }
              className={[
                'watchlist-header-btn',
                digestCopyStatus === 'copied' ? 'watchlist-header-btn--ok' : '',
                digestCopyStatus === 'failed' ? 'watchlist-header-btn--err' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {digestCopyStatus === 'copied'
                ? 'Digest copied'
                : digestCopyStatus === 'failed'
                  ? 'Copy failed'
                  : 'Copy digest'}
            </button>
            <button
              type="button"
              onClick={() => downloadWatchlistDigest()}
              title="Download every completed latest result in this view as one markdown digest (Shift+M)"
              aria-keyshortcuts="Shift+M"
              aria-label={
                digestDownloadStatus === 'done'
                  ? 'Results digest downloaded'
                  : digestDownloadStatus === 'failed'
                    ? 'Digest download failed'
                    : 'Download all completed results as a markdown digest'
              }
              className={[
                'watchlist-header-btn',
                digestDownloadStatus === 'done' ? 'watchlist-header-btn--ok' : '',
                digestDownloadStatus === 'failed' ? 'watchlist-header-btn--err' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {digestDownloadStatus === 'done'
                ? 'Digest downloaded'
                : digestDownloadStatus === 'failed'
                  ? 'Download failed'
                  : 'Download digest'}
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
        {bulkNotice ? (
          <p role="status" className="watchlist-page__bulk-notice">
            {bulkNotice}
          </p>
        ) : null}
        {runAllNotice ? (
          <p role="status" className="watchlist-page__bulk-notice">
            {runAllNotice}
          </p>
        ) : null}

        {bodyMode === 'list' && items.length > 0 ? (
          <WatchlistStatsStrip
            stats={stats}
            downloadBusy={statsDownloadBusy}
            downloadStatus={statsDownloadStatus}
            onDownload={() => void downloadStatsCsv()}
          />
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
              const arenaQuestion = item.question.trim();
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
                  <label className="watchlist-item__select">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      aria-label={
                        selectedIds.has(item.id)
                          ? `Deselect "${item.question}" for bulk remove`
                          : `Select "${item.question}" for bulk remove`
                      }
                    />
                  </label>
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
                      <button
                        type="button"
                        onClick={(e) => openEdit(item, e.currentTarget)}
                        title="Edit the watched question and expertise settings"
                        aria-label={`Edit watch: ${item.question.slice(0, 80) || 'watched question'}`}
                        className="watchlist-link"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onRunNow(item)}
                        disabled={runNowBusyId === item.id}
                        title="Start an immediate re-check now"
                        aria-label={`Run now: ${item.question.slice(0, 80) || 'watched question'}`}
                        className="watchlist-link watchlist-link--accent"
                      >
                        {runNowBusyId === item.id ? 'Starting…' : 'Run now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDuplicate(item)}
                        disabled={duplicateBusyId === item.id}
                        title="Duplicate this watch as a paused copy"
                        aria-label={`Duplicate watch: ${item.question.slice(0, 80) || 'watched question'}`}
                        className="watchlist-link"
                      >
                        {duplicateBusyId === item.id ? 'Duplicating…' : 'Duplicate'}
                      </button>
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
                      {item.latest_task?.is_complete &&
                      readableAgentAnswerText(item.latest_task.final_answer) ? (
                        <button
                          type="button"
                          onClick={() => void copyWatchItem(item, 'result')}
                          title="Copy the latest completed research answer as markdown"
                          aria-label={`Copy latest result: ${item.question.slice(0, 80) || 'watched question'}`}
                          className={[
                            'watchlist-link',
                            'watchlist-link--accent',
                            itemCopyId === item.id &&
                            itemCopyKind === 'result' &&
                            itemCopyStatus === 'copied'
                              ? 'watchlist-link--ok'
                              : '',
                            itemCopyId === item.id &&
                            itemCopyKind === 'result' &&
                            itemCopyStatus === 'failed'
                              ? 'watchlist-link--err'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {itemCopyId === item.id &&
                          itemCopyKind === 'result' &&
                          itemCopyStatus === 'copied'
                            ? 'Result copied'
                            : itemCopyId === item.id &&
                                itemCopyKind === 'result' &&
                                itemCopyStatus === 'failed'
                              ? 'Copy failed'
                              : 'Copy result'}
                        </button>
                      ) : null}
                      {item.latest_task_id &&
                      item.latest_task &&
                      item.latest_task.is_complete ? (
                        <button
                          type="button"
                          onClick={() => void shareLatestResult(item)}
                          disabled={latestShareBusyId === item.id}
                          title={
                            item.latest_task.share_url
                              ? 'Copy the public link to the latest result'
                              : 'Publish and copy a public link to the latest result'
                          }
                          aria-label={`Share latest result: ${item.question.slice(0, 80) || 'watched question'}`}
                          className={[
                            'watchlist-link',
                            'watchlist-link--accent',
                            latestShareId === item.id &&
                            latestShareStatus === 'copied'
                              ? 'watchlist-link--ok'
                              : '',
                            latestShareId === item.id &&
                            latestShareStatus === 'failed'
                              ? 'watchlist-link--err'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {latestShareBusyId === item.id
                            ? 'Sharing…'
                            : latestShareId === item.id &&
                                latestShareStatus === 'copied'
                              ? 'Link copied'
                              : latestShareId === item.id &&
                                  latestShareStatus === 'failed'
                                ? 'Share failed'
                                : item.latest_task.share_url
                                  ? 'Copy result link'
                                  : 'Share result'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (arenaQuestion) {
                            navigate('/app', {
                              state: {
                                agentStressPrompt: arenaQuestion,
                                fromWatchlist: true,
                              },
                            });
                          }
                        }}
                        title="Open this watched question in Arena for fresh four-mind takes"
                        aria-label={`Ask in Arena: ${item.question.slice(0, 80) || 'watched question'}`}
                        className="watchlist-link watchlist-link--accent"
                      >
                        Ask in Arena →
                      </button>
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
                                    <button
                                      type="button"
                                      onClick={() => void downloadWatchHistoryJson(item.question, item.id)}
                                      title="Download run history as JSON"
                                      className={[
                                        'watchlist-history-btn',
                                        historyJsonDownloadStatus === 'done' ? 'watchlist-history-btn--ok' : '',
                                        historyJsonDownloadStatus === 'failed' ? 'watchlist-history-btn--err' : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    >
                                      {historyJsonDownloadStatus === 'done'
                                        ? 'Downloaded'
                                        : historyJsonDownloadStatus === 'failed'
                                          ? 'Failed'
                                          : '.json'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void downloadWatchHistoryCsv(item.question, item.id)}
                                      title="Download run history as CSV"
                                      aria-label={
                                        historyCsvDownloadStatus === 'done'
                                          ? 'Run history CSV downloaded'
                                          : historyCsvDownloadStatus === 'failed'
                                            ? 'Run history CSV download failed'
                                            : 'Download run history as CSV'
                                      }
                                      className={[
                                        'watchlist-history-btn',
                                        historyCsvDownloadStatus === 'done' ? 'watchlist-history-btn--ok' : '',
                                        historyCsvDownloadStatus === 'failed' ? 'watchlist-history-btn--err' : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                    >
                                      {historyCsvDownloadStatus === 'done'
                                        ? 'Downloaded'
                                        : historyCsvDownloadStatus === 'failed'
                                          ? 'Failed'
                                          : '.csv'}
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
                                    const runTitle = run.title?.trim() || 'Research run';
                                    const answerText = readableAgentAnswerText(run.final_answer);
                                    const hasAnswer = Boolean(answerText);
                                    const answerOpen = historyAnswerTaskId === run.task_id;
                                    return (
                                      <li key={run.task_id} className="watchlist-history__item">
                                        <div className="watchlist-history__run-wrap">
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
                                                {runTitle}
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
                                          {hasAnswer ? (
                                            <button
                                              type="button"
                                              onClick={() => toggleHistoryAnswer(run.task_id)}
                                              aria-expanded={answerOpen}
                                              aria-controls={`watch-history-answer-${run.task_id}`}
                                              aria-label={`${answerOpen ? 'Hide' : 'View'} answer for ${runTitle}`}
                                              className={[
                                                'watchlist-history__answer-toggle',
                                                answerOpen ? 'watchlist-history__answer-toggle--open' : '',
                                              ]
                                                .filter(Boolean)
                                                .join(' ')}
                                            >
                                              {answerOpen ? 'Hide answer' : 'Answer'}
                                            </button>
                                          ) : null}
                                        </div>
                                        {answerOpen ? (
                                          <div
                                            id={`watch-history-answer-${run.task_id}`}
                                            className="watchlist-history__answer"
                                          >
                                            <p className="watchlist-history__answer-text">
                                              {answerText || 'No answer recorded for this run yet.'}
                                            </p>
                                            <div className="watchlist-history__answer-actions">
                                              <button
                                                type="button"
                                                onClick={() => void copyHistoryAnswer(run)}
                                                aria-label={
                                                  historyAnswerCopyStatus === 'copied'
                                                    ? 'Answer copied'
                                                    : historyAnswerCopyStatus === 'failed'
                                                      ? 'Answer copy failed'
                                                      : 'Copy this run answer'
                                                }
                                                className={[
                                                  'watchlist-history__answer-btn',
                                                  historyAnswerCopyStatus === 'copied'
                                                    ? 'watchlist-history__answer-btn--ok'
                                                    : '',
                                                  historyAnswerCopyStatus === 'failed'
                                                    ? 'watchlist-history__answer-btn--err'
                                                    : '',
                                                ]
                                                  .filter(Boolean)
                                                  .join(' ')}
                                              >
                                                {historyAnswerCopyStatus === 'copied'
                                                  ? 'Copied'
                                                  : historyAnswerCopyStatus === 'failed'
                                                    ? 'Failed'
                                                    : 'Copy answer'}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  navigate(
                                                    `/agent?task_id=${encodeURIComponent(run.task_id)}`,
                                                  )
                                                }
                                                className="watchlist-history__answer-btn"
                                              >
                                                Open full report
                                              </button>
                                            </div>
                                          </div>
                                        ) : null}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                              {data.has_more && data.total > data.items.length ? (
                                <div className="watchlist-history__more">
                                  <button
                                    type="button"
                                    onClick={() => void loadMoreWatchHistory(item.id)}
                                    disabled={historyMoreBusyId === item.id}
                                    className="watchlist-link watchlist-link--accent"
                                  >
                                    {historyMoreBusyId === item.id
                                      ? 'Loading older runs…'
                                      : `Load older runs (${data.total - data.items.length} more)`}
                                  </button>
                                  {historyMoreError ? (
                                    <p className="watchlist-history__more-error">
                                      {historyMoreError}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
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

      {editingItem ? (
        <div
          className="watchlist-edit-overlay"
          onClick={editBusy ? undefined : closeEdit}
        >
          <div
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="watchlist-edit-title"
            aria-describedby="watchlist-edit-hint"
            aria-busy={editBusy}
            className="watchlist-edit-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="watchlist-edit-title" className="watchlist-edit-dialog__title">
              Edit watch
            </h2>
            <p id="watchlist-edit-hint" className="watchlist-edit-dialog__hint">
              Refining the question or expertise keeps run history intact.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void onEditSave();
              }}
            >
              <label
                htmlFor="watchlist-edit-question"
                className="watchlist-edit-dialog__label"
              >
                Watched question
              </label>
              <textarea
                id="watchlist-edit-question"
                ref={editQuestionRef}
                className="watchlist-edit-dialog__question"
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                maxLength={2000}
                rows={3}
                disabled={editBusy}
              />
              <div className="watchlist-edit-dialog__expertise">
                <ExpertiseSelector
                  level={editLevel}
                  domain={editDomain}
                  onChange={(level, domain) => {
                    setEditLevel(level);
                    setEditDomain(domain);
                  }}
                  disabled={editBusy}
                />
              </div>
              {editError ? (
                <p role="alert" className="watchlist-edit-dialog__error">
                  {editError}
                </p>
              ) : null}
              <div className="watchlist-edit-dialog__actions">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={editBusy}
                  className="watchlist-edit-dialog__cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editBusy || !editQuestion.trim()}
                  className="watchlist-edit-dialog__save"
                >
                  {editBusy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <KeyboardShortcutsHelp surface="watchlist" />
    </div>
  );
}
