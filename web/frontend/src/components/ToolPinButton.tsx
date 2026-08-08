import { useCallback, useEffect, useRef, useState } from 'react';
import { Pin } from 'lucide-react';
import { isPinned, togglePinnedTool } from '../lib/pinnedTools';

const STORAGE_KEY = 'arena:persona-playground:pinned-tools:v1';

const LIMIT_HINT_REVERT_MS = 1500;

export interface ToolPinButtonProps {
  /** Persona-tool path to pin/unpin. */
  path: string;
  /** Optional accessible label override. */
  label?: string;
}

/**
 * Compact Pin / Unpin toggle for use inside tool cards. Reads its
 * own state from the shared pinnedTools storage key so multiple
 * instances across the grid stay in sync. Caps at 3 — when the
 * limit is hit, the button shows a disabled state and surfaces a
 * short title hint explaining why.
 */
export function ToolPinButton({ path, label }: ToolPinButtonProps) {
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return isPinned(window.localStorage, path);
  });
  const [limitHit, setLimitHit] = useState<boolean>(false);
  const limitHintTimerRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setPinned(isPinned(window.localStorage, path));
  }, [path]);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (limitHintTimerRef.current !== null) {
        window.clearTimeout(limitHintTimerRef.current);
        limitHintTimerRef.current = null;
      }
    };
  }, [refresh]);

  const onClick = useCallback(() => {
    if (typeof window === 'undefined') return;
    const next = togglePinnedTool(window.localStorage, path);
    // togglePinnedTool returns false when the cap is hit; the
    // storage write was a no-op so the lib didn't dispatch a
    // storage event. Reflect that locally.
    if (!next && !isPinned(window.localStorage, path)) {
      setLimitHit(true);
      if (limitHintTimerRef.current !== null) {
        window.clearTimeout(limitHintTimerRef.current);
      }
      limitHintTimerRef.current = window.setTimeout(() => {
        setLimitHit(false);
        limitHintTimerRef.current = null;
      }, LIMIT_HINT_REVERT_MS);
      return;
    }
    setPinned(next);
    setLimitHit(false);
  }, [path]);

  const ariaLabel = label ?? (pinned ? 'Unpin from hub' : 'Pin to hub');
  const title = limitHit
    ? 'You already have 3 pinned tools — unpin one first'
    : pinned
      ? 'Unpin from hub'
      : 'Pin to hub';

  return (
    <button
      type="button"
      className={`ppg-pin-btn${pinned ? ' ppg-pin-btn--on' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pinned}
      title={title}
    >
      <Pin
        aria-hidden="true"
        width={14}
        height={14}
        strokeWidth={1.8}
        fill={pinned ? 'currentColor' : 'none'}
      />
    </button>
  );
}

export default ToolPinButton;