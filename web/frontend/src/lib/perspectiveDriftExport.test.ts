import { describe, expect, it } from 'vitest';
import { formatPerspectiveDriftExport } from './perspectiveDriftExport';

describe('formatPerspectiveDriftExport', () => {
  it('formats score, clusters, and divergences', () => {
    const md = formatPerspectiveDriftExport({
      roomName: 'Climate board',
      driftScore: 62,
      label: 'Mixed',
      taskCount: 4,
      meanSimilarity: 0.41,
      clusters: [
        {
          theme: 'Carbon pricing',
          size: 2,
          members: [{ user: 'Ada' }, { user: 'Ben' }],
        },
      ],
      pairs: [
        {
          similarity: 0.12,
          task_a: { user: 'Ada', snippet: 'Tax first' },
          task_b: { user: 'Ben', snippet: 'Subsidies first' },
        },
      ],
    });
    expect(md).toContain('# Climate board · Perspective drift');
    expect(md).toContain('**Drift:** 62/100 · Mixed');
    expect(md).toContain('## Viewpoint clusters');
    expect(md).toContain('Carbon pricing');
    expect(md).toContain('Ada vs Ben');
    expect(md).toContain('Tax first');
    expect(md).toMatch(/Shared from Arena Rooms/);
  });

  it('handles empty analysis honestly', () => {
    const md = formatPerspectiveDriftExport({ roomName: 'Empty' });
    expect(md).toMatch(/Not enough answer text/i);
  });
});
