import { describe, expect, it } from 'vitest';
import { formatTemplatesExport } from './templatesExport';

describe('formatTemplatesExport', () => {
  it('formats templates with category, slots, and prompt', () => {
    const md = formatTemplatesExport({
      totalCount: 2,
      filterNote: 'category Business · sort: Title A–Z',
      items: [
        {
          title: 'Competitive teardown',
          category: 'Business',
          description: 'Map rivals and moats.',
          example: 'Stripe vs Adyen',
          promptTemplate: 'Compare {{a}} and {{b}}.',
          slots: ['a', 'b'],
          expertise: 'practitioner',
          id: 'tpl-1',
        },
      ],
    });
    expect(md).toContain('# Arena Agent · Task templates');
    expect(md).toContain('**1** of **2** templates');
    expect(md).toContain('_Filtered view: category Business');
    expect(md).toContain('## 1. Competitive teardown');
    expect(md).toContain('Business · 2 slots');
    expect(md).toContain('Map rivals and moats.');
    expect(md).toContain('**Example:** Stripe vs Adyen');
    expect(md).toContain('Compare {{a}} and {{b}}.');
    expect(md).toMatch(/Shared from Arena Agent templates/);
  });

  it('handles empty filtered views honestly', () => {
    const md = formatTemplatesExport({
      totalCount: 5,
      filterNote: 'search “quantum”',
      items: [],
    });
    expect(md).toMatch(/No templates match this filter/i);
  });

  it('handles empty catalog', () => {
    expect(formatTemplatesExport({ items: [] })).toMatch(/No task templates available/i);
  });
});
