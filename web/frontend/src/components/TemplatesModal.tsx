import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutTemplate } from 'lucide-react';
import type { AgentTaskTemplate } from '../api';
import { ConduraBadge } from './ConduraBadge';
import { EmptyState } from './EmptyState';
import { HighlightQuery } from './HighlightQuery';
import { MotionButton } from './MotionButton';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { motionDuration, prefersReducedMotion } from '../lib/motion';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import {
  formatTemplatesExport,
  formatTemplatesItemCopy,
  formatTemplatesPromptCopy,
} from '../lib/templatesExport';
import { templatesListBodyMode } from '../lib/templatesListView';
import {
  TEMPLATES_SORT_OPTIONS,
  sortTemplates,
  templatesSortLabel,
  type TemplatesSort,
} from '../lib/templatesSort';
import {
  TEMPLATES_AVAILABILITY_OPTIONS,
  filterTemplatesByAvailability,
  templatesAvailabilityFilterUseful,
  templatesAvailabilityLabel,
  type TemplatesAvailability,
} from '../lib/templatesAvailabilityFilter';
import {
  TEMPLATES_EXPERTISE_ALL,
  collectTemplatesExpertiseOptions,
  filterTemplatesByExpertise,
  templatesExpertiseFilterUseful,
  templatesExpertiseLabel,
  type TemplatesExpertiseFilter,
} from '../lib/templatesExpertiseFilter';
import {
  clearRecentTemplateIds,
  loadRecentTemplateIds,
  pickRecentTemplates,
  recordRecentTemplateId,
  templatesRecentUseful,
} from '../lib/templatesRecent';
import '../styles/templates-modal.css';

const TAB_ORDER = [
  'All',
  'Business',
  'Technical',
  'Finance',
  'Research',
  'Policy',
  'Personal',
  'Analysis',
  'On device',
] as const;

type TabId = (typeof TAB_ORDER)[number];

type TemplatesModalProps = {
  open: boolean;
  closing: boolean;
  categories: Record<string, AgentTaskTemplate[]>;
  onClose: () => void;
  onSelect: (t: AgentTaskTemplate) => void;
  /** True while the first (or retry) fetch is in flight. */
  loading?: boolean;
  /** True when the last fetch failed — must not look like an empty catalog. */
  loadFailed?: boolean;
  onRetryLoad?: () => void;
};

export function TemplatesModal({
  open,
  closing,
  categories,
  onClose,
  onSelect,
  loading = false,
  loadFailed = false,
  onRetryLoad,
}: TemplatesModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [templatesSort, setTemplatesSort] = useState<TemplatesSort>('default');
  const [availabilityFilter, setAvailabilityFilter] =
    useState<TemplatesAvailability>('all');
  const [expertiseFilter, setExpertiseFilter] =
    useState<TemplatesExpertiseFilter>(TEMPLATES_EXPERTISE_ALL);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  /** Per-card copy: template id + kind. */
  const [itemCopyId, setItemCopyId] = useState<string | null>(null);
  const [itemCopyKind, setItemCopyKind] = useState<'full' | 'prompt' | null>(null);
  const [itemCopyStatus, setItemCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentTemplateIds());
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const downloadTimerRef = useRef<number | null>(null);
  const itemCopyTimerRef = useRef<number | null>(null);
  const visible = open || closing;
  const reducedMotion = prefersReducedMotion();

  const flatTemplates = useMemo(() => {
    const out: AgentTaskTemplate[] = [];
    for (const list of Object.values(categories)) {
      for (const t of list) out.push(t);
    }
    return out;
  }, [categories]);

  const tabTemplates = useMemo(() => {
    if (activeTab === 'All') return flatTemplates;
    return categories[activeTab] ?? [];
  }, [activeTab, categories, flatTemplates]);

  const visibleTemplates = useMemo(() => {
    const byAvailability = filterTemplatesByAvailability(tabTemplates, availabilityFilter);
    const byExpertise = filterTemplatesByExpertise(byAvailability, expertiseFilter);
    const searched = filterBySearchQuery(byExpertise, searchQuery, (t) => [
      t.title,
      t.description,
      t.category,
      t.example,
      t.prompt_template,
      t.id,
      t.default_expertise,
    ]);
    return sortTemplates(searched, templatesSort, recentIds);
  }, [
    tabTemplates,
    searchQuery,
    templatesSort,
    availabilityFilter,
    expertiseFilter,
    recentIds,
  ]);

  const recentStrip = useMemo(
    () => pickRecentTemplates(flatTemplates, recentIds, 6),
    [flatTemplates, recentIds],
  );

  const showAvailabilityFilter = useMemo(
    () => templatesAvailabilityFilterUseful(flatTemplates),
    [flatTemplates],
  );

  const expertiseOptions = useMemo(
    () => collectTemplatesExpertiseOptions(flatTemplates),
    [flatTemplates],
  );

  const showExpertiseFilter = useMemo(
    () => templatesExpertiseFilterUseful(flatTemplates),
    [flatTemplates],
  );

  const catalogMode = templatesListBodyMode({
    loading,
    loadFailed,
    itemCount: flatTemplates.length,
  });

  const showRecentStrip =
    catalogMode === 'list' &&
    templatesRecentUseful(recentIds) &&
    recentStrip.length > 0 &&
    !searchQuery.trim() &&
    activeTab === 'All' &&
    availabilityFilter === 'all' &&
    expertiseFilter === TEMPLATES_EXPERTISE_ALL;

  const selectTemplate = useCallback(
    (t: AgentTaskTemplate) => {
      if (t.disabled) return;
      if (t.id) {
        setRecentIds(recordRecentTemplateId(t.id));
      }
      onSelect(t);
      onClose();
    },
    [onSelect, onClose],
  );

  useEffect(() => {
    if (open) {
      setActiveTab('All');
      setSearchQuery('');
      setTemplatesSort('default');
      setAvailabilityFilter('all');
      setExpertiseFilter(TEMPLATES_EXPERTISE_ALL);
      setCopyStatus('idle');
      setDownloadStatus('idle');
      setItemCopyStatus('idle');
      setItemCopyId(null);
      setItemCopyKind(null);
      setRecentIds(loadRecentTemplateIds());
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      if (downloadTimerRef.current != null) window.clearTimeout(downloadTimerRef.current);
      if (itemCopyTimerRef.current != null) window.clearTimeout(itemCopyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  const buildTemplatesMarkdown = useCallback(() => {
    const bits: string[] = [];
    if (activeTab !== 'All') bits.push(`category ${activeTab}`);
    if (availabilityFilter !== 'all') {
      bits.push(`availability: ${templatesAvailabilityLabel(availabilityFilter)}`);
    }
    if (expertiseFilter !== TEMPLATES_EXPERTISE_ALL) {
      bits.push(`expertise: ${templatesExpertiseLabel(expertiseFilter, expertiseOptions)}`);
    }
    const q = searchQuery.trim();
    if (q) bits.push(`search “${q}”`);
    if (templatesSort !== 'default') bits.push(`sort: ${templatesSortLabel(templatesSort)}`);
    return formatTemplatesExport({
      totalCount: flatTemplates.length,
      filterNote: bits.length > 0 ? bits.join(' · ') : undefined,
      items: visibleTemplates.map((t) => ({
        title: t.title,
        category: t.category,
        description: t.description,
        example: t.example,
        promptTemplate: t.prompt_template,
        slots: t.slots,
        expertise: t.default_expertise,
        id: t.id,
        disabled: t.disabled,
        disabledReason: t.disabled_reason,
      })),
    });
  }, [activeTab, searchQuery, templatesSort, availabilityFilter, expertiseFilter, expertiseOptions, flatTemplates.length, visibleTemplates]);

  const handleCopyTemplates = useCallback(() => {
    const md = buildTemplatesMarkdown();
    void copyToClipboard(md).then((ok) => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      setCopyStatus(ok ? 'copied' : 'failed');
      const hold = motionDuration(ok ? 2000 : 2800);
      copyTimerRef.current = window.setTimeout(() => {
        setCopyStatus('idle');
        copyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    });
  }, [buildTemplatesMarkdown]);

  const copyTemplateItem = useCallback(async (t: AgentTaskTemplate, kind: 'full' | 'prompt') => {
    const text =
      kind === 'prompt'
        ? formatTemplatesPromptCopy(t.prompt_template)
        : formatTemplatesItemCopy({
            title: t.title,
            category: t.category,
            description: t.description,
            example: t.example,
            promptTemplate: t.prompt_template,
            slots: t.slots,
            expertise: t.default_expertise,
            id: t.id,
            disabled: t.disabled,
            disabledReason: t.disabled_reason,
          });
    if (!text) {
      setItemCopyId(t.id);
      setItemCopyKind(kind);
      setItemCopyStatus('failed');
      return;
    }
    const ok = await copyToClipboard(text);
    if (itemCopyTimerRef.current != null) window.clearTimeout(itemCopyTimerRef.current);
    setItemCopyId(t.id);
    setItemCopyKind(kind);
    setItemCopyStatus(ok ? 'copied' : 'failed');
    const hold = motionDuration(ok ? 2000 : 2800);
    itemCopyTimerRef.current = window.setTimeout(() => {
      setItemCopyStatus('idle');
      setItemCopyId(null);
      setItemCopyKind(null);
      itemCopyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  }, []);

  const handleDownloadTemplates = useCallback(() => {
    const md = buildTemplatesMarkdown();
    const ok = downloadMarkdownFile(md, 'agent-task-templates');
    if (downloadTimerRef.current != null) window.clearTimeout(downloadTimerRef.current);
    setDownloadStatus(ok ? 'done' : 'failed');
    const hold = motionDuration(ok ? 2000 : 2800);
    downloadTimerRef.current = window.setTimeout(() => {
      setDownloadStatus('idle');
      downloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  }, [buildTemplatesMarkdown]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      // Prefer search for power users once the panel is open.
      if (searchRef.current) {
        searchRef.current.focus();
      } else {
        closeBtnRef.current?.focus();
      }
    }, 40);
    return () => window.clearTimeout(id);
  }, [open]);

  const handleOverlayPointerDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const overlayClass = [
    'templates-modal-overlay',
    reducedMotion
      ? 'templates-modal-overlay--static'
      : closing
        ? 'templates-modal-overlay--out'
        : 'templates-modal-overlay--in',
  ].join(' ');
  const panelClass = [
    'templates-modal-panel',
    reducedMotion
      ? 'templates-modal-panel--static'
      : closing
        ? 'templates-modal-panel--out'
        : 'templates-modal-panel--in',
  ].join(' ');

  return createPortal(
    <div
      role="presentation"
      className={overlayClass}
      onMouseDown={handleOverlayPointerDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="templates-modal-title"
        className={panelClass}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="templates-modal__header">
          <div className="templates-modal__title-wrap">
            <span className="templates-modal__mark" aria-hidden>
              <LayoutTemplate strokeWidth={1.75} />
            </span>
            <h2 id="templates-modal-title" className="templates-modal__title">
              Task templates
            </h2>
          </div>
          <div className="templates-modal__header-actions">
            {catalogMode === 'list' && flatTemplates.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => handleCopyTemplates()}
                  title="Copy visible templates as markdown"
                  aria-label={
                    copyStatus === 'copied'
                      ? 'Templates copied'
                      : copyStatus === 'failed'
                        ? 'Copy failed'
                        : 'Copy templates as markdown'
                  }
                  className={[
                    'templates-toolbar-btn',
                    copyStatus === 'failed'
                      ? 'templates-toolbar-btn--danger'
                      : copyStatus === 'copied'
                        ? 'templates-toolbar-btn--ok'
                        : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {copyStatus === 'copied'
                    ? 'Copied'
                    : copyStatus === 'failed'
                      ? 'Failed'
                      : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplates()}
                  title="Download visible templates as markdown"
                  aria-label={
                    downloadStatus === 'done'
                      ? 'Templates downloaded'
                      : downloadStatus === 'failed'
                        ? 'Download failed'
                        : 'Download templates as markdown'
                  }
                  className={[
                    'templates-toolbar-btn',
                    downloadStatus === 'failed'
                      ? 'templates-toolbar-btn--danger'
                      : downloadStatus === 'done'
                        ? 'templates-toolbar-btn--ok'
                        : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {downloadStatus === 'done'
                    ? 'Downloaded'
                    : downloadStatus === 'failed'
                      ? 'Failed'
                      : 'Download'}
                </button>
              </>
            ) : null}
            <button
              ref={closeBtnRef}
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="icon-close-btn"
            >
              ×
            </button>
          </div>
        </div>
        {copyStatus === 'failed' || downloadStatus === 'failed' ? (
          <p role="alert" className="templates-modal__alert">
            {copyStatus === 'failed'
              ? 'Could not copy templates — try Download instead.'
              : 'Could not download templates — try Copy instead.'}
          </p>
        ) : null}

        <div className="templates-modal__toolbar">
          <div className="templates-modal__search-row">
            <div className="templates-modal__search-wrap">
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates…"
                aria-label="Search task templates"
                autoComplete="off"
                className="templates-modal__search"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="templates-modal__search-clear"
                  aria-label="Clear template search"
                  onClick={() => {
                    setSearchQuery('');
                    searchRef.current?.focus();
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
            {flatTemplates.length > 1 ? (
              <select
                value={templatesSort}
                onChange={(e) => setTemplatesSort(e.target.value as TemplatesSort)}
                aria-label="Sort templates"
                title="Sort templates"
                className="templates-modal__sort"
              >
                {TEMPLATES_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {showAvailabilityFilter ? (
            <div
              role="group"
              aria-label="Filter templates by availability"
              className="templates-modal__chips"
            >
              {TEMPLATES_AVAILABILITY_OPTIONS.map((opt) => {
                const selected = availabilityFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAvailabilityFilter(opt.value)}
                    aria-pressed={selected}
                    className={`templates-modal__chip${selected ? ' templates-modal__chip--active' : ''}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {showExpertiseFilter ? (
            <div
              role="group"
              aria-label="Filter templates by expertise"
              className="templates-modal__chips"
            >
              {expertiseOptions.map((opt) => {
                const selected = expertiseFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExpertiseFilter(opt.value)}
                    aria-pressed={selected}
                    className={`templates-modal__chip${selected ? ' templates-modal__chip--active' : ''}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {(searchQuery.trim() ||
            activeTab !== 'All' ||
            templatesSort !== 'default' ||
            availabilityFilter !== 'all' ||
            expertiseFilter !== TEMPLATES_EXPERTISE_ALL) && (
            <p className="templates-modal__match">
              {visibleTemplates.length} match
              {visibleTemplates.length === 1 ? '' : 'es'}
              {activeTab !== 'All' ? ` in ${activeTab}` : ''}
              {searchQuery.trim() ? ` for “${searchQuery.trim()}”` : ''}
              {availabilityFilter !== 'all'
                ? ` · ${templatesAvailabilityLabel(availabilityFilter)}`
                : ''}
              {expertiseFilter !== TEMPLATES_EXPERTISE_ALL
                ? ` · ${templatesExpertiseLabel(expertiseFilter, expertiseOptions)}`
                : ''}
              {templatesSort !== 'default'
                ? ` · ${TEMPLATES_SORT_OPTIONS.find((o) => o.value === templatesSort)?.label}`
                : ''}
            </p>
          )}
        </div>

        <div
          className="templates-modal__tabs"
          role="tablist"
          aria-label="Template categories"
        >
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`templates-modal__tab${activeTab === tab ? ' templates-modal__tab--active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="templates-modal__body">
          {showRecentStrip ? (
            <div className="templates-modal__recent" aria-label="Recently used templates">
              <div className="templates-modal__recent-head">
                <div className="templates-modal__recent-label">Recently used</div>
                <button
                  type="button"
                  className="templates-modal__text-btn"
                  onClick={() => setRecentIds(clearRecentTemplateIds())}
                >
                  Clear
                </button>
              </div>
              <div className="templates-modal__recent-list">
                {recentStrip.map((t) => (
                  <button
                    key={`recent-${t.id}`}
                    type="button"
                    disabled={!!t.disabled}
                    onClick={() => selectTemplate(t)}
                    title={t.title}
                    className="templates-modal__recent-chip"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {catalogMode === 'loading' ? (
            <div className="templates-modal__loading">
              <p>
                {!reducedMotion ? (
                  <>
                    <span className="templates-modal__loading-dot" aria-hidden />
                    <span className="templates-modal__loading-dot" aria-hidden />
                    <span className="templates-modal__loading-dot" aria-hidden />{' '}
                  </>
                ) : null}
                Loading templates…
              </p>
            </div>
          ) : catalogMode === 'load_error' ? (
            <EmptyState
              variant="error"
              alert
              title="Could not load templates"
              description="Check your connection and try again. Your compose box still works without a template."
              actions={
                onRetryLoad ? (
                  <MotionButton
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => onRetryLoad()}
                  >
                    Retry
                  </MotionButton>
                ) : null
              }
            />
          ) : catalogMode === 'empty' || visibleTemplates.length === 0 ? (
            <EmptyState
              variant={catalogMode === 'empty' ? 'default' : 'filter'}
              title={catalogMode === 'empty' ? 'No templates yet' : 'No templates match'}
              description={
                catalogMode === 'empty'
                  ? 'Templates will show up here when available. You can still write a custom research question.'
                  : searchQuery.trim() ||
                      availabilityFilter !== 'all' ||
                      expertiseFilter !== TEMPLATES_EXPERTISE_ALL
                    ? `Nothing found${
                        searchQuery.trim() ? ` for “${searchQuery.trim()}”` : ''
                      }${activeTab !== 'All' ? ` in ${activeTab}` : ''}${
                        availabilityFilter !== 'all'
                          ? ` · ${templatesAvailabilityLabel(availabilityFilter)}`
                          : ''
                      }${
                        expertiseFilter !== TEMPLATES_EXPERTISE_ALL
                          ? ` · ${templatesExpertiseLabel(expertiseFilter, expertiseOptions)}`
                          : ''
                      }.`
                    : `No templates in ${activeTab} yet.`
              }
              actions={
                catalogMode === 'list' ? (
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--md"
                    onClick={() => {
                      setSearchQuery('');
                      setActiveTab('All');
                      setAvailabilityFilter('all');
                      setExpertiseFilter(TEMPLATES_EXPERTISE_ALL);
                      searchRef.current?.focus();
                    }}
                  >
                    Clear filters
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="templates-modal__grid">
              {visibleTemplates.map((t) => {
                const fullCopyState =
                  itemCopyId === t.id && itemCopyKind === 'full' ? itemCopyStatus : 'idle';
                const promptCopyState =
                  itemCopyId === t.id && itemCopyKind === 'prompt' ? itemCopyStatus : 'idle';
                return (
                  <div
                    key={t.id}
                    className={[
                      'templates-card',
                      t.disabled ? 'templates-card--disabled' : '',
                      reducedMotion ? 'templates-card--static' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <button
                      type="button"
                      disabled={!!t.disabled}
                      onClick={() => selectTemplate(t)}
                      className="templates-card__select"
                    >
                      <div className="templates-card__meta">
                        <span className="templates-card__cat">{t.category}</span>
                        <ConduraBadge execution={t.execution} compact />
                      </div>
                      <div className="templates-card__title">
                        <HighlightQuery text={t.title} query={searchQuery} />
                      </div>
                      <div className="templates-card__desc">
                        <HighlightQuery text={t.description} query={searchQuery} />
                      </div>
                      {t.disabled && t.disabled_reason ? (
                        <div className="templates-card__disabled-reason">{t.disabled_reason}</div>
                      ) : (
                        <div className="templates-card__example">e.g. {t.example}</div>
                      )}
                    </button>
                    <div className="templates-card__actions">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyTemplateItem(t, 'full');
                        }}
                        title="Copy this template as markdown"
                        aria-label={`Copy template ${t.title}`}
                        className={[
                          'templates-card__link',
                          fullCopyState === 'failed'
                            ? 'templates-card__link--err'
                            : fullCopyState === 'copied'
                              ? 'templates-card__link--ok'
                              : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {fullCopyState === 'copied'
                          ? 'Copied'
                          : fullCopyState === 'failed'
                            ? 'Failed'
                            : 'Copy template'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyTemplateItem(t, 'prompt');
                        }}
                        title="Copy prompt text only"
                        aria-label={`Copy prompt for ${t.title}`}
                        className={[
                          'templates-card__link',
                          'templates-card__link--muted',
                          promptCopyState === 'failed'
                            ? 'templates-card__link--err'
                            : promptCopyState === 'copied'
                              ? 'templates-card__link--ok'
                              : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {promptCopyState === 'copied'
                          ? 'Copied prompt'
                          : promptCopyState === 'failed'
                            ? 'Failed'
                            : 'Copy prompt'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
