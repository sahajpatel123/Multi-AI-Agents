/** Pure validation for Agent history task renames (matches API max). */

/** Backend sanitize_html max for rename title. */
export const AGENT_TASK_TITLE_MAX = 100;

export type AgentTaskRenameIssue = 'title_required' | 'title_too_long' | null;

export function validateAgentTaskTitle(title: string): AgentTaskRenameIssue {
  const t = (title || '').trim();
  if (!t) return 'title_required';
  if (t.length > AGENT_TASK_TITLE_MAX) return 'title_too_long';
  return null;
}

export function agentTaskRenameIssueMessage(
  issue: Exclude<AgentTaskRenameIssue, null>,
): string {
  switch (issue) {
    case 'title_required':
      return 'Add a short title, or press Esc to keep the current name.';
    case 'title_too_long':
      return `Title must be ${AGENT_TASK_TITLE_MAX} characters or fewer.`;
  }
}

export function agentTaskRenameCaughtErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return 'Could not rename task. Check your connection and try again.';
}
