/**
 * Portable markdown for a completed Agent research answer
 * (parity with Arena / Discuss / Debate export helpers).
 */

import {
  agentAnswerOutlineUseful,
  estimateReadingMinutes,
  extractAgentAnswerHeadings,
  formatAgentAnswerOutlineMarkdown,
  formatAgentAnswerReadingLabel,
} from './agentAnswerOutline';

export function formatAgentAnswerExport(opts: {
  question: string;
  answer: string;
  taskId?: string | null;
}): string {
  const question = (opts.question || '').trim() || '(no question)';
  const answer = (opts.answer || '').trim() || '_(empty answer)_';
  const headings = extractAgentAnswerHeadings(answer);
  const reading = formatAgentAnswerReadingLabel(estimateReadingMinutes(answer));
  const lines: string[] = [
    '# Arena Agent',
    '',
    `**Question:** ${question}`,
    '',
  ];
  if (reading) {
    lines.push(`_${reading}_`);
    lines.push('');
  }
  if (agentAnswerOutlineUseful(headings)) {
    lines.push(formatAgentAnswerOutlineMarkdown(headings).trimEnd());
    lines.push('');
  }
  lines.push('## Answer', '', answer, '');
  const taskId = (opts.taskId || '').trim();
  if (taskId) {
    lines.push(`_Task \`${taskId}\`_`);
    lines.push('');
  }
  lines.push('---');
  lines.push('_Shared from Arena Agent_');
  return lines.join('\n').trim() + '\n';
}
