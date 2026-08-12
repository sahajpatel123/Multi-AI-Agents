import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import type { SavedResponseItem } from '../types';
import { downloadMarkdownFile, downloadTextFile } from '../lib/downloadTextFile';
import type {
  BulkDuplicateSessionsResult,
  BulkPinSessionsResult,
  SessionSummary,
} from '../api';

vi.mock('../lib/downloadTextFile', async () => {
  const actual = await vi.importActual<typeof import('../lib/downloadTextFile')>(
    '../lib/downloadTextFile',
  );
  return {
    ...actual,
    downloadMarkdownFile: vi.fn(() => true),
    downloadTextFile: vi.fn(() => true),
  };
});

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

type MinimalSidebarTurn = {
  turn_id: string;
  prompt: string;
  prompt_category?: string;
  winner_id: string;
  timestamp: string;
};

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

vi.mock('../context/PanelContext', () => ({
  usePanel: () => ({
    panel: [],
    personas: [],
    swapAgent: vi.fn(),
    resetPanel: vi.fn(),
    savePanel: vi.fn(),
    isDefaultPanel: true,
  }),
}));

vi.mock('../context/ProfileModalContext', () => ({
  useProfileModal: () => ({
    openModal: vi.fn(),
  }),
}));

vi.mock('../context/TierContext', () => ({
  useTier: () => ({
    tier: 'FREE',
    dailyLimit: 5,
    messagesUsed: 0,
    messagesRemaining: 5,
    allowedPersonas: ['analyst', 'philosopher'],
    features: {},
    isPlus: false,
    isPro: false,
    isFree: true,
    canUsePersona: () => true,
    canUseFeature: () => false,
    refreshTier: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const savedItem: SavedResponseItem = {
  id: 1,
  session_id: 's1',
  turn_id: 't1',
  prompt: 'Should I ship today?',
  agent_id: 'analyst',
  persona_id: 'analyst',
  persona_name: 'The Analyst',
  one_liner: 'Ship small.',
  verdict: 'Risk is bounded if scope is tight.',
  timestamp: '2026-07-01T12:00:00Z',
  pinned: false,
};

const sessions: SessionSummary[] = [
  {
    session_id: 'chat-1',
    topics: ['launch'],
    primary_topic: 'launch',
    last_prompt: 'Should we launch today?',
    turn_count: 3,
    last_active: '2026-08-01T10:00:00Z',
  },
  {
    session_id: 'chat-2',
    topics: [],
    primary_topic: null,
    last_prompt: null,
    turn_count: 1,
    last_active: '2026-08-01T09:00:00Z',
  },
];

function renderSidebar(overrides?: {
  turns?: MinimalSidebarTurn[];
  sessions?: SessionSummary[];
  activeSessionId?: string | null;
  onSessionSelect?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onBulkDeleteSessions?:
    | ((sessionIds: string[]) => number | null | Promise<number | null>)
    | null;
  onBulkPinSessions?: (
    sessionIds: string[],
    pinned: boolean,
  ) => BulkPinSessionsResult | null | Promise<BulkPinSessionsResult | null>;
  onBulkDuplicateSessions?:
    | ((
        sessionIds: string[],
      ) => BulkDuplicateSessionsResult | null | Promise<BulkDuplicateSessionsResult | null>)
    | null;
  onBulkExportTranscripts?:
    | ((sessionIds: string[]) => number | null | Promise<number | null> | void)
    | null;
  onClearSessions?: () => Promise<number | null> | void;
  onRenameSession?: (sessionId: string, title: string) => boolean | Promise<boolean>;
  onToggleSessionPin?: (sessionId: string, pinned: boolean) => boolean | Promise<boolean>;
  onDuplicateSession?: (sessionId: string) => boolean | Promise<boolean>;
}) {
  const onSessionSelect = overrides?.onSessionSelect ?? vi.fn();
  const onDeleteSession = overrides?.onDeleteSession ?? vi.fn();
  const onBulkDeleteSessions =
    overrides?.onBulkDeleteSessions === undefined
      ? vi.fn(() => 2)
      : (overrides.onBulkDeleteSessions ?? undefined);
  const onBulkPinSessions = overrides?.onBulkPinSessions ?? vi.fn();
  const onBulkDuplicateSessions =
    overrides?.onBulkDuplicateSessions === undefined
      ? vi.fn(() => ({ duplicated: 0, sessions: [] }))
      : (overrides.onBulkDuplicateSessions ?? undefined);
  const onBulkExportTranscripts =
    overrides?.onBulkExportTranscripts === undefined
      ? vi.fn(() => 2)
      : (overrides.onBulkExportTranscripts ?? undefined);
  const onClearSessions = overrides?.onClearSessions;
  const onRenameSession = overrides?.onRenameSession ?? vi.fn(() => true);
  const onToggleSessionPin = overrides?.onToggleSessionPin ?? vi.fn(() => true);
  const onDuplicateSession = overrides?.onDuplicateSession ?? vi.fn(() => true);
  const view = render(
    <Sidebar
      turns={overrides?.turns ?? []}
      activeTurnId={null}
      onTurnClick={vi.fn()}
      onNewChat={vi.fn()}
      isOpen
      onClose={vi.fn()}
      onLeaderboardClick={vi.fn()}
      savedItems={[savedItem]}
      onSavedItemClick={vi.fn()}
      recentSessions={overrides?.sessions ?? sessions}
      activeSessionId={overrides?.activeSessionId ?? null}
      onSessionSelect={onSessionSelect}
      onDeleteSession={onDeleteSession}
      onBulkDeleteSessions={onBulkDeleteSessions}
      onBulkPinSessions={onBulkPinSessions}
      onBulkDuplicateSessions={onBulkDuplicateSessions}
      onBulkExportTranscripts={onBulkExportTranscripts}
      onClearSessions={onClearSessions}
      onRenameSession={onRenameSession}
      onToggleSessionPin={onToggleSessionPin}
      onDuplicateSession={onDuplicateSession}
    />,
  );
  return {
    onSessionSelect,
    onDeleteSession,
    onBulkDeleteSessions,
    onBulkPinSessions,
    onBulkDuplicateSessions,
    onBulkExportTranscripts,
    onClearSessions,
    onRenameSession,
    onToggleSessionPin,
    onDuplicateSession,
    rerender: (nextSessions: SessionSummary[]) =>
      view.rerender(
        <Sidebar
          turns={overrides?.turns ?? []}
          activeTurnId={null}
          onTurnClick={vi.fn()}
          onNewChat={vi.fn()}
          isOpen
          onClose={vi.fn()}
          onLeaderboardClick={vi.fn()}
          savedItems={[savedItem]}
          onSavedItemClick={vi.fn()}
          recentSessions={nextSessions}
          activeSessionId={overrides?.activeSessionId ?? null}
          onSessionSelect={onSessionSelect}
          onDeleteSession={onDeleteSession}
          onBulkDeleteSessions={onBulkDeleteSessions}
          onBulkPinSessions={onBulkPinSessions}
          onBulkDuplicateSessions={onBulkDuplicateSessions}
          onBulkExportTranscripts={onBulkExportTranscripts}
          onClearSessions={onClearSessions}
          onRenameSession={onRenameSession}
          onToggleSessionPin={onToggleSessionPin}
          onDuplicateSession={onDuplicateSession}
        />,
      ),
  };
}

describe('Sidebar recent chats', () => {
  it('lists resumable chats with their last prompt and turn count', () => {
    renderSidebar();
    expect(screen.getByText('Chats')).toBeInTheDocument();
    expect(screen.getByText(/Should we launch today/)).toBeInTheDocument();
    expect(screen.getByText(/3 msg/)).toBeInTheDocument();
    expect(screen.getByText('Untitled chat')).toBeInTheDocument();
  });

  it('offers a chat search box when resumable chats exist', () => {
    renderSidebar();
    expect(screen.getByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
  });

  it('duplicates a resumable chat from its card action', () => {
    const { onDuplicateSession } = renderSidebar();
    const duplicateButtons = screen.getAllByRole('button', {
      name: 'Duplicate session',
    });
    expect(duplicateButtons).toHaveLength(2);
    fireEvent.click(duplicateButtons[0]);
    expect(onDuplicateSession).toHaveBeenCalledWith('chat-1');
  });

  it('hides duplicate for empty chats with nothing to fork', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          turn_count: 0,
        },
      ],
    });
    expect(
      screen.queryByRole('button', { name: 'Duplicate session' }),
    ).toBeNull();
  });

  it('filters chats by last prompt', () => {
    renderSidebar();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), {
      target: { value: 'launch' },
    });
    expect(
      screen.getByRole('button', { name: /Open session: Should we launch today/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Untitled chat')).toBeNull();
  });

  it('filters chats by a custom title', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          title: 'Roadmap review',
        },
        {
          ...(sessions[1] as SessionSummary),
          title: 'Draft copy',
        },
      ],
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), {
      target: { value: 'roadmap' },
    });
    expect(screen.getByRole('button', { name: /Open session: Roadmap review/ })).toBeInTheDocument();
    expect(screen.queryByText('Draft copy')).toBeNull();
  });

  it('highlights the query in matching chat cards', () => {
    renderSidebar();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), {
      target: { value: 'launch' },
    });
    const marks = document.querySelectorAll('.session-card__prompt mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('launch');
  });

  it('explains when a chat matches only through its topic list', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          title: 'Q3 plan',
          primary_topic: 'planning',
          topics: ['planning', 'marketing'],
          last_prompt: 'Review the roadmap',
        },
      ],
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), {
      target: { value: 'marketing' },
    });
    expect(screen.getByRole('button', { name: /Open session: Q3 plan/ })).toBeInTheDocument();
    expect(screen.getByText(/topic: marketing/)).toBeInTheDocument();
  });

  it('does not show a topic hint when the visible title already matches', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          title: 'Marketing launch review',
          topics: ['marketing'],
          primary_topic: 'marketing',
        },
      ],
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), {
      target: { value: 'marketing' },
    });
    expect(
      screen.getByRole('button', { name: /Open session: Marketing launch review/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/topic: marketing/)).toBeNull();
  });

  it('shows a no-results message and restores chats after clearing', () => {
    renderSidebar();
    const search = screen.getByRole('searchbox', { name: 'Search chats' });
    fireEvent.change(search, { target: { value: 'quantum' } });
    expect(screen.getByText(/No chats match “quantum”/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear chat search' }));
    expect(screen.getByText(/Should we launch today/)).toBeInTheDocument();
    expect(screen.getByText('Untitled chat')).toBeInTheDocument();
  });

  it('searches the full list while collapsed', () => {
    const many: SessionSummary[] = Array.from({ length: 7 }, (_, i) => ({
      session_id: `chat-${i}`,
      topics: [],
      primary_topic: null,
      last_prompt: `Prompt ${i}`,
      turn_count: 1,
      last_active: new Date().toISOString(),
    }));
    renderSidebar({ sessions: many });
    expect(screen.getAllByRole('button', { name: /Open session/ })).toHaveLength(5);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), {
      target: { value: 'Prompt 6' },
    });
    expect(screen.getAllByRole('button', { name: /Open session/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Open session: Prompt 6/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all 7 chats/ })).toBeNull();
  });

  it('opens a chat when its card is clicked', () => {
    const { onSessionSelect } = renderSidebar();
    fireEvent.click(
      screen.getByRole('button', { name: /Open session: Should we launch today/ }),
    );
    expect(onSessionSelect).toHaveBeenCalledWith('chat-1');
  });

  it('marks the active session card as pressed', () => {
    renderSidebar({ activeSessionId: 'chat-1' });
    expect(
      screen.getByRole('button', { name: /Open session: Should we launch today/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('deletes a chat without opening it', () => {
    const { onSessionSelect, onDeleteSession } = renderSidebar();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete session' })[0]);
    expect(onDeleteSession).toHaveBeenCalledWith('chat-1');
    expect(onSessionSelect).not.toHaveBeenCalled();
  });

  it('selects chats and deletes only the selected subset after confirmation', async () => {
    const { onBulkDeleteSessions } = renderSidebar();

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    expect(screen.getByText('2 chats selected')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete 2 selected chats' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete selected chats' });
    expect(dialog).toHaveTextContent(/Delete 2 selected chats/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete selected' }));

    await waitFor(() =>
      expect(onBulkDeleteSessions).toHaveBeenCalledWith(['chat-1', 'chat-2']),
    );
  });

  it('announces a successful bulk delete to screen readers', async () => {
    const { onBulkDeleteSessions } = renderSidebar();
    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete 2 selected chats' }),
    );
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Delete selected chats' }),
      ).getByRole('button', { name: 'Delete selected' }),
    );

    await waitFor(() => expect(onBulkDeleteSessions).toHaveBeenCalled());
    await waitFor(() => {
      const statuses = screen.getAllByRole('status');
      expect(
        statuses.some((status) =>
          status.textContent?.includes('Selected chats deleted'),
        ),
      ).toBe(true);
    });
  });

  it('keeps non-deleted chats selected and reports a partial bulk delete', async () => {
    const { rerender } = renderSidebar({
      onBulkDeleteSessions: vi.fn().mockResolvedValue(1),
    });
    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete 2 selected chats' }),
    );
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Delete selected chats' }),
      ).getByRole('button', { name: 'Delete selected' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /some selected chats could not be deleted/i,
      ),
    );
    expect(screen.getByText('2 chats selected')).toBeInTheDocument();

    // The parent removes exactly the ids the server reported deleted; the
    // remaining chat should stay selected so the user can retry it.
    rerender([sessions[1] as SessionSummary]);
    await waitFor(() => expect(screen.getByText('1 chat selected')).toBeInTheDocument());
    expect(
      screen.getByRole('checkbox', { name: /Select chat: Untitled chat/ }),
    ).toBeChecked();
  });

  it('selects all visible chats and clears the selection without deleting', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'Select all visible chats' }));
    expect(screen.getByText('2 chats selected')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: /Select chat:/ })).toHaveLength(2);
    expect(
      screen.getAllByRole('checkbox', { name: /Select chat:/ }).every((box) =>
        (box as HTMLInputElement).checked,
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Clear chat selection' }));
    expect(screen.queryByText('2 chats selected')).toBeNull();
  });

  it('shift-clicks a chat to select the whole visible range since the anchor', () => {
    renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        {
          session_id: 'chat-3',
          topics: [],
          primary_topic: null,
          last_prompt: null,
          turn_count: 1,
          last_active: '2026-08-01T08:00:00Z',
        },
      ],
    });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[2], { shiftKey: true });

    expect(screen.getByText('3 chats selected')).toBeInTheDocument();
    expect(
      checkboxes.every((box) => (box as HTMLInputElement).checked),
    ).toBe(true);
  });

  it('extends a range from the most recent plain click, keeping earlier picks', () => {
    renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        {
          session_id: 'chat-3',
          topics: [],
          primary_topic: null,
          last_prompt: null,
          turn_count: 1,
          last_active: '2026-08-01T08:00:00Z',
        },
        {
          session_id: 'chat-4',
          topics: [],
          primary_topic: null,
          last_prompt: null,
          turn_count: 1,
          last_active: '2026-08-01T07:00:00Z',
        },
      ],
    });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    expect(checkboxes).toHaveLength(4);
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[2]);
    fireEvent.click(checkboxes[3], { shiftKey: true });

    expect(screen.getByText('3 chats selected')).toBeInTheDocument();
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[2] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[3] as HTMLInputElement).checked).toBe(true);
  });

  it('treats a shift-click with no anchor as a plain toggle', () => {
    renderSidebar();

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0], { shiftKey: true });

    expect(screen.getByText('1 chat selected')).toBeInTheDocument();
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it('forgets the range anchor when the selection is cleared', () => {
    renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        {
          session_id: 'chat-3',
          topics: [],
          primary_topic: null,
          last_prompt: null,
          turn_count: 1,
          last_active: '2026-08-01T08:00:00Z',
        },
      ],
    });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel chat selection' }));
    fireEvent.click(checkboxes[2], { shiftKey: true });

    expect(screen.getByText('1 chat selected')).toBeInTheDocument();
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[2] as HTMLInputElement).checked).toBe(true);
  });

  it('selects a range in reverse direction from the anchor', () => {
    renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        {
          session_id: 'chat-3',
          topics: [],
          primary_topic: null,
          last_prompt: null,
          turn_count: 1,
          last_active: '2026-08-01T08:00:00Z',
        },
        {
          session_id: 'chat-4',
          topics: [],
          primary_topic: null,
          last_prompt: null,
          turn_count: 1,
          last_active: '2026-08-01T07:00:00Z',
        },
      ],
    });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    expect(checkboxes).toHaveLength(4);
    fireEvent.click(checkboxes[2]);
    fireEvent.click(checkboxes[0], { shiftKey: true });

    expect(screen.getByText('3 chats selected')).toBeInTheDocument();
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[2] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[3] as HTMLInputElement).checked).toBe(false);
  });

  it('does not reuse a range anchor hidden by search', () => {
    renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        {
          session_id: 'chat-3',
          topics: [],
          primary_topic: null,
          last_prompt: 'Third question',
          turn_count: 1,
          last_active: '2026-08-01T08:00:00Z',
        },
      ],
    });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);

    const search = screen.getByRole('searchbox', { name: 'Search chats' });
    fireEvent.change(search, { target: { value: 'Third' } });

    const visible = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    expect(visible).toHaveLength(1);
    fireEvent.click(visible[0], { shiftKey: true });

    // The hidden anchor is not reused: chat-3 is toggled like a plain click and
    // the still-selected chat-1 is left alone (no hidden chat is swept in).
    expect(screen.getByText('2 chats selected')).toBeInTheDocument();
    expect((visible[0] as HTMLInputElement).checked).toBe(true);
  });

  it('computes shift-click ranges against the current visible order', () => {
    const thirdChat: SessionSummary = {
      session_id: 'chat-3',
      topics: [],
      primary_topic: null,
      last_prompt: null,
      turn_count: 1,
      last_active: '2026-08-01T08:00:00Z',
    };
    const { rerender } = renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        { ...thirdChat, pinned: true },
      ],
    });

    // chat-3 is pinned, so it renders first and becomes the anchor.
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: /Select chat:/ })[0],
    );
    rerender([
      { ...(sessions[0] as SessionSummary), pinned: true },
      sessions[1] as SessionSummary,
      thirdChat,
    ]);

    const reordered = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    // chat-1 is now pinned first; chat-3 (the anchor) has moved to the end.
    fireEvent.click(reordered[0], { shiftKey: true });

    expect(screen.getByText('3 chats selected')).toBeInTheDocument();
    expect(
      reordered.every((box) => (box as HTMLInputElement).checked),
    ).toBe(true);
  });

  it('forgets the range anchor when select-all toggles the visible list', () => {
    renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        {
          session_id: 'chat-3',
          topics: [],
          primary_topic: null,
          last_prompt: null,
          turn_count: 1,
          last_active: '2026-08-01T08:00:00Z',
        },
      ],
    });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Select all visible chats' }));
    expect(screen.getByText('3 chats selected')).toBeInTheDocument();

    fireEvent.click(checkboxes[1], { shiftKey: true });

    expect(screen.getByText('2 chats selected')).toBeInTheDocument();
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[2] as HTMLInputElement).checked).toBe(true);
  });

  it('starts a fresh selection when the anchor chat disappears from the list', () => {
    const thirdChat: SessionSummary = {
      session_id: 'chat-3',
      topics: [],
      primary_topic: null,
      last_prompt: null,
      turn_count: 1,
      last_active: '2026-08-01T08:00:00Z',
    };
    const { rerender } = renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        thirdChat,
      ],
    });

    fireEvent.click(
      screen.getAllByRole('checkbox', { name: /Select chat:/ })[0],
    );
    rerender([sessions[1] as SessionSummary, thirdChat]);

    expect(screen.queryByText(/chats selected/)).toBeNull();
    const visible = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(visible[1], { shiftKey: true });

    expect(screen.getByText('1 chat selected')).toBeInTheDocument();
    expect((visible[0] as HTMLInputElement).checked).toBe(false);
    expect((visible[1] as HTMLInputElement).checked).toBe(true);
  });

  it('hints at shift-click ranges while a selection spans multiple visible chats', () => {
    renderSidebar({
      sessions: [
        sessions[0] as SessionSummary,
        sessions[1] as SessionSummary,
        {
          session_id: 'chat-3',
          topics: [],
          primary_topic: null,
          last_prompt: null,
          turn_count: 1,
          last_active: '2026-08-01T08:00:00Z',
        },
      ],
    });

    expect(
      screen.queryByText(/shift-click a checkbox to select a range/i),
    ).toBeNull();
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);

    expect(
      screen.getByText(/shift-click a checkbox to select a range/i),
    ).toBeInTheDocument();
  });

  it('omits the range hint when only one chat is visible', () => {
    renderSidebar({ sessions: [sessions[0] as SessionSummary] });

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    expect(screen.getByText('1 chat selected')).toBeInTheDocument();
    expect(
      screen.queryByText(/shift-click a checkbox to select a range/i),
    ).toBeNull();
  });

  it('cancels a selected-chat delete without touching the callback', () => {
    const { onBulkDeleteSessions } = renderSidebar();
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete 1 selected chats' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onBulkDeleteSessions).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: 'Delete selected chats' }),
    ).toBeNull();
  });

  it('exports only the selected chats as markdown', async () => {
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 1 selected chats as markdown',
      }),
    );

    await waitFor(() =>
      expect(downloadMarkdownFile).toHaveBeenCalledWith(
        expect.stringContaining('## 1. Should we launch today?'),
        'arena-selected-chats',
      ),
    );
    const exported = vi.mocked(downloadMarkdownFile).mock.calls[0]?.[0];
    expect(exported).toContain('Chat `chat-1`');
    expect(exported).not.toContain('Chat `chat-2`');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Exported 1 selected chats' }),
      ).toBeInTheDocument(),
    );
  });

  it('copies only the selected chats as markdown', async () => {
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy 1 selected chat as markdown',
      }),
    );

    const { copyToClipboard } = await import('../lib/clipboard');
    await waitFor(() =>
      expect(copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('## 1. Should we launch today?'),
      ),
    );
    const copied = vi.mocked(copyToClipboard).mock.calls[0]?.[0];
    expect(copied).toContain('Chat `chat-1`');
    expect(copied).not.toContain('Chat `chat-2`');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Copied 1 selected chat' }),
      ).toBeInTheDocument(),
    );
  });

  it('exports only the selected chats as full transcripts', async () => {
    const onBulkExportTranscripts = vi.fn(() => 1);
    renderSidebar({ onBulkExportTranscripts });

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 1 selected chat as transcripts',
      }),
    );

    await waitFor(() =>
      expect(onBulkExportTranscripts).toHaveBeenCalledWith(['chat-1']),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Exported 1 selected chat as transcripts',
        }),
      ).toBeInTheDocument(),
    );
  });

  it('surfaces a partial full-transcript export honestly', async () => {
    renderSidebar({
      onBulkExportTranscripts: vi.fn(() => Promise.resolve(1)),
    });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 2 selected chats as transcripts',
      }),
    );

    await waitFor(() => {
      const statuses = screen.getAllByRole('status');
      expect(
        statuses.some((status) =>
          status.textContent?.includes(
            'Some selected chat transcripts could not be exported',
          ),
        ),
      ).toBe(true);
    });
  });

  it('hides the full-transcript export control when no callback is provided', () => {
    renderSidebar({ onBulkExportTranscripts: null });
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    expect(
      screen.queryByRole('button', {
        name: 'Export 1 selected chat as transcripts',
      }),
    ).toBeNull();
  });

  it('ignores a second copy click while the first copy is in flight', async () => {
    const { copyToClipboard } = await import('../lib/clipboard');
    let resolveCopy: (ok: boolean) => void = () => {};
    vi.mocked(copyToClipboard).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy 1 selected chat as markdown',
      }),
    );

    const copyingButton = await screen.findByRole('button', {
      name: 'Copying 1 selected chat…',
    });
    expect(copyingButton).toBeDisabled();
    fireEvent.click(copyingButton);

    resolveCopy(true);
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Copied 1 selected chat' }),
      ).toBeInTheDocument(),
    );
  });

  it('announces a failure when copying selected chats is blocked', async () => {
    const { copyToClipboard } = await import('../lib/clipboard');
    vi.mocked(copyToClipboard).mockResolvedValueOnce(false);
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy 1 selected chat as markdown',
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Selected chat copy failed' }),
      ).toBeInTheDocument(),
    );
  });

  it('announces a failure when the selected chat export is blocked', async () => {
    vi.mocked(downloadMarkdownFile).mockReturnValueOnce(false);
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 1 selected chats as markdown',
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Selected chat export failed' }),
      ).toBeInTheDocument(),
    );
  });

  it('keeps the exported count honest when sessions change during the success window', async () => {
    const { rerender } = renderSidebar();

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 2 selected chats as markdown',
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Exported 2 selected chats' }),
      ).toBeInTheDocument(),
    );

    // chat-1 disappears externally while the success feedback is still up;
    // the label must keep describing what was actually exported.
    rerender([sessions[1] as SessionSummary]);
    const exported = vi.mocked(downloadMarkdownFile).mock.calls[0]?.[0];
    expect(exported).toContain('Chat `chat-1`');
    expect(exported).toContain('Chat `chat-2`');
    expect(
      screen.getByRole('button', { name: 'Exported 2 selected chats' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 chat selected')).toBeInTheDocument();
    const statuses = screen.getAllByRole('status');
    expect(
      statuses.some((status) => status.textContent?.includes('2 chats exported')),
    ).toBe(true);
  });

  it('resets export feedback when the selection changes after a success', async () => {
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 1 selected chats as markdown',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Exported 1 selected chats' }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[1]);
    expect(
      screen.getByRole('button', {
        name: 'Export 2 selected chats as markdown',
      }),
    ).toBeInTheDocument();
  });

  it('exports only the selected chats as JSON', async () => {
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 1 selected chats as JSON',
      }),
    );

    await waitFor(() =>
      expect(downloadTextFile).toHaveBeenCalledWith(
        expect.stringContaining('"session_id": "chat-1"'),
        expect.objectContaining({
          filename: expect.stringMatching(/arena-selected-chats-\d{4}-\d{2}-\d{2}\.json/),
        }),
      ),
    );
    const exported = vi.mocked(downloadTextFile).mock.calls[0]?.[0];
    expect(exported).not.toContain('"session_id": "chat-2"');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Exported 1 selected chats as JSON' }),
      ).toBeInTheDocument(),
    );
  });

  it('exports only the selected chats as CSV', async () => {
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[1]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 1 selected chats as CSV',
      }),
    );

    await waitFor(() =>
      expect(downloadTextFile).toHaveBeenCalledWith(
        expect.stringContaining('"Untitled chat"'),
        expect.objectContaining({
          filename: expect.stringMatching(/arena-selected-chats-\d{4}-\d{2}-\d{2}\.csv/),
        }),
      ),
    );
    const exported = vi.mocked(downloadTextFile).mock.calls[0]?.[0];
    expect(exported).toContain('"chat-2"');
    expect(exported).not.toContain('"chat-1"');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Exported 1 selected chats as CSV' }),
      ).toBeInTheDocument(),
    );
  });

  it('announces a failure when the selected chat JSON export is blocked', async () => {
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 1 selected chats as JSON',
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Selected chat JSON export failed' }),
      ).toBeInTheDocument(),
    );
  });

  it('announces a failure when the selected chat CSV export is blocked', async () => {
    vi.mocked(downloadTextFile).mockReturnValueOnce(false);
    renderSidebar();

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Export 1 selected chats as CSV',
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Selected chat CSV export failed' }),
      ).toBeInTheDocument(),
    );
  });

  it('surfaces a failure when bulk deleting selected chats fails', async () => {
    renderSidebar({ onBulkDeleteSessions: vi.fn().mockResolvedValue(null) });
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete 1 selected chats' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete selected chats' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete selected' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not delete selected chats/i,
      ),
    );
  });

  it('pins selected chats from the selection toolbar', async () => {
    const onBulkPinSessions = vi
      .fn()
      .mockResolvedValue({ updated: 2, updated_ids: ['chat-1', 'chat-2'] });
    renderSidebar({ onBulkPinSessions });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Pin 2 selected chats' }),
    );

    await waitFor(() =>
      expect(onBulkPinSessions).toHaveBeenCalledWith(['chat-1', 'chat-2'], true),
    );
    await waitFor(() => {
      const statuses = screen.getAllByRole('status');
      expect(
        statuses.some((status) =>
          status.textContent?.includes('Selected chats updated'),
        ),
      ).toBe(true);
    });
  });

  it('unpins selected chats when every selected chat is pinned', async () => {
    const onBulkPinSessions = vi
      .fn()
      .mockResolvedValue({ updated: 2, updated_ids: ['chat-1', 'chat-2'] });
    renderSidebar({
      onBulkPinSessions,
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          pinned: true,
        },
        {
          ...(sessions[1] as SessionSummary),
          pinned: true,
        },
      ],
    });

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[1]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Unpin 2 selected chats' }),
    );

    await waitFor(() =>
      expect(onBulkPinSessions).toHaveBeenCalledWith(['chat-1', 'chat-2'], false),
    );
  });

  it('reports a partial bulk pin and keeps the selection', async () => {
    const onBulkPinSessions = vi
      .fn()
      .mockResolvedValue({ updated: 1, updated_ids: ['chat-1'] });
    renderSidebar({ onBulkPinSessions });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Pin 2 selected chats' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /some selected chats could not be updated/i,
      ),
    );
    expect(screen.getByText('2 chats selected')).toBeInTheDocument();
  });

  it('surfaces a failure when bulk pinning selected chats fails', async () => {
    renderSidebar({
      onBulkPinSessions: vi.fn().mockResolvedValue(null),
    });

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Pin 1 selected chats' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not update selected chats/i,
      ),
    );
  });

  it('locks chat selection while a bulk pin is in flight', async () => {
    let resolveBulkPin!: (value: BulkPinSessionsResult | null) => void;
    const onBulkPinSessions = vi.fn(
      () =>
        new Promise<BulkPinSessionsResult | null>((resolve) => {
          resolveBulkPin = resolve;
        }),
    );
    renderSidebar({ onBulkPinSessions });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Pin 2 selected chats' }),
    );

    await waitFor(() => expect(checkboxes[0]).toBeDisabled());
    expect(checkboxes[1]).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Clear chat selection' }),
    ).toBeDisabled();

    resolveBulkPin({ updated: 2, updated_ids: ['chat-1', 'chat-2'] });
    await waitFor(() => {
      const statuses = screen.getAllByRole('status');
      expect(
        statuses.some((status) =>
          status.textContent?.includes('Selected chats updated'),
        ),
      ).toBe(true);
    });
  });

  it('keeps the busy label on the intended pin action when parent state changes', async () => {
    let resolveBulkPin!: (value: BulkPinSessionsResult | null) => void;
    const onBulkPinSessions = vi.fn(
      () =>
        new Promise<BulkPinSessionsResult | null>((resolve) => {
          resolveBulkPin = resolve;
        }),
    );
    const { rerender } = renderSidebar({ onBulkPinSessions });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    const pinButton = screen.getByRole('button', {
      name: 'Pin 2 selected chats',
    });
    fireEvent.click(pinButton);

    await waitFor(() => expect(pinButton).toHaveTextContent('Pinning…'));
    rerender([
      {
        ...(sessions[0] as SessionSummary),
        pinned: true,
      },
      {
        ...(sessions[1] as SessionSummary),
        pinned: true,
      },
    ]);
    expect(pinButton).toHaveTextContent('Pinning…');
    expect(
      screen.getByRole('button', { name: 'Pin 2 selected chats' }),
    ).toBeInTheDocument();

    resolveBulkPin({ updated: 2, updated_ids: ['chat-1', 'chat-2'] });
    await waitFor(() => {
      const statuses = screen.getAllByRole('status');
      expect(
        statuses.some((status) =>
          status.textContent?.includes('Selected chats updated'),
        ),
      ).toBe(true);
    });
  });

  it('bulk pins selected chats when only the pin callback is provided', async () => {
    const onBulkPinSessions = vi
      .fn()
      .mockResolvedValue({ updated: 1, updated_ids: ['chat-1'] });
    renderSidebar({ onBulkPinSessions, onBulkDeleteSessions: null });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]);
    expect(
      screen.getByRole('button', { name: 'Pin 1 selected chats' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Delete 1 selected chats/ }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Pin 1 selected chats' }),
    );
    await waitFor(() =>
      expect(onBulkPinSessions).toHaveBeenCalledWith(['chat-1'], true),
    );
  });

  it('duplicates selected chats from the selection toolbar', async () => {
    const onBulkDuplicateSessions = vi.fn().mockResolvedValue({
      duplicated: 2,
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          session_id: 'dup-1',
        },
        {
          ...(sessions[1] as SessionSummary),
          session_id: 'dup-2',
        },
      ],
    });
    renderSidebar({ onBulkDuplicateSessions });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Duplicate 2 selected chats' }),
    );

    await waitFor(() =>
      expect(onBulkDuplicateSessions).toHaveBeenCalledWith(['chat-1', 'chat-2']),
    );
    await waitFor(() => {
      const statuses = screen.getAllByRole('status');
      expect(
        statuses.some((status) =>
          status.textContent?.includes('Selected chats duplicated'),
        ),
      ).toBe(true);
    });
    expect(screen.queryByText('2 chats selected')).toBeNull();
  });

  it('reports a partial bulk duplicate and clears the selection', async () => {
    const onBulkDuplicateSessions = vi.fn().mockResolvedValue({
      duplicated: 1,
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          session_id: 'dup-1',
        },
      ],
    });
    renderSidebar({ onBulkDuplicateSessions });

    const checkboxes = screen.getAllByRole('checkbox', { name: /Select chat:/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Duplicate 2 selected chats' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /some selected chats could not be duplicated/i,
      ),
    );
    expect(screen.queryByText('2 chats selected')).toBeNull();
  });

  it('surfaces a failure when bulk duplicating selected chats fails', async () => {
    renderSidebar({
      onBulkDuplicateSessions: vi.fn().mockResolvedValue(null),
    });

    fireEvent.click(screen.getAllByRole('checkbox', { name: /Select chat:/ })[0]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Duplicate 1 selected chats' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not duplicate selected chats/i,
      ),
    );
  });

  it('pins a chat without opening it', () => {
    const { onSessionSelect, onToggleSessionPin } = renderSidebar();
    fireEvent.click(screen.getAllByRole('button', { name: 'Pin session' })[0]);
    expect(onToggleSessionPin).toHaveBeenCalledWith('chat-1', true);
    expect(onSessionSelect).not.toHaveBeenCalled();
  });

  it('unpins a chat through its pin button', () => {
    const { onToggleSessionPin } = renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          pinned: true,
        },
        sessions[1] as SessionSummary,
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unpin session' }));
    expect(onToggleSessionPin).toHaveBeenCalledWith('chat-1', false);
  });

  it('surfaces a failure when a pin update is rejected', async () => {
    const onToggleSessionPin = vi.fn().mockResolvedValue(false);
    renderSidebar({ onToggleSessionPin });

    fireEvent.click(screen.getAllByRole('button', { name: 'Pin session' })[0]);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't update pin. Please try again.",
      ),
    );
    expect(onToggleSessionPin).toHaveBeenCalledWith('chat-1', true);
  });

  it('ignores repeated pin clicks while an update is in flight', async () => {
    let resolvePin!: (value: boolean) => void;
    const onToggleSessionPin = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePin = resolve;
        }),
    );
    renderSidebar({ onToggleSessionPin });

    const pinButton = screen.getAllByRole('button', { name: 'Pin session' })[0];
    fireEvent.click(pinButton);
    await waitFor(() => expect(pinButton).toBeDisabled());
    fireEvent.click(pinButton);
    resolvePin(true);

    await waitFor(() => expect(onToggleSessionPin).toHaveBeenCalledTimes(1));
  });

  it('keeps pinned chats at the top of the list', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          pinned: true,
          last_prompt: 'Pinned launch plan',
        },
        {
          ...(sessions[1] as SessionSummary),
          last_prompt: 'Newest unpinned chat',
        },
      ],
    });
    const openButtons = screen.getAllByRole('button', { name: /Open session/ });
    expect(openButtons[0]).toHaveAttribute('aria-label', 'Open session: Pinned launch plan');
    expect(openButtons[1]).toHaveAttribute(
      'aria-label',
      'Open session: Newest unpinned chat',
    );
  });

  it('sorts chats by title when the sort control is changed', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          title: 'Zebra planning',
        },
        {
          ...(sessions[1] as SessionSummary),
          title: 'Alpha review',
        },
      ],
    });
    const sort = screen.getByRole('combobox', { name: 'Sort chats' });
    expect(sort).toHaveValue('newest');
    expect(screen.getAllByRole('button', { name: /Open session/ })[0]).toHaveAttribute(
      'aria-label',
      'Open session: Zebra planning',
    );

    fireEvent.change(sort, { target: { value: 'title' } });
    expect(screen.getAllByRole('button', { name: /Open session/ })[0]).toHaveAttribute(
      'aria-label',
      'Open session: Alpha review',
    );
  });

  it('keeps pinned chats above the chosen chat sort', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          title: 'Zebra planning',
        },
        {
          ...(sessions[1] as SessionSummary),
          title: 'Alpha review',
          pinned: true,
        },
      ],
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort chats' }), {
      target: { value: 'title' },
    });
    const openButtons = screen.getAllByRole('button', { name: /Open session/ });
    expect(openButtons[0]).toHaveAttribute('aria-label', 'Open session: Alpha review');
    expect(openButtons[1]).toHaveAttribute('aria-label', 'Open session: Zebra planning');
  });

  it('clears all chats only after inline confirmation', async () => {
    const onClearSessions = vi.fn().mockResolvedValue(2);
    renderSidebar({ onClearSessions });

    fireEvent.click(screen.getByRole('button', { name: 'Clear 2 chats' }));
    expect(onClearSessions).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Clear all chats' });
    expect(dialog).toHaveTextContent(/Clear all 2 resumable chats/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(onClearSessions).toHaveBeenCalledTimes(1));
  });

  it('cancels clearing chats without touching the callback', () => {
    const onClearSessions = vi.fn().mockResolvedValue(2);
    renderSidebar({ onClearSessions });

    fireEvent.click(screen.getByRole('button', { name: 'Clear 2 chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClearSessions).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Clear all chats' })).toBeNull();
  });

  it('surfaces a failure when clearing all chats fails', async () => {
    const onClearSessions = vi.fn().mockResolvedValue(null);
    renderSidebar({ onClearSessions });

    fireEvent.click(screen.getByRole('button', { name: 'Clear 2 chats' }));
    const dialog = screen.getByRole('dialog', { name: 'Clear all chats' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/could not clear chats/i);
    });
  });

  it('treats a successful zero-count clear as a no-op, not a failure', async () => {
    const onClearSessions = vi.fn().mockResolvedValue(0);
    renderSidebar({ onClearSessions });

    fireEvent.click(screen.getByRole('button', { name: 'Clear 2 chats' }));
    const dialog = screen.getByRole('dialog', { name: 'Clear all chats' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));

    await waitFor(() => expect(onClearSessions).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('filters chats to the pinned-only view', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          pinned: true,
          last_prompt: 'Pinned launch plan',
        },
        {
          ...(sessions[1] as SessionSummary),
          last_prompt: 'Unpinned draft',
        },
      ],
    });

    const filter = screen.getByRole('combobox', { name: 'Filter chats' });
    expect(filter).toHaveValue('all');

    fireEvent.change(filter, { target: { value: 'pinned' } });

    const openButtons = screen.getAllByRole('button', { name: /Open session/ });
    expect(openButtons).toHaveLength(1);
    expect(openButtons[0]).toHaveAttribute(
      'aria-label',
      'Open session: Pinned launch plan',
    );
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('hides the pinned filter when no chat is pinned', () => {
    renderSidebar();
    expect(
      screen.queryByRole('combobox', { name: 'Filter chats' }),
    ).toBeNull();
  });

  it('searches within the pinned-only view', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          pinned: true,
          last_prompt: 'Q3 planning review',
        },
        {
          ...(sessions[1] as SessionSummary),
          pinned: true,
          last_prompt: 'Marketing launch',
        },
      ],
    });

    const filter = screen.getByRole('combobox', { name: 'Filter chats' });
    fireEvent.change(filter, { target: { value: 'pinned' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), {
      target: { value: 'marketing' },
    });

    expect(
      screen.getByRole('button', { name: /Open session: Marketing launch/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Q3 planning review/)).toBeNull();
  });

  it('shows every pinned chat without the show-all toggle', () => {
    const pinnedSessions = Array.from({ length: 6 }, (_, index) => ({
      ...(sessions[0] as SessionSummary),
      session_id: `pinned-${index}`,
      pinned: true,
      last_prompt: `Pinned chat ${index}`,
    }));
    renderSidebar({ sessions: pinnedSessions });

    const filter = screen.getByRole('combobox', { name: 'Filter chats' });
    fireEvent.change(filter, { target: { value: 'pinned' } });

    expect(screen.getAllByRole('button', { name: /Open session/ })).toHaveLength(
      6,
    );
    expect(
      screen.queryByRole('button', { name: /Show all|Show fewer/ }),
    ).toBeNull();
    expect(screen.getByText('6 / 6')).toBeInTheDocument();
  });

  it('falls back to all chats when the last pinned chat is unpinned', () => {
    const { rerender } = renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          pinned: true,
          last_prompt: 'Only pinned chat',
        },
      ],
    });

    const filter = screen.getByRole('combobox', { name: 'Filter chats' });
    fireEvent.change(filter, { target: { value: 'pinned' } });
    expect(screen.getAllByRole('button', { name: /Open session/ })).toHaveLength(
      1,
    );

    rerender([
      {
        ...(sessions[0] as SessionSummary),
        pinned: false,
        last_prompt: 'Only pinned chat',
      },
    ]);

    expect(
      screen.queryByRole('combobox', { name: 'Filter chats' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: /Open session: Only pinned chat/ }),
    ).toBeInTheDocument();
  });

  it('renames a chat inline through the callback', async () => {
    const { onRenameSession } = renderSidebar();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename session' })[0]);

    const input = screen.getByRole('textbox', { name: 'Rename chat' });
    fireEvent.change(input, { target: { value: 'Launch plan review' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(onRenameSession).toHaveBeenCalledWith('chat-1', 'Launch plan review'),
    );
  });

  it('normalizes whitespace before saving a chat title', async () => {
    const { onRenameSession } = renderSidebar();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename session' })[0]);

    const input = screen.getByRole('textbox', { name: 'Rename chat' });
    fireEvent.change(input, { target: { value: 'Launch \n  plan\treview' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(onRenameSession).toHaveBeenCalledWith('chat-1', 'Launch plan review'),
    );
  });

  it('does not close a second rename editor while an earlier save is pending', async () => {
    let resolveFirst!: (value: boolean) => void;
    let resolveSecond!: (value: boolean) => void;
    const firstSave = new Promise<boolean>((resolve) => {
      resolveFirst = resolve;
    });
    const secondSave = new Promise<boolean>((resolve) => {
      resolveSecond = resolve;
    });
    const onRenameSession = vi.fn((sessionId: string) =>
      sessionId === 'chat-1' ? firstSave : secondSave,
    );
    renderSidebar({ onRenameSession });

    fireEvent.click(screen.getAllByRole('button', { name: 'Rename session' })[0]);
    const firstInput = screen.getByRole('textbox', { name: 'Rename chat' });
    fireEvent.change(firstInput, { target: { value: 'First title' } });
    fireEvent.keyDown(firstInput, { key: 'Enter' });

    // The second chat card is still interactive while the first save is in flight.
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename session' })[0]);
    const secondInput = screen.getByRole('textbox', { name: 'Rename chat' });
    fireEvent.change(secondInput, { target: { value: 'Second title' } });

    resolveFirst(true);
    await waitFor(() =>
      expect(onRenameSession).toHaveBeenCalledWith('chat-1', 'First title'),
    );
    expect(screen.getByRole('textbox', { name: 'Rename chat' })).toHaveValue(
      'Second title',
    );

    fireEvent.keyDown(secondInput, { key: 'Enter' });
    await waitFor(() =>
      expect(onRenameSession).toHaveBeenCalledWith('chat-2', 'Second title'),
    );
    resolveSecond(true);
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Rename chat' })).toBeNull(),
    );
  });

  it('shows a custom title instead of the last prompt', () => {
    renderSidebar({
      sessions: [
        {
          ...(sessions[0] as SessionSummary),
          title: 'My launch plan',
        },
      ],
    });
    expect(screen.getByText('My launch plan')).toBeInTheDocument();
    expect(screen.queryByText(/Should we launch today/)).toBeNull();
  });

  it('collapses long chat lists behind a show-all toggle', () => {
    const many: SessionSummary[] = Array.from({ length: 7 }, (_, i) => ({
      session_id: `chat-${i}`,
      topics: [],
      primary_topic: null,
      last_prompt: `Prompt ${i}`,
      turn_count: 1,
      last_active: new Date().toISOString(),
    }));
    renderSidebar({ sessions: many });
    expect(screen.getAllByRole('button', { name: /Open session/ })).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: /Show all 7 chats/ }));
    expect(screen.getAllByRole('button', { name: /Open session/ })).toHaveLength(7);
    expect(screen.getByRole('button', { name: /Show fewer chats/ })).toBeInTheDocument();
  });

  it('offers chat export controls when resumable chats exist', () => {
    renderSidebar();

    expect(
      screen.getByRole('button', { name: 'Copy chats as markdown' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download chats as markdown' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download chats as JSON' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download chats as CSV' }),
    ).toBeInTheDocument();
  });

  it('hides chat export controls when there are no resumable chats', () => {
    renderSidebar({ sessions: [] });

    expect(
      screen.queryByRole('button', { name: 'Copy chats as markdown' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Download chats as JSON' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Download chats as CSV' }),
    ).toBeNull();
  });
});

describe('Sidebar recents export', () => {
  it('offers JSON and CSV export controls when recents exist', () => {
    renderSidebar({
      turns: [
        {
          turn_id: 'turn-1',
          prompt: 'Should we ship today?',
          prompt_category: 'question',
          winner_id: 'agent_1',
          timestamp: '2026-07-01T12:00:00Z',
        },
      ],
    });

    expect(
      screen.getByRole('button', { name: 'Download recents as JSON' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download recents as CSV' }),
    ).toBeInTheDocument();
  });

  it('hides export controls when there are no recent turns', () => {
    renderSidebar();

    expect(
      screen.queryByRole('button', { name: 'Download recents as JSON' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Download recents as CSV' }),
    ).toBeNull();
  });
});
