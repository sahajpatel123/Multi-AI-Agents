/**
 * Build a self-contained HTML document for a public Agent report.
 *
 * This formatter deliberately owns all escaping. Shared report fields are
 * public, user-authored content, so an exported file must remain inert even
 * when it is opened directly from the Downloads folder.
 */

function escapeHtml(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

function singleLine(raw: string | null | undefined, fallback = ''): string {
  return String(raw ?? fallback)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeHttpUrl(raw: string | null | undefined): string | null {
  const value = singleLine(raw);
  if (!value || value.endsWith('…')) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function stablePublicUrl(raw: string | null | undefined): string | null {
  const href = safeHttpUrl(raw);
  if (!href) return null;
  try {
    const url = new URL(href);
    // Client-side fragments and tracking parameters should not become part of
    // a durable offline export's canonical report link.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function inlineMarkdown(raw: string): string {
  const links: string[] = [];
  const withLinkTokens = raw.replace(
    /\[([^\]\n]+)\]\(([^\s)]+)\)/g,
    (match: string, label: string, href: string) => {
    const safeHref = safeHttpUrl(href);
    if (!safeHref) return match;
    const token = `\u0000ARENA-LINK-TOKEN-${links.length}\u0000`;
    links.push(
      `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`,
    );
    return token;
    },
  );

  let escaped = escapeHtml(withLinkTokens)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');

  links.forEach((link, index) => {
    escaped = escaped.replace(`\u0000ARENA-LINK-TOKEN-${index}\u0000`, link);
  });
  return escaped;
}

function renderMarkdown(markdown: string | null | undefined): string {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${inlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const tag = list.kind;
    blocks.push(`<${tag}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`);
    list = null;
  };

  const flushTextBlocks = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    if (code) {
      if (/^\s*```/.test(line)) {
        blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }

    if (/^\s*```/.test(line)) {
      flushTextBlocks();
      code = [];
      continue;
    }

    if (!line.trim()) {
      flushTextBlocks();
      continue;
    }

    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushTextBlocks();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const kind = unordered ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push((unordered || ordered)?.[1] ?? '');
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(line)) {
      flushTextBlocks();
      blocks.push('<hr>');
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushTextBlocks();
      blocks.push(`<blockquote>${inlineMarkdown(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }

    paragraph.push(line);
  }

  if (code) blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushTextBlocks();
  return blocks.join('\n') || '<p class="empty">No answer was provided.</p>';
}

function renderSources(sources: readonly string[] | undefined): string {
  const items = (sources ?? [])
    .map((source) => singleLine(source))
    .filter(Boolean)
    .map((source) => {
      const href = safeHttpUrl(source);
      const label = escapeHtml(source);
      return `<li>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${label}</a>` : label}</li>`;
    });
  return items.length > 0
    ? `<section><h2>Sources consulted</h2><ol>${items.join('')}</ol></section>`
    : '';
}

/** Format a complete public Agent report as an offline-friendly HTML file. */
export function formatAgentReportHtml(opts: {
  title?: string | null;
  question?: string | null;
  answer?: string | null;
  sources?: readonly string[];
  url?: string | null;
  sharedAt?: string | null;
  finalScore?: number | null;
  finalConfidence?: number | null;
}): string {
  const title = singleLine(opts.title) || singleLine(opts.question) || 'Arena Agent report';
  const question = singleLine(opts.question);
  const url = stablePublicUrl(opts.url);
  const score =
    typeof opts.finalScore === 'number' && Number.isFinite(opts.finalScore)
      ? Math.round(Math.min(100, Math.max(0, opts.finalScore)))
      : null;
  const confidence =
    typeof opts.finalConfidence === 'number' && Number.isFinite(opts.finalConfidence)
      ? Math.round(Math.min(1, Math.max(0, opts.finalConfidence)) * 100)
      : null;
  const facts = [
    score == null ? '' : `<span>Score ${score}</span>`,
    confidence == null ? '' : `<span>Confidence ${confidence}%</span>`,
    opts.sharedAt ? `<span>Shared ${escapeHtml(singleLine(opts.sharedAt))}</span>` : '',
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="generator" content="Arena Agent">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { background: #f7f4ee; color: #2b211b; margin: 0; }
    main { box-sizing: border-box; max-width: 840px; margin: 0 auto; padding: 48px 24px 64px; }
    article { background: #fffdf9; border: 1px solid #e4d9cc; border-radius: 16px; box-shadow: 0 12px 40px rgba(66, 45, 28, .08); padding: 32px; }
    h1 { font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.1; margin: 0 0 18px; }
    h2 { border-bottom: 1px solid #e4d9cc; font-size: 1.15rem; margin: 32px 0 14px; padding-bottom: 8px; }
    h3 { font-size: 1rem; margin: 24px 0 8px; }
    .eyebrow { color: #79583d; font-size: .75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .question { border-left: 3px solid #b66f43; margin: 0 0 24px; padding: 4px 0 4px 16px; }
    .question strong { display: block; font-size: .72rem; letter-spacing: .1em; margin-bottom: 6px; text-transform: uppercase; }
    .facts { color: #79583d; display: flex; flex-wrap: wrap; font-size: .85rem; gap: 8px 16px; margin: 0 0 28px; }
    .answer { font-size: 1rem; line-height: 1.75; }
    .answer p { margin: 0 0 16px; }
    .answer li { margin: 6px 0; }
    .answer blockquote { border-left: 3px solid #d5b79d; color: #644b37; margin: 16px 0; padding-left: 16px; }
    .answer code { background: #f0e9e0; border-radius: 4px; padding: 2px 5px; }
    .answer pre { background: #2b211b; border-radius: 8px; color: #fffaf4; overflow-x: auto; padding: 16px; white-space: pre-wrap; }
    a { color: #8b4d28; overflow-wrap: anywhere; }
    .provenance { border-top: 1px solid #e4d9cc; color: #79583d; font-size: .8rem; margin-top: 36px; padding-top: 16px; }
    .empty { color: #79583d; font-style: italic; }
    @media print { body { background: #fff; } main { padding: 0; } article { border: 0; box-shadow: none; padding: 0; } }
  </style>
</head>
<body>
  <main>
    <article data-format="arena-agent-report" data-version="1">
      <div class="eyebrow">Arena Agent report</div>
      <h1>${escapeHtml(title)}</h1>
      ${question ? `<div class="question"><strong>Research question</strong>${escapeHtml(question)}</div>` : ''}
      ${facts.length > 0 ? `<div class="facts">${facts.join('')}</div>` : ''}
      <section><h2>Report</h2><div class="answer">${renderMarkdown(opts.answer)}</div></section>
      ${renderSources(opts.sources)}
      <p class="provenance">Shared from Arena${url ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">Open public report</a>` : ''}</p>
    </article>
  </main>
</body>
</html>
`;
}
