import { describe, expect, it } from 'vitest';
import {
  formatPersonasLibraryExport,
  formatPersonasLibraryItemCopy,
} from './personasLibraryExport';

describe('formatPersonasLibraryExport', () => {
  it('formats minds with panel and unlock notes', () => {
    const md = formatPersonasLibraryExport({
      totalCount: 16,
      filterNote: 'search: “analyst” · sort: Name A–Z',
      items: [
        {
          name: 'The Analyst',
          quote: 'I find the flaw.',
          description: 'Stress-tests claims.',
          id: 'analyst',
          onPanel: true,
          panelSlot: 1,
          unlocked: true,
        },
      ],
    });

    expect(md).toContain('# Arena Personas · Full library');
    expect(md).toContain('**1** of **16** minds in this view');
    expect(md).toContain('_Filtered view: search: “analyst” · sort: Name A–Z_');
    expect(md).toContain('## 1. The Analyst');
    expect(md).toContain('> I find the flaw.');
    expect(md).toContain('Stress-tests claims.');
    expect(md).toContain('On panel · slot 1');
    expect(md).toContain('Unlocked');
    expect(md).toContain('analyst');
    expect(md).toMatch(/Shared from Arena Personas library/);
  });

  it('handles empty views', () => {
    expect(formatPersonasLibraryExport({ items: [] })).toMatch(/No minds/i);
  });
});

describe('formatPersonasLibraryItemCopy', () => {
  it('snapshots one mind', () => {
    const md = formatPersonasLibraryItemCopy({
      name: 'The Analyst',
      quote: 'I find the flaw.',
      description: 'Stress-tests claims.',
      id: 'analyst',
      onPanel: true,
      panelSlot: 1,
      unlocked: true,
    });
    expect(md).toContain('# The Analyst');
    expect(md).toContain('> I find the flaw.');
    expect(md).toContain('Stress-tests claims.');
    expect(md).toContain('On panel · slot 1');
    expect(md).toContain('Unlocked');
    expect(md).toContain('analyst');
    expect(md).toContain('Shared from Arena Personas library');
  });

  it('returns empty when no content', () => {
    expect(formatPersonasLibraryItemCopy({ name: '  ', quote: '', description: '' })).toBe('');
  });
});
