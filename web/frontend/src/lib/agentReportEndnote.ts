/**
 * Build a compact EndNote XML record for a public Agent report.
 *
 * Keep this provenance-only: the report body and private task/share fields
 * never belong in a reference-manager export.
 */

function isXml10CodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function normalizeEndnoteText(raw: string | null | undefined, max = 240): string {
  const normalized = Array.from(String(raw ?? ''))
    // XML 1.0 cannot represent C0 controls, surrogates, or the noncharacters
    // outside its allowed Unicode ranges. Replace those with a space before
    // the length cap so a supplementary character cannot be split in half by
    // JavaScript's UTF-16 string slicing while existing field sanitization
    // remains readable.
    .map((character) =>
      isXml10CodePoint(character.codePointAt(0) ?? 0) ? character : ' ',
    )
    .join('')
    // EndNote XML is line-oriented in practice. Flatten user-authored
    // controls before escaping so metadata cannot create misleading markup.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]+/g, ' ')
    // Remove invisible directional controls so imported records cannot
    // reorder what a reader sees (Trojan Source style).
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return Array.from(normalized).slice(0, max).join('');
}

function endnoteDate(raw: string | null | undefined): { iso: string; year: string } | null {
  const value = normalizeEndnoteText(raw, 80);
  // Only accept a complete ISO calendar date or timestamp. A shared report
  // should not become an imported reference with a guessed publication date.
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))?)?$/,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return null;
  }

  if (match[4] !== undefined) {
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = match[6] === undefined ? 0 : Number(match[6]);
    const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
    const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
    if (
      hour > 23 ||
      minute > 59 ||
      second > 59 ||
      offsetHour > 23 ||
      offsetMinute > 59
    ) {
      return null;
    }
  }

  return { iso: `${match[1]}-${match[2]}-${match[3]}`, year: match[1] };
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeEndnoteText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    // A stable public reference should not preserve tracking parameters or
    // fragment-only client state from the current browser tab.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlElement(tag: string, value: string, indent = '      '): string {
  return `${indent}<${tag}>${escapeXml(value)}</${tag}>`;
}

/** Format a public Agent report as a portable EndNote XML record. */
export function formatAgentReportEndnote(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeEndnoteText(opts.title) || normalizeEndnoteText(opts.question) || 'Arena Agent report';
  const question = normalizeEndnoteText(opts.question);
  const url = safePublicUrl(opts.url);
  const date = endnoteDate(opts.sharedAt);
  const note =
    question && question !== title
      ? `Arena Agent report. Question: ${question}`
      : 'Arena Agent report.';

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE xml>',
    '<xml>',
    '  <records>',
    '    <record>',
    '      <rec-number>1</rec-number>',
    '      <ref-type name="Web Page">12</ref-type>',
    '      <contributors>',
    '        <authors>',
    '          <author>',
    xmlElement('last', 'Arena', '            '),
    '          </author>',
    '        </authors>',
    '      </contributors>',
    '      <titles>',
    xmlElement('title', title, '        '),
    xmlElement('secondary-title', 'Arena Agent report', '        '),
    '      </titles>',
  ];

  if (date) {
    lines.push(
      '      <dates>',
      xmlElement('year', date.year, '        '),
      '        <pub-dates>',
      xmlElement('date', date.iso, '          '),
      '        </pub-dates>',
      '      </dates>',
    );
  }

  lines.push('      <publisher>');
  lines.push(xmlElement('publisher-name', 'Arena', '        '));
  lines.push('      </publisher>');

  if (url) {
    lines.push(
      '      <urls>',
      '        <related-urls>',
      xmlElement('url', url, '          '),
      '        </related-urls>',
      '      </urls>',
    );
  }

  lines.push(
    '      <notes>',
    xmlElement('note', note, '        '),
    '      </notes>',
    '    </record>',
    '  </records>',
    '</xml>',
  );

  return `${lines.join('\n')}\n`;
}
