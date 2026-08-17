import { useState } from 'react';
import { ChevronDown, Scale } from 'lucide-react';
import { prefersReducedMotion } from '../lib/motion';

interface WinnerReasoningProps {
  /** The judge's plain-text rationale; empty/absent hides the disclosure. */
  reasoning?: string | null;
  /** Display name of the winning mind, used in the toggle label. */
  winnerName: string;
}

/**
 * Collapsible disclosure of the judge's rationale for the winning take.
 * Renders nothing when the scorer supplied no reasoning (for example, when
 * scoring fell back to default scores), so users never see a hollow widget.
 */
export function WinnerReasoning({ reasoning, winnerName }: WinnerReasoningProps) {
  const [open, setOpen] = useState(false);
  const text = (reasoning || '').trim();
  if (!text) return null;

  const label = (winnerName || '').trim() || 'Winner';
  const reduceMotion = prefersReducedMotion();

  return (
    <div
      className={`winner-reasoning${reduceMotion ? ' winner-reasoning--static' : ''}`}
    >
      <button
        type="button"
        className="winner-reasoning-toggle"
        aria-expanded={open}
        aria-controls="winner-reasoning-body"
        onClick={() => setOpen((v) => !v)}
      >
        <Scale
          className="winner-reasoning-icon"
          width={15}
          height={15}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="winner-reasoning-label">Why {label} won</span>
        <ChevronDown
          className={`winner-reasoning-chevron${open ? ' winner-reasoning-chevron--open' : ''}`}
          width={15}
          height={15}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      {open ? (
        <p id="winner-reasoning-body" className="winner-reasoning-body">
          {text}
        </p>
      ) : null}
    </div>
  );
}

export default WinnerReasoning;
