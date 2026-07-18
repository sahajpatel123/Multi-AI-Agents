import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { AgentDot } from '../components/AgentDot';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
import { HighlightQuery } from '../components/HighlightQuery';
import { EmptyState } from '../components/EmptyState';
import { usePanel } from '../context/PanelContext';
import { useTier } from '../context/TierContext';
import { type Persona } from '../data/personas';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { motionDuration, prefersReducedMotion } from '../lib/motion';
import { formatPanelExport } from '../lib/panelExport';
import {
  formatPersonasLibraryExport,
  formatPersonasLibraryItemCopy,
} from '../lib/personasLibraryExport';
import {
  panelSaveButtonLabel,
  panelSaveCaughtErrorMessage,
  panelSaveSuccessMessage,
  panelSaveToastAriaLive,
  panelSaveToastRole,
  type PanelSaveToastKind,
} from '../lib/panelSave';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import {
  PERSONAS_LIBRARY_AVAILABILITY_OPTIONS,
  filterPersonasLibraryByAvailability,
  personasLibraryAvailabilityLabel,
  type PersonasLibraryAvailability,
} from '../lib/personasLibraryFilter';
import {
  PERSONAS_LIBRARY_SORT_OPTIONS,
  personasLibrarySortLabel,
  sortPersonasLibrary,
  type PersonasLibrarySort,
} from '../lib/personasLibrarySort';
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
  const [libraryCopyStatus, setLibraryCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [libraryDownloadStatus, setLibraryDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  /** Per-mind library card copy feedback. */
  const [mindCopyId, setMindCopyId] = useState<string | null>(null);
  const [mindCopyStatus, setMindCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const mindCopyTimerRef = useRef<number | null>(null);
  const libraryCopyTimerRef = useRef<number | null>(null);
  const libraryDownloadTimerRef = useRef<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [revealedLibraryIds, setRevealedLibraryIds] = useState<Record<string, boolean>>({});
  const [libraryQuery, setLibraryQuery] = useState('');
  const [librarySort, setLibrarySort] = useState<PersonasLibrarySort>('default');
  const [libraryAvailability, setLibraryAvailability] =
    useState<PersonasLibraryAvailability>('all');
  const [swapQuery, setSwapQuery] = useState('');
  const [swapSort, setSwapSort] = useState<PersonasLibrarySort>('default');
  const [swapAvailability, setSwapAvailability] =
    useState<PersonasLibraryAvailability>('all');
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
    setSwapSort('default');
    setSwapAvailability('all');
    const delay = motionDuration(220);
    window.setTimeout(() => setActiveSlot(null), delay > 0 ? delay : 0);
  }, []);

  useEffect(() => {
    if (activeSlot === null) {
      setModalVisible(false);
      setSwapQuery('');
      setSwapSort('default');
      setSwapAvailability('all');
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
      if (libraryCopyTimerRef.current != null) {
        window.clearTimeout(libraryCopyTimerRef.current);
      }
      if (libraryDownloadTimerRef.current != null) {
        window.clearTimeout(libraryDownloadTimerRef.current);
      }
      if (mindCopyTimerRef.current != null) {
        window.clearTimeout(mindCopyTimerRef.current);
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

  const filteredSwapOptions = useMemo(() => {
    const annotated = modalOptions.map((persona) => ({
      ...persona,
      onPanel: unlockedSlotMap[persona.id] != null,
      unlocked: canUsePersona(persona.id),
    }));
    const byAvailability = filterPersonasLibraryByAvailability(
      annotated,
      swapAvailability,
    );
    const searched = filterBySearchQuery(byAvailability, swapQuery, (persona) => [
      persona.name,
      persona.quote,
      persona.description,
      persona.id,
    ]);
    return sortPersonasLibrary(searched, swapSort);
  }, [modalOptions, swapQuery, swapSort, swapAvailability, unlockedSlotMap, canUsePersona]);

  const filteredLibrary = useMemo(() => {
    const annotated = personas.map((persona) => ({
      ...persona,
      onPanel: unlockedSlotMap[persona.id] != null,
      unlocked: canUsePersona(persona.id),
    }));
    const byAvailability = filterPersonasLibraryByAvailability(
      annotated,
      libraryAvailability,
    );
    const searched = filterBySearchQuery(byAvailability, libraryQuery, (persona) => [
      persona.name,
      persona.quote,
      persona.description,
      persona.id,
    ]);
    return sortPersonasLibrary(searched, librarySort);
  }, [personas, libraryQuery, librarySort, libraryAvailability, unlockedSlotMap, canUsePersona]);

  const buildFilteredLibraryMarkdown = () => {
    const q = libraryQuery.trim();
    const filterBits: string[] = [];
    if (libraryAvailability !== 'all') {
      filterBits.push(
        `availability: ${personasLibraryAvailabilityLabel(libraryAvailability)}`,
      );
    }
    if (q) filterBits.push(`search: “${q}”`);
    if (librarySort !== 'default') {
      filterBits.push(`sort: ${personasLibrarySortLabel(librarySort)}`);
    }
    return formatPersonasLibraryExport({
      items: filteredLibrary.map((persona) => ({
        name: persona.name,
        quote: persona.quote,
        description: persona.description,
        id: persona.id,
        onPanel: persona.onPanel,
        unlocked: persona.unlocked,
        panelSlot: unlockedSlotMap[persona.id] ?? null,
      })),
      totalCount: personas.length,
      filterNote: filterBits.length ? filterBits.join(' · ') : undefined,
    });
  };

  const copyFilteredLibrary = async () => {
    const ok = await copyToClipboard(buildFilteredLibraryMarkdown());
    if (libraryCopyTimerRef.current != null) {
      window.clearTimeout(libraryCopyTimerRef.current);
    }
    setLibraryCopyStatus(ok ? 'copied' : 'failed');
    setToast({
      message: ok ? 'Library copied as markdown' : 'Could not copy library — try again',
      color: ok ? '#1A1714' : '#E57373',
      iconColor: ok ? '#C4956A' : '#FAF7F4',
      kind: ok ? 'success' : 'error',
    });
    const hold = motionDuration(ok ? 2200 : 3000);
    libraryCopyTimerRef.current = window.setTimeout(() => {
      setLibraryCopyStatus('idle');
      libraryCopyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copyLibraryMind = async (persona: {
    id: string;
    name: string;
    quote: string;
    description: string;
    onPanel?: boolean;
    unlocked?: boolean;
  }) => {
    const text = formatPersonasLibraryItemCopy({
      name: persona.name,
      quote: persona.quote,
      description: persona.description,
      id: persona.id,
      onPanel: persona.onPanel ?? unlockedSlotMap[persona.id] != null,
      unlocked: persona.unlocked ?? canUsePersona(persona.id),
      panelSlot: unlockedSlotMap[persona.id] ?? null,
    });
    if (!text) {
      setMindCopyId(persona.id);
      setMindCopyStatus('failed');
      setToast({
        message: 'Nothing to copy for this mind',
        color: '#E57373',
        iconColor: '#FAF7F4',
        kind: 'error',
      });
      return;
    }
    const ok = await copyToClipboard(text);
    if (mindCopyTimerRef.current != null) {
      window.clearTimeout(mindCopyTimerRef.current);
    }
    setMindCopyId(persona.id);
    setMindCopyStatus(ok ? 'copied' : 'failed');
    setToast({
      message: ok
        ? `${persona.name} copied as markdown`
        : 'Could not copy mind — try again',
      color: ok ? '#1A1714' : '#E57373',
      iconColor: ok ? '#C4956A' : '#FAF7F4',
      kind: ok ? 'success' : 'error',
    });
    if (ok) void track('persona_mind_copied', undefined, persona.id);
    const hold = motionDuration(ok ? 2200 : 3000);
    mindCopyTimerRef.current = window.setTimeout(() => {
      setMindCopyStatus('idle');
      setMindCopyId(null);
      mindCopyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const downloadFilteredLibrary = () => {
    const ok = downloadMarkdownFile(buildFilteredLibraryMarkdown(), 'arena-personas-library');
    if (libraryDownloadTimerRef.current != null) {
      window.clearTimeout(libraryDownloadTimerRef.current);
    }
    setLibraryDownloadStatus(ok ? 'done' : 'failed');
    setToast({
      message: ok
        ? 'Library downloaded as markdown'
        : 'Could not download library — try Copy instead',
      color: ok ? '#1A1714' : '#E57373',
      iconColor: ok ? '#C4956A' : '#FAF7F4',
      kind: ok ? 'success' : 'error',
    });
    const hold = motionDuration(ok ? 2200 : 3000);
    libraryDownloadTimerRef.current = window.setTimeout(() => {
      setLibraryDownloadStatus('idle');
      libraryDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

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
  }, [filteredLibrary.length, libraryQuery, librarySort, libraryAvailability]);

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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <p style={{ ...eyebrowStyle, margin: 0 }}>
                Full library · {filteredLibrary.length}
                {libraryQuery.trim() || libraryAvailability !== 'all'
                  ? ` / ${personas.length}`
                  : ' personas'}
              </p>
              {personas.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => void copyFilteredLibrary()}
                    title="Copy current library view as markdown"
                    aria-label={
                      libraryCopyStatus === 'copied'
                        ? 'Library copied'
                        : libraryCopyStatus === 'failed'
                          ? 'Copy failed'
                          : 'Copy persona library as markdown'
                    }
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 6,
                      padding: '2px 7px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color:
                        libraryCopyStatus === 'failed'
                          ? '#D85A30'
                          : libraryCopyStatus === 'copied'
                            ? '#5A8C6A'
                            : '#A89070',
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                      lineHeight: 1.4,
                    }}
                  >
                    {libraryCopyStatus === 'copied'
                      ? 'Copied'
                      : libraryCopyStatus === 'failed'
                        ? 'Failed'
                        : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFilteredLibrary()}
                    title="Download current library view as markdown"
                    aria-label={
                      libraryDownloadStatus === 'done'
                        ? 'Library downloaded'
                        : libraryDownloadStatus === 'failed'
                          ? 'Download failed'
                          : 'Download persona library as markdown'
                    }
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 6,
                      padding: '2px 7px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color:
                        libraryDownloadStatus === 'failed'
                          ? '#D85A30'
                          : libraryDownloadStatus === 'done'
                            ? '#5A8C6A'
                            : '#A89070',
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                      lineHeight: 1.4,
                    }}
                  >
                    {libraryDownloadStatus === 'done'
                      ? 'Downloaded'
                      : libraryDownloadStatus === 'failed'
                        ? 'Failed'
                        : 'Download'}
                  </button>
                </div>
              ) : null}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flex: '1 1 280px',
                maxWidth: 420,
                minWidth: 200,
              }}
            >
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
              {personas.length > 1 ? (
                <select
                  value={librarySort}
                  onChange={(e) => setLibrarySort(e.target.value as PersonasLibrarySort)}
                  aria-label="Sort persona library"
                  title="Sort persona library"
                  style={{
                    fontSize: 12,
                    fontFamily: 'Georgia, serif',
                    color: '#4A3728',
                    background: '#FAF7F4',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: 10,
                    padding: '9px 10px',
                    cursor: 'pointer',
                    flex: '0 0 auto',
                    maxWidth: 150,
                  }}
                >
                  {PERSONAS_LIBRARY_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {personas.length > 0 ? (
            <div
              role="group"
              aria-label="Filter persona library by availability"
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                marginBottom: 14,
                alignItems: 'center',
              }}
            >
              {PERSONAS_LIBRARY_AVAILABILITY_OPTIONS.map((opt) => {
                const selected = libraryAvailability === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLibraryAvailability(opt.value)}
                    aria-pressed={selected}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 999,
                      border: selected ? 'none' : '0.5px solid #E0D8D0',
                      background: selected ? '#C4956A' : 'transparent',
                      color: selected ? '#FAF7F4' : '#6B6460',
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

          {filteredLibrary.length === 0 ? (
            <EmptyState
              variant="filter"
              icon={<Sparkles width={24} height={24} strokeWidth={1.5} aria-hidden />}
              title={
                libraryQuery.trim()
                  ? `No minds match “${libraryQuery.trim()}”${
                      libraryAvailability !== 'all'
                        ? ` in ${personasLibraryAvailabilityLabel(libraryAvailability).toLowerCase()}`
                        : ''
                    }`
                  : libraryAvailability === 'on_panel'
                    ? 'No minds currently on your panel in this view.'
                    : libraryAvailability === 'unlocked'
                      ? 'No unlocked minds match this view.'
                      : libraryAvailability === 'locked'
                        ? 'No locked minds — your tier unlocks the full library.'
                        : 'No minds in this view.'
              }
              description={
                libraryQuery.trim()
                  ? 'Try a name, quote fragment, or trait — for example “analyst” or “what works”.'
                  : 'Clear the availability filter to browse every mind again.'
              }
              actions={
                <button
                  type="button"
                  className="arena-btn arena-btn--ghost arena-btn--md"
                  onClick={() => {
                    setLibraryQuery('');
                    setLibraryAvailability('all');
                    librarySearchRef.current?.focus();
                  }}
                >
                  {libraryAvailability !== 'all' && !libraryQuery.trim()
                    ? 'Show all minds'
                    : 'Clear filters'}
                </button>
              }
            />
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
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>
                      <HighlightQuery text={persona.name} query={libraryQuery} />
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B6460', fontStyle: 'italic', marginTop: '.4rem', lineHeight: 1.6 }}>
                    <HighlightQuery text={persona.quote} query={libraryQuery} />
                  </p>
                  <p style={{ fontSize: '12px', color: '#6B6460', lineHeight: 1.6, marginTop: '.7rem' }}>
                    <HighlightQuery text={persona.description} query={libraryQuery} />
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      marginTop: '0.85rem',
                      minHeight: 22,
                    }}
                  >
                    {inSlot ? (
                      <span
                        style={{
                          background: '#F0EBE3',
                          color: '#6B6460',
                          fontSize: '10px',
                          padding: '3px 8px',
                          borderRadius: '999px',
                        }}
                      >
                        In slot {inSlot}
                      </span>
                    ) : isLocked ? (
                      <span
                        style={{
                          background: '#C4956A',
                          color: '#FAF7F4',
                          fontSize: '10px',
                          padding: '3px 8px',
                          borderRadius: '999px',
                        }}
                      >
                        Plus
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyLibraryMind({
                          id: persona.id,
                          name: persona.name,
                          quote: persona.quote,
                          description: persona.description,
                          onPanel: inSlot != null,
                          unlocked: !isLocked,
                        });
                      }}
                      title={`Copy ${persona.name} as markdown`}
                      aria-label={`Copy ${persona.name} as markdown`}
                      style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 11,
                        fontFamily: 'Georgia, serif',
                        cursor: 'pointer',
                        color:
                          mindCopyId === persona.id && mindCopyStatus === 'failed'
                            ? '#993C1D'
                            : mindCopyId === persona.id && mindCopyStatus === 'copied'
                              ? '#3F6B4A'
                              : '#C4956A',
                      }}
                    >
                      {mindCopyId === persona.id && mindCopyStatus === 'copied'
                        ? 'Copied'
                        : mindCopyId === persona.id && mindCopyStatus === 'failed'
                          ? 'Failed'
                          : 'Copy mind'}
                    </button>
                  </div>
                  {isLocked && (
                    <div
                      style={{
                        marginTop: 10,
                        background: '#1A1714',
                        color: '#FAF7F4',
                        fontSize: '11px',
                        padding: '5px 12px',
                        borderRadius: '999px',
                        display: 'inline-block',
                      }}
                    >
                      Unlock with Plus — $12/month
                    </div>
                  )}
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

            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
              {modalOptions.length > 1 ? (
                <select
                  value={swapSort}
                  onChange={(e) => setSwapSort(e.target.value as PersonasLibrarySort)}
                  aria-label="Sort minds to swap"
                  title="Sort minds to swap"
                  style={{
                    fontSize: 12,
                    fontFamily: 'Georgia, serif',
                    color: '#4A3728',
                    background: '#FFFFFF',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: 10,
                    padding: '9px 10px',
                    cursor: 'pointer',
                    flex: '0 0 auto',
                    maxWidth: 150,
                  }}
                >
                  {PERSONAS_LIBRARY_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            {modalOptions.length > 0 ? (
              <div
                role="group"
                aria-label="Filter swap candidates by availability"
                style={{
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                  alignItems: 'center',
                }}
              >
                {PERSONAS_LIBRARY_AVAILABILITY_OPTIONS.map((opt) => {
                  const selected = swapAvailability === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSwapAvailability(opt.value)}
                      aria-pressed={selected}
                      style={{
                        padding: '4px 11px',
                        borderRadius: 999,
                        border: selected ? 'none' : '0.5px solid #E0D8D0',
                        background: selected ? '#C4956A' : 'transparent',
                        color: selected ? '#FAF7F4' : '#6B6460',
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

            <p style={{ ...eyebrowStyle, marginBottom: '.8rem' }}>
              Available to swap
              {swapQuery.trim() || swapSort !== 'default' || swapAvailability !== 'all'
                ? ` · ${filteredSwapOptions.length} / ${modalOptions.length}`
                : ` · ${modalOptions.length}`}
              {swapAvailability !== 'all'
                ? ` · ${personasLibraryAvailabilityLabel(swapAvailability)}`
                : ''}
              {swapSort !== 'default'
                ? ` · ${PERSONAS_LIBRARY_SORT_OPTIONS.find((o) => o.value === swapSort)?.label}`
                : ''}
            </p>
            {filteredSwapOptions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#1A1714', fontWeight: 500 }}>
                  {swapQuery.trim()
                    ? `No minds match “${swapQuery.trim()}”${
                        swapAvailability !== 'all'
                          ? ` in ${personasLibraryAvailabilityLabel(swapAvailability).toLowerCase()}`
                          : ''
                      }`
                    : swapAvailability === 'on_panel'
                      ? 'No other panel minds to swap with.'
                      : swapAvailability === 'unlocked'
                        ? 'No unlocked minds available for this slot.'
                        : swapAvailability === 'locked'
                          ? 'No locked minds in this view.'
                          : 'No minds available to swap.'}
                </p>
                <button
                  type="button"
                  className="arena-btn arena-btn--ghost arena-btn--sm"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setSwapQuery('');
                    setSwapAvailability('all');
                    swapSearchRef.current?.focus();
                  }}
                >
                  {swapAvailability !== 'all' && !swapQuery.trim()
                    ? 'Show all minds'
                    : 'Clear filters'}
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
                          <HighlightQuery text={persona.name} query={swapQuery} />
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#6B6460', lineHeight: 1.5, marginTop: '.4rem' }}>
                        <HighlightQuery text={persona.description} query={swapQuery} />
                      </p>
                      <p
                        style={{
                          fontSize: '11px',
                          color: '#6B6460',
                          fontStyle: 'italic',
                          marginTop: '.4rem',
                        }}
                      >
                        <HighlightQuery text={persona.quote} query={swapQuery} />
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
