import { describe, expect, it } from 'vitest';
import { formatAgentRoomsExport } from './agentRoomsExport';

describe('formatAgentRoomsExport', () => {
  it('formats rooms with members, tasks, and filter notes', () => {
    const md = formatAgentRoomsExport({
      totalCount: 4,
      filterNote: 'search: “macro” · sort: Name A–Z',
      items: [
        {
          name: 'Macro desk',
          slug: 'macro-desk',
          topic: 'Rates & inflation',
          description: 'Shared rate-path research.',
          memberCount: 3,
          taskCount: 12,
          activityAt: '2026-07-01T12:00:00.000Z',
          roomId: 'room_abc',
        },
      ],
    });

    expect(md).toContain('# Agent Rooms');
    expect(md).toContain('**1** of **4** rooms in this view');
    expect(md).toContain('_Filtered view: search: “macro” · sort: Name A–Z_');
    expect(md).toContain('## 1. Macro desk');
    expect(md).toContain('**Topic:** Rates & inflation');
    expect(md).toContain('Shared rate-path research.');
    expect(md).toContain('3 members');
    expect(md).toContain('12 tasks');
    expect(md).toContain('**Slug:** `macro-desk`');
    expect(md).toContain('room_abc');
    expect(md).toMatch(/Shared from Arena Agent Rooms/);
  });

  it('handles empty views and falls back to slug as title', () => {
    expect(formatAgentRoomsExport({ items: [] })).toMatch(/No rooms/i);
    const md = formatAgentRoomsExport({
      items: [{ slug: 'solo-lab', memberCount: 1, taskCount: 0 }],
      totalCount: 1,
    });
    expect(md).toContain('## 1. solo-lab');
    expect(md).toContain('**1** room');
    expect(md).toContain('1 member');
    expect(md).toContain('0 tasks');
  });
});
