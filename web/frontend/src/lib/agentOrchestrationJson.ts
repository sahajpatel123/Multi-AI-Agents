export type AgentOrchestrationJsonExport = {
  id: string;
  status: 'complete';
  created_at: string | null;
  task_count: number;
  task_ids: string[];
  synthesis: string;
  synthesis_bullets: string[];
  conflicts: Record<string, unknown>[];
};

/**
 * Validate the single-orchestration JSON contract before the payload is
 * downloaded or copied. Requiring the requested ID prevents a stale or
 * mismatched successful response from being presented as the active run.
 */
export function isAgentOrchestrationJsonExport(
  payload: unknown,
  expectedId: string,
): payload is AgentOrchestrationJsonExport {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

  const normalizedExpectedId = expectedId.trim();
  if (!normalizedExpectedId) return false;

  const record = payload as Record<string, unknown>;
  const createdAt = record.created_at;
  const taskCount = record.task_count;
  const taskIds = record.task_ids;
  const synthesisBullets = record.synthesis_bullets;
  const conflicts = record.conflicts;

  return (
    record.id === normalizedExpectedId &&
    record.status === 'complete' &&
    (createdAt === null || typeof createdAt === 'string') &&
    typeof taskCount === 'number' &&
    Number.isInteger(taskCount) &&
    taskCount >= 0 &&
    Array.isArray(taskIds) &&
    taskIds.every((taskId) => typeof taskId === 'string' && taskId.length > 0) &&
    taskIds.length === taskCount &&
    typeof record.synthesis === 'string' &&
    Array.isArray(synthesisBullets) &&
    synthesisBullets.every((bullet) => typeof bullet === 'string') &&
    Array.isArray(conflicts) &&
    conflicts.every(
      (conflict) => Boolean(conflict) && typeof conflict === 'object' && !Array.isArray(conflict),
    )
  );
}
