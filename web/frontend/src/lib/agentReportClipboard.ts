import { formatAgentAnswerExport } from './agentAnswerExport';
import { formatAgentReportHtml, selectAgentReportSources } from './agentReportHtml';

/** The two clipboard representations for a completed Agent report. */
export type AgentReportClipboardPayload = {
  html: string;
  plainText: string;
};

/**
 * Build the rich and plain-text forms of the same Agent report.
 *
 * Rich editors can paste the formatted HTML, while text-only destinations get
 * a complete Markdown snapshot rather than the standalone document markup.
 * Source selection intentionally matches the report download's compatibility
 * order so copying and downloading never disagree about provenance.
 */
export function formatAgentReportClipboard(opts: {
  question?: string | null;
  answer?: string | null;
  taskId?: string | null;
  sources?: unknown;
  sourceIntegritySources?: unknown;
  answerSources?: unknown;
  finalScore?: number | null;
  finalConfidence?: number | null;
}): AgentReportClipboardPayload {
  const question = opts.question || '';
  const answer = opts.answer || '';
  const sources = selectAgentReportSources({
    sources: opts.sources,
    sourceIntegritySources: opts.sourceIntegritySources,
    answerSources: opts.answerSources,
  });

  return {
    html: formatAgentReportHtml({
      title: question,
      question,
      answer,
      sources,
      finalScore: opts.finalScore,
      finalConfidence: opts.finalConfidence,
    }),
    plainText: formatAgentAnswerExport({
      question,
      answer,
      taskId: opts.taskId,
      sources,
    }),
  };
}
