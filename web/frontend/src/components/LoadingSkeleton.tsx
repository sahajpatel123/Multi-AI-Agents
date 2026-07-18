import { AGENTS } from '../types';
import { prefersReducedMotion } from '../lib/motion';

const AGENT_IDS = ['agent_1', 'agent_2', 'agent_3', 'agent_4'] as const;

interface LoadingSkeletonProps {
  /** Number of agent cards to render. Defaults to 4 (the canonical
   *  Arena panel size) — useful for tests and for narrower viewports
   *  that want to render a smaller skeleton. */
  count?: number;
  /** Optional accessible label for the loading region. Defaults to a
   *  generic 'Loading responses…'. */
  label?: string;
}

/**
 * Skeleton placeholder for the four-agent Arena panel while responses load.
 * Shimmer is disabled under prefers-reduced-motion; static bars remain.
 */
export function LoadingSkeleton({
  count = AGENT_IDS.length,
  label = 'Loading responses…',
}: LoadingSkeletonProps = {}) {
  const animate = !prefersReducedMotion();
  const cards = AGENT_IDS.slice(0, Math.min(count, AGENT_IDS.length));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={[
        'arena-skeleton',
        animate ? 'arena-skeleton--animate' : 'arena-skeleton--static',
      ].join(' ')}
    >
      {cards.map((id, i) => {
        const agent = AGENTS[id];
        return (
          <div
            key={id}
            className="arena-skeleton__card"
            style={{
              ['--skeleton-accent' as string]: agent.color,
              animationDelay: animate ? `${i * 80}ms` : undefined,
            }}
          >
            <div className="arena-skeleton__accent" aria-hidden />

            {animate ? (
              <div className="arena-skeleton__shimmer pointer-events-none" aria-hidden />
            ) : null}

            <div className="arena-skeleton__header">
              <span
                className="arena-skeleton__dot"
                style={{ backgroundColor: agent.color }}
                aria-hidden
              />
              <span
                className="arena-skeleton__bar arena-skeleton__bar--name"
                style={{ backgroundColor: `${agent.color}33` }}
                aria-hidden
              />
            </div>

            <div className="arena-skeleton__lines" aria-hidden>
              <span className="arena-skeleton__bar arena-skeleton__bar--full" />
              <span className="arena-skeleton__bar arena-skeleton__bar--lg" />
              <span className="arena-skeleton__bar arena-skeleton__bar--md" />
            </div>

            <div className="arena-skeleton__meter" aria-hidden>
              <span
                className="arena-skeleton__meter-fill"
                style={{ backgroundColor: `${agent.color}55` }}
              />
            </div>
          </div>
        );
      })}
      <span className="arena-skeleton__sr-only">{label}</span>
    </div>
  );
}
