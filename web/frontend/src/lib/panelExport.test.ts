import { describe, expect, it } from 'vitest';
import { formatPanelExport } from './panelExport';

describe('formatPanelExport', () => {
  it('formats four slots with quotes and descriptions', () => {
    const md = formatPanelExport({
      isDefault: true,
      minds: [
        {
          id: 'analyst',
          name: 'The Analyst',
          quote: 'I find the flaw.',
          description: 'Stress-tests claims.',
        },
        { name: 'The Philosopher', quote: 'Question the premise.' },
      ],
    });
    expect(md).toContain('# Arena panel — four minds');
    expect(md).toContain('_Default four minds_');
    expect(md).toContain('## Slot 1 · The Analyst');
    expect(md).toContain('> I find the flaw.');
    expect(md).toContain('Stress-tests claims.');
    expect(md).toContain('`analyst`');
    expect(md).toContain('## Slot 2 · The Philosopher');
    expect(md).toMatch(/Shared from Arena Personas/);
  });

  it('handles empty panels honestly', () => {
    expect(formatPanelExport({ minds: [] })).toMatch(/No minds/i);
  });
});
