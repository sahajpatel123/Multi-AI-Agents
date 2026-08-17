import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/memory-page.css';
import MicroLoader from '../components/MicroLoader';
import { EmptyState } from '../components/EmptyState';
import { MotionButton } from '../components/MotionButton';
import {
  ApiError,
  deleteMemorySummary,
  exportMemorySummaries,
  getMemorySummary,
  listMemorySummaries,
} from '../api';
import type { MemorySummary } from '../types';
import { useTier } from '../context/TierContext';
import { formatRelativePast } from '../lib/relativeTime';
import { prefersReducedMotion } from '../lib/motion';
import { isAriaModalOpen, isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';
import { downloadBlobFile } from '../lib/downloadTextFile';

const PER_PAGE = 20;

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

function personaName(personaId: string | null | undefined): string {
  if (!personaId) return '';
  return PERSONA_NAMES[personaId] || personaId;
}

function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'Session';
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
}

export function MemoryPage() {
  const navigate = useNavigate();
  const { canUseFeature } = useTier();
  const canMemory = canUseFeature('memory');
  const [rawSearch, setRawSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
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
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'json' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
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

  // Debounce the raw search box into the query actually sent to the API.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(rawSearch.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [rawSearch]);

  const loadPage = useCallback(
    async (page: number, append: boolean, query: string) => {
      if (append) {
        setLoadingMore(true);
        setLoadMoreError(null);
      } else {
        loadEpochRef.current += 1;
        setLoading(true);
        setError(null);
        setLoadMoreError(null);
        setExhausted(false);
      }
      const epoch = loadEpochRef.current;
      try {
        const data = await listMemorySummaries({ page, perPage: PER_PAGE, search: query });
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
            err instanceof ApiError ? err.message : 'Could not load older memories',
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
    [],
  );

  // Fresh list whenever the tier gate or debounced query changes.
  useEffect(() => {
    if (!canMemory) {
      setLoading(false);
      return;
    }
    setExpandedId(null);
    setDetailState({});
    setDeleteArmedId(null);
    void loadPage(1, false, searchQuery);
  }, [canMemory, searchQuery, loadPage]);

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
        setItems((prev) => prev.filter((x) => x.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
        if (expandedId === id) setExpandedId(null);
        setDeleteArmedId(null);
      } catch (err) {
        setDeleteError(err instanceof ApiError ? err.message : 'Could not delete summary');
      } finally {
        setDeleteBusyId(null);
      }
    },
    [expandedId],
  );

  const exportMemory = useCallback(
    async (format: 'csv' | 'json') => {
      if (exportingFormat) return;
      setExportingFormat(format);
      setExportError(null);
      try {
        const { blob, filename } = await exportMemorySummaries(format, { search: searchQuery });
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
    [exportingFormat, searchQuery],
  );

  const hasMore = !exhausted && items.length < total;

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

        {!loading && !error && total > 0 ? (
          <div className="memory-export" aria-label="Export memory summaries">
            <div className="memory-export__copy">
              <span className="memory-export__title">Take your memory with you</span>
              <span className="memory-export__note">
                {searchQuery ? `Exporting matches for “${searchQuery}”.` : 'Export all saved summaries.'}
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
            </div>
          </div>
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
                onClick={() => void loadPage(1, false, searchQuery)}
              >
                Try again
              </MotionButton>
            }
          />
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'No matching memories' : 'Nothing remembered yet'}
            description={
              searchQuery
                ? `No summary matches “${searchQuery}”. Try a different phrase.`
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
                    <span className="memory-card__category">{categoryLabel(item.dominant_category)}</span>
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
                                  {position.persona_id ? (
                                    <strong>{personaName(position.persona_id)}</strong>
                                  ) : null}
                                  {position.topic ? ` — ${position.topic}` : ''}
                                  {position.stance ? `: ${position.stance}` : ''}
                                </li>
                              ))}
                            </ul>
                          ) : null}
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
                  onClick={() => void loadPage(currentPage + 1, true, searchQuery)}
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
              onClick={() => void loadPage(currentPage + 1, true, searchQuery)}
            >
              Load older memories
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
