import { describe, expect, it } from 'vitest';
import { formatAgentAnswerExport } from './agentAnswerExport';

describe('formatAgentAnswerExport', () => {
  it('formats question and answer as markdown', () => {
    const md = formatAgentAnswerExport({
      question: 'What is enough?',
      answer: 'Enough is when desire ends.',
      taskId: 'task_abc',
    });
    expect(md).toContain('# Arena Agent');
    expect(md).toContain('What is enough?');
    expect(md).toContain('Enough is when desire ends.');
    expect(md).toContain('task_abc');
    expect(md).toContain('Shared from Arena Agent');
  });

  it('handles missing fields honestly', () => {
    const md = formatAgentAnswerExport({ question: '', answer: '' });
    expect(md).toContain('(no question)');
    expect(md).toContain('empty answer');
  });

  it('includes reading time and outline for multi-section answers', () => {
    const md = formatAgentAnswerExport({
      question: 'Q',
      answer: '# Intro\n\nWords here.\n\n## Findings\n\nMore detail about the research answer.',
    });
    expect(md).toMatch(/min read/);
    expect(md).toContain('## On this page');
    expect(md).toContain('- Intro');
    expect(md).toContain('  - Findings');
    expect(md).toContain('## Answer');
  });
});
