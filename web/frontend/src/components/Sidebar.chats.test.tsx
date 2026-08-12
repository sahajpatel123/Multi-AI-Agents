import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
}) {
  const onSessionSelect = overrides?.onSessionSelect ?? vi.fn();
  const onDeleteSession = overrides?.onDeleteSession ?? vi.fn();
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
    />,
  );
  return { onSessionSelect, onDeleteSession };
}

describe('Sidebar recent chats', () => {
  it('lists resumable chats with their last prompt and turn count', () => {
    renderSidebar();
    expect(screen.getByText('Chats')).toBeInTheDocument();
    expect(screen.getByText(/Should we launch today/)).toBeInTheDocument();
    expect(screen.getByText(/3 msg/)).toBeInTheDocument();
    expect(screen.getByText('Untitled chat')).toBeInTheDocument();
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
