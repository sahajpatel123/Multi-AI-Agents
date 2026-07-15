/** Agent research pipeline stages — labels shared by CalligraphyLoader + status copy. */

export const STAGE_KEYS = [
  'planner',
  'researcher',
  'solver',
  'critic',
  'verifier',
  'synthesizer',
  'judge',
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export const STAGE_WORDS: Record<StageKey, string> = {
  planner: 'truth',
  researcher: 'reason',
  solver: 'clarity',
  critic: 'logic',
  verifier: 'wisdom',
  synthesizer: 'insight',
  judge: 'judge',
};

export const STAGE_STATUS: Record<StageKey, string> = {
  planner: 'Planning your task...',
  researcher: 'Researching sources...',
  solver: 'Building the answer...',
  critic: 'Stress-testing logic...',
  verifier: 'Verifying claims...',
  synthesizer: 'Synthesizing insights...',
  judge: 'Final judgement...',
};

export function getStageKey(stage?: string): StageKey | null {
  return STAGE_KEYS.includes(stage as StageKey) ? (stage as StageKey) : null;
}

/** 0-based index for progress chrome; unknown stages map to planner (0). */
export function stageProgressIndex(stage?: string): number {
  const key = getStageKey(stage);
  if (!key) return 0;
  return STAGE_KEYS.indexOf(key);
}

export function formatElapsedSeconds(elapsedSeconds: number): string {
  const safe = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Status line for reduced-motion and screen readers. */
export function pipelineStatusText(stage?: string): string {
  const key = getStageKey(stage) || 'planner';
  return STAGE_STATUS[key];
}
