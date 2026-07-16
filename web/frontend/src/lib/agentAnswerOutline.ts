/**
 * Outline + reading meta for long Agent research answers.
 * Pure helpers — safe for tests and SSR.
 */

export type AgentAnswerHeading = {
  /** Stable in-document id (answer-h-0, …). */
  id: string;
  level: 1 | 2 | 3;
  text: string;
};

export type AgentAnswerReadingMeta = {
  words: number;
  /** Whole minutes, minimum 1 when any words exist. */
  minutes: number;
};

const WORDS_PER_MINUTE = 200;

/** Strip fenced code so heading lines inside fences are ignored. */
function stripFencedCode(markdown: string): string {
  return (markdown || '').replace(/```[\s\S]*?```/g, '\n');
}

/**
 * Extract ATX headings (# / ## / ###) in document order.
 * Levels deeper than 3 are ignored (keeps the outline scannable).
 */
export function extractAgentAnswerHeadings(markdown: string): AgentAnswerHeading[] {
  const body = stripFencedCode(markdown);
  const headings: AgentAnswerHeading[] = [];
  const re = /^(#{1,3})\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const level = m[1].length as 1 | 2 | 3;
    const text = m[2]
      .replace(/\s+#+\s*$/, '') // trailing ###
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
      .replace(/[*_`]/g, '')
      .trim();
    if (!text) continue;
    headings.push({
      id: `answer-h-${headings.length}`,
      level,
      text,
    });
  }
  return headings;
}

/** True when an outline nav is worth showing (multi-section answers). */
export function agentAnswerOutlineUseful(headings: AgentAnswerHeading[]): boolean {
  return (headings || []).length >= 2;
}

export function countMarkdownWords(markdown: string): number {
  const plain = stripFencedCode(markdown)
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`>#|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingMinutes(
  markdown: string,
  wpm: number = WORDS_PER_MINUTE,
): AgentAnswerReadingMeta {
  const words = countMarkdownWords(markdown);
  if (words <= 0) return { words: 0, minutes: 0 };
  const rate = wpm > 0 ? wpm : WORDS_PER_MINUTE;
  const minutes = Math.max(1, Math.round(words / rate));
  return { words, minutes };
}

/** Minimum words before we surface a reading-time chrome (avoids noise on short takes). */
export const AGENT_ANSWER_READING_META_MIN_WORDS = 50;

/** True when reading-time chrome is worth showing. */
export function agentAnswerReadingMetaUseful(meta: AgentAnswerReadingMeta | null | undefined): boolean {
  return Boolean(meta && meta.words >= AGENT_ANSWER_READING_META_MIN_WORDS);
}

/** Human label, e.g. "≈ 4 min read · 820 words". Empty when no content. */
export function formatAgentAnswerReadingLabel(meta: AgentAnswerReadingMeta): string {
  if (!meta || meta.words <= 0) return '';
  const minLabel = meta.minutes === 1 ? '1 min read' : `${meta.minutes} min read`;
  return `≈ ${minLabel} · ${meta.words.toLocaleString('en-US')} words`;
}

/**
 * Markdown table of contents from outline headings.
 * Indent nested levels with two spaces per depth step.
 */
export function formatAgentAnswerOutlineMarkdown(
  headings: AgentAnswerHeading[],
  opts?: { title?: string },
): string {
  const list = headings || [];
  if (list.length === 0) return '';
  const title = (opts?.title || 'On this page').trim() || 'On this page';
  const lines: string[] = [`## ${title}`, ''];
  for (const h of list) {
    const indent = '  '.repeat(Math.max(0, h.level - 1));
    lines.push(`${indent}- ${h.text}`);
  }
  lines.push('');
  return lines.join('\n');
}
