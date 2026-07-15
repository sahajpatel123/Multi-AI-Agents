import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AgentTaskTemplate } from '../api';
import { ConduraBadge } from './ConduraBadge';
import { prefersReducedMotion } from '../lib/motion';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import { templatesListBodyMode } from '../lib/templatesListView';

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
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
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

  const visibleTemplates = useMemo(
    () =>
      filterBySearchQuery(tabTemplates, searchQuery, (t) => [
        t.title,
        t.description,
        t.category,
        t.example,
        t.prompt_template,
        t.id,
      ]),
    [tabTemplates, searchQuery],
  );

  const catalogMode = templatesListBodyMode({
    loading,
    loadFailed,
    itemCount: flatTemplates.length,
  });

  useEffect(() => {
    if (open) {
      setActiveTab('All');
      setSearchQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

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

        <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
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
          {(searchQuery.trim() || activeTab !== 'All') && (
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#A89070' }}>
              {visibleTemplates.length} match
              {visibleTemplates.length === 1 ? '' : 'es'}
              {activeTab !== 'All' ? ` in ${activeTab}` : ''}
              {searchQuery.trim() ? ` for “${searchQuery.trim()}”` : ''}
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
          {catalogMode === 'loading' ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#8C7355' }}>Loading templates…</p>
            </div>
          ) : catalogMode === 'load_error' ? (
            <div
              role="alert"
              style={{ textAlign: 'center', padding: '2rem 1rem' }}
            >
              <p style={{ margin: 0, fontSize: 15, color: '#2C1810', fontWeight: 500 }}>
                Could not load templates
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8C7355', lineHeight: 1.55 }}>
                Check your connection and try again. Your compose box still works without a template.
              </p>
              {onRetryLoad ? (
                <button
                  type="button"
                  className="arena-btn arena-btn--primary arena-btn--md"
                  style={{ marginTop: 16 }}
                  onClick={() => onRetryLoad()}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : catalogMode === 'empty' || visibleTemplates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <p style={{ margin: 0, fontSize: 15, color: '#2C1810', fontWeight: 500 }}>
                {catalogMode === 'empty' ? 'No templates yet' : 'No templates match'}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8C7355', lineHeight: 1.55 }}>
                {catalogMode === 'empty'
                  ? 'Templates will show up here when available. You can still write a custom research question.'
                  : searchQuery.trim()
                    ? `Nothing found for “${searchQuery.trim()}”${activeTab !== 'All' ? ` in ${activeTab}` : ''}.`
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
                <button
                  key={t.id}
                  type="button"
                  disabled={!!t.disabled}
                  onClick={() => {
                    if (t.disabled) return;
                    onSelect(t);
                    onClose();
                  }}
                  style={{
                    textAlign: 'left',
                    background: t.disabled ? '#F5F0E8' : '#FAF7F2',
                    border: '0.5px solid #E0D5C5',
                    borderRadius: 8,
                    padding: 14,
                    cursor: t.disabled ? 'not-allowed' : 'pointer',
                    opacity: t.disabled ? 0.65 : 1,
                    transition: reducedMotion ? 'none' : 'all 0.15s',
                    fontFamily: 'Georgia, serif',
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
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#2C1810', marginTop: 6 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: '#8C7355', fontStyle: 'italic', marginTop: 3, lineHeight: 1.4 }}>
                    {t.description}
                  </div>
                  {t.disabled && t.disabled_reason ? (
                    <div style={{ fontSize: 11, color: '#a89070', marginTop: 6 }}>{t.disabled_reason}</div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#C4A882', marginTop: 6 }}>
                      e.g. {t.example}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
