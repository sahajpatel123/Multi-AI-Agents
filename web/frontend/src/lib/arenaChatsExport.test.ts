import { describe, expect, it } from 'vitest';
import {
  formatArenaChatsCsvExport,
  formatArenaChatsExport,
  formatArenaChatsJsonExport,
} from './arenaChatsExport';

const csvLines = (csv: string) => csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);

describe('formatArenaChatsExport', () => {
  it('formats filtered chats with titles, topics, and turn counts', () => {
    const md = formatArenaChatsExport({
      totalCount: 3,
      filterNote: 'search “launch”',
      items: [
        {
          sessionId: 'chat-1',
          title: 'Launch plan',
          prompt: 'Should we launch today?',
          topics: ['launch', 'marketing'],
          primaryTopic: 'launch',
          turnCount: 3,
          pinned: true,
          timestamp: '2026-07-01T12:00:00Z',
        },
        {
          sessionId: 'chat-2',
          prompt: 'Review the roadmap',
          turnCount: 1,
          timestamp: '2026-07-02T12:00:00Z',
        },
      ],
    });

    expect(md).toContain('# Arena · Resumable Chats');
    expect(md).toContain('**2** of **3** chats in this view');
    expect(md).toContain('_Filtered view: search “launch”_');
    expect(md).toContain('## 1. Launch plan');
    expect(md).toContain('**Last prompt:** Should we launch today?');
    expect(md).toContain('Topics: launch, marketing');
    expect(md).toContain('3 turns · Pinned · 2026-07-01 12:00 UTC');
    expect(md).toContain('Chat `chat-1`');
    expect(md).toContain('## 2. Review the roadmap');
    expect(md).toMatch(/Shared from Arena resumable chats/);
  });

  it('handles empty filtered views honestly', () => {
    const md = formatArenaChatsExport({
      totalCount: 4,
      filterNote: 'search “quantum”',
      items: [],
    });
    expect(md).toMatch(/No chats match this filter/i);
    expect(md).toContain('_Filtered view: search “quantum”_');
  });

  it('handles no resumable chats', () => {
    const md = formatArenaChatsExport({ items: [] });
    expect(md).toMatch(/No resumable chats yet/i);
  });

  it('falls back to last prompt then primary topic for untitled chats', () => {
    const md = formatArenaChatsExport({
      items: [
        {
          sessionId: 'chat-1',
          prompt: 'Roadmap review',
          turnCount: 2,
        },
        {
          sessionId: 'chat-2',
          primaryTopic: 'planning',
          turnCount: 0,
        },
      ],
    });
    expect(md).toContain('## 1. Roadmap review');
    expect(md).toContain('## 2. planning');
    expect(md).toContain('2 turns');
  });

  it('escapes markdown-sensitive user text so exports stay portable', () => {
    const md = formatArenaChatsExport({
      totalCount: 1,
      filterNote: 'search "*star*"',
      items: [
        {
          sessionId: 'chat-1',
          title: '# Launch [plan](https://evil.example)',
          prompt: 'Line one\n# Heading\n- item\n= summary\n<script>alert(1)</script>',
          topics: ['*bold*', 'a|b'],
          primaryTopic: '>quote',
          turnCount: 2,
        },
      ],
    });

    expect(md).toContain('## 1. \\# Launch \\[plan\\]\\(https://evil.example\\)');
    expect(md).toContain(
      '**Last prompt:** Line one\n\\# Heading\n\\- item\n\\= summary\n\\<script\\>alert\\(1\\)\\</script\\>',
    );
    expect(md).toContain('Topics: \\*bold\\*, a\\|b');
    expect(md).toContain('_Filtered view: search "\\*star\\*"_');
    expect(md).toContain('Chat `chat-1`');
  });
});

describe('formatArenaChatsJsonExport', () => {
  it('exports filtered chats with structured metadata', () => {
    const json = formatArenaChatsJsonExport({
      totalCount: 3,
      filterNote: 'search “launch”',
      items: [
        {
          sessionId: 'chat-1',
          title: 'Launch plan',
          prompt: 'Should we launch today?',
          topics: ['launch', 'marketing'],
          primaryTopic: 'launch',
          turnCount: 3,
          pinned: true,
          timestamp: '2026-07-01T12:00:00Z',
        },
        {
          sessionId: 'chat-2',
          prompt: 'Review the roadmap',
        },
      ],
    });

    const parsed = JSON.parse(json) as {
      exported_from: string;
      total_chats: number;
      filter_note: string;
      count: number;
      items: Array<Record<string, unknown>>;
    };
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.total_chats).toBe(3);
    expect(parsed.filter_note).toBe('search “launch”');
    expect(parsed.count).toBe(2);
    expect(parsed.items[0]).toEqual({
      session_id: 'chat-1',
      title: 'Launch plan',
      prompt: 'Should we launch today?',
      topics: ['launch', 'marketing'],
      primary_topic: 'launch',
      turn_count: 3,
      pinned: true,
      timestamp: '2026-07-01T12:00:00Z',
    });
    expect(parsed.items[1]).toMatchObject({
      session_id: 'chat-2',
      title: 'Review the roadmap',
      primary_topic: null,
    });
  });

  it('handles an empty filtered view honestly', () => {
    const parsed = JSON.parse(
      formatArenaChatsJsonExport({
        totalCount: 4,
        filterNote: 'search “quantum”',
        items: [],
      }),
    ) as { total_chats: number; filter_note: string; count: number };
    expect(parsed.total_chats).toBe(4);
    expect(parsed.filter_note).toBe('search “quantum”');
    expect(parsed.count).toBe(0);
  });
});

describe('formatArenaChatsCsvExport', () => {
  it('quotes headers and values so prompts cannot break columns', () => {
    const csv = formatArenaChatsCsvExport({
      items: [
        {
          sessionId: 'chat-1',
          title: 'Ship, plan',
          prompt: 'Should we "ship"?\nToday',
          topics: ['launch', 'marketing'],
          primaryTopic: 'launch',
          turnCount: 3,
          pinned: true,
          timestamp: '2026-07-01T12:00:00Z',
        },
      ],
    });

    expect(csvLines(csv)[0]).toBe(
      '"title","prompt","topics","primaryTopic","turnCount","pinned","timestamp","sessionId"',
    );
    expect(csv).toContain('"Ship, plan"');
    expect(csv).toContain('"Should we ""ship""?\nToday"');
    expect(csv).toContain('"launch, marketing"');
    expect(csv).toContain('"true"');
    expect(csv.trimEnd().endsWith('"chat-1"')).toBe(true);
  });

  it('starts with a UTF-8 BOM and uses CRLF record separators', () => {
    const csv = formatArenaChatsCsvExport({
      items: [{ sessionId: 'chat-1', prompt: 'How is the launch going?' }],
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toMatch(/[^\r]\r\n$/);
    expect(csv).toContain('\r\n');
  });

  it('neutralizes spreadsheet formula injection, including hidden leading whitespace', () => {
    const csv = formatArenaChatsCsvExport({
      items: [
        {
          sessionId: '=HYPERLINK("https://evil.example")',
          title: '=SUM(A1:A9)',
          prompt: '+1+1',
          topics: ['@cmd|/c calc'],
          primaryTopic: '=NOW()',
          timestamp: ' =NOW()',
        },
      ],
    });

    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"")"`);
    expect(csv).toContain(`"'=SUM(A1:A9)"`);
    expect(csv).toContain(`"'+1+1"`);
    expect(csv).toContain(`"'@cmd|/c calc"`);
    expect(csv).toContain(`"'=NOW()"`);
    expect(csv).toContain(`"' =NOW()"`);
  });

  it('leaves ordinary text unchanged', () => {
    const csv = formatArenaChatsCsvExport({
      items: [
        {
          sessionId: 'chat-1',
          title: 'Launch plan',
          prompt: 'Should we launch today?',
          turnCount: 2,
        },
      ],
    });
    expect(csv).toContain('"Launch plan"');
    expect(csv).toContain('"2"');
  });

  it('emits only the header row for an empty export', () => {
    expect(formatArenaChatsCsvExport({ items: [] })).toBe(
      '\uFEFF"title","prompt","topics","primaryTopic","turnCount","pinned","timestamp","sessionId"\r\n',
    );
  });
});
