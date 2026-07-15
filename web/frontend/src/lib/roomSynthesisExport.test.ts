import { describe, expect, it } from 'vitest';
import { formatRoomSynthesisExport } from './roomSynthesisExport';

describe('formatRoomSynthesisExport', () => {
  it('formats a full synthesis with contradictions, patterns, and tasks', () => {
    const md = formatRoomSynthesisExport({
      roomName: 'Climate board',
      shareUrl: 'https://arena.example/room/climate',
      memberCount: 3,
      taskCount: 2,
      synthesis: 'Overall the group agrees on urgency.',
      patterns: ['Carbon pricing', 'Adaptation'],
      contradictions: [
        {
          member_a: 'Ada',
          member_b: 'Ben',
          claim_a: 'Tax first',
          claim_b: 'Subsidies first',
          resolution_hint: 'Compare cost curves',
        },
      ],
      tasks: [
        { title: 'Policy scan', author: 'Ada', score: 88 },
        { title: 'Market risks', author: 'Ben', score: 72 },
      ],
    });

    expect(md).toContain('# Climate board · Group synthesis');
    expect(md).toContain('3 researchers · 2 tasks');
    expect(md).toContain('**Room:** https://arena.example/room/climate');
    expect(md).toContain('## Contradictions');
    expect(md).toContain('Ada vs Ben');
    expect(md).toContain('**Ada:** Tax first');
    expect(md).toContain('_Resolution hint:_ Compare cost curves');
    expect(md).toContain('## Shared patterns');
    expect(md).toContain('- Carbon pricing');
    expect(md).toContain('## Synthesis');
    expect(md).toContain('Overall the group agrees on urgency.');
    expect(md).toContain('1. **Policy scan** — Ada (88/100)');
    expect(md).toMatch(/Shared from Arena Rooms/);
  });

  it('handles empty synthesis honestly', () => {
    const md = formatRoomSynthesisExport({ roomName: 'Empty' });
    expect(md).toMatch(/No synthesis available/i);
    expect(md).toContain('# Empty · Group synthesis');
  });

  it('omits empty optional sections', () => {
    const md = formatRoomSynthesisExport({
      roomName: 'Solo',
      synthesis: 'One finding.',
      patterns: ['', '  '],
      contradictions: [],
    });
    expect(md).not.toContain('## Contradictions');
    expect(md).not.toContain('## Shared patterns');
    expect(md).toContain('One finding.');
  });
});
