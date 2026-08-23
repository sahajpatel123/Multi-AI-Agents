import { Command } from 'lucide-react';
import { ToolSearchPalette } from './ToolSearchPalette';

export interface ToolSearchLauncherProps {
  /** Heading shown in the launcher palette. */
  heading?: string;
  /** Optional copy shown in the visible launcher button. */
  label?: string;
}

/**
 * Visible launcher for the ToolSearchPalette — handy for touch and
 * mouse-only users who don't have a Cmd/Ctrl-K muscle memory yet.
 * Mounts the palette itself, so consumers only need one widget.
 */
export function ToolSearchLauncher({
  heading = 'Jump to a tool',
  label = 'Open the command palette',
}: ToolSearchLauncherProps) {
  return (
    <div className="palette-launcher" aria-label="Quick-launch a tool">
      <button
        type="button"
        className="palette-launcher__btn"
        onClick={() => {
          // Reuse the global keydown handler that listens for Cmd/Ctrl-K
          // by dispatching the same event. The palette will open on the
          // next tick and focus its input.
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'k', bubbles: true }),
          );
        }}
        aria-label={label}
      >
        <Command aria-hidden="true" width={14} height={14} strokeWidth={1.8} />
        <span>{label}</span>
        <span className="palette-launcher__hint" aria-hidden="true">
          ⌘K
        </span>
      </button>
      <ToolSearchPalette heading={heading} />
    </div>
  );
}

export default ToolSearchLauncher;
