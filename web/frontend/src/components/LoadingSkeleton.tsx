import { AGENTS } from '../types';
import { prefersReducedMotion } from '../lib/motion';

const AGENT_IDS = ['agent_1', 'agent_2', 'agent_3', 'agent_4'] as const;

// Each card pulses at a slightly different speed so they feel independent
const PULSE_DURATIONS = ['1.8s', '2.1s', '2.4s', '1.5s'];

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
 * Skeleton placeholder rendered while the four-agent panel is fetching.
 *
 * The pulse animation runs by default but is disabled when the user
 * prefers reduced motion (OS-level setting). The skeleton cards
 * still appear — a static placeholder is better than nothing — but
 * the perpetual shimmer stops, which can be a real accessibility
 * win for users with vestibular sensitivity.
 */
export function LoadingSkeleton({ count = AGENT_IDS.length, label = 'Loading responses…' }: LoadingSkeletonProps = {}) {
  const animate = !prefersReducedMotion();
  const cards = AGENT_IDS.slice(0, Math.min(count, AGENT_IDS.length));
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {cards.map((id, i) => {
        const agent = AGENTS[id];
        const pulseStyle = animate
          ? {
              animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
            }
          : undefined;
        return (
          <div
            key={id}
            className="relative bg-surface rounded-lg border border-border p-4 overflow-hidden"
          >
            {/* Pulse overlay — each card has its own animation speed */}
            {animate ? (
              <div
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{
                  animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                }}
              />
            ) : null}

            {/* Agent header */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-3 h-3 rounded-full opacity-60"
                style={{ backgroundColor: agent.color, ...pulseStyle }}
              />
              <div
                className="h-4 rounded w-24"
                style={{
                  backgroundColor: `${agent.color}30`,
                  ...pulseStyle,
                }}
              />
            </div>

            {/* Content skeleton lines */}
            <div className="space-y-2">
              <div
                className="h-3 bg-border/60 rounded w-full"
                style={pulseStyle}
              />
              <div
                className="h-3 bg-border/40 rounded w-4/5"
                style={{ ...pulseStyle, animationDelay: '0.15s' }}
              />
              <div
                className="h-3 bg-border/30 rounded w-3/5"
                style={{ ...pulseStyle, animationDelay: '0.3s' }}
              />
            </div>

            {/* Bottom bar skeleton */}
            <div className="mt-4 h-1 bg-border/20 rounded overflow-hidden">
              <div
                className="h-full rounded"
                style={{
                  width: '30%',
                  backgroundColor: `${agent.color}40`,
                  ...pulseStyle,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
