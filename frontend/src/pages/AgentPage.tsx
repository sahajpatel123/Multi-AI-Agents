import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { runAgentTask } from '../api';
import { useTier } from '../context/TierContext';
import { useAuth } from '../hooks/useAuth';
import { UserMenu } from '../components/UserMenu';

const STAGES = [
  { id: 'planner', label: 'Planning', description: 'Breaking down your task' },
  { id: 'researcher', label: 'Researching', description: 'Gathering information' },
  { id: 'solver', label: 'Solving', description: 'Building the answer' },
  { id: 'critic', label: 'Critiquing', description: 'Finding weaknesses' },
  { id: 'verifier', label: 'Verifying', description: 'Checking accuracy' },
  { id: 'synthesizer', label: 'Synthesizing', description: 'Refining the answer' },
  { id: 'judge', label: 'Judging', description: 'Scoring the result' },
] as const;

type StageId = (typeof STAGES)[number]['id'];

type StagePayload = {
  status?: string;
  output?: string;
  model?: string;
};

type AgentResult = {
  task_id?: string;
  status?: string;
  current_stage?: string;
  stages?: Record<string, StagePayload>;
  final_answer?: string;
  final_confidence?: number;
  final_score?: number;
  flags?: string[];
  error?: string;
};

const EXAMPLES = [
  'Research the top 5 AI startups funded this month',
  'Write a go-to-market strategy for a SaaS product',
  'Analyse the pros and cons of moving from SQL to NoSQL',
];

export function AgentPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { canUseFeature, isPro } = useTier();
  const canAgent = canUseFeature('agent_mode');

  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<StageId>>(new Set());
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [fakeStageIndex, setFakeStageIndex] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const t = window.setInterval(() => {
      setFakeStageIndex((i) => (i + 1) % STAGES.length);
    }, 1600);
    return () => window.clearInterval(t);
  }, [isRunning]);

  const toggleStage = useCallback((id: StageId) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRunTask = async () => {
    const t = task.trim();
    if (t.length < 10 || isRunning) return;
    setError(null);
    setResult(null);
    setExpandedStages(new Set());
    setPipelineOpen(false);
    setIsRunning(true);
    setFakeStageIndex(0);
    try {
      const data = (await runAgentTask(t)) as AgentResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent task failed');
    } finally {
      setIsRunning(false);
    }
  };

  const resetRun = () => {
    setResult(null);
    setError(null);
    setExpandedStages(new Set());
    setPipelineOpen(false);
  };

  const stageVisual = useMemo(() => {
    if (!isRunning && result?.stages) {
      return STAGES.map((s) => ({
        id: s.id,
        state: (result.stages?.[s.id]?.status || 'pending') as string,
      }));
    }
    return STAGES.map((s, i) => ({
      id: s.id,
      state: i === fakeStageIndex ? 'running' : i < fakeStageIndex ? 'complete' : 'pending',
    }));
  }, [isRunning, result, fakeStageIndex]);

  const expandedId = expandedStages.size === 1 ? [...expandedStages][0] : null;

  const expandedPayload: StagePayload | null =
    expandedId && result?.stages ? (result.stages[expandedId] as StagePayload) : null;

  const score = result?.final_score ?? 0;
  const confidence = result?.final_confidence ?? 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAF7F4',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes breatheDot {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>

      <header
        style={{
          height: '52px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          background: 'rgba(250,247,244,0.85)',
          borderBottom: '0.5px solid #E0D8D0',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '0 24px',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            type="button"
            onClick={() => navigate('/app')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#F0EBE3',
              border: '0.5px solid #E0D8D0',
              borderRadius: '999px',
              padding: '6px 14px',
              fontSize: '13px',
              color: '#6B6460',
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#E0D8D0';
              e.currentTarget.style.color = '#1A1714';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#F0EBE3';
              e.currentTarget.style.color = '#6B6460';
            }}
          >
            <ArrowLeft style={{ width: '14px', height: '14px' }} />
            Arena
          </button>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifySelf: 'center' }}>
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#C4956A',
              animation: 'breathe 2.4s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714' }}>Agent</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <UserMenu user={user} isLoading={authLoading} onSignInClick={() => navigate('/signin')} onLogout={logout} />
        </div>
      </header>

      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '2rem 1.5rem',
          flex: 1,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {!canAgent ? (
          <div
            style={{
              maxWidth: 480,
              margin: '0 auto',
              textAlign: 'center',
              padding: '3rem 2rem',
            }}
          >
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
              <Lock style={{ width: 32, height: 32, color: '#C4956A' }} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 400, color: '#1A1714', marginBottom: '0.5rem' }}>Agent Mode</h1>
            <p style={{ fontSize: 14, color: '#6B6460', lineHeight: 1.7, marginBottom: '2rem' }}>
              A 7-stage AI pipeline that researches, solves, critiques, verifies, and synthesises. Not just an answer — a
              process.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                marginBottom: '2rem',
              }}
            >
              {['7 reasoning stages', 'Confidence scoring', 'Web research', 'Self-correction'].map((label) => (
                <span
                  key={label}
                  style={{
                    background: '#F0EBE3',
                    color: '#6B6460',
                    borderRadius: 999,
                    padding: '6px 14px',
                    fontSize: 12,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate('/pricing')}
              style={{
                background: '#1A1714',
                color: '#FAF7F4',
                borderRadius: 999,
                padding: '13px 32px',
                fontSize: 14,
                fontWeight: 500,
                width: '100%',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Upgrade to Pro
            </button>
            {!isPro && (
              <p style={{ fontSize: 12, color: '#B0A9A2', marginTop: '1rem' }}>Pro includes Agent Mode and more.</p>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '2rem' }}>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#B0A9A2',
                  marginBottom: '0.5rem',
                }}
              >
                AGENT MODE
              </p>
              <h1
                style={{
                  fontSize: 36,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  color: '#1A1714',
                  marginBottom: '0.5rem',
                }}
              >
                Give it a task.
              </h1>
              <p style={{ fontSize: 14, color: '#6B6460', lineHeight: 1.6 }}>
                Not just an answer. A reasoned, verified, battle-tested response.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '2rem' }}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={isRunning}
                  onClick={() => setTask(ex)}
                  style={{
                    background: '#F0EBE3',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: 999,
                    padding: '7px 16px',
                    fontSize: 12,
                    color: '#6B6460',
                    cursor: isRunning ? 'default' : 'pointer',
                    opacity: isRunning ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isRunning) e.currentTarget.style.background = '#E0D8D0';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#F0EBE3';
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>

            <div
              style={{
                background: '#FFFFFF',
                border: '0.5px solid #E0D8D0',
                borderRadius: 16,
                padding: '1rem',
              }}
            >
              <textarea
                value={task}
                disabled={isRunning}
                onChange={(e) => setTask(e.target.value.slice(0, 2000))}
                placeholder="Describe a complex task, research question, or problem you want solved..."
                style={{
                  width: '100%',
                  minHeight: 120,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: 15,
                  color: '#1A1714',
                  background: 'transparent',
                  lineHeight: 1.7,
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#C4B8AE' }}>
                  {task.length}/2000
                </span>
                <button
                  type="button"
                  disabled={task.trim().length < 10 || isRunning}
                  onClick={() => void handleRunTask()}
                  style={{
                    background: '#1A1714',
                    color: '#FAF7F4',
                    borderRadius: 999,
                    padding: '9px 24px',
                    fontSize: 13,
                    fontWeight: 500,
                    border: 'none',
                    cursor: task.trim().length < 10 || isRunning ? 'default' : 'pointer',
                    opacity: task.trim().length < 10 || isRunning ? 0.4 : 1,
                  }}
                >
                  Run
                </button>
              </div>
            </div>

            {error && (
              <p style={{ color: '#E57373', fontSize: 13, marginTop: '1rem' }}>{error}</p>
            )}

            {isRunning && (
              <div style={{ margin: '1.5rem 0' }}>
                <p style={{ fontSize: 12, color: '#6B6460', marginBottom: 12 }}>Pipeline progress</p>
                <StageDotsRow
                  stages={STAGES}
                  stageVisual={stageVisual}
                  expandedId={expandedId}
                  onToggle={toggleStage}
                  isRunning={isRunning}
                  expandedPayload={expandedPayload}
                />
              </div>
            )}

            {result && (result.final_answer || result.stages) && !isRunning && (
              <>
                <div
                  style={{
                    background: '#FFFFFF',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: 20,
                    padding: '2rem',
                    marginTop: '1.5rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '1.5rem',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        color: '#6B6460',
                      }}
                    >
                      Agent Response
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background:
                            score >= 80
                              ? 'rgba(138,168,153,0.15)'
                              : score >= 60
                                ? 'rgba(196,149,106,0.12)'
                                : 'rgba(229,115,115,0.1)',
                          color: score >= 80 ? '#5A8A5A' : score >= 60 ? '#C4956A' : '#E57373',
                          borderRadius: 999,
                          padding: '4px 12px',
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {score}/100
                      </span>
                      <span
                        style={{
                          background:
                            confidence >= 80
                              ? 'rgba(138,168,153,0.15)'
                              : confidence >= 50
                                ? 'rgba(196,149,106,0.12)'
                                : 'rgba(229,115,115,0.1)',
                          color:
                            confidence >= 80 ? '#5A8A5A' : confidence >= 50 ? '#C4956A' : '#E57373',
                          borderRadius: 999,
                          padding: '4px 12px',
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {Math.round(confidence)}% confident
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.8, color: '#1A1714', whiteSpace: 'pre-wrap' }}>
                    {result.final_answer || 'No final answer returned.'}
                  </div>
                  {result.flags && result.flags.length > 0 && (
                    <div
                      style={{
                        marginTop: '1.5rem',
                        padding: '12px 16px',
                        background: 'rgba(196,149,106,0.06)',
                        borderRadius: 10,
                        borderLeft: '2px solid #C4956A',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          color: '#C4956A',
                          marginBottom: 4,
                        }}
                      >
                        Note
                      </div>
                      {result.flags.map((f) => (
                        <p key={f} style={{ fontSize: 12, color: '#6B6460', margin: '4px 0 0' }}>
                          {f}
                        </p>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(result.final_answer || '');
                      }}
                      style={{
                        background: 'transparent',
                        border: '0.5px solid #E0D8D0',
                        borderRadius: 999,
                        padding: '8px 18px',
                        fontSize: 13,
                        color: '#6B6460',
                        cursor: 'pointer',
                      }}
                    >
                      Copy answer
                    </button>
                    <button
                      type="button"
                      onClick={resetRun}
                      style={{
                        background: 'transparent',
                        border: '0.5px solid #E0D8D0',
                        borderRadius: 999,
                        padding: '8px 18px',
                        fontSize: 13,
                        color: '#6B6460',
                        cursor: 'pointer',
                      }}
                    >
                      Run again
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigate('/app', {
                          state: {
                            agentStressPrompt: `Stress-test this agent response in Arena:\n\n${result.final_answer || ''}`,
                          },
                        })
                      }
                      style={{
                        background: '#F0EBE3',
                        border: '0.5px solid rgba(196,149,106,0.3)',
                        borderRadius: 999,
                        padding: '8px 18px',
                        fontSize: 13,
                        color: '#C4956A',
                        cursor: 'pointer',
                      }}
                    >
                      Stress test in Arena →
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPipelineOpen((o) => !o)}
                  style={{
                    marginTop: '1rem',
                    background: 'none',
                    border: 'none',
                    color: '#C4956A',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {pipelineOpen ? 'Hide full pipeline ↑' : 'See full pipeline →'}
                </button>
                {pipelineOpen && result.stages && (
                  <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {STAGES.map((s) => {
                      const st = result.stages?.[s.id] as StagePayload | undefined;
                      return (
                        <div
                          key={s.id}
                          style={{
                            background: '#FFFFFF',
                            border: '0.5px solid #E0D8D0',
                            borderRadius: 12,
                            padding: '1.25rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: '#1A1714' }}>{s.label}</span>
                            {st?.model && (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: '#F0EBE3',
                                  color: '#6B6460',
                                  borderRadius: 999,
                                  padding: '2px 8px',
                                }}
                              >
                                {st.model}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: '#B0A9A2', marginLeft: 'auto' }}>{st?.status}</span>
                          </div>
                          <pre
                            style={{
                              fontSize: 13,
                              color: '#1A1714',
                              lineHeight: 1.7,
                              whiteSpace: 'pre-wrap',
                              margin: 0,
                              fontFamily: 'inherit',
                            }}
                          >
                            {st?.output || '—'}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StageDotsRow({
  stages,
  stageVisual,
  expandedId,
  onToggle,
  isRunning,
  expandedPayload,
}: {
  stages: typeof STAGES;
  stageVisual: { id: StageId; state: string }[];
  expandedId: StageId | null;
  onToggle: (id: StageId) => void;
  isRunning: boolean;
  expandedPayload: StagePayload | null;
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {stages.map((s, idx) => {
          const vis = stageVisual[idx]?.state || 'pending';
          const isLast = idx === stages.length - 1;
          const lineDone = vis === 'complete' || vis === 'skipped';

          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: isLast ? '0 0 auto' : 1, minWidth: 0 }}>
              <div style={{ position: 'relative', flex: '0 0 auto' }}>
                <button
                  type="button"
                  onClick={() => onToggle(s.id)}
                  title={s.description}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: 'pointer',
                    padding: 0,
                    background:
                      vis === 'running'
                        ? '#FAF7F4'
                        : vis === 'complete'
                          ? '#C4956A'
                          : vis === 'failed'
                            ? '#FEF2F2'
                            : vis === 'skipped'
                              ? '#F0EBE3'
                              : '#F0EBE3',
                    border:
                      vis === 'running'
                        ? '1.5px solid #C4956A'
                        : vis === 'complete'
                          ? '1.5px solid #C4956A'
                          : vis === 'failed'
                            ? '1.5px solid #E57373'
                            : vis === 'skipped'
                              ? '1.5px dashed #E0D8D0'
                              : '1.5px solid #E0D8D0',
                    opacity: vis === 'skipped' ? 0.5 : 1,
                    animation: vis === 'running' ? 'breatheDot 1s ease-in-out infinite' : undefined,
                  }}
                >
                  {vis === 'running' && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#C4956A',
                        display: 'block',
                      }}
                    />
                  )}
                  {vis === 'complete' && (
                    <span style={{ color: '#FAF7F4', fontSize: 12 }}>✓</span>
                  )}
                  {vis === 'skipped' && <span style={{ color: '#C4B8AE', fontSize: 14 }}>–</span>}
                  {vis === 'failed' && <span style={{ color: '#E57373', fontSize: 14 }}>×</span>}
                  {vis === 'pending' && isRunning && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#E0D8D0',
                        display: 'block',
                      }}
                    />
                  )}
                  {vis === 'pending' && !isRunning && <span style={{ color: '#C4B8AE', fontSize: 10 }}>·</span>}
                </button>
                <span
                  style={{
                    position: 'absolute',
                    top: 36,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: 9,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: vis === 'running' ? '#C4956A' : '#B0A9A2',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.label}
                </span>
              </div>
              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: 1.5,
                    minWidth: 4,
                    background: lineDone ? '#C4956A' : '#E0D8D0',
                    transition: 'background 300ms ease',
                    alignSelf: 'center',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ height: 48 }} />

      {expandedId && (
        <div
          style={{
            background: '#FFFFFF',
            border: '0.5px solid #E0D8D0',
            borderRadius: 12,
            padding: '1.25rem',
            marginTop: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#1A1714' }}>
              {stages.find((x) => x.id === expandedId)?.label}
            </span>
            {expandedPayload?.model && (
              <span
                style={{
                  fontSize: 10,
                  background: '#F0EBE3',
                  color: '#6B6460',
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                {expandedPayload.model}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#1A1714', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {isRunning ? '…' : expandedPayload?.output || '—'}
          </div>
        </div>
      )}
    </>
  );
}
