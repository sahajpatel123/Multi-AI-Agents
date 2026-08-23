import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Command, Search, Sparkles, X } from 'lucide-react';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  personaPlaygroundCategoryLabel,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';
import {
  clampIndex,
  filterForPalette,
  isPaletteOpenKey,
} from '../lib/commandPalette';
import { shouldCaptureSlashFocus } from '../lib/slashFocus';
import { prefersReducedMotion } from '../lib/motion';
import { HighlightQuery } from './HighlightQuery';

export interface ToolSearchPaletteProps {
  /** Heading shown in the palette header. */
  heading?: string;
  /** Placeholder for the search input. */
  placeholder?: string;
  /** Optional subset to filter from (defaults to the full catalog). */
  entries?: readonly PersonaPlaygroundEntry[];
}

const MAX_RESULTS = 8;

function formatKeyHint(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  return isMac ? '⌘ K' : 'Ctrl K';
}

function formatKeyHintLong(): string {
  if (typeof navigator === 'undefined') return 'Ctrl + K';
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  return isMac ? '⌘ K' : 'Ctrl + K';
}

/**
 * Press Cmd/Ctrl-K (or just `K` outside a field) to open a
 * command-palette-style launcher that jumps to any of the persona
 * tools. Type to filter, ↑/↓ to navigate, Enter to jump, Esc to
 * close. Closes itself on navigation.
 */
export function ToolSearchPalette({
  heading = 'Jump to a tool',
  placeholder = 'Type a tool name, format, or idea…',
  entries,
}: ToolSearchPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const headingId = useId();
  const navigate = useNavigate();
  const reduceMotion = prefersReducedMotion();
  const keyHint = useMemo(formatKeyHint, []);
  const keyHintLong = useMemo(formatKeyHintLong, []);

  const catalog = entries ?? PERSONA_PLAYGROUND_ENTRIES;
  const matches = useMemo(
    () => filterForPalette(catalog, query).slice(0, MAX_RESULTS),
    [catalog, query],
  );

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery('');
    setActive(0);
  }, []);

  const goToMatch = useCallback(
    (index: number) => {
      const m = matches[index];
      if (!m) return;
      navigate(m.entry.path);
      closePalette();
    },
    [matches, navigate, closePalette],
  );

  // Global keydown — opens the palette and listens for Esc inside it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        closePalette();
        return;
      }
      if (open) return;
      if (!isPaletteOpenKey(event)) return;
      if (!shouldCaptureSlashFocus(event.target)) return;
      event.preventDefault();
      openPalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closePalette, openPalette]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus the search field on open.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Clamp the active row when results change.
  useEffect(() => {
    setActive((cur) => clampIndex(cur, matches.length, 0));
  }, [matches.length]);

  // Scroll the active row into view as the user navigates with the
  // keyboard. Mouse hover already drives `active`; this effect keeps
  // both input sources in sync with the visible viewport. Guarded for
  // jsdom environments that don't implement scrollIntoView.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `#palette-result-${CSS.escape(matches[active]?.entry.path ?? '')}`,
    );
    if (!node) return;
    if (typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [active, matches, open, reduceMotion]);

  const onInputKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((cur) => clampIndex(cur + 1, matches.length, 0));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((cur) => clampIndex(cur - 1, matches.length, 0));
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        setActive(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        setActive(Math.max(0, matches.length - 1));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        goToMatch(active);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closePalette();
        return;
      }
    },
    [matches.length, active, goToMatch, closePalette],
  );

  if (!open) return null;

  const overlayClass = `palette-overlay${reduceMotion ? ' palette-overlay--static' : ''}`;
  const panelClass = `palette-panel${reduceMotion ? ' palette-panel--static' : ''}`;

  return (
    <div
      className={overlayClass}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={panelClass}
      >
        <header className="palette-head">
          <div className="palette-head__icon" aria-hidden>
            <Sparkles width={16} height={16} strokeWidth={1.75} />
          </div>
          <h2 id={headingId} className="palette-head__title">
            {heading}
          </h2>
          <button
            type="button"
            className="palette-head__close"
            onClick={closePalette}
            aria-label="Close tool launcher"
          >
            <X width={16} height={16} aria-hidden />
          </button>
        </header>

        <div className="palette-search">
          <Search aria-hidden="true" className="palette-search__icon" />
          <input
            ref={inputRef}
            type="search"
            className="palette-search__input"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            aria-controls="palette-results"
            aria-activedescendant={
              matches[active] ? `palette-result-${matches[active].entry.path}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="palette-search__hint" aria-hidden>
            {keyHint}
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="palette-results"
          role="listbox"
          className="palette-list"
          aria-label="Matching persona tools"
        >
          {matches.length === 0 ? (
            <li className="palette-empty" role="status">
              <p>No tools match that search yet.</p>
              <p className="palette-empty__hint">
                Try a name like “Mosaic” or a format like “4-mind panel”.
              </p>
            </li>
          ) : (
            matches.map((match, index) => {
              const isActive = index === active;
              return (
                <li
                  key={match.entry.path}
                  id={`palette-result-${match.entry.path}`}
                  role="option"
                  aria-selected={isActive}
                  className={`palette-row${isActive ? ' palette-row--active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => goToMatch(index)}
                >
                  <div className="palette-row__copy">
                    <span className="palette-row__name">
                      <HighlightQuery text={match.entry.name} query={query} />
                    </span>
                    <span className="palette-row__tagline">
                      <HighlightQuery text={match.entry.tagline} query={query} />
                    </span>
                  </div>
                  <span className="palette-row__meta">
                    <span className="palette-row__cat">
                      {personaPlaygroundCategoryLabel(match.entry.category)}
                    </span>
                    <ArrowRight aria-hidden width={14} height={14} />
                  </span>
                </li>
              );
            })
          )}
        </ul>

        <footer className="palette-foot">
          <span className="palette-foot__keys">
            <kbd className="palette-foot__kbd">↑</kbd>
            <kbd className="palette-foot__kbd">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="palette-foot__keys">
            <kbd className="palette-foot__kbd">↵</kbd>
            <span>Open</span>
          </span>
          <span className="palette-foot__keys">
            <kbd className="palette-foot__kbd">Esc</kbd>
            <span>Close</span>
          </span>
          <span className="palette-foot__shortcut" aria-hidden>
            <Command width={11} height={11} strokeWidth={2} />
            {keyHintLong.replace(/^[^\s]+\s/, '')}
          </span>
        </footer>
      </div>
    </div>
  );
}

export default ToolSearchPalette;
