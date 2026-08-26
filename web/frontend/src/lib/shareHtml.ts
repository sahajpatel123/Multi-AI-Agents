/** Build an offline-friendly HTML document for a public Arena share link. */

import type { RoundShareData } from './roundShare';
import { escapeHtml, renderMarkdown, safeHttpUrl } from './agentReportHtml';

function singleLine(raw: string | null | undefined, fallback = ''): string {
  return String(raw ?? fallback)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreText(score: number | undefined): string {
  return Number.isFinite(score) ? `${Math.round(Math.max(0, Math.min(100, score ?? 0)))}/100` : '';
}

function provenanceHtml(shareUrl: string | undefined): string {
  const href = safeHttpUrl(shareUrl);
  return `<p class="provenance">Shared from Arena${
    href
      ? ` · <a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">Open public share</a>`
      : ''
  }</p>`;
}

function pageTitle(opts: { round?: RoundShareData | null; agentName?: string }): string {
  if (opts.round) return 'Arena round';
  return `${singleLine(opts.agentName) || 'Arena mind'} · Arena take`;
}

/**
 * Format either a public single-take link or a compact public round as a
 * self-contained HTML file. User/model content is escaped or passed through
 * the inert Markdown renderer; no external stylesheets or scripts are used.
 */
export function formatArenaShareHtml(opts: {
  round?: RoundShareData | null;
  resolveAgentName?: (agentId: string) => string;
  agentName?: string;
  prompt?: string;
  response?: string;
  shareUrl?: string;
}): string {
  const round = opts.round;
  const prompt = round?.prompt || opts.prompt || '';
  const title = pageTitle(opts);
  const questionHtml = prompt
    ? `<div class="question"><strong>Question</strong><span>${escapeHtml(prompt)}</span></div>`
    : '';

  let body: string;
  if (round) {
    const resolveAgentName = opts.resolveAgentName || ((agentId: string) => agentId);
    const takes = round.takes
      .map((take, index) => {
        const name =
          singleLine(resolveAgentName(take.agentId)) ||
          singleLine(take.agentId) ||
          `Take ${index + 1}`;
        const isWinner = Boolean(round.winnerAgentId && take.agentId === round.winnerAgentId);
        const score = scoreText(take.score);
        return `<article class="take${isWinner ? ' take--winner' : ''}">
  <div class="take-heading"><h2>${escapeHtml(name)}</h2><span class="take-badge">${
          isWinner ? 'Arena winner' : 'Arena take'
        }${score ? ` · ${escapeHtml(score)}` : ''}</span></div>
  <div class="answer">${renderMarkdown(take.oneLiner)}</div>
</article>`;
      })
      .join('\n');
    body = `<div class="eyebrow">Arena round</div>
<h1>Four minds. One question.</h1>
${questionHtml}
<section class="takes" aria-label="Arena takes">${takes}</section>`;
  } else {
    const agentName = singleLine(opts.agentName) || 'Arena mind';
    body = `<div class="eyebrow">Arena take</div>
<h1>${escapeHtml(agentName)}</h1>
${questionHtml}
<section class="take"><div class="answer">${renderMarkdown(opts.response)}</div></section>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="generator" content="Arena">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { background: #f7f4ee; color: #2b211b; margin: 0; }
    main { box-sizing: border-box; max-width: 840px; margin: 0 auto; padding: 48px 24px 64px; }
    article { background: #fffdf9; border: 1px solid #e4d9cc; border-radius: 16px; box-shadow: 0 12px 40px rgba(66, 45, 28, .08); padding: 32px; }
    h1 { font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.1; margin: 0 0 18px; }
    h2 { font-size: 1.15rem; margin: 0; }
    .eyebrow { color: #79583d; font-size: .75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .question { border-left: 3px solid #b66f43; display: grid; gap: 6px; margin: 0 0 24px; padding: 4px 0 4px 16px; }
    .question strong { font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; }
    .question span { line-height: 1.55; white-space: pre-wrap; }
    .takes { display: grid; gap: 16px; }
    .take { background: #fffdf9; border: 1px solid #e4d9cc; border-radius: 12px; padding: 24px; }
    .take--winner { border-color: #b66f43; box-shadow: inset 3px 0 #b66f43; }
    .take-heading { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; }
    .take-badge { color: #79583d; font-size: .78rem; font-weight: 700; }
    .answer { font-size: 1rem; line-height: 1.75; margin-top: 18px; }
    .answer p { margin: 0 0 16px; }
    .answer li { margin: 6px 0; }
    .answer blockquote { border-left: 3px solid #d5b79d; color: #644b37; margin: 16px 0; padding-left: 16px; }
    .answer code { background: #f0e9e0; border-radius: 4px; padding: 2px 5px; }
    .answer pre { background: #2b211b; border-radius: 8px; color: #fffaf4; overflow-x: auto; padding: 16px; white-space: pre-wrap; }
    a { color: #8b4d28; overflow-wrap: anywhere; }
    .provenance { border-top: 1px solid #e4d9cc; color: #79583d; font-size: .8rem; margin-top: 36px; padding-top: 16px; }
    @media print { body { background: #fff; } main { padding: 0; } article { box-shadow: none; } }
  </style>
</head>
<body>
  <main>
    <article data-format="arena-share" data-version="1">
      ${body}
      ${provenanceHtml(opts.shareUrl)}
    </article>
  </main>
</body>
</html>
`;
}
