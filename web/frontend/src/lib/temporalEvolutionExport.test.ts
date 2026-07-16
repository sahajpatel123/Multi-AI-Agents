import { describe, expect, it } from 'vitest';
import { formatTemporalEvolutionExport } from './temporalEvolutionExport';

describe('formatTemporalEvolutionExport', () => {
  it('formats score, stability, timeline, and key shifts', () => {
    const md = formatTemporalEvolutionExport({
      question: 'How is carbon pricing evolving?',
      taskId: 'abc-12345-full',
      evolutionScore: 42,
      trendLabel: 'Moderate shift',
      stability: 58,
      relatedCount: 4,
      timeline: [
        {
          task_id: 'task-aaaa',
          created_at: '2026-01-01T00:00:00Z',
          snippet: 'Tax first.',
          score: 70,
        },
        {
          task_id: 'abc-12345-full',
          created_at: '2026-02-01T00:00:00Z',
          snippet: 'Subsidy plus ETS.',
          score: 82,
          isCurrent: true,
        },
      ],
      shifts: [
        {
          from_task: 'task-aaaa',
          to_task: 'task-bbbb',
          gained_terms: ['subsidy', 'ETS'],
          lost_terms: ['voluntary'],
        },
      ],
    });
    expect(md).toContain('# Arena Agent · Answer evolution');
    expect(md).toContain('How is carbon pricing evolving?');
    expect(md).toContain('**Evolution:** 42/100 · Moderate shift');
    expect(md).toContain('**Stability:** 58/100');
    expect(md).toContain('**Related runs:** 4');
    expect(md).toContain('## Related runs');
    expect(md).toContain('current');
    expect(md).toContain('Tax first.');
    expect(md).toContain('## Key shifts between runs');
    expect(md).toContain('**Gained:** subsidy, ETS');
    expect(md).toContain('**Faded:** voluntary');
    expect(md).toContain('Task `abc-12345-full`');
    expect(md).toMatch(/Shared from Arena Agent/);
  });

  it('handles stable / empty shifts honestly', () => {
    const md = formatTemporalEvolutionExport({
      evolutionScore: 5,
      trendLabel: 'Stable',
      stability: 95,
      relatedCount: 2,
      shifts: [],
    });
    expect(md).toMatch(/little drift detected/i);
  });

  it('surfaces API messages', () => {
    const md = formatTemporalEvolutionExport({
      message: 'Question too short to match related research runs',
      shifts: [],
    });
    expect(md).toContain('Question too short');
  });
});
