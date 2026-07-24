// Persona Forecast — pure helpers for the scenario-prediction surface
// at /persona-forecast. 4 personas each give a forecast on a future
// scenario, picked deterministically from the scenario text.

import { PERSONAS } from './personas';

export type ForecastStance =
  | 'predicts-up'
  | 'predicts-down'
  | 'predicts-sideways'
  | 'predicts-disruption';

export interface ForecastTake {
  readonly personaId: string;
  readonly stance: ForecastStance;
  readonly prediction: string;
  readonly followup: string;
}

export interface PersonaForecast {
  readonly scenario: string;
  readonly takes: ReadonlyArray<ForecastTake>;
  readonly summary: {
    readonly up: number;
    readonly down: number;
    readonly sideways: number;
    readonly disruption: number;
  };
}

const STANCE_LABELS: Record<ForecastStance, string> = {
  'predicts-up': 'predicts up',
  'predicts-down': 'predicts down',
  'predicts-sideways': 'predicts sideways',
  'predicts-disruption': 'predicts disruption',
};

// Per-persona forecast templates, keyed by stance. Each persona has
// 1 take per stance. The stance pool is large enough that any
// deterministic pick still yields meaningful variety.

const FORECAST_TAKES: Record<
  string,
  Record<ForecastStance, { prediction: string; followup: string }>
> = {
  analyst: {
    'predicts-up': {
      prediction: 'The trajectory looks positive on the surface, but the underlying base rate is overstated.',
      followup: 'Watch the second derivative. The growth rate is what tells you if this is real.',
    },
    'predicts-down': {
      prediction: 'The data points down. The hard question is whether the inflection has happened yet.',
      followup: 'Look for the leading indicator. If you can name one, the bottom is near.',
    },
    'predicts-sideways': {
      prediction: 'Most of the variance cancels out. The mean is stable; the tails are not.',
      followup: 'If you can only bet on the mean, expect nothing. Position for the tails.',
    },
    'predicts-disruption': {
      prediction: 'Something will change in the next cycle that nobody is currently pricing. The shape is unclear; the magnitude is not.',
      followup: 'Identify the threshold at which your model breaks. Most plans fail here, not at the mean.',
    },
  },
  futurist: {
    'predicts-up': {
      prediction: 'Compounding forces are still in our favor. The next decade is the previous one squared.',
      followup: 'Position for the version that benefits from the compounding, not the one that competes with it.',
    },
    'predicts-down': {
      prediction: 'The trajectory looks tired. What looks like momentum is actually the last lap of a longer cycle.',
      followup: 'Find the early signal that the cycle is turning. The first signal is usually small and most people miss it.',
    },
    'predicts-sideways': {
      prediction: 'The shape will look familiar for a while, then change abruptly. Linear expectations are wrong.',
      followup: 'Plan for the median but design for the step function.',
    },
    'predicts-disruption': {
      prediction: 'A small thing now will look enormous in five years. The future is shaped by the decisions that look trivial today.',
      followup: 'Choose the option that compounds in the direction you want, not the one that wins today.',
    },
  },
  optimist: {
    'predicts-up': {
      prediction: 'The mechanism is real. People who bet against it will be wrong, but for the right reasons.',
      followup: 'Name the specific mechanism. Hope without a mechanism is wishful thinking.',
    },
    'predicts-down': {
      prediction: 'Things look bad. The mechanism behind the recovery is invisible today but is already in motion.',
      followup: 'Find the people working on the fix before the headline names the problem.',
    },
    'predicts-sideways': {
      prediction: 'The line is flat but the variance is wide. Some players win big; most do not. Position for the upside tail.',
      followup: 'Be specific about what you are betting on. Generic optimism is a story; specific optimism is a plan.',
    },
    'predicts-disruption': {
      prediction: 'The disruption is good news even if it looks bad. The old model was not delivering; the new one will.',
      followup: 'Place your bet on the version of the future where the people most affected are the winners.',
    },
  },
  strategist: {
    'predicts-up': {
      prediction: 'The trend is real but the position is crowded. The first mover wins; the second mover buys the dip.',
      followup: 'If you are late, do not chase. Wait for the first pullback and buy the re-test.',
    },
    'predicts-down': {
      prediction: 'The position is right but the timing is wrong. The setup is there; the trigger is not.',
      followup: 'Define the exact signal that would make you act. Without it, you are just hoping.',
    },
    'predicts-sideways': {
      prediction: 'Mean-reversion. The position is profitable at the extremes and crowded in the middle.',
      followup: 'Buy when everyone else is bored. Sell when everyone else is excited.',
    },
    'predicts-disruption': {
      prediction: 'The current leader will not be the next one. The question is who replaces them and how fast.',
      followup: 'Identify the second place that is closest to the lead. That is who buys the leader.',
    },
  },
};

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Pure — pick 4 distinct personas from the scenario text.
 */
function pickForecasters(seed: string): ReadonlyArray<string> {
  const all = PERSONAS.map((p) => p.id);
  const indices = all.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = simpleHash(`${seed}:${i}`) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  // Prefer personas with the best forecast coverage first.
  const preferred = ['futurist', 'analyst', 'strategist', 'optimist'];
  const picked: string[] = [];
  for (const id of preferred) {
    const idx = all.indexOf(id);
    if (idx >= 0) picked.push(id);
  }
  // If we need more, pull from the shuffled indices.
  if (picked.length < 4) {
    for (const i of indices) {
      if (picked.length >= 4) break;
      const personaId = all[i];
      if (personaId && !picked.includes(personaId)) picked.push(personaId);
    }
  }
  return picked.slice(0, 4);
}

const ALL_STANCES: ReadonlyArray<ForecastStance> = [
  'predicts-up',
  'predicts-down',
  'predicts-sideways',
  'predicts-disruption',
];

/**
 * Pure — build the forecast for a scenario. Picks 4 personas, picks
 * one stance per persona deterministically from the scenario text.
 */
export function buildForecast(scenario: string): PersonaForecast {
  const normalized = scenario.trim();
  const forecasters = pickForecasters(normalized);
  const takes: ForecastTake[] = forecasters.map((personaId, idx) => {
    const persona = FORECAST_TAKES[personaId];
    const stance: ForecastStance =
      persona
        ? ALL_STANCES[simpleHash(`${normalized}:${personaId}:${idx}`) % ALL_STANCES.length]
        : 'predicts-sideways';
    const pool = persona?.[stance] ?? {
      prediction: 'I have no view on this scenario.',
      followup: 'Look for a second opinion.',
    };
    return {
      personaId,
      stance,
      prediction: pool.prediction,
      followup: pool.followup,
    };
  });
  const summary = takes.reduce(
    (acc, t) => {
      switch (t.stance) {
        case 'predicts-up':
          acc.up += 1;
          break;
        case 'predicts-down':
          acc.down += 1;
          break;
        case 'predicts-sideways':
          acc.sideways += 1;
          break;
        case 'predicts-disruption':
          acc.disruption += 1;
          break;
      }
      return acc;
    },
    { up: 0, down: 0, sideways: 0, disruption: 0 },
  );
  return {
    scenario: normalized,
    takes,
    summary,
  };
}

/** Pure — verify a forecast's takes reference real personas. */
export function forecastValid(forecast: PersonaForecast): boolean {
  const known = new Set(PERSONAS.map((p) => p.id));
  for (const t of forecast.takes) {
    if (!known.has(t.personaId)) return false;
  }
  return true;
}

/** Build a shareable URL for a forecast. */
export function forecastShareUrl(origin: string, scenario: string): string {
  return `${origin}/persona-forecast?s=${encodeURIComponent(scenario)}`;
}

export { STANCE_LABELS as FORECAST_STANCE_LABELS };