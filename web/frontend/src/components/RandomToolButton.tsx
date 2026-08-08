import { Link } from 'react-router-dom';
import { RefreshCw, Shuffle, Sparkles } from 'lucide-react';
import { pickRandomTool, type PersonaPlaygroundCategory, type PersonaPlaygroundEntry } from '../data/personaPlayground';

export interface RandomToolButtonProps {
  /** Paths to exclude from the random pick (e.g. the daily featured, the surprise pick). */
  excludePaths?: readonly string[];
  /** Override the current date (useful for tests). */
  date?: Date;
  /** Label shown on the button. Defaults to "Open a random tool". */
  label?: string;
  /** Visual size. Defaults to "sm". */
  size?: 'sm' | 'md';
  /**
   * Pre-computed pick. Lets the caller share the same pick with a
   * keyboard shortcut (e.g. Shift + R) so the shortcut lands on the
   * exact tool the button advertises. When omitted, the component
   * computes its own pick at render time.
   */
  pick?: PersonaPlaygroundEntry | null;
  /** Show the Shift + R shortcut chip in the label. Defaults to true. */
  showShortcut?: boolean;
  /**
   * Optional reshuffle handler. When provided, renders a small
   * inline "Reshuffle" button next to the link. The handler is
   * expected to update the parent's `pick` (e.g. by incrementing
   * a salt) so the displayed pick changes.
   */
  onReshuffle?: () => void;
  /** Accessible label for the reshuffle button. */
  reshuffleAriaLabel?: string;
  /**
   * When set, the random pick is taken from the tools in this
   * category only (cycle 480 — mood-matched reshuffle). When the
   * filtered pool is empty the picker falls back to the full
   * catalog so the user is never left without a pick.
   */
  categoryFilter?: PersonaPlaygroundCategory | null;
  /**
   * Label for the mood that produced `categoryFilter`. When set,
   * a small "Mood-matched" chip is shown on the button so the
   * user can see the shuffle is biased to their current mood.
   */
  moodLabel?: string;
}

/**
 * Single-CTA that picks a random tool from the catalog (excluding
 * the given paths) and links to it. Renders nothing when the
 * catalog is empty or the only entry is excluded.
 *
 * Different from <SurpriseButton /> (which excludes the daily
 * featured) and <FeaturedArchive /> (which shows past featured
 * picks). This is the "shuffle me" generic picker.
 */
export function RandomToolButton({
  excludePaths = [],
  date = new Date(),
  label = 'Open a random tool',
  size = 'sm',
  pick: pickProp,
  showShortcut = true,
  onReshuffle,
  reshuffleAriaLabel = 'Reshuffle the random tool',
  categoryFilter = null,
  moodLabel,
}: RandomToolButtonProps) {
  const pick = pickProp ?? pickRandomTool(excludePaths, 0, date, undefined, categoryFilter);
  if (!pick) return null;
  const sizeClass = size === 'md' ? 'ppg-randombtn--md' : 'ppg-randombtn--sm';
  const isMoodMatched = Boolean(moodLabel);
  return (
    <span className={`ppg-randombtn-wrap ${sizeClass}`}>
      <Link
        to={pick.path}
        className={`ppg-randombtn ${sizeClass}${isMoodMatched ? ' ppg-randombtn--mood' : ''}`}
        aria-label={
          `${label}: ${pick.name}` +
          (isMoodMatched ? ` (mood-matched to "${moodLabel}")` : '') +
          (showShortcut ? ' (Shift + R)' : '')
        }
      >
        <Shuffle aria-hidden="true" />
        <span>
          {label}
          <strong>{pick.name}</strong>
        </span>
        {isMoodMatched ? (
          <span className="ppg-randombtn__mood-chip" aria-hidden="true">
            <Sparkles width={11} height={11} strokeWidth={2} />
            <span>{moodLabel}</span>
          </span>
        ) : null}
        {showShortcut ? (
          <kbd className="ppg-randombtn__shortcut" aria-hidden="true">
            Shift + R
          </kbd>
        ) : null}
      </Link>
      {onReshuffle ? (
        <button
          type="button"
          className="ppg-randombtn__reshuffle"
          onClick={onReshuffle}
          aria-label={reshuffleAriaLabel}
          title={reshuffleAriaLabel}
        >
          <RefreshCw aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
