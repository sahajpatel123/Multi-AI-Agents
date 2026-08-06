import { RefreshCw } from 'lucide-react';

interface ReRunRoundButtonProps {
  /** The prompt from the completed round; the button hides when blank. */
  prompt: string;
  /** Disables the button (e.g. while a round is streaming). */
  disabled?: boolean;
  /** Fired when the user asks to run the same prompt again. */
  onReRun: () => void;
}

/**
 * One-click replay for a completed Arena round. Sends the exact same prompt
 * back through the pipeline so users can compare fresh takes without
 * retyping or digging through recents.
 */
export function ReRunRoundButton({
  prompt,
  disabled = false,
  onReRun,
}: ReRunRoundButtonProps) {
  if (!prompt.trim()) return null;

  return (
    <button
      type="button"
      className="arena-btn arena-btn--ghost arena-btn--sm interactive-surface interactive-surface--soft"
      onClick={onReRun}
      disabled={disabled}
      title={prompt}
      aria-label="Re-run round"
      style={{
        fontSize: 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <RefreshCw width={12} height={12} aria-hidden />
      Re-run round
    </button>
  );
}
