import { describe, expect, it } from 'vitest';
import {
  AGENT_TASK_TITLE_MAX,
  agentTaskRenameCaughtErrorMessage,
  agentTaskRenameIssueMessage,
  validateAgentTaskTitle,
} from './agentTaskRename';

describe('agentTaskRename', () => {
  it('requires a non-empty title and enforces max length', () => {
    expect(validateAgentTaskTitle('')).toBe('title_required');
    expect(validateAgentTaskTitle('   ')).toBe('title_required');
    expect(validateAgentTaskTitle('Rate path')).toBeNull();
    expect(validateAgentTaskTitle('x'.repeat(AGENT_TASK_TITLE_MAX))).toBeNull();
    expect(validateAgentTaskTitle('x'.repeat(AGENT_TASK_TITLE_MAX + 1))).toBe('title_too_long');
  });

  it('maps issues and errors to human copy', () => {
    expect(agentTaskRenameIssueMessage('title_required')).toMatch(/Esc/i);
    expect(agentTaskRenameIssueMessage('title_too_long')).toMatch(/100/);
    expect(agentTaskRenameCaughtErrorMessage(new Error('Forbidden'))).toBe('Forbidden');
    expect(agentTaskRenameCaughtErrorMessage({})).toMatch(/try again/i);
  });
});
