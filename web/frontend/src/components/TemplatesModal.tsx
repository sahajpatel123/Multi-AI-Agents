import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

  const overlayAnim = reducedMotion
    ? 'none'
    : closing
      ? 'templatesModalOverlayOut 0.22s ease forwards'
      : 'templatesModalOverlayIn 0.2s ease forwards';
  const panelAnim = reducedMotion
    ? 'none'
    : closing
      ? 'templatesModalPanelOut 0.22s ease-in forwards'
      : 'templatesModalPanelIn 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards';

  return createPortal(
    <div
      role="presentation"
      onMouseDown={handleOverlayPointerDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(30, 18, 10, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: overlayAnim,
        opacity: reducedMotion ? 1 : undefined,
      }}
    >
      {!reducedMotion ? (
        <style>{`
        @keyframes templatesModalOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes templatesModalOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes templatesModalPanelIn {
          from { opacity: 0; transform: scale(0.96) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes templatesModalPanelOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.96) translateY(12px); }
        }
      `}</style>
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="templates-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#FDFAF6',
          border: '0.5px solid #DDD0BC',
          borderRadius: 14,
          animation: panelAnim,
          boxShadow: '0 16px 48px rgba(26, 23, 20, 0.12)',
          opacity: reducedMotion ? 1 : undefined,
          transform: reducedMotion ? 'none' : undefined,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom: '0.5px solid #EDE4D8',
            flexShrink: 0,
            gap: 12,
          }}
        >
          <h2
            id="templates-modal-title"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 500,
              color: '#2C1810',
              fontFamily: 'Georgia, serif',
            }}
          >
            Task templates
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
                  style={{
                    background: 'none',
                    border: '0.5px solid #D4C4B0',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color:
                      copyStatus === 'failed'
                        ? '#D85A30'
                        : copyStatus === 'copied'
                          ? '#5A8C6A'
                          : '#C4956A',
                    padding: '5px 10px',
                    fontFamily: 'Georgia, serif',
                  }}
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
                  style={{
                    background: 'none',
                    border: '0.5px solid #D4C4B0',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color:
                      downloadStatus === 'failed'
                        ? '#D85A30'
                        : downloadStatus === 'done'
                          ? '#5A8C6A'
                          : '#C4956A',
                    padding: '5px 10px',
                    fontFamily: 'Georgia, serif',
                  }}
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
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 22,
                lineHeight: 1,
                color: '#8C7355',
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        </div>
        {copyStatus === 'failed' || downloadStatus === 'failed' ? (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: '0 18px 8px',
              fontSize: 12,
              color: '#993C1D',
              lineHeight: 1.4,
            }}
          >
            {copyStatus === 'failed'
              ? 'Could not copy templates — try Download instead.'
              : 'Could not download templates — try Copy instead.'}
          </p>
        ) : null}

        <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates…"
                aria-label="Search task templates"
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
                  aria-label="Clear template search"
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
            {flatTemplates.length > 1 ? (
              <select
                value={templatesSort}
                onChange={(e) => setTemplatesSort(e.target.value as TemplatesSort)}
                aria-label="Sort templates"
                title="Sort templates"
                style={{
                  fontSize: 12,
                  fontFamily: 'Georgia, serif',
                  color: '#4A3728',
                  background: '#FAF7F2',
                  border: '0.5px solid #E0D5C5',
                  borderRadius: 10,
                  padding: '10px 10px',
                  cursor: 'pointer',
                  flex: '0 0 auto',
                  maxWidth: 148,
                }}
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
              style={{
                display: 'flex',
                gap: 6,
                marginTop: 10,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {TEMPLATES_AVAILABILITY_OPTIONS.map((opt) => {
                const selected = availabilityFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAvailabilityFilter(opt.value)}
                    aria-pressed={selected}
                    style={{
                      background: selected ? '#F0E6DA' : 'transparent',
                      border: selected
                        ? '0.5px solid #C4956A'
                        : '0.5px solid #E0D5C5',
                      borderRadius: 999,
                      padding: '3px 9px',
                      fontSize: 10,
                      letterSpacing: '0.03em',
                      color: selected ? '#4A3728' : '#A89070',
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                      lineHeight: 1.35,
                    }}
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
              style={{
                display: 'flex',
                gap: 6,
                marginTop: 10,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
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
                      background: selected ? '#F0E6DA' : 'transparent',
                      border: selected
                        ? '0.5px solid #C4956A'
                        : '0.5px solid #E0D5C5',
                      borderRadius: 999,
                      padding: '3px 9px',
                      fontSize: 10,
                      letterSpacing: '0.03em',
                      color: selected ? '#4A3728' : '#A89070',
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                      lineHeight: 1.35,
                    }}
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
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#A89070' }}>
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
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0,
            borderBottom: '0.5px solid #EDE4D8',
            padding: '0 8px',
            flexShrink: 0,
            overflowX: 'auto',
            marginTop: 8,
          }}
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
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'Georgia, serif',
                padding: '10px 12px',
                color: activeTab === tab ? '#2C1810' : '#8C7355',
                borderBottom: activeTab === tab ? '2px solid #C4956A' : '2px solid transparent',
                marginBottom: -1,
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div style={{ overflowY: 'auto', padding: 16, flex: 1 }}>
          {showRecentStrip ? (
            <div
              style={{ marginBottom: 16 }}
              aria-label="Recently used templates"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: '#A89070',
                  }}
                >
                  Recently used
                </div>
                <button
                  type="button"
                  onClick={() => setRecentIds(clearRecentTemplateIds())}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#C4956A',
                    fontFamily: 'Georgia, serif',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {recentStrip.map((t) => (
                  <button
                    key={`recent-${t.id}`}
                    type="button"
                    disabled={!!t.disabled}
                    onClick={() => selectTemplate(t)}
                    title={t.title}
                    style={{
                      maxWidth: '100%',
                      textAlign: 'left',
                      background: t.disabled ? '#F5F0E8' : '#FAF3EA',
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 999,
                      padding: '6px 12px',
                      cursor: t.disabled ? 'not-allowed' : 'pointer',
                      opacity: t.disabled ? 0.65 : 1,
                      fontSize: 12,
                      color: '#4A3728',
                      fontFamily: 'Georgia, serif',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {catalogMode === 'loading' ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#8C7355' }}>Loading templates…</p>
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
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <p style={{ margin: 0, fontSize: 15, color: '#2C1810', fontWeight: 500 }}>
                {catalogMode === 'empty' ? 'No templates yet' : 'No templates match'}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8C7355', lineHeight: 1.55 }}>
                {catalogMode === 'empty'
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
                    : `No templates in ${activeTab} yet.`}
              </p>
              {catalogMode === 'list' ? (
                <button
                  type="button"
                  className="arena-btn arena-btn--ghost arena-btn--md"
                  style={{ marginTop: 16 }}
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
              ) : null}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
              }}
            >
              {visibleTemplates.map((t) => (
                <div
                  key={t.id}
                  style={{
                    textAlign: 'left',
                    background: t.disabled ? '#F5F0E8' : '#FAF7F2',
                    border: '0.5px solid #E0D5C5',
                    borderRadius: 8,
                    padding: 14,
                    opacity: t.disabled ? 0.65 : 1,
                    transition: reducedMotion ? 'none' : 'all 0.15s',
                    fontFamily: 'Georgia, serif',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (t.disabled || reducedMotion) return;
                    e.currentTarget.style.borderColor = '#C4956A';
                    e.currentTarget.style.background = '#FAF3EA';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#E0D5C5';
                    e.currentTarget.style.background = t.disabled ? '#F5F0E8' : '#FAF7F2';
                  }}
                >
                  <button
                    type="button"
                    disabled={!!t.disabled}
                    onClick={() => selectTemplate(t)}
                    style={{
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: t.disabled ? 'not-allowed' : 'pointer',
                      fontFamily: 'Georgia, serif',
                      width: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 9,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          background: '#F0E8DC',
                          color: '#8C7355',
                          borderRadius: 6,
                          padding: '2px 8px',
                          display: 'inline-block',
                        }}
                      >
                        {t.category}
                      </span>
                      <ConduraBadge execution={t.execution} compact />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#2C1810', marginTop: 6 }}>
                      <HighlightQuery text={t.title} query={searchQuery} />
                    </div>
                    <div style={{ fontSize: 12, color: '#8C7355', fontStyle: 'italic', marginTop: 3, lineHeight: 1.4 }}>
                      <HighlightQuery text={t.description} query={searchQuery} />
                    </div>
                    {t.disabled && t.disabled_reason ? (
                      <div style={{ fontSize: 11, color: '#a89070', marginTop: 6 }}>{t.disabled_reason}</div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#C4A882', marginTop: 6 }}>
                        e.g. {t.example}
                      </div>
                    )}
                  </button>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginTop: 10,
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyTemplateItem(t, 'full');
                      }}
                      title="Copy this template as markdown"
                      aria-label={`Copy template ${t.title}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 11,
                        fontFamily: 'Georgia, serif',
                        cursor: 'pointer',
                        color:
                          itemCopyId === t.id &&
                          itemCopyKind === 'full' &&
                          itemCopyStatus === 'failed'
                            ? '#993C1D'
                            : itemCopyId === t.id &&
                                itemCopyKind === 'full' &&
                                itemCopyStatus === 'copied'
                              ? '#3F6B4A'
                              : '#C4956A',
                      }}
                    >
                      {itemCopyId === t.id &&
                      itemCopyKind === 'full' &&
                      itemCopyStatus === 'copied'
                        ? 'Copied'
                        : itemCopyId === t.id &&
                            itemCopyKind === 'full' &&
                            itemCopyStatus === 'failed'
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
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 11,
                        fontFamily: 'Georgia, serif',
                        cursor: 'pointer',
                        color:
                          itemCopyId === t.id &&
                          itemCopyKind === 'prompt' &&
                          itemCopyStatus === 'failed'
                            ? '#993C1D'
                            : itemCopyId === t.id &&
                                itemCopyKind === 'prompt' &&
                                itemCopyStatus === 'copied'
                              ? '#3F6B4A'
                              : '#8C7355',
                      }}
                    >
                      {itemCopyId === t.id &&
                      itemCopyKind === 'prompt' &&
                      itemCopyStatus === 'copied'
                        ? 'Copied prompt'
                        : itemCopyId === t.id &&
                            itemCopyKind === 'prompt' &&
                            itemCopyStatus === 'failed'
                          ? 'Failed'
                          : 'Copy prompt'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
