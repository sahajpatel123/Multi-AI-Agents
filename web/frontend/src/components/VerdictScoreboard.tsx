import { useId, useState } from 'react';
import { BarChart3, ChevronDown, Crown } from 'lucide-react';
import { prefersReducedMotion } from '../lib/motion';

export interface VerdictScoreboardEntry {
  agentId: string;
  name: string;
  color?: string;
  score: number;
  isWinner: boolean;
}

interface VerdictScoreboardProps {
  entries: VerdictScoreboardEntry[];
  /**
   * Authoritative winner id from the round payload. Consulted when no take
   * carries the is_winner flag, matching the canonical winner precedence used
   * by the export/import paths (flag, then winner id, then highest score).
   */
  winnerAgentId?: string | null;
}

interface RankedEntry extends VerdictScoreboardEntry {
  normalizedScore: number;
}

/**
 * Coerce a possibly-string score into a clamped 0-100 number, or NaN when the
 * value is unusable. Imported rounds can carry raw numbers outside the
 * contract, so the displayed label and the bar must always agree.
 */
function normalizeScore(score: number): number {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return Math.max(0, Math.min(100, numeric));
}

function ordinal(position: number): string {
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}

function rankedEntries(entries: VerdictScoreboardEntry[]): RankedEntry[] {
  return entries
    .map((entry) => ({ ...entry, normalizedScore: normalizeScore(entry.score) }))
    .filter((entry) => Number.isFinite(entry.normalizedScore))
    .sort((a, b) => b.normalizedScore - a.normalizedScore);
}

/**
 * Crown the same take the rest of the app treats as the winner: an explicit
 * is_winner flag first, then the payload's winner id, then the top score.
 */
function resolveWinner(
  ranked: RankedEntry[],
  winnerAgentId?: string | null,
): RankedEntry | undefined {
  const flagged = ranked.find((entry) => entry.isWinner);
  if (flagged) return flagged;
  if (winnerAgentId) {
    const byId = ranked.find((entry) => entry.agentId === winnerAgentId);
    if (byId) return byId;
  }
  return ranked[0];
}

/**
 * Collapsible scorecard for the judge's full ranking of every take.
 * The winner rationale discloses *why* one mind won; this panel shows the
 * whole ranking behind that call. It renders nothing when there are fewer
 * than two scored takes or every score is identical (the scorer's failure
 * fallback stamps a flat 50 on all takes), so users never see a hollow
 * scorecard with no ranking signal.
 */
export function VerdictScoreboard({ entries, winnerAgentId }: VerdictScoreboardProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const ranked = rankedEntries(entries);
  if (ranked.length < 2) return null;

  const distinctScores = new Set(ranked.map((entry) => entry.normalizedScore));
  if (distinctScores.size <= 1) return null;

  const winner = resolveWinner(ranked, winnerAgentId);
  const reduceMotion = prefersReducedMotion();

  return (
    <section
      className={`verdict-scoreboard${reduceMotion ? ' verdict-scoreboard--static' : ''}`}
    >
      <button
        type="button"
        className="verdict-scoreboard-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <BarChart3
          className="verdict-scoreboard-icon"
          width={15}
          height={15}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="verdict-scoreboard-label">Judge&apos;s scorecard</span>
        <ChevronDown
          className={`verdict-scoreboard-chevron${open ? ' verdict-scoreboard-chevron--open' : ''}`}
          width={15}
          height={15}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      {/* Keep mounted so aria-controls always points at a live element; the
          hidden attribute keeps it out of the accessibility tree when closed. */}
      <ol id={bodyId} className="verdict-scoreboard-body" hidden={!open}>
        {ranked.map((entry, index) => {
          const isWinner = entry === winner;
          const name = (entry.name || entry.agentId).trim() || entry.agentId;
          const fillColor = isWinner
            ? 'var(--cream-gold, #c4956a)'
            : (entry.color || '').trim() || '#C4956A';
          const width = entry.normalizedScore;

          return (
            <li
              key={entry.agentId}
              className={`verdict-scoreboard-row${isWinner ? ' verdict-scoreboard-row--winner' : ''}`}
            >
              <span className="verdict-scoreboard-rank" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="verdict-scoreboard-name">
                <span className="verdict-scoreboard-sr-only">
                  {ordinal(index + 1)} place
                </span>
                {isWinner && (
                  <Crown
                    className="verdict-scoreboard-crown"
                    width={13}
                    height={13}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
                {name}
                {isWinner && (
                  <span className="verdict-scoreboard-sr-only">, winner</span>
                )}
              </span>
              <span className="verdict-scoreboard-score">
                {entry.normalizedScore}
                <span className="verdict-scoreboard-sr-only"> out of 100</span>
              </span>
              <span className="verdict-scoreboard-track" aria-hidden>
                <span
                  className="verdict-scoreboard-fill"
                  style={{ width: `${width}%`, backgroundColor: fillColor }}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default VerdictScoreboard;
