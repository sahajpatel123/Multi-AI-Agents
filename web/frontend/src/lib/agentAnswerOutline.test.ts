import { describe, expect, it } from 'vitest';
import {
  agentAnswerOutlineUseful,
  agentAnswerReadingMetaUseful,
  countMarkdownWords,
  estimateReadingMinutes,
  extractAgentAnswerHeadings,
  formatAgentAnswerOutlineMarkdown,
  formatAgentAnswerReadingLabel,
} from './agentAnswerOutline';

const sample = `
# Intro

Some words here about the topic.

## Findings

More detail.

### Caveats

Careful note.

\`\`\`
# Not a heading
\`\`\`

## Next steps

Done.
`;

describe('extractAgentAnswerHeadings', () => {
  it('extracts h1–h3 in order with stable ids', () => {
    const h = extractAgentAnswerHeadings(sample);
    expect(h.map((x) => x.text)).toEqual(['Intro', 'Findings', 'Caveats', 'Next steps']);
    expect(h.map((x) => x.level)).toEqual([1, 2, 3, 2]);
    expect(h[0].id).toBe('answer-h-0');
    expect(h[3].id).toBe('answer-h-3');
  });

  it('ignores headings inside fenced code', () => {
    const h = extractAgentAnswerHeadings('```\n# Fake\n```\n## Real\n');
    expect(h).toEqual([{ id: 'answer-h-0', level: 2, text: 'Real' }]);
  });

  it('strips simple markdown from heading text', () => {
    const h = extractAgentAnswerHeadings('## **Bold** and [link](https://x.test)\n');
    expect(h[0].text).toBe('Bold and link');
  });
});

describe('agentAnswerOutlineUseful', () => {
  it('needs at least two headings', () => {
    expect(agentAnswerOutlineUseful([])).toBe(false);
    expect(agentAnswerOutlineUseful([{ id: 'a', level: 1, text: 'Only' }])).toBe(false);
    expect(
      agentAnswerOutlineUseful([
        { id: 'a', level: 1, text: 'A' },
        { id: 'b', level: 2, text: 'B' },
      ]),
    ).toBe(true);
  });
});

describe('reading meta', () => {
  it('counts words and estimates minutes', () => {
    const words = 'word '.repeat(400).trim();
    const meta = estimateReadingMinutes(words, 200);
    expect(meta.words).toBe(400);
    expect(meta.minutes).toBe(2);
  });

  it('returns empty label for empty content', () => {
    expect(countMarkdownWords('')).toBe(0);
    expect(formatAgentAnswerReadingLabel({ words: 0, minutes: 0 })).toBe('');
  });

  it('formats a readable label', () => {
    expect(formatAgentAnswerReadingLabel({ words: 820, minutes: 4 })).toBe(
      '≈ 4 min read · 820 words',
    );
  });

  it('only treats longer answers as useful for reading chrome', () => {
    expect(agentAnswerReadingMetaUseful({ words: 12, minutes: 1 })).toBe(false);
    expect(agentAnswerReadingMetaUseful({ words: 50, minutes: 1 })).toBe(true);
  });
});

describe('formatAgentAnswerOutlineMarkdown', () => {
  it('returns empty for no headings', () => {
    expect(formatAgentAnswerOutlineMarkdown([])).toBe('');
  });

  it('indents by heading level', () => {
    const md = formatAgentAnswerOutlineMarkdown([
      { id: 'a', level: 1, text: 'Intro' },
      { id: 'b', level: 2, text: 'Findings' },
      { id: 'c', level: 3, text: 'Caveats' },
    ]);
    expect(md).toContain('## On this page');
    expect(md).toContain('- Intro');
    expect(md).toContain('  - Findings');
    expect(md).toContain('    - Caveats');
  });
});
