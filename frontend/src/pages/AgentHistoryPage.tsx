import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApiError, getAgentHistory, submitTaskFeedback } from '../api';
import { useTier } from '../context/TierContext';
import { useAuth } from '../hooks/useAuth';
import { UserMenu } from '../components/UserMenu';

type HistoryTask = {
  task_id: string;
  task_text: string;
  final_score: number | null;
  final_confidence: number | null;
  topics: string[];
  user_feedback: string | null;
  created_at: string;
};

type HistoryPayload = {
  tasks: HistoryTask[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};

function formatShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export function AgentHistoryPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { canUseFeature, isPro } = useTier();
  const canAgent = canUseFeature('agent_mode');

  const [data, setData] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canAgent) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const raw = (await getAgentHistory(1)) as HistoryPayload;
      setData(raw);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load history');
    } finally {
      setLoading(false);
    }
  }, [canAgent]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFeedback = async (taskId: string, feedback: 'accurate' | 'partial' | 'inaccurate') => {
    setFeedbackBusy(taskId);
    try {
      await submitTaskFeedback(taskId, feedback);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.task_id === taskId ? { ...t, user_feedback: feedback } : t,
          ),
        };
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Feedback failed');
    } finally {
      setFeedbackBusy(null);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAF7F4',
        color: '#1A1714',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '0.5px solid #E0D8D0',
          background: 'rgba(250, 247, 244, 0.92)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/agent')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6B6460',
            fontSize: 13,
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          Agent
        </button>
        <span style={{ fontSize: 15, fontWeight: 500, color: '#1A1714' }}>Research history</span>
        <div style={{ minWidth: 120, display: 'flex', justifyContent: 'flex-end' }}>
          {user && (
            <UserMenu
              user={user}
              isLoading={authLoading}
              onSignInClick={() => navigate('/signin')}
              onLogout={() => void logout()}
            />
          )}
        </div>
      </header>

      <main
        style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '2rem 1.5rem',
        }}
      >
        {authLoading ? (
          <p style={{ fontSize: 14, color: '#6B6460' }}>Loading…</p>
        ) : !canAgent ? (
          <p style={{ fontSize: 15, color: '#6B6460', textAlign: 'center' }}>
            Agent Mode requires Pro.
          </p>
        ) : loading ? (
          <p style={{ fontSize: 15, color: '#6B6460', textAlign: 'center' }}>Loading history…</p>
        ) : error ? (
          <p style={{ color: '#E57373', fontSize: 14, textAlign: 'center' }}>{error}</p>
        ) : !data?.tasks?.length ? (
          <p style={{ fontSize: 15, color: '#6B6460', textAlign: 'center' }}>No tasks yet.</p>
        ) : (
          data.tasks.map((t) => {
            const score = t.final_score ?? 0;
            const scoreColor =
              score >= 80 ? '#5A8A5A' : score >= 60 ? '#C4956A' : '#E57373';
            const scoreBg =
              score >= 80
                ? 'rgba(138,168,153,0.15)'
                : score >= 60
                  ? 'rgba(196,149,106,0.12)'
                  : 'rgba(229,115,115,0.1)';
            const preview =
              t.task_text.length > 80 ? `${t.task_text.slice(0, 80)}…` : t.task_text;
            const topics = (t.topics || []).slice(0, 3);

            return (
              <div
                key={t.task_id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/agent?task_id=${encodeURIComponent(t.task_id)}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/agent?task_id=${encodeURIComponent(t.task_id)}`);
                  }
                }}
                style={{
                  background: '#FFFFFF',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 14,
                  padding: '1rem 1.25rem',
                  marginBottom: 8,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#1A1714',
                    marginBottom: 8,
                  }}
                >
                  {preview}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {topics.map((topic) => (
                      <span
                        key={topic}
                        style={{
                          background: '#F0EBE3',
                          color: '#6B6460',
                          borderRadius: 999,
                          padding: '2px 8px',
                          fontSize: 10,
                        }}
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        fontSize: 11,
                        borderRadius: 999,
                        padding: '2px 8px',
                        color: scoreColor,
                        background: scoreBg,
                      }}
                    >
                      {t.final_score != null ? `${t.final_score}/100` : '—'}
                    </span>
                    <span style={{ fontSize: 11, color: '#B0A9A2' }}>
                      {formatShortDate(t.created_at)}
                    </span>
                  </div>
                </div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  {!t.user_feedback ? (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ fontSize: 11, color: '#6B6460', marginBottom: 6 }}>
                        Was this answer accurate?
                      </p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(
                          [
                            { key: 'accurate', label: '✓ Accurate' },
                            { key: 'partial', label: '~ Partial' },
                            { key: 'inaccurate', label: '✗ Inaccurate' },
                          ] as const
                        ).map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            disabled={feedbackBusy === t.task_id}
                            onClick={() => void onFeedback(t.task_id, key)}
                            style={{
                              background: 'transparent',
                              border: '0.5px solid #E0D8D0',
                              borderRadius: 999,
                              padding: '3px 10px',
                              fontSize: 11,
                              color: '#6B6460',
                              cursor: feedbackBusy === t.task_id ? 'default' : 'pointer',
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: '#6B6460', marginTop: 8 }}>
                      Marked:{' '}
                      {t.user_feedback === 'accurate'
                        ? 'Accurate'
                        : t.user_feedback === 'partial'
                          ? 'Partial'
                          : 'Inaccurate'}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>

      {!isPro && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#B0A9A2', paddingBottom: 24 }}>
          Upgrade to Pro for full Agent Mode.
        </p>
      )}
    </div>
  );
}
