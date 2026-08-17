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
}

function rankedEntries(entries: VerdictScoreboardEntry[]): VerdictScoreboardEntry[] {
  return [...entries]
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score);
}

/**
 * Collapsible scorecard for the judge's full ranking of every take.
 * The winner rationale discloses *why* one mind won; this panel shows the
 * whole ranking behind that call. It renders nothing when there are fewer
 * than two scored takes or every score is identical (the scorer's failure
 * fallback stamps a flat 50 on all takes), so users never see a hollow
 * scorecard with no ranking signal.
 */
export function VerdictScoreboard({ entries }: VerdictScoreboardProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const ranked = rankedEntries(entries);
  if (ranked.length < 2) return null;

  const distinctScores = new Set(ranked.map((entry) => entry.score));
  if (distinctScores.size <= 1) return null;

  const winner = ranked.find((entry) => entry.isWinner) || ranked[0];
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
          const width = Math.max(0, Math.min(100, entry.score));

          return (
            <li
              key={entry.agentId}
              className={`verdict-scoreboard-row${isWinner ? ' verdict-scoreboard-row--winner' : ''}`}
            >
              <span className="verdict-scoreboard-rank" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="verdict-scoreboard-name">
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
              <span
                className="verdict-scoreboard-score"
                aria-label={`${name} scored ${entry.score} out of 100`}
              >
                {entry.score}
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
