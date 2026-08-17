import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/memory-page.css';
import MicroLoader from '../components/MicroLoader';
import { EmptyState } from '../components/EmptyState';
import { MotionButton } from '../components/MotionButton';
import {
  ApiError,
  deleteMemorySummary,
  deleteMemorySummaries,
  exportMemorySummaries,
  getMemorySummary,
  listMemorySummaries,
  MEMORY_BULK_DELETE_MAX,
} from '../api';
import type { MemorySummary, MemorySummarySort } from '../types';
import { useTier } from '../context/TierContext';
import { formatRelativePast } from '../lib/relativeTime';
import { prefersReducedMotion } from '../lib/motion';
import { isAriaModalOpen, isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';
import { copyToClipboard } from '../lib/clipboard';
import { downloadBlobFile, downloadMarkdownFile } from '../lib/downloadTextFile';
import { PERSONAS } from '../data/personas';

const PER_PAGE = 20;
// `decision` is kept for summaries created by earlier classifiers; current
// Arena prompt classification uses the four categories above it.
const CATEGORY_OPTIONS = ['question', 'task', 'statement', 'debate', 'decision'] as const;

/** Persona display names for the `trusted_persona` field. The raw id stays the
 * source of truth; this is presentation-only with a graceful fallback. */
const PERSONA_NAMES: Record<string, string> = {
  analyst: 'The Analyst',
  philosopher: 'The Philosopher',
  pragmatist: 'The Pragmatist',
  contrarian: 'The Contrarian',
  scientist: 'The Scientist',
  historian: 'The Historian',
  economist: 'The Economist',
  ethicist: 'The Ethicist',
  stoic: 'The Stoic',
  futurist: 'The Futurist',
  strategist: 'The Strategist',
  engineer: 'The Engineer',
  optimist: 'The Optimist',
  empath: 'The Empath',
  firstprinciples: 'First Principles',
  devilsadvocate: "Devil's Advocate",
};

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: MemorySummary };

type CopyStatus = 'copied' | 'failed';
type DownloadStatus = 'downloaded' | 'failed';
type SelectionExportAction = 'copy' | 'download' | null;
type SelectionExportStatus = 'copied' | 'downloaded' | null;

function personaName(personaId: string | null | undefined): string {
  if (!personaId) return '';
  return PERSONA_NAMES[personaId] || personaId;
}

function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'Session';
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
}

function markdownInline(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\r\n|\r|\n|\u2028|\u2029/g, ' ')
    .replace(/\t/g, ' ')
    .trim();
}

function positionLabel(position: NonNullable<MemorySummary['key_positions_taken']>[number]): string {
  const persona = markdownInline(position.persona_id ? personaName(position.persona_id) : '');
  const topic = markdownInline(position.topic);
  const stance = markdownInline(position.stance);
  const confidence =
    position.confidence === null || position.confidence === undefined
      ? ''
      : ` (confidence ${markdownInline(position.confidence)}%)`;
  return `${persona}${topic ? ` — ${topic}` : ''}${stance ? `: ${stance}` : ''}${confidence}`.trim() || 'Unspecified position';
}

function memoryMarkdown(summary: MemorySummary): string {
  const topics = (Array.isArray(summary.main_topics) ? summary.main_topics : [])
    .map((topic) => markdownInline(topic))
    .filter(Boolean);
  const lines = [`# Arena memory — ${markdownInline(categoryLabel(summary.dominant_category))}`];
  const metadata = [
    summary.compressed_at ? `- Saved: ${markdownInline(summary.compressed_at)}` : '',
    `- Exchanges: ${summary.exchange_count}`,
    summary.preferred_depth ? `- Depth: ${markdownInline(summary.preferred_depth)}` : '',
    summary.trusted_persona
      ? `- Trusted mind: ${markdownInline(personaName(summary.trusted_persona))}`
      : '',
    topics.length > 0 ? `- Topics: ${topics.join(', ')}` : '',
  ].filter(Boolean);

  if (metadata.length > 0) lines.push('', ...metadata);
  lines.push('', '## Summary', summary.session_summary?.trim() || 'No summary text was saved.');

  if (summary.key_positions_taken && summary.key_positions_taken.length > 0) {
    lines.push('', '## Key positions', ...summary.key_positions_taken.map((position) => `- ${positionLabel(position)}`));
  }

  return lines.join('\n');
}

function memorySelectionMarkdown(summaries: MemorySummary[]): string {
  const sections = summaries.map((summary) => memoryMarkdown(summary).replace(/^# /, '## '));
  return [
    '# Arena selected memories',
    `- Memories: ${summaries.length}`,
    '',
    sections.join('\n\n'),
  ].join('\n');
}

function memoryFilterParams(
  search: string,
  category: string,
  personaId: string,
  fromDate: string,
  toDate: string,
  sort: MemorySummarySort,
) {
  return {
    search,
    ...(category ? { category } : {}),
    ...(personaId ? { personaId } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(sort !== 'newest' ? { sort } : {}),
  };
}

export function MemoryPage() {
  const navigate = useNavigate();
  const { canUseFeature } = useTier();
  const canMemory = canUseFeature('memory');
  const [rawSearch, setRawSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [personaFilter, setPersonaFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<MemorySummarySort>('newest');
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailState, setDetailState] = useState<Record<number, DetailState>>({});
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkDeleteArmed, setBulkDeleteArmed] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'json' | 'md' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectionExportAction, setSelectionExportAction] = useState<SelectionExportAction>(null);
  const [selectionExportStatus, setSelectionExportStatus] =
    useState<SelectionExportStatus>(null);
  const [selectionExportError, setSelectionExportError] = useState<string | null>(null);
  const [copyingSummaryId, setCopyingSummaryId] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<{ id: number; status: CopyStatus } | null>(null);
  const [downloadingSummaryId, setDownloadingSummaryId] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{
    id: number;
    status: DownloadStatus;
  } | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const downloadResetTimerRef = useRef<number | null>(null);
  const selectionExportRunRef = useRef(0);
  /** True once an "older memories" page comes back empty — deletions can
   * shift the server's offset so an empty page means we've rendered every
   * remaining row. Without this the button would keep offering (and fetching)
   * empty pages forever. */
  const [exhausted, setExhausted] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  /** Bumped on every fresh list fetch so a stale in-flight response can never
   * overwrite a newer search/refresh. */
  const loadEpochRef = useRef(0);
  const reducedMotion = prefersReducedMotion();

  const invalidateSelectionExport = useCallback(() => {
    selectionExportRunRef.current += 1;
    setSelectionExportAction(null);
    setSelectionExportStatus(null);
    setSelectionExportError(null);
  }, []);

  // Debounce the raw search box into the query actually sent to the API.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(rawSearch.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [rawSearch]);

  const loadPage = useCallback(
    async (
      page: number,
      append: boolean,
      query: string,
      category: string,
      personaId: string,
      fromDate: string,
      toDate: string,
      sort: MemorySummarySort,
    ) => {
      if (append) {
        setLoadingMore(true);
        setLoadMoreError(null);
      } else {
        loadEpochRef.current += 1;
        setLoading(true);
        // A fresh query supersedes any older-page request. Clear its busy
        // state immediately so stale pagination cannot disable the new view
        // while the filtered first page is still arriving.
        setLoadingMore(false);
        setError(null);
        setLoadMoreError(null);
        setExhausted(false);
        invalidateSelectionExport();
        setSelectedIds(new Set());
        setBulkDeleteArmed(false);
        setBulkDeleteError(null);
      }
      const epoch = loadEpochRef.current;
      try {
        const data = await listMemorySummaries({
          page,
          perPage: PER_PAGE,
          ...memoryFilterParams(query, category, personaId, fromDate, toDate, sort),
        });
        if (loadEpochRef.current !== epoch) return;
        setItems((prev) => (append ? [...prev, ...data.summaries] : data.summaries));
        setTotal(data.total);
        setCurrentPage(data.page);
        if (append && data.summaries.length === 0) {
          setExhausted(true);
        }
      } catch (err) {
        if (loadEpochRef.current !== epoch) return;
        if (append) {
          setLoadMoreError(
            err instanceof ApiError
              ? err.message
              : `Could not load ${sort === 'newest' ? 'older memories' : 'more memories'}`,
          );
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not load memory');
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (loadEpochRef.current === epoch) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [invalidateSelectionExport],
  );

  // Fresh list whenever the tier gate, filters, or ordering changes.
  useEffect(() => {
    if (!canMemory) {
      setLoading(false);
      return;
    }
    setExpandedId(null);
    setDetailState({});
    setDeleteArmedId(null);
    void loadPage(
      1,
      false,
      searchQuery,
      categoryFilter,
      personaFilter,
      fromDateFilter,
      toDateFilter,
      sortOrder,
    );
  }, [
    canMemory,
    searchQuery,
    categoryFilter,
    personaFilter,
    fromDateFilter,
    toDateFilter,
    sortOrder,
    loadPage,
  ]);

  // `/` focuses the search box when the user is not typing elsewhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isBareSlashKey(event) || !shouldCaptureSlashFocus(event.target)) return;
      if (isAriaModalOpen()) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleDetail = useCallback(
    async (item: MemorySummary) => {
      if (expandedId === item.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(item.id);
      const existing = detailState[item.id];
      if (existing && existing.status !== 'error') return;
      setDetailState((prev) => ({ ...prev, [item.id]: { status: 'loading' } }));
      try {
        const data = await getMemorySummary(item.id);
        setDetailState((prev) => ({ ...prev, [item.id]: { status: 'ready', data } }));
      } catch (err) {
        setDetailState((prev) => ({
          ...prev,
          [item.id]: {
            status: 'error',
            message: err instanceof ApiError ? err.message : 'Could not load summary',
          },
        }));
      }
    },
    [expandedId, detailState],
  );

  const confirmDelete = useCallback(
    async (id: number) => {
      setDeleteBusyId(id);
      setDeleteError(null);
      try {
        await deleteMemorySummary(id);
        invalidateSelectionExport();
        setItems((prev) => prev.filter((x) => x.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
        setSelectedIds((current) => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        if (expandedId === id) setExpandedId(null);
        setDeleteArmedId(null);
      } catch (err) {
        setDeleteError(err instanceof ApiError ? err.message : 'Could not delete summary');
      } finally {
        setDeleteBusyId(null);
      }
    },
    [expandedId, invalidateSelectionExport],
  );

  const exportMemory = useCallback(
    async (format: 'csv' | 'json' | 'md') => {
      if (exportingFormat) return;
      setExportingFormat(format);
      setExportError(null);
      try {
        const { blob, filename } = await exportMemorySummaries(
          format,
          memoryFilterParams(
            searchQuery,
            categoryFilter,
            personaFilter,
            fromDateFilter,
            toDateFilter,
            sortOrder,
          ),
        );
        if (!downloadBlobFile(blob, filename)) {
          setExportError(`Could not download memory as ${format.toUpperCase()} — try again.`);
        }
      } catch (err) {
        setExportError(
          err instanceof ApiError
            ? err.message
            : `Could not export memory as ${format.toUpperCase()} — try again.`,
        );
      } finally {
        setExportingFormat(null);
      }
    },
    [
      categoryFilter,
      exportingFormat,
      fromDateFilter,
      personaFilter,
      searchQuery,
      toDateFilter,
      sortOrder,
    ],
  );

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      if (downloadResetTimerRef.current !== null) {
        window.clearTimeout(downloadResetTimerRef.current);
      }
    },
    [],
  );

  const copySummary = useCallback(
    async (summary: MemorySummary) => {
      if (copyingSummaryId !== null) return;
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }

      setCopyingSummaryId(summary.id);
      setCopyStatus(null);
      let status: CopyStatus = 'failed';
      try {
        status = (await copyToClipboard(memoryMarkdown(summary))) ? 'copied' : 'failed';
      } catch {
        status = 'failed';
      } finally {
        setCopyingSummaryId(null);
        setCopyStatus({ id: summary.id, status });
        copyResetTimerRef.current = window.setTimeout(() => {
          setCopyStatus((current) => (current?.id === summary.id ? null : current));
          copyResetTimerRef.current = null;
        }, status === 'copied' ? 1800 : 2400);
      }
    },
    [copyingSummaryId],
  );

  const downloadSummary = useCallback(
    (summary: MemorySummary) => {
      if (downloadingSummaryId !== null) return;
      if (downloadResetTimerRef.current !== null) {
        window.clearTimeout(downloadResetTimerRef.current);
        downloadResetTimerRef.current = null;
      }

      setDownloadingSummaryId(summary.id);
      setDownloadStatus(null);
      let status: DownloadStatus = 'failed';
      try {
        status = downloadMarkdownFile(
          memoryMarkdown(summary),
          `arena-memory-summary-${summary.id}`,
        )
          ? 'downloaded'
          : 'failed';
      } catch {
        // Keep the action recoverable if a browser-specific download failure
        // escapes the helper's normal boolean return path.
        status = 'failed';
      } finally {
        setDownloadingSummaryId(null);
        setDownloadStatus({ id: summary.id, status });
        downloadResetTimerRef.current = window.setTimeout(() => {
          setDownloadStatus((current) => (current?.id === summary.id ? null : current));
          downloadResetTimerRef.current = null;
        }, status === 'downloaded' ? 1800 : 2400);
      }
    },
    [downloadingSummaryId],
  );

  const exportSelectedMemories = useCallback(
    async (action: Exclude<SelectionExportAction, null>) => {
      if (selectedIds.size === 0 || selectionExportAction) return;

      const selectedItems = items.filter((item) => selectedIds.has(item.id));
      if (selectedItems.length !== selectedIds.size) {
        setSelectionExportError('Refresh Memory before exporting selected memories.');
        return;
      }

      setSelectionExportAction(action);
      setSelectionExportStatus(null);
      setSelectionExportError(null);
      const runId = selectionExportRunRef.current + 1;
      selectionExportRunRef.current = runId;
      const isCurrentRun = () => selectionExportRunRef.current === runId;
      try {
        const detailedSummaries: MemorySummary[] = [];
        // Keep the detail hydration bounded so a large selection does not
        // create a burst of requests against the per-user memory limits.
        for (let index = 0; index < selectedItems.length; index += 5) {
          const batch = await Promise.all(
            selectedItems
              .slice(index, index + 5)
              .map((item) => getMemorySummary(item.id)),
          );
          if (!isCurrentRun()) return;
          detailedSummaries.push(...batch);
        }

        const markdown = memorySelectionMarkdown(detailedSummaries);
        if (action === 'copy') {
          const copied = await copyToClipboard(markdown);
          if (!isCurrentRun()) return;
          if (!copied) {
            setSelectionExportError('Could not copy selected memories — try again.');
            return;
          }
          setSelectionExportStatus('copied');
        } else {
          if (!isCurrentRun()) return;
          if (!downloadMarkdownFile(markdown, `arena-memory-selection-${detailedSummaries.length}`)) {
            setSelectionExportError('Could not download selected memories — try again.');
            return;
          }
          setSelectionExportStatus('downloaded');
        }
      } catch (err) {
        if (!isCurrentRun()) return;
        setSelectionExportError(
          err instanceof ApiError
            ? err.message
            : 'Could not prepare selected memories — try again.',
        );
      } finally {
        if (isCurrentRun()) setSelectionExportAction(null);
      }
    },
    [items, selectedIds, selectionExportAction],
  );

  const toggleSelected = useCallback((id: number) => {
    if (!selectedIds.has(id) && selectedIds.size >= MEMORY_BULK_DELETE_MAX) {
      setBulkDeleteError(
        `You can forget up to ${MEMORY_BULK_DELETE_MAX} memories at a time. Unselect some before selecting more.`,
      );
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkDeleteArmed(false);
    setBulkDeleteError(null);
    invalidateSelectionExport();
  }, [invalidateSelectionExport, selectedIds]);

  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));
  const selectionLimitReached = selectedIds.size >= MEMORY_BULK_DELETE_MAX;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (items.length > 0 && items.every((item) => current.has(item.id))) {
        items.forEach((item) => next.delete(item.id));
      } else {
        items.forEach((item) => {
          if (next.size < MEMORY_BULK_DELETE_MAX) next.add(item.id);
        });
      }
      return next;
    });
    const unselectedVisible = items.filter((item) => !selectedIds.has(item.id)).length;
    if (
      !allVisibleSelected &&
      unselectedVisible > Math.max(0, MEMORY_BULK_DELETE_MAX - selectedIds.size)
    ) {
      setBulkDeleteError(
        `You can forget up to ${MEMORY_BULK_DELETE_MAX} memories at a time. Unselect some before selecting more.`,
      );
    } else {
      setBulkDeleteError(null);
    }
    setBulkDeleteArmed(false);
    invalidateSelectionExport();
  }, [allVisibleSelected, invalidateSelectionExport, items, selectedIds]);

  const forgetSelected = useCallback(async () => {
    if (selectedIds.size === 0 || bulkDeleteBusy) return;
    setBulkDeleteBusy(true);
    setBulkDeleteError(null);
    try {
      const result = await deleteMemorySummaries(Array.from(selectedIds));
      const deletedIds = new Set(result.ids);
      setItems((current) => current.filter((item) => !deletedIds.has(item.id)));
      setTotal((current) => Math.max(0, current - result.deleted));
      if (expandedId !== null && deletedIds.has(expandedId)) setExpandedId(null);
      setSelectedIds(new Set());
      setBulkDeleteArmed(false);
      invalidateSelectionExport();
    } catch (err) {
      setBulkDeleteError(
        err instanceof ApiError ? err.message : 'Could not forget selected memories',
      );
    } finally {
      setBulkDeleteBusy(false);
    }
  }, [bulkDeleteBusy, expandedId, invalidateSelectionExport, selectedIds]);

  const hasActiveFilters = Boolean(categoryFilter || personaFilter || fromDateFilter || toDateFilter);

  const hasMore = !exhausted && items.length < total;
  const loadMoreLabel = sortOrder === 'newest' ? 'Load older memories' : 'Load more memories';

  if (!canMemory) {
    return (
      <div className={`memory-page memory-page--gate${reducedMotion ? ' memory-page--static' : ''}`}>
        <div className="memory-gate">
          <p className="memory-gate__kicker">
            <span className="memory-gate__kicker-dot" aria-hidden="true" />
            Plus feature
          </p>
          <h1 className="memory-gate__title">Memory</h1>
          <p className="memory-gate__body">
            Memory compresses each Arena session into what mattered — the topics you explored,
            the minds you trusted, and the positions you took. Browse, search, and manage it on
            Arena Plus and Pro.
          </p>
          <div className="memory-gate__actions">
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
    <div className={`memory-page${reducedMotion ? ' memory-page--static' : ''}`}>
      <header className="memory-page__header">
        <button
          type="button"
          className="memory-page__back"
          onClick={() => navigate('/agent')}
        >
          ← Agent
        </button>
        <div className="memory-page__title-block">
          <div className="memory-page__title-row">
            <h1 className="memory-page__title">Memory</h1>
            {!loading && <span className="memory-page__title-count">{total} saved</span>}
          </div>
          <p className="memory-page__lede">
            What Arena has learned across your sessions, compressed after each one ends.
          </p>
        </div>
      </header>

      <main className="memory-page__main">
        <div className="memory-search">
          <span className="memory-search__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={searchRef}
            type="search"
            className="memory-search__input"
            value={rawSearch}
            onChange={(event) => setRawSearch(event.target.value)}
            placeholder="Search what Arena remembers…"
            aria-label="Search memory summaries"
          />
          <kbd className="memory-search__hint" aria-hidden="true">
            /
          </kbd>
        </div>

        <div className="memory-filters" aria-label="Memory filters">
          <label className="memory-filter">
            <span className="memory-filter__label">Kind</span>
            <select
              className="memory-filter__select"
              aria-label="Filter memory by category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">All kinds</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="memory-filter">
            <span className="memory-filter__label">Trusted mind</span>
            <select
              className="memory-filter__select"
              aria-label="Filter memory by trusted mind"
              value={personaFilter}
              onChange={(event) => setPersonaFilter(event.target.value)}
            >
              <option value="">All minds</option>
              {PERSONAS.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name.replace(/^The\s+/i, '')}
                </option>
              ))}
            </select>
          </label>
          <label className="memory-filter memory-filter--date">
            <span className="memory-filter__label">From</span>
            <input
              className="memory-filter__date"
              type="date"
              aria-label="Filter memory from date"
              value={fromDateFilter}
              max={toDateFilter || undefined}
              onChange={(event) => setFromDateFilter(event.target.value)}
            />
          </label>
          <label className="memory-filter memory-filter--date">
            <span className="memory-filter__label">To</span>
            <input
              className="memory-filter__date"
              type="date"
              aria-label="Filter memory to date"
              value={toDateFilter}
              min={fromDateFilter || undefined}
              onChange={(event) => setToDateFilter(event.target.value)}
            />
          </label>
          <label className="memory-filter">
            <span className="memory-filter__label">Order</span>
            <select
              className="memory-filter__select"
              aria-label="Sort memory summaries"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as MemorySummarySort)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most_exchanges">Most exchanges</option>
              <option value="fewest_exchanges">Fewest exchanges</option>
            </select>
          </label>
          {hasActiveFilters ? (
            <button
              type="button"
              className="memory-filters__clear"
              onClick={() => {
                setCategoryFilter('');
                setPersonaFilter('');
                setFromDateFilter('');
                setToDateFilter('');
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {!loading && !error && total > 0 ? (
          <div className="memory-export" aria-label="Export memory summaries">
            <div className="memory-export__copy">
              <span className="memory-export__title">Take your memory with you</span>
              <span className="memory-export__note">
                {searchQuery || hasActiveFilters
                  ? 'Exporting the summaries that match your filters.'
                  : 'Export all saved summaries.'}
              </span>
            </div>
            <div className="memory-export__actions">
              <MotionButton
                type="button"
                variant="ghost"
                size="sm"
                loading={exportingFormat === 'csv'}
                disabled={Boolean(exportingFormat)}
                onClick={() => void exportMemory('csv')}
              >
                CSV
              </MotionButton>
              <MotionButton
                type="button"
                variant="ghost"
                size="sm"
                loading={exportingFormat === 'json'}
                disabled={Boolean(exportingFormat)}
                onClick={() => void exportMemory('json')}
              >
                JSON
              </MotionButton>
              <MotionButton
                type="button"
                variant="ghost"
                size="sm"
                loading={exportingFormat === 'md'}
                disabled={Boolean(exportingFormat)}
                onClick={() => void exportMemory('md')}
              >
                Markdown
              </MotionButton>
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="memory-selection" aria-label="Select memory summaries">
            <label className="memory-selection__toggle">
              <input
                type="checkbox"
                aria-label="Select all visible memories"
                checked={allVisibleSelected}
                disabled={Boolean(selectionExportAction)}
                onChange={toggleSelectAll}
              />
              <span>
                {selectedIds.size > 0
                  ? `${selectedIds.size} selected${selectionLimitReached ? ` · max ${MEMORY_BULK_DELETE_MAX}` : ''}`
                  : 'Select visible memories'}
              </span>
            </label>
            {selectedIds.size > 0 && !bulkDeleteArmed ? (
              <div className="memory-selection__actions">
                <MotionButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={selectionExportAction === 'copy'}
                  disabled={Boolean(selectionExportAction)}
                  aria-label={
                    selectionExportStatus === 'copied'
                      ? 'Selected memories copied'
                      : 'Copy selected memories'
                  }
                  onClick={() => void exportSelectedMemories('copy')}
                >
                  {selectionExportStatus === 'copied' ? 'Copied' : 'Copy selected'}
                </MotionButton>
                <MotionButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={selectionExportAction === 'download'}
                  disabled={Boolean(selectionExportAction)}
                  aria-label={
                    selectionExportStatus === 'downloaded'
                      ? 'Selected memories downloaded'
                      : 'Download selected memories'
                  }
                  onClick={() => void exportSelectedMemories('download')}
                >
                  {selectionExportStatus === 'downloaded' ? 'Downloaded' : 'Download Markdown'}
                </MotionButton>
                <MotionButton
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={Boolean(selectionExportAction)}
                  onClick={() => setBulkDeleteArmed(true)}
                >
                  Forget selected
                </MotionButton>
              </div>
            ) : null}
          </div>
        ) : null}

        {selectionExportError ? (
          <p className="memory-selection__error" role="alert">
            {selectionExportError}
          </p>
        ) : null}

        {bulkDeleteArmed ? (
          <div className="memory-bulk-confirm" role="alert">
            <p>
              Forget {selectedIds.size}{' '}
              {selectedIds.size === 1 ? 'selected memory' : 'selected memories'}? This cannot be
              undone.
            </p>
            <div className="memory-bulk-confirm__actions">
              <MotionButton
                type="button"
                variant="danger"
                size="sm"
                loading={bulkDeleteBusy}
                onClick={() => void forgetSelected()}
              >
                Forget {selectedIds.size} {selectedIds.size === 1 ? 'memory' : 'memories'}
              </MotionButton>
              <MotionButton
                type="button"
                variant="ghost"
                size="sm"
                disabled={bulkDeleteBusy}
                onClick={() => setBulkDeleteArmed(false)}
              >
                Cancel
              </MotionButton>
            </div>
          </div>
        ) : null}

        {bulkDeleteError ? (
          <p className="memory-page__error" role="alert">
            {bulkDeleteError}
          </p>
        ) : null}

        {exportError ? (
          <p className="memory-page__error memory-export__error" role="alert">
            {exportError}
          </p>
        ) : null}

        {deleteError ? (
          <p className="memory-page__error" role="alert">
            {deleteError}
          </p>
        ) : null}

        {loading && items.length === 0 ? (
          <div className="memory-page__loading" role="status" aria-live="polite">
            <MicroLoader label="Loading memory" cycleWords={false} />
          </div>
        ) : null}

        {!loading && error && items.length === 0 ? (
          <EmptyState
            title="Couldn't load memory"
            description={error}
            variant="error"
            alert
            actions={
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={() =>
                  void loadPage(
                    1,
                    false,
                    searchQuery,
                    categoryFilter,
                    personaFilter,
                    fromDateFilter,
                    toDateFilter,
                    sortOrder,
                  )
                }
              >
                Try again
              </MotionButton>
            }
          />
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState
            title={searchQuery || hasActiveFilters ? 'No matching memories' : 'Nothing remembered yet'}
            description={
                searchQuery || hasActiveFilters
                ? 'No summaries match these filters. Try a different combination.'
                : 'Finish an Arena session to let memory compress what mattered. Sessions are saved automatically on Plus.'
            }
            actions={
              searchQuery ? (
                <MotionButton
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setRawSearch('')}
                >
                  Clear search
                </MotionButton>
              ) : (
                <MotionButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => navigate('/app')}
                >
                  Open Arena
                </MotionButton>
              )
            }
          />
        ) : null}

        {items.length > 0 ? (
          <ul className="memory-list">
            {items.map((item) => {
              const detail = detailState[item.id];
              const isExpanded = expandedId === item.id;
              const isDeleteArmed = deleteArmedId === item.id;
              const isDeleteBusy = deleteBusyId === item.id;
              return (
                <li className="memory-card" key={item.id}>
                  <div className="memory-card__row">
                    <label className="memory-card__identity">
                      <input
                        type="checkbox"
                        aria-label={`Select memory summary ${item.id}`}
                        checked={selectedIds.has(item.id)}
                        disabled={
                          Boolean(selectionExportAction) ||
                          (!selectedIds.has(item.id) && selectionLimitReached)
                        }
                        onChange={() => toggleSelected(item.id)}
                      />
                      <span className="memory-card__category">
                        {categoryLabel(item.dominant_category)}
                      </span>
                    </label>
                    <span className="memory-card__meta">
                      {item.exchange_count} {item.exchange_count === 1 ? 'exchange' : 'exchanges'}
                      {item.preferred_depth ? ` · ${item.preferred_depth} depth` : ''}
                      {' · '}
                      {formatRelativePast(item.compressed_at, { fallback: 'sometime ago' })}
                    </span>
                  </div>

                  {item.main_topics.length > 0 ? (
                    <div className="memory-card__topics">
                      {item.main_topics.slice(0, 5).map((topic) => (
                        <span className="memory-card__topic" key={topic}>
                          {topic}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {item.trusted_persona ? (
                    <p className="memory-card__persona">
                      <span className="memory-card__persona-label">Trusted mind</span>
                      {personaName(item.trusted_persona)}
                    </p>
                  ) : null}

                  <div className="memory-card__actions">
                    <button
                      type="button"
                      className="memory-card__link"
                      aria-expanded={isExpanded}
                      aria-controls={`memory-detail-${item.id}`}
                      onClick={() => void toggleDetail(item)}
                    >
                      {isExpanded ? 'Hide summary' : 'Read summary'}
                    </button>
                    <button
                      type="button"
                      className="memory-card__link memory-card__link--danger"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteArmedId(isDeleteArmed ? null : item.id);
                      }}
                    >
                      {isDeleteArmed ? 'Keep' : 'Forget'}
                    </button>
                  </div>

                  {isDeleteArmed ? (
                    <div className="memory-card__confirm" role="alert">
                      <p>Forget this memory? This removes the summary and cannot be undone.</p>
                      <div className="memory-card__confirm-actions">
                        <MotionButton
                          type="button"
                          variant="danger"
                          size="sm"
                          loading={isDeleteBusy}
                          onClick={() => void confirmDelete(item.id)}
                        >
                          Remove
                        </MotionButton>
                        <MotionButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isDeleteBusy}
                          onClick={() => setDeleteArmedId(null)}
                        >
                          Cancel
                        </MotionButton>
                      </div>
                    </div>
                  ) : null}

                  {isExpanded ? (
                    <div className="memory-card__detail" id={`memory-detail-${item.id}`}>
                      {!detail || detail.status === 'loading' ? (
                        <p className="memory-card__detail-note" role="status">
                          Loading summary…
                        </p>
                      ) : detail.status === 'error' ? (
                        <p className="memory-card__detail-note" role="alert">
                          {detail.message}
                        </p>
                      ) : (
                        <>
                          {detail.data.session_summary ? (
                            <p className="memory-card__summary">{detail.data.session_summary}</p>
                          ) : (
                            <p className="memory-card__detail-note">No summary text was saved.</p>
                          )}
                          {detail.data.key_positions_taken &&
                          detail.data.key_positions_taken.length > 0 ? (
                            <ul className="memory-card__positions">
                              {detail.data.key_positions_taken.map((position, index) => (
                                <li key={`${position.topic || index}-${index}`}>
                                  {position.persona_id ? <strong>{personaName(position.persona_id)}</strong> : null}
                                  {position.topic ? ` — ${position.topic}` : ''}
                                  {position.stance ? `: ${position.stance}` : ''}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="memory-card__detail-actions">
                            <MotionButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={copyingSummaryId === item.id}
                              disabled={copyingSummaryId !== null}
                              aria-label={
                                copyStatus?.id === item.id && copyStatus.status === 'failed'
                                  ? 'Copy failed'
                                  : copyStatus?.id === item.id && copyStatus.status === 'copied'
                                    ? 'Summary copied'
                                    : 'Copy summary'
                              }
                              onClick={() => void copySummary(detail.data)}
                            >
                              {copyStatus?.id === item.id && copyStatus.status === 'failed'
                                ? 'Copy failed'
                                : copyStatus?.id === item.id && copyStatus.status === 'copied'
                                  ? 'Copied'
                                  : 'Copy summary'}
                            </MotionButton>
                            <MotionButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              loading={downloadingSummaryId === item.id}
                              disabled={downloadingSummaryId !== null}
                              aria-label={
                                downloadStatus?.id === item.id && downloadStatus.status === 'failed'
                                  ? 'Download failed'
                                  : downloadStatus?.id === item.id && downloadStatus.status === 'downloaded'
                                    ? 'Summary downloaded'
                                    : 'Download Markdown'
                              }
                              onClick={() => downloadSummary(detail.data)}
                            >
                              {downloadStatus?.id === item.id && downloadStatus.status === 'failed'
                                ? 'Download failed'
                                : downloadStatus?.id === item.id && downloadStatus.status === 'downloaded'
                                  ? 'Downloaded'
                                  : 'Download Markdown'}
                            </MotionButton>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {hasMore ? (
          <div className="memory-page__more">
            {loadMoreError ? (
              <div className="memory-page__more-error" role="alert">
                <span>{loadMoreError}</span>
                <MotionButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() =>
                    void loadPage(
                      currentPage + 1,
                      true,
                      searchQuery,
                      categoryFilter,
                      personaFilter,
                      fromDateFilter,
                      toDateFilter,
                      sortOrder,
                    )
                  }
                >
                  Try again
                </MotionButton>
              </div>
            ) : null}
            <MotionButton
              type="button"
              variant="secondary"
              size="md"
              loading={loadingMore}
              disabled={loading}
              onClick={() =>
                void loadPage(
                  currentPage + 1,
                  true,
                  searchQuery,
                  categoryFilter,
                  personaFilter,
                  fromDateFilter,
                  toDateFilter,
                  sortOrder,
                )
              }
            >
              {loadMoreLabel}
            </MotionButton>
          </div>
        ) : null}

        <p className="memory-page__privacy">
          Memory stays on your account. Forgetting a summary removes it permanently.
        </p>
      </main>
    </div>
  );
}

export default MemoryPage;
