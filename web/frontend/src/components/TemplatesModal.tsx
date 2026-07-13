import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AgentTaskTemplate } from '../api';

const TAB_ORDER = [
  'All',
  'Business',
  'Technical',
  'Finance',
  'Research',
  'Policy',
  'Personal',
  'Analysis',
] as const;

type TabId = (typeof TAB_ORDER)[number];

type TemplatesModalProps = {
  open: boolean;
  closing: boolean;
  categories: Record<string, AgentTaskTemplate[]>;
  onClose: () => void;
  onSelect: (t: AgentTaskTemplate) => void;
};

export function TemplatesModal({ open, closing, categories, onClose, onSelect }: TemplatesModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('All');

  const flatTemplates = useMemo(() => {
    const out: AgentTaskTemplate[] = [];
    for (const list of Object.values(categories)) {
      for (const t of list) out.push(t);
    }
    return out;
  }, [categories]);

  const visibleTemplates = useMemo(() => {
    if (activeTab === 'All') return flatTemplates;
    return categories[activeTab] ?? [];
  }, [activeTab, categories, flatTemplates]);

  useEffect(() => {
    if (open) setActiveTab('All');
  }, [open]);

  const handleOverlayPointerDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open && !closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closing, onClose]);

  if (!open && !closing) return null;

  const overlayAnim = closing ? 'templatesModalOverlayOut 0.22s ease forwards' : 'templatesModalOverlayIn 0.2s ease forwards';
  const panelAnim = closing
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
      }}
    >
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0,
            borderBottom: '0.5px solid #EDE4D8',
            padding: '0 8px',
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              type="button"
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
                onClick={() => {
                  onSelect(t);
                  onClose();
                }}
                style={{
                  textAlign: 'left',
                  background: '#FAF7F2',
                  border: '0.5px solid #E0D5C5',
                  borderRadius: 8,
                  padding: 14,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: 'Georgia, serif',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#C4956A';
                  e.currentTarget.style.background = '#FAF3EA';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#E0D5C5';
                  e.currentTarget.style.background = '#FAF7F2';
                }}
              >
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
                <div style={{ fontSize: 14, fontWeight: 500, color: '#2C1810', marginTop: 6 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: '#8C7355', fontStyle: 'italic', marginTop: 3, lineHeight: 1.4 }}>
                  {t.description}
                </div>
                <div style={{ fontSize: 11, color: '#C4A882', marginTop: 6 }}>
                  e.g. {t.example}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
