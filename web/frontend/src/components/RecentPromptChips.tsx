import { Pin } from 'lucide-react';
import type { RecentPrompt } from '../lib/recentPrompts';

interface RecentPromptChipsProps {
  /** Most-recent-first prompts from local storage. */
  prompts: readonly RecentPrompt[];
  /** Fill the compose box with a prompt (reuse). */
  onReuse: (text: string) => void;
  /** Remove a single prompt from local storage. */
  onRemove: (text: string) => void;
  /** Clear every recent prompt, including pinned ones. */
  onClear: () => void;
  /** Pin or unpin a prompt so it stays visible at the front. */
  onTogglePin: (text: string, pinned: boolean) => void;
  /** How many chips to show; pinned prompts are always sorted first. */
  limit?: number;
  /** Narrow mobile layout uses compact chip widths. */
  isMobile?: boolean;
}

/**
 * Reusable recent-prompt chip strip for the Arena compose box. Pinned prompts
 * sort ahead of ordinary recents so users can keep their most-used questions
 * one tap away, while the existing remove / clear affordances stay intact.
 */
export function RecentPromptChips({
  prompts,
  onReuse,
  onRemove,
  onClear,
  onTogglePin,
  limit = 4,
  isMobile = false,
}: RecentPromptChipsProps) {
  if (!prompts.length) return null;

  const pinned = prompts.filter((item) => item.pinned);
  const unpinned = prompts.filter((item) => !item.pinned);
  const visible = [...pinned, ...unpinned.slice(0, Math.max(0, limit - pinned.length))];

  return (
    <div
      role="list"
      style={{
        pointerEvents: 'all',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        alignItems: 'center',
        maxWidth: '100%',
        padding: isMobile ? '0 12px' : 0,
      }}
      aria-label="Recent prompts"
    >
      {visible.map((item) => {
        const label =
          item.text.length > 48 ? `${item.text.slice(0, 47).trimEnd()}…` : item.text;
        return (
          <div
            key={`${item.at}-${item.text.slice(0, 24)}`}
            role="listitem"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              maxWidth: isMobile ? '46vw' : 220,
              background: 'rgba(255,255,255,0.72)',
              border: '0.5px solid #E0D8D0',
              borderRadius: 999,
              overflow: 'hidden',
              transition: 'background 150ms ease, border-color 150ms ease',
            }}
          >
            <button
              type="button"
              onClick={() => onReuse(item.text)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' || e.key === 'Delete') {
                  e.preventDefault();
                  onRemove(item.text);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onRemove(item.text);
              }}
              title={item.text}
              aria-label={`Reuse recent prompt: ${item.text}`}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 12,
                color: '#A0A39A',
                background: 'transparent',
                border: 'none',
                borderRadius: 0,
                padding: '6px 4px 6px 12px',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'var(--vp-font-sans)',
              }}
            >
              {label}
            </button>
            <button
              type="button"
              aria-label={
                item.pinned
                  ? `Unpin recent prompt: ${item.text}`
                  : `Pin recent prompt: ${item.text}`
              }
              title={item.pinned ? 'Unpin prompt' : 'Pin prompt'}
              aria-pressed={item.pinned}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(item.text, !item.pinned);
              }}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '6px 2px 6px 4px',
                color: item.pinned ? '#C4956A' : '#A0A39A',
              }}
            >
              <Pin width={10} height={10} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Remove recent prompt: ${item.text}`}
              title="Remove from recent"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.text);
              }}
              style={{
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                color: '#A0A39A',
                lineHeight: 1,
                padding: '6px 8px 6px 2px',
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onClear}
        title="Clear recent prompts from this device"
        aria-label="Clear all recent prompts"
        style={{
          fontSize: 11,
          color: '#A0A39A',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 8px',
          fontFamily: 'var(--vp-font-sans)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        Clear
      </button>
    </div>
  );
}
