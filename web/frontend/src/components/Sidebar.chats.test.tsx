import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import type { SavedResponseItem } from '../types';
import type { SessionSummary } from '../api';

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
    last_active: new Date().toISOString(),
  },
  {
    session_id: 'chat-2',
    topics: [],
    primary_topic: null,
    last_prompt: null,
    turn_count: 1,
    last_active: new Date().toISOString(),
  },
];

function renderSidebar(overrides?: {
  sessions?: SessionSummary[];
  activeSessionId?: string | null;
  onSessionSelect?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onClearSessions?: () => Promise<number | null> | void;
  onRenameSession?: (sessionId: string, title: string) => boolean | Promise<boolean>;
  onToggleSessionPin?: (sessionId: string, pinned: boolean) => boolean | Promise<boolean>;
}) {
  const onSessionSelect = overrides?.onSessionSelect ?? vi.fn();
  const onDeleteSession = overrides?.onDeleteSession ?? vi.fn();
  const onClearSessions = overrides?.onClearSessions;
  const onRenameSession = overrides?.onRenameSession ?? vi.fn(() => true);
  const onToggleSessionPin = overrides?.onToggleSessionPin ?? vi.fn(() => true);
  render(
    <Sidebar
      turns={[]}
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
      onClearSessions={onClearSessions}
      onRenameSession={onRenameSession}
      onToggleSessionPin={onToggleSessionPin}
    />,
  );
  return {
    onSessionSelect,
    onDeleteSession,
    onClearSessions,
    onRenameSession,
    onToggleSessionPin,
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
});
