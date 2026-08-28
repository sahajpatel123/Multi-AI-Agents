import { formatAgentAnswerExport } from './agentAnswerExport';
import { formatAgentReportHtml, selectAgentReportSources } from './agentReportHtml';

/** Mutable handles used to cancel stale rich-report clipboard feedback. */
export type AgentReportCopyLifecycle = {
  runId: { current: number };
  inFlight: { current: boolean };
  feedbackTimer: { current: number | null };
};

/**
 * Invalidate a pending rich-report copy before the displayed task changes or
 * the page unmounts. The run id makes late clipboard resolutions harmless;
 * clearing the timer also prevents old feedback from lingering in the next
 * report's toolbar.
 */
export function invalidateAgentReportCopy(
  lifecycle: AgentReportCopyLifecycle,
  clearTimer: (timerId: number) => void,
): void {
  lifecycle.runId.current += 1;
  lifecycle.inFlight.current = false;
  if (lifecycle.feedbackTimer.current != null) {
    clearTimer(lifecycle.feedbackTimer.current);
    lifecycle.feedbackTimer.current = null;
  }
}

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
