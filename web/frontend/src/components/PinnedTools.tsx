import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pin, PinOff, X } from 'lucide-react';
import {
  readPinnedTools,
  togglePinnedTool,
  clearPinnedTools,
} from '../lib/pinnedTools';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

export interface PinnedToolsProps {
  /** Heading shown above the bar. */
  heading?: string;
  /**
   * Increment any time the pin set changes (e.g. after Shift + E
   * toggles). When the value changes, the affected chip plays a
   * brief one-shot pulse animation so the user sees the change.
   * The parent tracks which path was toggled and supplies it via
   * `pulsePath`.
   */
  pulseTick?: number;
  /** Path of the chip that should pulse when `pulseTick` changes. */
  pulsePath?: string | null;
}

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

const STORAGE_KEY = 'arena:persona-playground:pinned-tools:v1';

/**
 * Sticky bar at the top of the hub showing the user's pinned
 * persona tools (up to 3). Each chip is a Link + a small
 * unpin button. Empty state (no pins) is hidden so first-time
 * visitors don't see a meaningless empty bar.
 *
 * Subscribes to the storage event for cross-tab sync.
 */
export function PinnedTools({
  heading = 'Pinned tools',
  pulseTick = 0,
  pulsePath = null,
}: PinnedToolsProps) {
  const [paths, setPaths] = useState<readonly string[]>([]);
  const [pulsingPath, setPulsingPath] = useState<string | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setPaths(readPinnedTools(window.localStorage));
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) {
        window.clearTimeout(pulseTimerRef.current);
      }
    };
  }, []);

  // When the parent bumps the pulse tick, mark the affected path
  // as pulsing for ~1.5s so the chip animation can play once.
  useEffect(() => {
    if (pulseTick === 0 || !pulsePath) return;
    if (pulseTimerRef.current !== null) {
      window.clearTimeout(pulseTimerRef.current);
    }
    setPulsingPath(pulsePath);
    pulseTimerRef.current = window.setTimeout(() => {
      setPulsingPath(null);
      pulseTimerRef.current = null;
    }, 1500);
  }, [pulseTick, pulsePath]);

  const onUnpin = useCallback(
    (path: string) => {
      if (typeof window === 'undefined') return;
      togglePinnedTool(window.localStorage, path);
      refresh();
    },
    [refresh],
  );

  const onClearAll = useCallback(() => {
    if (typeof window === 'undefined') return;
    clearPinnedTools(window.localStorage);
    setPaths([]);
  }, []);

  if (paths.length === 0) return null;

  return (
    <section className="ppg-pinned" aria-label={heading}>
      <header className="ppg-pinned__head">
        <p className="ppg-pinned__eyebrow">
          <Pin aria-hidden="true" /> {heading}
          <span className="ppg-pinned__count" aria-label={`${paths.length} of 3 slots used`}>
            {paths.length}/3
          </span>
          <kbd className="ppg-pinned__shortcut" aria-hidden="true">
            Shift + E
          </kbd>
        </p>
        <button
          type="button"
          className="ppg-pinned__clear"
          onClick={onClearAll}
          aria-label="Unpin all tools"
        >
          <PinOff aria-hidden="true" />
          <span>Unpin all</span>
        </button>
      </header>
      <ul className="ppg-pinned__list">
        {paths.map((path) => {
          const tool = TOOL_BY_PATH.get(path);
          if (!tool) return null;
          const isPulsing = pulsingPath === path;
          const itemClass = isPulsing
            ? 'ppg-pinned__item ppg-pinned__item--pulse'
            : 'ppg-pinned__item';
          return (
            <li key={path} className={itemClass}>
              <Link to={path} className="ppg-pinned__chip">
                <span className="ppg-pinned__name">{tool.name}</span>
                <span className="ppg-pinned__tagline">{tool.tagline}</span>
              </Link>
              <button
                type="button"
                className="ppg-pinned__unpin"
                onClick={() => onUnpin(path)}
                aria-label={`Unpin ${tool.name}`}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default PinnedTools;