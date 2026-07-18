import { useEffect, useRef, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import {
  isBareQuestionHelpKey,
  shortcutsForSurface,
  shortcutsPanelTitle,
  type ShortcutSurface,
} from '../lib/keyboardShortcuts';
import { prefersReducedMotion } from '../lib/motion';
import { shouldCaptureSlashFocus } from '../lib/slashFocus';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Press `?` (when not typing in a field) to toggle a compact shortcuts panel.
 */
export function KeyboardShortcutsHelp({ surface }: { surface: ShortcutSurface }) {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const shortcuts = shortcutsForSurface(surface);
  const title = shortcutsPanelTitle(surface);
  const reduceMotion = prefersReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (!isBareQuestionHelpKey(e) || !shouldCaptureSlashFocus(e.target)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  // Focus trap while the panel is open
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => {
        if (el.hasAttribute('disabled')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`kbd-help-overlay${reduceMotion ? ' kbd-help-overlay--static' : ''}`}
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className={`kbd-help-panel${reduceMotion ? ' kbd-help-panel--static' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kbd-help-header">
          <div className="kbd-help-heading">
            <span className="kbd-help-mark" aria-hidden>
              <Keyboard width={16} height={16} strokeWidth={1.75} />
            </span>
            <h2 id="keyboard-shortcuts-title" className="kbd-help-title">
              {title}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="kbd-help-close"
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
          >
            <X width={16} height={16} aria-hidden />
          </button>
        </div>

        <ul className="kbd-help-list">
          {shortcuts.map((row) => (
            <li key={`${row.keys}-${row.action}`} className="kbd-help-row">
              <span className="kbd-help-action">{row.action}</span>
              <span className="kbd-help-keys" aria-hidden={false}>
                {row.keys.split(/\s*\+\s*/).map((part, i) => (
                  <span key={`${row.keys}-${part}-${i}`} className="kbd-help-key-group">
                    {i > 0 ? <span className="kbd-help-plus">+</span> : null}
                    <kbd className="kbd-help-kbd">{part}</kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="kbd-help-footnote">
          Press <kbd className="kbd-help-kbd kbd-help-kbd--inline">?</kbd> or{' '}
          <kbd className="kbd-help-kbd kbd-help-kbd--inline">Esc</kbd> to close.
        </p>
      </div>
    </div>
  );
}

export default KeyboardShortcutsHelp;
