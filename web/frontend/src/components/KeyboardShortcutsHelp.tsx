import { useEffect, useRef, useState } from 'react';
import {
  isBareQuestionHelpKey,
  shortcutsForSurface,
  shortcutsPanelTitle,
  type ShortcutSurface,
} from '../lib/keyboardShortcuts';
import { shouldCaptureSlashFocus } from '../lib/slashFocus';

/**
 * Press `?` (when not typing in a field) to toggle a compact shortcuts panel.
 */
export function KeyboardShortcutsHelp({ surface }: { surface: ShortcutSurface }) {
  const [open, setOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const shortcuts = shortcutsForSurface(surface);
  const title = shortcutsPanelTitle(surface);

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

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(26,23,20,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          background: '#FAF7F4',
          border: '0.5px solid #E0D8D0',
          borderRadius: 16,
          maxWidth: 360,
          width: '100%',
          padding: '20px 22px 18px',
          boxShadow: '0 16px 40px rgba(26,23,20,0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <h2
            id="keyboard-shortcuts-title"
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 500,
              color: '#1A1714',
              fontFamily: 'Georgia, serif',
            }}
          >
            {title}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: '#A89070',
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shortcuts.map((row) => (
            <li
              key={`${row.keys}-${row.action}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <span style={{ fontSize: 13, color: '#6B6460', lineHeight: 1.4 }}>{row.action}</span>
              <kbd
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  color: '#1A1714',
                  background: '#F0EBE3',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 6,
                  padding: '3px 8px',
                  minWidth: 28,
                  textAlign: 'center',
                }}
              >
                {row.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <p style={{ margin: '14px 0 0', fontSize: 11, color: '#A89070', lineHeight: 1.5 }}>
          Press <kbd style={{ fontFamily: 'ui-monospace, monospace' }}>?</kbd> or Esc to close.
        </p>
      </div>
    </div>
  );
}

export default KeyboardShortcutsHelp;
