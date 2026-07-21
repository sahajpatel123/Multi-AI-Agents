import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ArrowRight, Lock, Sparkles, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Pressable } from '../components/Pressable';
import { Reveal } from '../components/Reveal';
import { AgentDot } from '../components/AgentDot';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
import { HighlightQuery } from '../components/HighlightQuery';
import { EmptyState } from '../components/EmptyState';
import { PersonasSearchInput } from '../components/PersonasSearchInput';
import { PersonasAvailabilityFilters } from '../components/PersonasAvailabilityFilters';
import { usePanel } from '../context/PanelContext';
import { useTier } from '../context/TierContext';
import { useAuth } from '../hooks/useAuth';
import { type Persona } from '../data/personas';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { motionDuration } from '../lib/motion';
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
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/personas-page.css';

type SlotIndex = 0 | 1 | 2 | 3;

interface ToastState {
  message: string;
  color: string;
  iconColor?: string;
  kind?: PanelSaveToastKind;
}


const PERSONA_LENSES: Record<string, string> = {
  analyst: 'Which assumption breaks the case first?',
  philosopher: 'What if the question is framed incorrectly?',
  pragmatist: 'What can we test this week with real users?',
  contrarian: 'What does the current consensus refuse to admit?',
  scientist: 'What evidence would change the decision?',
  historian: 'Where has this pattern appeared before?',
  economist: 'Which incentives shape the second-order outcome?',
  ethicist: 'Who benefits, who pays, and who lacks a voice?',
  stoic: 'Which part of this decision is actually controllable?',
  futurist: 'What does this compound into over ten years?',
  strategist: 'Where is the leverage, timing, or asymmetric move?',
  engineer: 'Which constraint or failure mode arrives first?',
  optimist: 'What mechanism could make the upside real?',
  empath: 'Who experiences the cost most directly?',
  firstprinciples: 'What remains true after every assumption is removed?',
  devilsadvocate: 'What is the strongest case against this direction?',
};


export function PersonasPage() {
  const navigate = useNavigate();
  const { panel, personas, swapAgent, resetPanel, savePanel, isDefaultPanel } = usePanel();
  const { canUsePersona } = useTier();
  const { isAuthenticated } = useAuth();
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
  const [libraryQuery, setLibraryQuery] = useState('');
  const [librarySort, setLibrarySort] = useState<PersonasLibrarySort>('default');
  const [libraryAvailability, setLibraryAvailability] =
    useState<PersonasLibraryAvailability>('all');
  const [swapQuery, setSwapQuery] = useState('');
  const [swapSort, setSwapSort] = useState<PersonasLibrarySort>('default');
  const [swapAvailability, setSwapAvailability] =
    useState<PersonasLibraryAvailability>('all');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [showAllLibrary, setShowAllLibrary] = useState(false);
  const [inspectedSlot, setInspectedSlot] = useState<SlotIndex>(0);
  const librarySearchRef = useRef<HTMLInputElement | null>(null);
  const swapSearchRef = useRef<HTMLInputElement | null>(null);
  const swapDialogRef = useRef<HTMLDivElement | null>(null);
  const lastSwapTriggerRef = useRef<HTMLElement | null>(null);
  const slotLabels = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'] as const;
  const activePersona = activeSlot !== null ? panel[activeSlot] : null;
  const panelTemperature = panel.length
    ? panel.reduce((total, persona) => total + persona.temperature, 0) / panel.length
    : 0;
  const panelFloor = panel.length ? Math.min(...panel.map((persona) => persona.temperature)) : 0;
  const panelCeiling = panel.length ? Math.max(...panel.map((persona) => persona.temperature)) : 0;
  const panelSignal = panelTemperature < 0.4
    ? 'Measured precision'
    : panelTemperature < 0.7
      ? 'Productive tension'
      : 'High divergence';
  const inspectedPersona = panel[inspectedSlot] ?? panel[0];

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setPageVisible(true));
    void track('personas_viewed');
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const openSwap = useCallback((slot: SlotIndex, trigger?: HTMLElement) => {
    lastSwapTriggerRef.current = trigger ?? document.activeElement as HTMLElement | null;
    setActiveSlot(slot);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSwapQuery('');
    setSwapSort('default');
    setSwapAvailability('all');
    const delay = motionDuration(220);
    window.setTimeout(() => {
      setActiveSlot(null);
      lastSwapTriggerRef.current?.focus();
    }, delay > 0 ? delay : 0);
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
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        swapDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
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
      iconColor: '#F0B84E',
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
      iconColor: ok ? '#F0B84E' : '#0B0C0A',
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
      iconColor: ok ? '#F0B84E' : '#0B0C0A',
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

  const libraryIsFiltered = Boolean(libraryQuery.trim()) || libraryAvailability !== 'all' || librarySort !== 'default';
  const displayedLibrary = showAllLibrary || libraryIsFiltered
    ? filteredLibrary
    : filteredLibrary.slice(0, 8);

  const requestedPersona = personas.find((persona) => persona.id === selectedPersonaId);
  const selectedPersona =
    (requestedPersona && displayedLibrary.some((persona) => persona.id === requestedPersona.id)
      ? requestedPersona
      : displayedLibrary[0]) ??
    null;


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
      iconColor: ok ? '#F0B84E' : '#0B0C0A',
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
        iconColor: '#0B0C0A',
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
      iconColor: ok ? '#F0B84E' : '#0B0C0A',
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
      iconColor: ok ? '#F0B84E' : '#0B0C0A',
      kind: ok ? 'success' : 'error',
    });
    const hold = motionDuration(ok ? 2200 : 3000);
    libraryDownloadTimerRef.current = window.setTimeout(() => {
      setLibraryDownloadStatus('idle');
      libraryDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

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
    if (!isAuthenticated) {
      setRedirectIntent('/personas');
      navigate('/signin?tab=signin');
      return;
    }
    if (savingPanel) return;
    setSavingPanel(true);
    try {
      await savePanel();
      void track('panel_saved');
      setToast({
        message: panelSaveSuccessMessage(),
        color: '#1A1714',
        iconColor: '#F0B84E',
        kind: 'success',
      });
    } catch (err) {
      setToast({
        message: panelSaveCaughtErrorMessage(err),
        color: '#E57373',
        iconColor: '#0B0C0A',
        kind: 'error',
      });
    } finally {
      setSavingPanel(false);
    }
  };

  return (
    <div className="personas-page">
      <Navbar />

      <main
        id="main-content"
        className="personas-page__main"
        tabIndex={-1}
        aria-labelledby="personas-title"
      >
        <section
          className={`personas-studio-hero${pageVisible ? ' is-visible' : ''}`}
          aria-labelledby="personas-title"
        >
          <div className="personas-studio-hero__copy">
            <p className="personas-studio-kicker">
              <span aria-hidden="true" />
              The persona system
            </p>
            <h1 id="personas-title">
              Build useful <em>disagreement.</em>
            </h1>
            <p>
              Four distinct reasoning styles examine the same question. Choose the tension you
              need—not four versions of the same agreeable answer.
            </p>
            <div className="personas-studio-hero__actions">
              <a href="#panel-studio">Tune your panel <ArrowRight aria-hidden="true" /></a>
              <Pressable type="button" onClick={() => navigate('/app')}>Enter Arena</Pressable>
            </div>
            <dl className="personas-studio-proof">
              <div><dt>16</dt><dd>reasoning styles</dd></div>
              <div><dt>04</dt><dd>panel slots</dd></div>
              <div><dt>01</dt><dd>independent judge</dd></div>
            </dl>
          </div>

          <div className="personas-hero-instrument" aria-hidden="true">
            <header><span>YOUR QUESTION</span><b>INPUT / 01</b></header>
            <div className="personas-hero-instrument__question">?</div>
            <div className="personas-hero-instrument__minds">
              {panel.map((persona, index) => (
                <div key={`${persona.id}-hero`} style={{ '--tone': persona.color } as CSSProperties}>
                  <small>0{index + 1}</small>
                  <strong>{persona.name.replace('The ', '')}</strong>
                  <i />
                </div>
              ))}
            </div>
            <footer><span>INDEPENDENT RESPONSES</span><span>→ JUDGE 05</span></footer>
          </div>
        </section>

        <Reveal as="section" id="panel-studio" className="personas-studio-section personas-panel-studio" aria-labelledby="panel-studio-title">
          <header className="personas-studio-section__head">
            <div>
              <span className="personas-studio-eyebrow">Your panel</span>
              <h2 id="panel-studio-title">Shape the room before asking the question.</h2>
            </div>
            <p>
              Each slot contributes a different failure mode. Swap a mind, watch the panel
              fingerprint change, then save the combination that fits your work.
            </p>
          </header>

          <div
            className="personas-council"
            style={{ '--focus-color': inspectedPersona?.color ?? '#A98CF8' } as CSSProperties}
          >
            <header className="personas-council__bar">
              <div><i aria-hidden="true" /><strong>Live composition</strong></div>
              <span>{isDefaultPanel ? 'Default panel' : 'Custom panel'}</span>
              <span>04 minds / 01 shared question</span>
            </header>

            <div className="personas-council__field">
              {inspectedPersona && (
                <aside
                  className="personas-council__lens"
                  aria-label="Inspected panel lens"
                  aria-live="polite"
                >
                  <header>
                    <span>Shared question / inspected by</span>
                    <strong>0{inspectedSlot + 1}</strong>
                  </header>
                  <div>
                    <small>{inspectedPersona.name}</small>
                    <p>“{PERSONA_LENSES[inspectedPersona.id] ?? inspectedPersona.description}”</p>
                  </div>
                  <footer>
                    <span>Choose lens</span>
                    <div role="group" aria-label="Inspect panel slot">
                      {panel.map((persona, index) => (
                        <button
                          key={`${persona.id}-inspect-control`}
                          type="button"
                          aria-pressed={inspectedSlot === index}
                          aria-label={`Inspect slot ${index + 1}: ${persona.name}`}
                          onClick={() => setInspectedSlot(index as SlotIndex)}
                        >
                          0{index + 1}
                        </button>
                      ))}
                    </div>
                  </footer>
                </aside>
              )}

              <div className="current-panel-grid" role="list" aria-label="Current panel slots">
                {panel.map((persona, index) => {
                  const slot = index as SlotIndex;
                  const isInspected = inspectedSlot === slot;
                  return (
                    <article
                      key={`${persona.id}-${index}`}
                      role="listitem"
                      className={`personas-panel-card${isInspected ? ' is-inspected' : ''}`}
                      style={{
                        '--slot-color': persona.color,
                        '--slot-level': `${Math.max(10, persona.temperature * 100)}%`,
                      } as CSSProperties}
                    >
                      <div className="personas-panel-card__rail" aria-hidden="true" />
                      <header className="personas-panel-card__meta">
                        <span>SLOT {index + 1}</span>
                        <span>
                          <AgentDot agentId={`agent_${index + 1}`} size={7} color={persona.color} />
                          DIVERGENCE {persona.temperature.toFixed(1)}
                        </span>
                      </header>
                      <div className="personas-panel-card__identity">
                        <h3 className="personas-panel-card__name">{persona.name}</h3>
                        <p className="personas-panel-card__quote">“{persona.quote}”</p>
                      </div>
                      <p className="personas-panel-card__function">
                        {PERSONA_LENSES[persona.id] ?? persona.description}
                      </p>
                      <div className="personas-panel-card__pressure" aria-hidden="true">
                        <span>Reasoning pressure</span>
                        <i><b /></i>
                      </div>
                      <footer className="personas-panel-card__controls">
                        <button
                          type="button"
                          className="personas-inspect-btn"
                          aria-pressed={isInspected}
                          aria-label={`Inspect ${persona.name} lens in slot ${index + 1}`}
                          onClick={() => setInspectedSlot(slot)}
                        >
                          <span>{isInspected ? 'Lens in focus' : 'Inspect lens'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => openSwap(slot, event.currentTarget)}
                          className="personas-swap-btn"
                          aria-label={`Swap ${persona.name} in slot ${index + 1}`}
                        >
                          Swap <ArrowRight aria-hidden="true" />
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>

            </div>

            <aside className="personas-panel-signature personas-council__reading" aria-label="Current panel fingerprint">
              <header>
                <span><i aria-hidden="true" /> Live panel reading</span>
                <b>Configuration / not outcome</b>
              </header>
              <div className="personas-council__reading-body">
                <div className="personas-panel-signature__signal">
                  <small>Current signal</small>
                  <strong>{panelSignal}<em>.</em></strong>
                  <p>Four persona settings, read as one composition.</p>
                </div>
                <dl>
                  <div><dt>{panelTemperature.toFixed(2)}</dt><dd>average divergence</dd></div>
                  <div><dt>{panelFloor.toFixed(1)}—{panelCeiling.toFixed(1)}</dt><dd>reasoning range</dd></div>
                  <div><dt>{new Set(panel.map((persona) => persona.id)).size}/4</dt><dd>distinct lenses</dd></div>
                </dl>
                <div className="personas-panel-signature__spectrum" aria-hidden="true">
                  {panel.map((persona, index) => (
                    <div key={`${persona.id}-reading`}>
                      <header><small>0{index + 1}</small><span>{persona.name.replace('The ', '')}</span><b>{persona.temperature.toFixed(1)}</b></header>
                      <i><span style={{ width: `${Math.max(10, persona.temperature * 100)}%`, background: persona.color }} /></i>
                    </div>
                  ))}
                </div>
              </div>
              <p>Configuration indicators describe persona settings—not answer quality or certainty.</p>
            </aside>

            <div className="personas-panel-actions personas-council__actions">
              <div className="personas-panel-actions__primary">
                <button
                  type="button"
                  onClick={() => void handleSavePanel()}
                  className="save-panel-btn"
                  disabled={savingPanel}
                  aria-busy={savingPanel}
                  aria-label={isAuthenticated ? panelSaveButtonLabel(savingPanel) : 'Sign in to save panel'}
                >
                  {isAuthenticated ? panelSaveButtonLabel(savingPanel) : 'Sign in to save panel'}
                </button>
                <button
                  type="button"
                  onClick={() => void copyPanelMarkdown()}
                  className={`personas-ghost-btn${panelCopyStatus === 'copied' ? ' personas-ghost-btn--ok' : panelCopyStatus === 'failed' ? ' personas-ghost-btn--err' : ''}`}
                  aria-label={panelCopyStatus === 'copied' ? 'Panel copied' : panelCopyStatus === 'failed' ? 'Copy failed' : 'Copy panel as markdown'}
                >
                  {panelCopyStatus === 'copied' ? 'Copied' : panelCopyStatus === 'failed' ? 'Copy failed' : 'Copy panel'}
                </button>
                <button
                  type="button"
                  onClick={downloadPanelMarkdown}
                  className={`personas-ghost-btn${panelDownloadStatus === 'done' ? ' personas-ghost-btn--ok' : panelDownloadStatus === 'failed' ? ' personas-ghost-btn--err' : ''}`}
                  aria-label={panelDownloadStatus === 'done' ? 'Panel downloaded' : panelDownloadStatus === 'failed' ? 'Download failed' : 'Download panel as markdown'}
                >
                  {panelDownloadStatus === 'done' ? 'Downloaded' : panelDownloadStatus === 'failed' ? 'Download failed' : 'Download .md'}
                </button>
              </div>
              {!isDefaultPanel ? (
                <button
                  type="button"
                  onClick={handleResetPanel}
                  aria-label={pendingReset ? 'Confirm reset panel to default minds' : 'Reset panel to default minds'}
                  className={`personas-reset-btn${pendingReset ? ' personas-reset-btn--confirm' : ''}`}
                >
                  {pendingReset ? 'Confirm reset' : 'Reset default'}
                </button>
              ) : <span className="personas-panel-actions__status">DEFAULT PANEL / UNSAVED CHANGES: NONE</span>}
            </div>
          </div>
        </Reveal>

        <Reveal as="section" className="personas-studio-section personas-page__library" aria-labelledby="library-title">
          <header className="personas-studio-section__head personas-library-title-row">
            <div>
              <span className="personas-studio-eyebrow">Mind index</span>
              <h2 id="library-title">Inspect every reasoning style.</h2>
            </div>
            <p>
              Search by trait, compare each lens, then place a mind directly into any slot.
              Six starter personas are available on Free; paid plans unlock the full catalog.
            </p>
          </header>

          <div className="personas-library-toolbar">
            <div className="personas-search__row">
              <PersonasSearchInput
                inputRef={librarySearchRef}
                value={libraryQuery}
                onChange={setLibraryQuery}
                onClear={() => setLibraryQuery('')}
                placeholder="Search name, trait, or question…"
                ariaLabel="Search persona library"
                clearAriaLabel="Clear persona search"
              />
              {personas.length > 1 ? (
                <select
                  value={librarySort}
                  onChange={(event) => setLibrarySort(event.target.value as PersonasLibrarySort)}
                  aria-label="Sort persona library"
                  className="personas-sort-select"
                >
                  {PERSONAS_LIBRARY_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : null}
            </div>
            <div className="personas-library-toolbar__meta">
              <span>{String(displayedLibrary.length).padStart(2, '0')} / {String(filteredLibrary.length).padStart(2, '0')} VISIBLE</span>
              <button type="button" onClick={() => void copyFilteredLibrary()} aria-label="Copy persona library as markdown">
                {libraryCopyStatus === 'copied' ? 'Copied' : libraryCopyStatus === 'failed' ? 'Failed' : 'Copy view'}
              </button>
              <button type="button" onClick={downloadFilteredLibrary} aria-label="Download persona library as markdown">
                {libraryDownloadStatus === 'done' ? 'Downloaded' : libraryDownloadStatus === 'failed' ? 'Failed' : 'Download .md'}
              </button>
            </div>
          </div>

          {personas.length > 0 ? (
            <PersonasAvailabilityFilters<PersonasLibraryAvailability>
              options={PERSONAS_LIBRARY_AVAILABILITY_OPTIONS}
              value={libraryAvailability}
              onChange={setLibraryAvailability}
              ariaLabel="Filter persona library by availability"
            />
          ) : null}

          {filteredLibrary.length === 0 ? (
            <EmptyState
              variant="filter"
              icon={<Sparkles width={24} height={24} strokeWidth={1.5} aria-hidden />}
              title={libraryQuery.trim() ? `No minds match “${libraryQuery.trim()}”` : 'No minds in this view.'}
              description="Try a name, quote fragment, or trait—or return to the complete catalog."
              actions={<button type="button" className="arena-btn arena-btn--ghost arena-btn--md" onClick={() => { setLibraryQuery(''); setLibraryAvailability('all'); librarySearchRef.current?.focus(); }}>Clear filters</button>}
            />
          ) : (
            <div className="personas-library-workbench">
              {selectedPersona ? (
                <aside className="personas-profile" style={{ '--tone': selectedPersona.color } as CSSProperties} aria-label={`Selected mind: ${selectedPersona.name}`}>
                  <header><span>SELECTED MIND</span><b>{canUsePersona(selectedPersona.id) ? 'AVAILABLE' : 'PLUS'}</b></header>
                  <div className="personas-profile__number">{String(personas.findIndex((persona) => persona.id === selectedPersona.id) + 1).padStart(2, '0')}</div>
                  <h3>{selectedPersona.name}</h3>
                  <blockquote>“{selectedPersona.quote}”</blockquote>
                  <p>{selectedPersona.description}</p>
                  <div className="personas-profile__lens"><small>FIRST INSPECTION</small><strong>{PERSONA_LENSES[selectedPersona.id] ?? selectedPersona.quote}</strong></div>
                  <dl><div><dt>{selectedPersona.temperature.toFixed(1)}</dt><dd>configured divergence</dd></div><div><dt>{unlockedSlotMap[selectedPersona.id] ? `0${unlockedSlotMap[selectedPersona.id]}` : '—'}</dt><dd>current slot</dd></div></dl>
                  <div className="personas-profile__slots" role="group" aria-label={`Place ${selectedPersona.name} in panel slot`}>
                    {slotLabels.map((label, index) => (
                      <button key={label} type="button" onClick={() => handleSwap(index as SlotIndex, selectedPersona)} aria-label={`Place ${selectedPersona.name} in ${label.toLowerCase()}`}>
                        0{index + 1}
                      </button>
                    ))}
                  </div>
                  {!canUsePersona(selectedPersona.id) ? <button type="button" className="personas-profile__unlock" onClick={() => navigate('/pricing')}>View Plus pricing <ArrowRight aria-hidden="true" /></button> : null}
                </aside>
              ) : null}

              <div className="persona-library-grid">
                {displayedLibrary.map((persona, index) => {
                  const inSlot = unlockedSlotMap[persona.id];
                  const isLocked = !canUsePersona(persona.id);
                  const isSelected = selectedPersona?.id === persona.id;
                  return (
                    <article
                      key={persona.id}
                      className={`personas-lib-card${isLocked ? ' personas-lib-card--locked' : ''}${isSelected ? ' is-selected' : ''}`}
                      style={{ '--persona-color': persona.color } as CSSProperties}
                    >
                      <button type="button" className="personas-lib-card__inspect" aria-pressed={isSelected} onClick={() => setSelectedPersonaId(persona.id)}>
                        <header><small>{String(index + 1).padStart(2, '0')}</small><i /><span>{isLocked ? <Lock aria-hidden="true" /> : null}</span></header>
                        <h3><HighlightQuery text={persona.name} query={libraryQuery} /></h3>
                        <blockquote>“<HighlightQuery text={persona.quote} query={libraryQuery} />”</blockquote>
                        <p><HighlightQuery text={persona.description} query={libraryQuery} /></p>
                      </button>
                      <footer>
                        <span>{inSlot ? `SLOT 0${inSlot}` : isLocked ? 'PLUS' : 'AVAILABLE'}</span>
                        <button
                          type="button"
                          onClick={() => void copyLibraryMind({ id: persona.id, name: persona.name, quote: persona.quote, description: persona.description, onPanel: inSlot != null, unlocked: !isLocked })}
                          aria-label={`Copy ${persona.name} as markdown`}
                        >
                          {mindCopyId === persona.id && mindCopyStatus === 'copied' ? 'Copied' : mindCopyId === persona.id && mindCopyStatus === 'failed' ? 'Failed' : 'Copy'}
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
              {displayedLibrary.length < filteredLibrary.length ? (
                <div className="personas-library-disclosure">
                  <span>{filteredLibrary.length - displayedLibrary.length} more reasoning styles remain in the index.</span>
                  <button type="button" onClick={() => setShowAllLibrary(true)}>Show all {filteredLibrary.length} minds <ArrowRight aria-hidden="true" /></button>
                </div>
              ) : showAllLibrary && !libraryIsFiltered && filteredLibrary.length > 8 ? (
                <div className="personas-library-disclosure">
                  <span>Complete persona index is visible.</span>
                  <button type="button" onClick={() => setShowAllLibrary(false)}>Show fewer minds</button>
                </div>
              ) : null}
            </div>
          )}
        </Reveal>

        <Reveal as="section" className="personas-studio-close" aria-labelledby="personas-close-title">
          <small>THE ROOM IS THE INSTRUMENT</small>
          <h2 id="personas-close-title">Choose minds that fail differently.</h2>
          <p>Then give all four the question you cannot afford to examine from one angle.</p>
          <Pressable type="button" onClick={() => navigate('/app')}>Enter Arena <ArrowRight aria-hidden="true" /></Pressable>
        </Reveal>
      </main>

      <Footer />

      {activeSlot !== null && activePersona ? createPortal(
        <div className="personas-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            ref={swapDialogRef}
            className={`swap-modal${modalVisible ? ' is-visible' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-slot-title"
            aria-describedby="swap-slot-description"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="personas-modal-head">
              <div><small>SLOT 0{activeSlot + 1} / RECONFIGURE</small><h2 id="swap-slot-title">Choose a counterweight.</h2><p id="swap-slot-description">Replacing {activePersona.name}</p></div>
              <button type="button" onClick={closeModal} aria-label="Close swap dialog" className="personas-modal-close"><X aria-hidden="true" /></button>
            </header>

            <div className="personas-modal-controls">
              <div className="personas-search__row personas-search__row--modal">
                <PersonasSearchInput inputRef={swapSearchRef} value={swapQuery} onChange={setSwapQuery} onClear={() => setSwapQuery('')} placeholder="Search minds to swap…" ariaLabel="Search minds to swap into this slot" clearAriaLabel="Clear swap search" variant="swap" />
                {modalOptions.length > 1 ? (
                  <select value={swapSort} onChange={(event) => setSwapSort(event.target.value as PersonasLibrarySort)} aria-label="Sort minds to swap" className="personas-sort-select personas-sort-select--swap">
                    {PERSONAS_LIBRARY_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : null}
              </div>
              {modalOptions.length > 0 ? <PersonasAvailabilityFilters<PersonasLibraryAvailability> options={PERSONAS_LIBRARY_AVAILABILITY_OPTIONS} value={swapAvailability} onChange={setSwapAvailability} ariaLabel="Filter swap candidates by availability" variant="compact" /> : null}
              <p className="personas-modal-count">{String(filteredSwapOptions.length).padStart(2, '0')} / {String(modalOptions.length).padStart(2, '0')} CANDIDATES</p>
            </div>

            {filteredSwapOptions.length === 0 ? (
              <div className="personas-swap-empty"><p>No minds match this view.</p><button type="button" onClick={() => { setSwapQuery(''); setSwapAvailability('all'); swapSearchRef.current?.focus(); }}>Clear filters</button></div>
            ) : (
              <div className="personas-swap-grid">
                {filteredSwapOptions.map((persona) => {
                  const isLocked = !canUsePersona(persona.id);
                  return (
                    <button key={persona.id} type="button" onClick={() => isLocked ? navigate('/pricing') : handleSwap(activeSlot, persona)} className={`personas-swap-option${isLocked ? ' personas-swap-option--locked' : ''}`} style={{ '--persona-color': persona.color } as CSSProperties}>
                      <header><i /><span>{persona.name}</span>{isLocked ? <Lock aria-hidden="true" /> : null}</header>
                      <strong>{PERSONA_LENSES[persona.id] ?? persona.quote}</strong>
                      <p>{persona.description}</p>
                      <footer>{isLocked ? 'VIEW PLUS PRICING' : 'PLACE IN SLOT'} <ArrowRight aria-hidden="true" /></footer>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}

      {toast ? createPortal(
        <div className={`personas-toast${toastVisible ? ' is-visible' : ''}`} role={panelSaveToastRole(toast.kind ?? 'success')} aria-live={panelSaveToastAriaLive(toast.kind ?? 'success')} aria-atomic="true" style={{ '--toast-tone': toast.iconColor ?? '#D7F64A' } as CSSProperties}>
          <Sparkles aria-hidden="true" /><span>{toast.message}</span>
        </div>,
        document.body,
      ) : null}

      <KeyboardShortcutsHelp surface="personas" />
    </div>
  );
}
