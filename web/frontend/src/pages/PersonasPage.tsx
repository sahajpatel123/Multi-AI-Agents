import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { AgentDot } from '../components/AgentDot';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
import { usePanel } from '../context/PanelContext';
import { useTier } from '../context/TierContext';
import { type Persona } from '../data/personas';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { motionDuration, prefersReducedMotion } from '../lib/motion';
import { formatPanelExport } from '../lib/panelExport';
import {
  panelSaveButtonLabel,
  panelSaveCaughtErrorMessage,
  panelSaveSuccessMessage,
  panelSaveToastAriaLive,
  panelSaveToastRole,
  type PanelSaveToastKind,
} from '../lib/panelSave';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import { isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';
import track from '../utils/track';

type SlotIndex = 0 | 1 | 2 | 3;

interface ToastState {
  message: string;
  color: string;
  iconColor?: string;
  kind?: PanelSaveToastKind;
}

const eyebrowStyle = {
  fontSize: '12px',
  letterSpacing: '.12em',
  textTransform: 'uppercase' as const,
  color: '#6B6460',
};

export function PersonasPage() {
  const navigate = useNavigate();
  const { panel, personas, swapAgent, resetPanel, savePanel, isDefaultPanel } = usePanel();
  const { canUsePersona } = useTier();
  const [pageVisible, setPageVisible] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotIndex | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [savingPanel, setSavingPanel] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [panelCopyStatus, setPanelCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [panelDownloadStatus, setPanelDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const panelCopyTimerRef = useRef<number | null>(null);
  const panelDownloadTimerRef = useRef<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [revealedLibraryIds, setRevealedLibraryIds] = useState<Record<string, boolean>>({});
  const [libraryQuery, setLibraryQuery] = useState('');
  const [swapQuery, setSwapQuery] = useState('');
  const libraryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const librarySearchRef = useRef<HTMLInputElement | null>(null);
  const swapSearchRef = useRef<HTMLInputElement | null>(null);
  const reducedMotion = prefersReducedMotion();

  const slotLabels = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'] as const;
  const activePersona = activeSlot !== null ? panel[activeSlot] : null;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setPageVisible(true));
    void track('personas_viewed');
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSwapQuery('');
    const delay = motionDuration(220);
    window.setTimeout(() => setActiveSlot(null), delay > 0 ? delay : 0);
  }, []);

  useEffect(() => {
    if (activeSlot === null) {
      setModalVisible(false);
      setSwapQuery('');
      return;
    }

    const frameId = window.requestAnimationFrame(() => setModalVisible(true));
    const focusId = window.setTimeout(() => swapSearchRef.current?.focus(), 50);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(focusId);
    };
  }, [activeSlot]);

  // Escape closes the swap modal; lock body scroll while open.
  useEffect(() => {
    if (activeSlot === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [activeSlot, closeModal]);

  useEffect(() => {
    if (!toast) return;

    setToastVisible(true);
    const hideMs = motionDuration(2500) || 0;
    const removeMs = motionDuration(2800) || 0;
    const hideTimer = window.setTimeout(() => setToastVisible(false), hideMs);
    const removeTimer = window.setTimeout(() => setToast(null), removeMs);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [toast]);

  // `/` focuses library search, or swap search when the slot dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBareSlashKey(e) || !shouldCaptureSlashFocus(e.target)) return;
      e.preventDefault();
      if (activeSlot !== null) {
        swapSearchRef.current?.focus();
        swapSearchRef.current?.select();
        return;
      }
      librarySearchRef.current?.focus();
      librarySearchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSlot]);

  // Esc cancels a pending panel reset (when swap modal is not open).
  useEffect(() => {
    if (!pendingReset || activeSlot !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPendingReset(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingReset, activeSlot]);

  // Leaving the default state or opening swap clears confirm UI.
  useEffect(() => {
    if (isDefaultPanel || activeSlot !== null) setPendingReset(false);
  }, [isDefaultPanel, activeSlot]);

  const handleResetPanel = () => {
    if (!pendingReset) {
      setPendingReset(true);
      return;
    }
    resetPanel();
    setPendingReset(false);
    void track('panel_reset');
    setToast({
      message: 'Panel reset to the four default minds',
      color: '#1A1714',
      iconColor: '#C4956A',
      kind: 'success',
    });
  };

  useEffect(() => {
    return () => {
      if (panelCopyTimerRef.current != null) {
        window.clearTimeout(panelCopyTimerRef.current);
      }
      if (panelDownloadTimerRef.current != null) {
        window.clearTimeout(panelDownloadTimerRef.current);
      }
    };
  }, []);

  const buildPanelMarkdown = () =>
    formatPanelExport({
      isDefault: isDefaultPanel,
      minds: panel.map((p) => ({
        id: p.id,
        name: p.name,
        quote: p.quote,
        description: p.description,
      })),
    });

  const copyPanelMarkdown = async () => {
    const ok = await copyToClipboard(buildPanelMarkdown());
    if (panelCopyTimerRef.current != null) {
      window.clearTimeout(panelCopyTimerRef.current);
    }
    setPanelCopyStatus(ok ? 'copied' : 'failed');
    setToast({
      message: ok ? 'Panel copied as markdown' : 'Could not copy panel — try again',
      color: ok ? '#1A1714' : '#E57373',
      iconColor: ok ? '#C4956A' : '#FAF7F4',
      kind: ok ? 'success' : 'error',
    });
    if (ok) void track('panel_copied');
    const hold = motionDuration(ok ? 2200 : 3000);
    panelCopyTimerRef.current = window.setTimeout(() => {
      setPanelCopyStatus('idle');
      panelCopyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const downloadPanelMarkdown = () => {
    const ok = downloadMarkdownFile(buildPanelMarkdown(), 'arena-personas-panel');
    if (panelDownloadTimerRef.current != null) {
      window.clearTimeout(panelDownloadTimerRef.current);
    }
    setPanelDownloadStatus(ok ? 'done' : 'failed');
    setToast({
      message: ok ? 'Panel downloaded as markdown' : 'Could not download panel — try Copy instead',
      color: ok ? '#1A1714' : '#E57373',
      iconColor: ok ? '#C4956A' : '#FAF7F4',
      kind: ok ? 'success' : 'error',
    });
    const hold = motionDuration(ok ? 2200 : 3000);
    panelDownloadTimerRef.current = window.setTimeout(() => {
      setPanelDownloadStatus('idle');
      panelDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const unlockedSlotMap = useMemo(
    () =>
      panel.reduce<Record<string, number>>((acc, persona, index) => {
        acc[persona.id] = index + 1;
        return acc;
      }, {}),
    [panel],
  );

  const modalOptions = useMemo(() => {
    if (activePersona === null) return [];
    return personas.filter((persona) => persona.id !== activePersona.id);
  }, [activePersona, personas]);

  const filteredSwapOptions = useMemo(
    () =>
      filterBySearchQuery(modalOptions, swapQuery, (persona) => [
        persona.name,
        persona.quote,
        persona.description,
        persona.id,
      ]),
    [modalOptions, swapQuery],
  );

  const filteredLibrary = useMemo(
    () =>
      filterBySearchQuery(personas, libraryQuery, (persona) => [
        persona.name,
        persona.quote,
        persona.description,
        persona.id,
      ]),
    [personas, libraryQuery],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setRevealedLibraryIds((prev) => {
          const next = { ...prev };
          let changed = false;

          for (const entry of entries) {
            const id = entry.target.getAttribute('data-persona-id');
            if (entry.isIntersecting && id && !next[id]) {
              next[id] = true;
              changed = true;
            }
          }

          return changed ? next : prev;
        });
      },
      { threshold: 0.16 },
    );

    Object.values(libraryRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [filteredLibrary.length, libraryQuery]);

  const handleSwap = (slotIndex: SlotIndex, persona: Persona) => {
    if (!canUsePersona(persona.id)) {
      navigate('/pricing');
      return;
    }
    const replacedPersona = panel[slotIndex];
    void track('persona_swapped', persona.id, undefined, {
      slot: slotIndex + 1,
      replaced: replacedPersona?.id || null,
    });
    swapAgent(slotIndex, persona);
    setToast({ message: `${persona.name} added to slot ${slotIndex + 1}`, color: '#1A1714', iconColor: persona.color });
    closeModal();
  };

  const handleSavePanel = async () => {
    if (savingPanel) return;
    setSavingPanel(true);
    try {
      await savePanel();
      void track('panel_saved');
      setToast({
        message: panelSaveSuccessMessage(),
        color: '#1A1714',
        iconColor: '#C4956A',
        kind: 'success',
      });
    } catch (err) {
      setToast({
        message: panelSaveCaughtErrorMessage(err),
        color: '#E57373',
        iconColor: '#FAF7F4',
        kind: 'error',
      });
    } finally {
      setSavingPanel(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F4' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Navbar />

      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '4rem 24px 5rem' }}>
        <button
          type="button"
          onClick={() => navigate('/app')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: '#6B6460',
            background: '#F0EBE3',
            border: '0.5px solid #E0D8D0',
            borderRadius: '999px',
            padding: '7px 16px',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            marginBottom: '1.5rem',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#E0D8D0';
            e.currentTarget.style.color = '#1A1714';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#F0EBE3';
            e.currentTarget.style.color = '#6B6460';
          }}
        >
          ← Back to Arena
        </button>

        <section
          style={{
            opacity: pageVisible ? 1 : 0,
            transform: pageVisible ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 450ms ease, transform 450ms ease',
            marginBottom: '3rem',
          }}
        >
          <p style={eyebrowStyle}>Your panel</p>
          <h1 style={{ marginTop: '1rem', fontSize: '48px', fontWeight: 500, letterSpacing: '-.03em', lineHeight: 1.02, color: '#1A1714' }}>
            <span style={{ display: 'block' }}>Build your</span>
            <span style={{ display: 'block', color: '#C4956A', fontStyle: 'italic' }}>four minds.</span>
          </h1>
          <p style={{ marginTop: '1rem', fontSize: '14px', color: '#6B6460', lineHeight: 1.75, maxWidth: '460px' }}>
            Your current panel loads by default. Swap any agent with another from the library for this session.
          </p>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <p style={{ ...eyebrowStyle, marginBottom: '1rem' }}>Your current panel</p>
          <div
            className="current-panel-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {panel.map((persona, index) => (
              <div
                key={`${persona.id}-${index}`}
                style={{
                  background: persona.bgTint,
                  border: '0.5px solid #E0D8D0',
                  borderRadius: '14px',
                  padding: '1.2rem',
                  position: 'relative',
                  minHeight: '140px',
                  opacity: pageVisible ? 1 : 0,
                  transform: pageVisible ? 'translateY(0)' : 'translateY(12px)',
                  transition: `opacity 420ms ease ${index * 60}ms, transform 420ms ease ${index * 60}ms`,
                }}
              >
                <div style={{ height: '2px', background: persona.color, borderRadius: '999px', marginBottom: '1rem' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AgentDot agentId={`agent_${index + 1}`} size={7} color={persona.color} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{persona.name}</span>
                </div>
                <p style={{ fontSize: '12px', color: '#6B6460', fontStyle: 'italic', marginTop: '.4rem', lineHeight: 1.6 }}>{persona.quote}</p>
                <div style={{ position: 'absolute', left: '1.2rem', bottom: '1.1rem', fontSize: '10px', color: '#6B6460', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {slotLabels[index]}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSlot(index as SlotIndex)}
                  style={{
                    position: 'absolute',
                    right: '1.2rem',
                    bottom: '0.95rem',
                    fontSize: '11px',
                    color: '#C4956A',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'color 150ms ease',
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#1A1714';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#C4956A';
                  }}
                >
                  Swap →
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.9rem', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  void handleSavePanel();
                }}
                className="save-panel-btn"
                disabled={savingPanel}
                aria-busy={savingPanel}
                aria-label={panelSaveButtonLabel(savingPanel)}
                style={{
                  background: '#1A1714',
                  color: '#FAF7F4',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '10px 24px',
                  fontSize: '13px',
                  cursor: savingPanel ? 'wait' : 'pointer',
                  opacity: savingPanel ? 0.72 : 1,
                }}
              >
                {panelSaveButtonLabel(savingPanel)}
              </button>
              <button
                type="button"
                onClick={() => {
                  void copyPanelMarkdown();
                }}
                title="Copy this panel as markdown"
                aria-label={
                  panelCopyStatus === 'copied'
                    ? 'Panel copied'
                    : panelCopyStatus === 'failed'
                      ? 'Copy failed'
                      : 'Copy panel as markdown'
                }
                style={{
                  background: 'none',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 999,
                  padding: '9px 16px',
                  fontSize: 12,
                  color:
                    panelCopyStatus === 'failed'
                      ? '#D85A30'
                      : panelCopyStatus === 'copied'
                        ? '#5A8C6A'
                        : '#6B6460',
                  cursor: 'pointer',
                  fontFamily: 'Georgia, serif',
                }}
              >
                {panelCopyStatus === 'copied'
                  ? 'Copied'
                  : panelCopyStatus === 'failed'
                    ? 'Copy failed'
                    : 'Copy panel'}
              </button>
              <button
                type="button"
                onClick={downloadPanelMarkdown}
                title="Download this panel as markdown"
                aria-label={
                  panelDownloadStatus === 'done'
                    ? 'Panel downloaded'
                    : panelDownloadStatus === 'failed'
                      ? 'Download failed'
                      : 'Download panel as markdown'
                }
                style={{
                  background: 'none',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 999,
                  padding: '9px 16px',
                  fontSize: 12,
                  color:
                    panelDownloadStatus === 'failed'
                      ? '#D85A30'
                      : panelDownloadStatus === 'done'
                        ? '#5A8C6A'
                        : '#6B6460',
                  cursor: 'pointer',
                  fontFamily: 'Georgia, serif',
                }}
              >
                {panelDownloadStatus === 'done'
                  ? 'Downloaded'
                  : panelDownloadStatus === 'failed'
                    ? 'Download failed'
                    : 'Download .md'}
              </button>
            </div>
            {!isDefaultPanel && (
              <button
                type="button"
                onClick={handleResetPanel}
                aria-label={
                  pendingReset
                    ? 'Confirm reset panel to default minds'
                    : 'Reset panel to default minds'
                }
                style={{
                  fontSize: '12px',
                  color: pendingReset ? '#D85A30' : '#6B6460',
                  background: pendingReset ? 'rgba(216, 90, 48, 0.08)' : 'none',
                  border: pendingReset ? '0.5px solid rgba(216, 90, 48, 0.35)' : 'none',
                  borderRadius: pendingReset ? 999 : 0,
                  cursor: 'pointer',
                  padding: pendingReset ? '6px 12px' : 0,
                  transition: 'color 150ms ease, background 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!pendingReset) e.currentTarget.style.color = '#1A1714';
                }}
                onMouseLeave={(e) => {
                  if (!pendingReset) e.currentTarget.style.color = '#6B6460';
                }}
              >
                {pendingReset ? 'Reset panel? Confirm' : 'Reset to default'}
              </button>
            )}
          </div>
        </section>

        <section>
          <div
            style={{
              margin: '3rem 0 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <p style={{ ...eyebrowStyle, margin: 0 }}>
              Full library · {filteredLibrary.length}
              {libraryQuery.trim() ? ` / ${personas.length}` : ' personas'}
            </p>
            <div style={{ position: 'relative', minWidth: 200, flex: '1 1 220px', maxWidth: 320 }}>
              <input
                ref={librarySearchRef}
                type="search"
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="Search minds…"
                aria-label="Search persona library"
                autoComplete="off"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 13,
                  fontFamily: 'Georgia, serif',
                  color: '#1A1714',
                  background: '#FAF7F4',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 10,
                  padding: '9px 32px 9px 12px',
                  outline: 'none',
                }}
              />
              {libraryQuery ? (
                <button
                  type="button"
                  aria-label="Clear persona search"
                  onClick={() => {
                    setLibraryQuery('');
                    librarySearchRef.current?.focus();
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

          {filteredLibrary.length === 0 ? (
            <div
              className="arena-empty-state"
              style={{
                background: '#FAF7F4',
                border: '0.5px solid #E0D8D0',
                borderRadius: 14,
                padding: '2rem 1.25rem',
              }}
            >
              <p style={{ fontSize: 15, color: '#1A1714', fontWeight: 500, margin: 0 }}>
                No minds match “{libraryQuery.trim()}”
              </p>
              <p style={{ fontSize: 13, color: '#6B6460', marginTop: 8, maxWidth: 320, lineHeight: 1.6 }}>
                Try a name, quote fragment, or trait — for example “analyst” or “what works”.
              </p>
              <button
                type="button"
                className="arena-btn arena-btn--ghost arena-btn--md"
                style={{ marginTop: 16 }}
                onClick={() => {
                  setLibraryQuery('');
                  librarySearchRef.current?.focus();
                }}
              >
                Clear search
              </button>
            </div>
          ) : (
          <div
            className="persona-library-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {filteredLibrary.map((persona, index) => {
              const inSlot = unlockedSlotMap[persona.id];
              const isVisible = revealedLibraryIds[persona.id] || index < 4 || Boolean(libraryQuery.trim());
              const isLocked = !canUsePersona(persona.id);
              const cardTransition = reducedMotion
                ? 'none'
                : `opacity 300ms ease ${index * 30}ms, transform 300ms ease ${index * 30}ms, box-shadow 200ms ease, background 150ms ease`;

              return (
                <div
                  key={persona.id}
                  ref={(node) => {
                    libraryRefs.current[persona.id] = node;
                  }}
                  data-persona-id={persona.id}
                  style={{
                    background: persona.bgTint,
                    opacity: isVisible ? (isLocked ? 0.65 : 1) : 0,
                    border: '0.5px solid #E0D8D0',
                    borderRadius: '14px',
                    padding: '1.2rem',
                    minHeight: '168px',
                    position: 'relative',
                    transform: isVisible ? 'translateY(0)' : reducedMotion ? 'none' : 'translateY(16px)',
                    transition: cardTransition,
                    boxShadow: 'none',
                    cursor: isLocked ? 'pointer' : 'default',
                  }}
                  onMouseEnter={(e) => {
                    if (reducedMotion) return;
                    e.currentTarget.style.transform = isLocked ? 'translateY(0)' : 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(26,23,20,0.07)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.opacity = isLocked ? '0.65' : '1';
                  }}
                  onClick={() => {
                    if (isLocked) navigate('/pricing');
                  }}
                >
                  <div style={{ height: '2px', background: persona.color, borderRadius: '999px', marginBottom: '1rem' }} />
                  {isLocked && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'rgba(26,23,20,0.08)',
                        color: '#1A1714',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Lock style={{ width: '14px', height: '14px' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: persona.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{persona.name}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B6460', fontStyle: 'italic', marginTop: '.4rem', lineHeight: 1.6 }}>
                    {persona.quote}
                  </p>
                  <p style={{ fontSize: '12px', color: '#6B6460', lineHeight: 1.6, marginTop: '.7rem' }}>
                    {persona.description}
                  </p>
                  {isLocked && (
                    <div
                      style={{
                        position: 'absolute',
                        right: '12px',
                        bottom: '12px',
                        background: '#1A1714',
                        color: '#FAF7F4',
                        fontSize: '11px',
                        padding: '5px 12px',
                        borderRadius: '999px',
                      }}
                    >
                      Unlock with Plus — $12/month
                    </div>
                  )}

                  {inSlot ? (
                    <div style={{ position: 'absolute', left: '1.2rem', bottom: '1rem' }}>
                      <span style={{ background: '#F0EBE3', color: '#6B6460', fontSize: '10px', padding: '3px 8px', borderRadius: '999px' }}>
                        In slot {inSlot}
                      </span>
                    </div>
                  ) : isLocked ? (
                    <div style={{ position: 'absolute', left: '1.2rem', bottom: '1rem' }}>
                      <span style={{ background: '#C4956A', color: '#FAF7F4', fontSize: '10px', padding: '3px 8px', borderRadius: '999px' }}>
                        Plus
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          )}
        </section>
      </main>

      {activeSlot !== null && activePersona && (
        <div
          role="presentation"
          onClick={closeModal}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(26,23,20,0.4)',
            backdropFilter: reducedMotion ? 'none' : 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            className="swap-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-slot-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FAF7F4',
              borderRadius: '20px',
              padding: '2rem',
              maxWidth: '560px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              opacity: modalVisible ? 1 : 0,
              transform: modalVisible || reducedMotion ? 'scale(1)' : 'scale(0.95)',
              transition: reducedMotion ? 'none' : 'opacity 250ms ease, transform 250ms ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <h2 id="swap-slot-title" style={{ fontSize: '18px', fontWeight: 500, color: '#1A1714', margin: 0 }}>
                  Swap slot {activeSlot + 1}
                </h2>
                <p style={{ fontSize: '13px', color: '#6B6460', marginTop: '.35rem' }}>
                  Currently: {activePersona.name}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close swap dialog"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#F0EBE3',
                  color: '#6B6460',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: reducedMotion ? 'none' : 'background 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#E0D8D0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#F0EBE3';
                }}
              >
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            </div>

            <div style={{ height: '0.5px', background: '#E0D8D0', margin: '1rem 0' }} />

            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                ref={swapSearchRef}
                type="search"
                value={swapQuery}
                onChange={(e) => setSwapQuery(e.target.value)}
                placeholder="Search minds to swap…"
                aria-label="Search minds to swap into this slot"
                autoComplete="off"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 13,
                  fontFamily: 'Georgia, serif',
                  color: '#1A1714',
                  background: '#FFFFFF',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 10,
                  padding: '9px 32px 9px 12px',
                  outline: 'none',
                }}
              />
              {swapQuery ? (
                <button
                  type="button"
                  aria-label="Clear swap search"
                  onClick={() => {
                    setSwapQuery('');
                    swapSearchRef.current?.focus();
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

            <p style={{ ...eyebrowStyle, marginBottom: '.8rem' }}>
              Available to swap
              {swapQuery.trim()
                ? ` · ${filteredSwapOptions.length} / ${modalOptions.length}`
                : ` · ${modalOptions.length}`}
            </p>
            {filteredSwapOptions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#1A1714', fontWeight: 500 }}>
                  No minds match “{swapQuery.trim()}”
                </p>
                <button
                  type="button"
                  className="arena-btn arena-btn--ghost arena-btn--sm"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setSwapQuery('');
                    swapSearchRef.current?.focus();
                  }}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div
                className="current-panel-grid"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}
              >
                {filteredSwapOptions.map((persona) => {
                  const isLocked = !canUsePersona(persona.id);

                  return (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => {
                        if (isLocked) {
                          navigate('/pricing');
                          return;
                        }
                        handleSwap(activeSlot, persona);
                      }}
                      style={{
                        background: persona.bgTint,
                        border: '0.5px solid #E0D8D0',
                        borderRadius: '12px',
                        padding: '1rem',
                        cursor: 'pointer',
                        transition: reducedMotion ? 'none' : 'all 150ms ease',
                        textAlign: 'left',
                        opacity: isLocked ? 0.65 : 1,
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        if (isLocked || reducedMotion) return;
                        e.currentTarget.style.borderColor = persona.color;
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#E0D8D0';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      {isLocked && (
                        <div style={{ position: 'absolute', top: '10px', right: '10px', color: '#1A1714' }}>
                          <Lock style={{ width: '13px', height: '13px' }} />
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: persona.color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>
                          {persona.name}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#6B6460', lineHeight: 1.5, marginTop: '.4rem' }}>
                        {persona.description}
                      </p>
                      <p
                        style={{
                          fontSize: '11px',
                          color: '#6B6460',
                          fontStyle: 'italic',
                          marginTop: '.4rem',
                        }}
                      >
                        {persona.quote}
                      </p>
                      {isLocked && (
                        <div style={{ marginTop: '.6rem', fontSize: '11px', color: '#1A1714' }}>
                          Unlock with Plus — $12/month
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ height: '0.5px', background: '#E0D8D0', margin: '1rem 0' }} />
          </div>
        </div>
      )}

      {toast && (
        <div
          role={panelSaveToastRole(toast.kind ?? 'success')}
          aria-live={panelSaveToastAriaLive(toast.kind ?? 'success')}
          aria-atomic="true"
          style={{
            position: 'fixed',
            bottom: '90px',
            left: '50%',
            transform: `translateX(-50%) translateY(${toastVisible ? '0' : '8px'})`,
            zIndex: 200,
            background: toast.color,
            color: '#FAF7F4',
            fontSize: '13px',
            padding: '10px 20px',
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: toastVisible ? 1 : 0,
            transition: 'opacity 300ms ease, transform 300ms ease',
          }}
        >
          <Sparkles style={{ width: '14px', height: '14px', color: toast.iconColor || '#FAF7F4' }} aria-hidden />
          <span
            style={{ width: '6px', height: '6px', borderRadius: '50%', background: toast.iconColor || '#FAF7F4' }}
            aria-hidden
          />
          <span>{toast.message}</span>
        </div>
      )}

      <KeyboardShortcutsHelp surface="personas" />
    </div>
  );
}
