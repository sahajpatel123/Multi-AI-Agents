import { AGENTS } from '../types';

const AGENT_IDS = ['agent_1', 'agent_2', 'agent_3', 'agent_4'] as const;

// Each card pulses at a slightly different speed so they feel independent
const PULSE_DURATIONS = ['1.8s', '2.1s', '2.4s', '1.5s'];

export function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {AGENT_IDS.map((id, i) => {
        const agent = AGENTS[id];
        return (
          <div
            key={id}
            className="relative bg-surface rounded-lg border border-border p-4 overflow-hidden"
          >
            {/* Pulse overlay — each card has its own animation speed */}
            <div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{
                animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
              }}
            />

            {/* Agent header */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-3 h-3 rounded-full opacity-60"
                style={{
                  backgroundColor: agent.color,
                  animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                }}
              />
              <div
                className="h-4 rounded w-24"
                style={{
                  backgroundColor: `${agent.color}30`,
                  animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                }}
              />
            </div>

            {/* Content skeleton lines */}
            <div className="space-y-2">
              <div
                className="h-3 bg-border/60 rounded w-full"
                style={{
                  animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                }}
              />
              <div
                className="h-3 bg-border/40 rounded w-4/5"
                style={{
                  animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                  animationDelay: '0.15s',
                }}
              />
              <div
                className="h-3 bg-border/30 rounded w-3/5"
                style={{
                  animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                  animationDelay: '0.3s',
                }}
              />
            </div>

            {/* Bottom bar skeleton */}
            <div className="mt-4 h-1 bg-border/20 rounded overflow-hidden">
              <div
                className="h-full rounded"
                style={{
                  width: '30%',
                  backgroundColor: `${agent.color}40`,
                  animation: `pulse ${PULSE_DURATIONS[i]} cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
