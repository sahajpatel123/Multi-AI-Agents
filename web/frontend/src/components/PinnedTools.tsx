import { useCallback, useEffect, useState } from 'react';
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
export function PinnedTools({ heading = 'Pinned tools' }: PinnedToolsProps) {
  const [paths, setPaths] = useState<readonly string[]>([]);

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
          return (
            <li key={path} className="ppg-pinned__item">
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