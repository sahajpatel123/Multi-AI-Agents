import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Loader2, Lock, Zap } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  challengeAgentAnswer,
  getAgentRebuttal,
  getAgentResult,
  getAgentSavedTask,
  getAgentStatus,
  getMemoryContext,
  refineAgentAnswer,
  runAgentTask,
  type AgentChallengeItem,
} from '../api';
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

const STAGE_ORDER: StageId[] = [
  'planner',
  'researcher',
  'solver',
  'critic',
  'verifier',
  'synthesizer',
  'judge',
];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StagePayload = {
  status?: string;
  output?: string;
  model?: string;
  duration_ms?: number;
};

type ConversationEntry = {
  role: string;
  content: string;
  timestamp?: string;
  refinement_type?: string | null;
};

type AgentResult = {
  task_id?: string;
  task?: string;
  original_task?: string;
  status?: string;
  current_stage?: string;
  iterations?: number;
  stages?: Record<string, StagePayload>;
  final_answer?: string;
  final_confidence?: number;
  final_score?: number;
  flags?: string[];
  error?: string;
  source_integrity?: SourceIntegrityPayload;
  contradictions?: ContradictionItem[];
  memory_saved?: boolean;
  conversation?: ConversationEntry[];
  is_refinement?: boolean;
  refinement_count?: number;
  parent_task_id?: string;
  bridge_from_arena?: boolean;
};

type ContradictionItem = {
  summary?: string;
  severity?: string;
  old_task_id?: string;
};

type SourceIntegrityPayload = {
  source_count?: number;
  overall_source_integrity?: number;
  integrity_label?: string;
  summary?: string;
  contradictions?: Array<{
    topic?: string;
    position_a?: string;
    position_b?: string;
    severity?: string;
  }>;
};

type MemoryContextPayload = {
  task_count?: number;
  top_topics?: string[];
  unresolved_contradictions?: Array<{ summary?: string; severity?: string }>;
};

type ParsedSentence = {
  text: string;
  confidence?: number;
  type?: string;
};

type ParsedSynthesis = {
  sentences: ParsedSentence[];
  overall_confidence?: number;
  flags?: string[];
  sources_referenced?: string[];
};

const TRACE_STAGE_META: Record<
  StageId,
  { label: string; letter: string; bg: string; color: string }
> = {
  planner: { label: 'Planner', letter: 'P', bg: '#EEF0F2', color: '#8C9BAB' },
  researcher: { label: 'Researcher', letter: 'R', bg: '#F0EBE3', color: '#B0977E' },
  solver: { label: 'Solver', letter: 'S', bg: '#F0EDF2', color: '#9B8FAA' },
  critic: { label: 'Critic', letter: 'C', bg: '#FEF2F2', color: '#E57373' },
  verifier: { label: 'Verifier', letter: 'V', bg: '#EDF2EF', color: '#8AA899' },
  synthesizer: { label: 'Synthesizer', letter: 'Sy', bg: '#F5F0EC', color: '#C4956A' },
  judge: { label: 'Judge', letter: 'J', bg: '#EFEFED', color: '#6B6460' },
};

function formatDurationMs(ms: number | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function buildRevisionSummary(result: AgentResult): string {
  const cOut = result.stages?.critic?.output || '';
  const vOut = result.stages?.verifier?.output || '';
  const criticWeak = (cOut.match(/\bweakness(es)?\b/gi) || []).length;
  const criticGaps = (cOut.match(/\bgaps?\b|\bflaws?\b/gi) || []).length;
  const criticHits = Math.min(12, criticWeak + criticGaps) || (cOut.length > 200 ? 1 : 0);
  const verUnc = (vOut.match(/\buncertain\b|\bunverifiable\b/gi) || []).length;
  const verFlag = (vOut.match(/\bflag(s|ged)?\b|\below\s*50\b/gi) || []).length;
  const verHits = Math.min(12, verUnc + verFlag) || (vOut.length > 200 ? 1 : 0);
  const parts: string[] = [];
  if (criticHits > 0) {
    parts.push(`The Critic identified ${criticHits} potential weaknesses or gaps.`);
  }
  if (verHits > 0) {
    parts.push(`The Verifier flagged ${verHits} uncertain or low-confidence items.`);
  }
  if (parts.length === 0) {
    return 'Each stage refined the draft: planning, evidence, solution, critique, verification, and synthesis.';
  }
  parts.push('The Synthesizer resolved these into the final answer.');
  return parts.join(' ');
}

function plainTextFromFinalAnswer(finalAnswer: string | undefined, parsed: ParsedSynthesis | null): string {
  if (!finalAnswer) return '';
  if (parsed?.sentences?.length) {
    return parsed.sentences.map((s) => s.text).join(' ');
  }
  return finalAnswer;
}

const CHALLENGER_CARD_STYLES: Record<string, { accent: string; dot: string }> = {
  'The Analyst': { accent: '#8C9BAB', dot: '#8C9BAB' },
  'The Contrarian': { accent: '#B0977E', dot: '#B0977E' },
  'The Philosopher': { accent: '#9B8FAA', dot: '#9B8FAA' },
};

const EXAMPLES = [
  'Research the top 5 AI startups funded this month',
  'Write a go-to-market strategy for a SaaS product',
  'Analyse the pros and cons of moving from SQL to NoSQL',
];

export function AgentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: authLoading, logout } = useAuth();
  const { canUseFeature, isPro } = useTier();
  const canAgent = canUseFeature('agent_mode');

  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<StageId>>(new Set());
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceOutputExpanded, setTraceOutputExpanded] = useState<Set<StageId>>(new Set());
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('planner');
  const [liveStages, setLiveStages] = useState<Partial<Record<StageId, string>>>({});
  const [challenges, setChallenges] = useState<AgentChallengeItem[]>([]);
  const [isChallengingAnswer, setIsChallengingAnswer] = useState(false);
  const [challengesVisible, setChallengesVisible] = useState(false);
  const [challengeSectionError, setChallengeSectionError] = useState<string | null>(null);
  const [rebuttals, setRebuttals] = useState<Record<string, string>>({});
  const [rebuttalLoadingFor, setRebuttalLoadingFor] = useState<string | null>(null);
  const [memoryContext, setMemoryContext] = useState<MemoryContextPayload | null>(null);
  const [refinementInput, setRefinementInput] = useState('');
  const [refinementError, setRefinementError] = useState<string | null>(null);
  const [bridgeMeta, setBridgeMeta] = useState<{ taskId: string; originalQuestion: string } | null>(null);
  const [refineFocus, setRefineFocus] = useState(false);
  const answerAnchorRef = useRef<HTMLDivElement>(null);

  const urlTaskId = searchParams.get('task_id');

  useEffect(() => {
    if (!canAgent || authLoading) return;
    (async () => {
      try {
        const ctx = (await getMemoryContext('')) as MemoryContextPayload;
        setMemoryContext(ctx);
      } catch {
        setMemoryContext(null);
      }
    })();
  }, [canAgent, authLoading]);

  useEffect(() => {
    if (!urlTaskId || !canAgent || authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const data = (await getAgentResult(urlTaskId)) as AgentResult;
        if (!cancelled) {
          setResult({ ...data, task_id: data.task_id || urlTaskId });
          if (data.task) setTask(data.task);
          setError(null);
        }
      } catch {
        try {
          const saved = (await getAgentSavedTask(urlTaskId)) as AgentResult & { task?: string };
          if (!cancelled) {
            setResult(saved);
            if (saved.task) setTask(saved.task);
            setError(null);
          }
        } catch {
          if (!cancelled) setError('Could not load this task.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlTaskId, canAgent, authLoading]);

  useEffect(() => {
    const st = location.state as {
      bridgeTaskId?: string;
      bridgeMode?: boolean;
      originalQuestion?: string;
    } | null;
    if (st?.bridgeTaskId && st.bridgeMode && canAgent && !authLoading) {
      setBridgeMeta({
        taskId: st.bridgeTaskId,
        originalQuestion: typeof st.originalQuestion === 'string' ? st.originalQuestion : '',
      });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, canAgent, authLoading]);

  const pollAgentTaskUntilDone = useCallback(async (taskId: string) => {
    const maxAttempts = 60;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      try {
        const statusData = await getAgentStatus(taskId);
        const stages = statusData.stages || {};

        const next: Partial<Record<StageId, string>> = {};
        for (const sid of STAGE_ORDER) {
          next[sid] = (stages[sid]?.status as string) || 'pending';
        }
        setLiveStages(next);

        let runningStage: string | null = null;
        for (const stage of STAGE_ORDER) {
          if (stages[stage]?.status === 'running') {
            runningStage = stage;
            break;
          }
        }
        const cur = runningStage || statusData.current_stage || 'planner';
        setCurrentStage(cur);

        setCompletedStages(STAGE_ORDER.filter((s) => stages[s]?.status === 'complete'));

        const st = String(statusData.status || '').toLowerCase();
        if (st === 'complete' || st === 'failed') {
          try {
            const resultData = (await getAgentResult(taskId)) as AgentResult;
            if (resultData) {
              setResult(resultData);
              setCompletedStages([...STAGE_ORDER]);
              setCurrentStage('done');
              if (resultData.stages) {
                const fromResult: Partial<Record<StageId, string>> = {};
                for (const sid of STAGE_ORDER) {
                  const ps = resultData.stages[sid]?.status;
                  if (ps) fromResult[sid] = ps as string;
                }
                setLiveStages(fromResult);
              }
            }
          } catch (resultErr) {
            setError(resultErr instanceof Error ? resultErr.message : 'Could not load agent result');
          }
          setIsRunning(false);
          setIsRefining(false);
          return;
        }
      } catch (pollErr) {
        if (pollErr instanceof ApiError && (pollErr.status === 401 || pollErr.status === 403)) {
          setError(pollErr.message || 'Authentication required');
          setIsRunning(false);
          setIsRefining(false);
          return;
        }
        await wait(5000);
        continue;
      }
      await wait(3000);
    }
    setError('Task timed out. Please try again.');
    setIsRunning(false);
    setIsRefining(false);
  }, []);

  useEffect(() => {
    if (!bridgeMeta?.taskId || !canAgent || authLoading) return;
    let cancelled = false;
    setError(null);
    setIsRunning(true);
    setIsRefining(false);
    (async () => {
      try {
        await pollAgentTaskUntilDone(bridgeMeta.taskId);
      } catch {
        if (!cancelled) setError('Verification failed to complete.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridgeMeta, canAgent, authLoading, pollAgentTaskUntilDone]);

  useEffect(() => {
    if (result?.bridge_from_arena && bridgeMeta) {
      setBridgeMeta(null);
    }
  }, [result?.bridge_from_arena, bridgeMeta]);

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
    setTraceOpen(false);
    setTraceOutputExpanded(new Set());
    setCompletedStages([]);
    setCurrentStage('planner');
    setLiveStages({});
    setChallenges([]);
    setChallengesVisible(false);
    setChallengeSectionError(null);
    setRebuttals({});
    setRebuttalLoadingFor(null);
    setIsRunning(true);
    setIsRefining(false);

    try {
      const startData = await runAgentTask(t);
      if (!startData.task_id) {
        throw new Error('No task ID received');
      }
      await pollAgentTaskUntilDone(startData.task_id);
      try {
        const ctx = (await getMemoryContext('')) as MemoryContextPayload;
        setMemoryContext(ctx);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent task failed');
      setIsRunning(false);
      setIsRefining(false);
    }
  };

  const handleRefine = async () => {
    const msg = refinementInput.trim();
    if (!msg || !result?.task_id || isRefining || isRunning) return;
    setRefinementInput('');
    setIsRunning(true);
    setIsRefining(true);
    setRefinementError(null);
    try {
      await refineAgentAnswer(result.task_id, msg);
      await pollAgentTaskUntilDone(result.task_id);
      try {
        const ctx = (await getMemoryContext('')) as MemoryContextPayload;
        setMemoryContext(ctx);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setRefinementError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Refinement failed.',
      );
    } finally {
      setIsRunning(false);
      setIsRefining(false);
    }
  };

  const resetRun = () => {
    setSearchParams({});
    setBridgeMeta(null);
    setResult(null);
    setError(null);
    setRefinementInput('');
    setRefinementError(null);
    setIsRefining(false);
    setExpandedStages(new Set());
    setTraceOpen(false);
    setTraceOutputExpanded(new Set());
    setCompletedStages([]);
    setCurrentStage('planner');
    setLiveStages({});
    setChallenges([]);
    setChallengesVisible(false);
    setChallengeSectionError(null);
    setRebuttals({});
    setRebuttalLoadingFor(null);
    setIsChallengingAnswer(false);
  };

  const stageVisual = useMemo(() => {
    if (!isRunning && result?.stages) {
      return STAGES.map((s) => ({
        id: s.id,
        state: (result.stages?.[s.id]?.status || 'pending') as string,
      }));
    }
    if (isRunning) {
      return STAGES.map((s) => {
        let st = liveStages[s.id] || 'pending';
        if (st === 'pending' && completedStages.includes(s.id)) {
          st = 'complete';
        }
        if (st === 'running') return { id: s.id, state: 'running' };
        if (st === 'complete') return { id: s.id, state: 'complete' };
        if (st === 'skipped') return { id: s.id, state: 'skipped' };
        if (st === 'failed') return { id: s.id, state: 'failed' };
        if (currentStage === s.id) return { id: s.id, state: 'running' };
        return { id: s.id, state: 'pending' };
      });
    }
    return STAGES.map((s) => ({ id: s.id, state: 'pending' }));
  }, [isRunning, result, liveStages, currentStage, completedStages]);

  const expandedId = expandedStages.size === 1 ? [...expandedStages][0] : null;

  const expandedPayload: StagePayload | null =
    expandedId && result?.stages ? (result.stages[expandedId] as StagePayload) : null;

  const score = result?.final_score ?? 0;

  const parsedAnswer = useMemo((): ParsedSynthesis | null => {
    if (!result?.final_answer) return null;
    try {
      const parsed = JSON.parse(result.final_answer) as ParsedSynthesis;
      if (parsed && Array.isArray(parsed.sentences)) return parsed;
      return null;
    } catch {
      return null;
    }
  }, [result]);

  const displayOverallConfidence = parsedAnswer?.overall_confidence ?? result?.final_confidence ?? 0;

  const plainAnswerText = useMemo(
    () => plainTextFromFinalAnswer(result?.final_answer, parsedAnswer),
    [result?.final_answer, parsedAnswer],
  );

  const handleChallengeAnswer = useCallback(async () => {
    if (!result) return;
    setChallengesVisible(true);
    setIsChallengingAnswer(true);
    setChallengeSectionError(null);
    try {
      const plainAnswer = plainAnswerText || result.final_answer || '';
      const data = await challengeAgentAnswer(
        result.task_id || '',
        plainAnswer,
        result.task || task,
      );
      setChallenges(data.challenges || []);
    } catch (err) {
      console.error('Challenge failed:', err);
      setChallengeSectionError(err instanceof Error ? err.message : 'Challenge failed');
      setChallenges([]);
    } finally {
      setIsChallengingAnswer(false);
    }
  }, [result, plainAnswerText, task]);

  const handleGetRebuttal = useCallback(
    async (challengeText: string, challengerKey: string) => {
      if (!result) return;
      setRebuttalLoadingFor(challengerKey);
      try {
        const plainAnswer = plainAnswerText || result.final_answer || '';
        const data = await getAgentRebuttal(result.task || task, plainAnswer, challengeText);
        setRebuttals((prev) => ({ ...prev, [challengerKey]: data.rebuttal }));
      } catch (err) {
        console.error('Rebuttal failed:', err);
        setRebuttals((prev) => ({
          ...prev,
          [challengerKey]: `Rebuttal failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }));
      } finally {
        setRebuttalLoadingFor(null);
      }
    },
    [result, plainAnswerText, task],
  );

  const mergedFlags = useMemo(() => {
    const fromParsed = parsedAnswer?.flags?.filter((f) => typeof f === 'string' && f.trim()) || [];
    const fromResult = result?.flags?.filter((f) => typeof f === 'string' && f.trim()) || [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of [...fromParsed, ...fromResult]) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
    return out;
  }, [parsedAnswer, result?.flags]);

  const sourceIntegrity = result?.source_integrity;

  const toggleTraceOutputExpand = useCallback((id: StageId) => {
    setTraceOutputExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
        .agent-trace-expand {
          max-height: 0;
          opacity: 0;
          overflow: hidden;
          transition: max-height 400ms ease, opacity 400ms ease;
        }
        .agent-trace-expand.agent-trace-expand-open {
          max-height: 12000px;
          opacity: 1;
        }
        @keyframes agentChallengeCardIn {
          from {
            opacity: 0;
            transform: translateX(-16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .agent-challenge-card-in {
          animation: agentChallengeCardIn 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        @keyframes agentChalDotPulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes agentSpin {
          to { transform: rotate(360deg); }
        }
        .agent-chal-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: agentChalDotPulse 1.2s ease-in-out infinite;
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
            {bridgeMeta && isRunning && (
              <div
                style={{
                  background: 'rgba(196,149,106,0.08)',
                  border: '0.5px solid rgba(196,149,106,0.25)',
                  borderRadius: 12,
                  padding: '10px 16px',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <span
                  className="breathe"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#C4956A',
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1714' }}>
                    Verifying Arena winner in Agent
                  </div>
                  {bridgeMeta.originalQuestion ? (
                    <div style={{ fontSize: 12, color: '#6B6460', marginTop: 4 }}>
                      Original question: {bridgeMeta.originalQuestion}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

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

            {canAgent &&
              !isRunning &&
              !result &&
              memoryContext &&
              (memoryContext.task_count ?? 0) > 0 && (
                <div
                  style={{
                    background: '#F5F2EF',
                    borderRadius: 12,
                    padding: '10px 14px',
                    marginBottom: 12,
                    fontSize: 12,
                    color: '#6B6460',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: '#B0A9A2',
                      marginBottom: 6,
                    }}
                  >
                    Based on your research history:
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(memoryContext.top_topics || []).map((topic) => (
                      <span
                        key={topic}
                        style={{
                          background: '#F0EBE3',
                          color: '#6B6460',
                          borderRadius: 999,
                          padding: '3px 10px',
                          fontSize: 11,
                        }}
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                  {(memoryContext.unresolved_contradictions?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/agent/history')}
                      style={{
                        marginTop: 8,
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: '#C4956A',
                        fontSize: 11,
                        textAlign: 'left',
                      }}
                    >
                      You have {memoryContext.unresolved_contradictions?.length} unresolved contradiction
                      {(memoryContext.unresolved_contradictions?.length ?? 0) === 1 ? '' : 's'} in your
                      history
                    </button>
                  )}
                </div>
              )}

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
                <p style={{ fontSize: 12, color: '#6B6460', marginBottom: 12 }}>
                  {bridgeMeta
                    ? 'Verifying Arena answer...'
                    : isRefining
                      ? 'Refining your answer...'
                      : 'Pipeline progress'}
                </p>
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

            {result && (result.final_answer || result.stages) && (!isRunning || isRefining) && (
              <>
                {(result.original_task || result.task) && (
                  <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                    <div
                      style={{
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: '#B0A9A2',
                        marginBottom: 6,
                      }}
                    >
                      Your task
                    </div>
                    <p style={{ fontSize: 14, color: '#1A1714', lineHeight: 1.6, margin: 0 }}>
                      {result.original_task || result.task}
                    </p>
                  </div>
                )}

                {(result.refinement_count ?? 0) > 0 && (
                  <p
                    style={{
                      fontSize: 11,
                      color: '#B0A9A2',
                      textAlign: 'center',
                      marginBottom: 10,
                      marginTop: 0,
                    }}
                  >
                    Refined {result.refinement_count} time{result.refinement_count === 1 ? '' : 's'}
                  </p>
                )}

                {result.conversation && result.conversation.length >= 2 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    {result.conversation.map((msg, idx) => {
                      const isUser = msg.role === 'user';
                      const text = msg.content || '';
                      const short = text.length > 200 ? `${text.slice(0, 200)}…` : text;
                      return (
                        <div
                          key={`${msg.timestamp || idx}-${idx}`}
                          style={{
                            display: 'flex',
                            justifyContent: isUser ? 'flex-end' : 'flex-start',
                            marginBottom: 10,
                            alignItems: 'flex-start',
                            gap: 10,
                          }}
                        >
                          {!isUser && (
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#C4956A',
                                marginTop: 8,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <div style={{ maxWidth: isUser ? '80%' : '88%' }}>
                            <div
                              style={{
                                background: isUser ? '#F0EBE3' : '#FFFFFF',
                                border: isUser ? 'none' : '0.5px solid #E0D8D0',
                                borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                padding: '10px 14px',
                                fontSize: 13,
                                color: '#1A1714',
                                lineHeight: 1.6,
                              }}
                            >
                              {short}
                              {!isUser && text.length > 200 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    answerAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
                                  }
                                  style={{
                                    display: 'block',
                                    marginTop: 6,
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    color: '#C4956A',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                  }}
                                >
                                  See full answer below
                                </button>
                              ) : null}
                            </div>
                            {!isUser && msg.refinement_type ? (
                              <div style={{ fontSize: 10, color: '#B0A9A2', marginTop: 3 }}>
                                {msg.refinement_type}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  ref={answerAnchorRef}
                  id="agent-current-answer"
                  style={{
                    background: '#FFFFFF',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: 20,
                    padding: '2rem',
                    marginTop: '1.5rem',
                  }}
                >
                  {result.bridge_from_arena && !isRunning && (
                    <div
                      style={{
                        background: 'rgba(196,149,106,0.06)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        marginBottom: '1rem',
                        fontSize: 12,
                        color: '#6B6460',
                      }}
                    >
                      This is Agent&apos;s verification of the Arena winner. Confidence and accuracy scores reflect
                      rigorous fact-checking of that answer.
                    </div>
                  )}
                  {result.contradictions && result.contradictions.length > 0 && (
                      <div
                        style={{
                          background: 'rgba(196,149,106,0.08)',
                          border: '0.5px solid rgba(196,149,106,0.3)',
                          borderRadius: 12,
                          padding: '10px 14px',
                          marginBottom: '1rem',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                        }}
                      >
                        <span style={{ color: '#C4956A', fontSize: 16, lineHeight: 1.2 }}>↺</span>
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              color: '#1A1714',
                              fontWeight: 500,
                            }}
                          >
                            This answer may contradict a past conclusion
                          </div>
                          <div style={{ fontSize: 12, color: '#6B6460', marginTop: 2 }}>
                            {result.contradictions
                              .map((c) => c.summary)
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                      </div>
                    )}
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
                            displayOverallConfidence >= 80
                              ? 'rgba(138,168,153,0.15)'
                              : displayOverallConfidence >= 50
                                ? 'rgba(196,149,106,0.12)'
                                : 'rgba(229,115,115,0.1)',
                          color:
                            displayOverallConfidence >= 80
                              ? '#5A8A5A'
                              : displayOverallConfidence >= 50
                                ? '#C4956A'
                                : '#E57373',
                          borderRadius: 999,
                          padding: '4px 12px',
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {Math.round(displayOverallConfidence)}% confident
                      </span>
                    </div>
                  </div>
                  {parsedAnswer ? (
                    <div style={{ fontSize: 15, lineHeight: 2.0, color: '#1A1714' }}>
                      {parsedAnswer.sentences.map((sent, idx) => {
                        const cRaw = sent.confidence;
                        const c =
                          typeof cRaw === 'number' && !Number.isNaN(cRaw)
                            ? cRaw
                            : typeof cRaw === 'string'
                              ? Number.parseFloat(cRaw) || 70
                              : 70;
                        const muted = c < 50;
                        let dot: ReactNode = null;
                        if (c >= 90) {
                          dot = null;
                        } else if (c >= 70) {
                          dot = (
                            <span
                              title={`${c}% confident`}
                              style={{
                                display: 'inline-block',
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                marginLeft: 4,
                                marginBottom: 2,
                                verticalAlign: 'middle',
                                background: 'rgba(138,168,153,0.8)',
                                cursor: 'help',
                              }}
                            />
                          );
                        } else if (c >= 50) {
                          dot = (
                            <span
                              title={`${c}% confident`}
                              style={{
                                display: 'inline-block',
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                marginLeft: 4,
                                marginBottom: 2,
                                verticalAlign: 'middle',
                                background: 'rgba(196,149,106,0.8)',
                                cursor: 'help',
                              }}
                            />
                          );
                        } else {
                          dot = (
                            <span
                              title={`${c}% confident — uncertain`}
                              style={{
                                display: 'inline-block',
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                marginLeft: 4,
                                marginBottom: 2,
                                verticalAlign: 'middle',
                                background: 'rgba(229,115,115,0.7)',
                                cursor: 'help',
                              }}
                            />
                          );
                        }
                        return (
                          <span key={`${idx}-${sent.text.slice(0, 24)}`}>
                            <span style={{ color: muted ? '#6B6460' : '#1A1714' }}>{sent.text}</span>
                            {dot}
                            {idx < parsedAnswer.sentences.length - 1 ? ' ' : null}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 15, lineHeight: 1.8, color: '#1A1714', whiteSpace: 'pre-wrap' }}>
                      {result.final_answer || 'No final answer returned.'}
                    </div>
                  )}
                  {parsedAnswer && (
                    <div style={{ marginTop: '1rem' }}>
                      <div
                        style={{
                          fontSize: 10,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: '#B0A9A2',
                          marginBottom: 6,
                        }}
                      >
                        Confidence indicators
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#8AA899',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 11, color: '#6B6460' }}>Verified (90%+)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#C4956A',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 11, color: '#6B6460' }}>Supported (70–89%)</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#E57373',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 11, color: '#6B6460' }}>Uncertain (&lt;70%)</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {parsedAnswer?.sources_referenced && parsedAnswer.sources_referenced.length > 0 && (
                    <div style={{ marginTop: '1.25rem' }}>
                      <div
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          color: '#B0A9A2',
                          marginBottom: 8,
                        }}
                      >
                        Sources & context used
                      </div>
                      {parsedAnswer.sources_referenced.map((src, i) => (
                        <div
                          key={`${i}-${src.slice(0, 40)}`}
                          style={{
                            fontSize: 12,
                            color: '#6B6460',
                            padding: '4px 0',
                            borderBottom: '0.5px solid #F0EBE3',
                          }}
                        >
                          {src}
                        </div>
                      ))}
                    </div>
                  )}
                  {mergedFlags.length > 0 && (
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
                      {mergedFlags.map((f) => (
                        <p key={f} style={{ fontSize: 12, color: '#6B6460', margin: '4px 0 0' }}>
                          {f}
                        </p>
                      ))}
                    </div>
                  )}
                  {sourceIntegrity &&
                    (sourceIntegrity.source_count ?? 0) > 0 &&
                    (() => {
                      const label = (sourceIntegrity.integrity_label || 'moderate').toLowerCase();
                      const badge =
                        label === 'high'
                          ? {
                              bg: 'rgba(138,168,153,0.15)',
                              color: '#5A8A5A',
                              text: 'High',
                              bar: '#8AA899',
                            }
                          : label === 'low'
                            ? {
                                bg: 'rgba(229,115,115,0.1)',
                                color: '#E57373',
                                text: 'Low',
                                bar: '#E57373',
                              }
                            : label === 'contested'
                              ? {
                                  bg: 'rgba(229,115,115,0.1)',
                                  color: '#E57373',
                                  text: 'Contested',
                                  bar: '#E57373',
                                }
                              : {
                                  bg: 'rgba(196,149,106,0.12)',
                                  color: '#C4956A',
                                  text: 'Moderate',
                                  bar: '#C4956A',
                                };
                      const pct = Math.min(
                        100,
                        Math.max(0, Number(sourceIntegrity.overall_source_integrity) || 0),
                      );
                      const iconContra = sourceIntegrity.contradictions || [];
                      return (
                        <div
                          style={{
                            background: '#FFFFFF',
                            border: '0.5px solid #E0D8D0',
                            borderRadius: 14,
                            padding: '1rem 1.25rem',
                            marginTop: '1.25rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                              marginBottom: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: '0.14em',
                                color: '#B0A9A2',
                              }}
                            >
                              Source integrity
                            </span>
                            <span
                              style={{
                                background: badge.bg,
                                color: badge.color,
                                borderRadius: 999,
                                padding: '3px 10px',
                                fontSize: 11,
                                fontWeight: 500,
                              }}
                            >
                              {badge.text}
                            </span>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: 4,
                              background: '#F0EBE3',
                              borderRadius: 999,
                              margin: '8px 0',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: badge.bar,
                                borderRadius: 999,
                                transition: 'width 600ms ease',
                              }}
                            />
                          </div>
                          {sourceIntegrity.summary ? (
                            <p style={{ fontSize: 12, color: '#6B6460', marginTop: 6, marginBottom: 0 }}>
                              {sourceIntegrity.summary}
                            </p>
                          ) : null}
                          {iconContra.length > 0 ? (
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 10,
                                borderTop: '0.5px solid #F0EBE3',
                              }}
                            >
                              {iconContra.map((c, idx) => (
                                <div
                                  key={`${c.topic}-${idx}`}
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    marginBottom: 6,
                                    fontSize: 12,
                                    color: '#6B6460',
                                  }}
                                >
                                  <span style={{ color: '#C4956A', flexShrink: 0 }}>⚠</span>
                                  <span>
                                    {c.topic || 'Source conflict'}
                                    {c.position_a || c.position_b
                                      ? ` — ${c.position_a || ''} vs ${c.position_b || ''}`
                                      : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(plainAnswerText);
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
                            agentStressPrompt: plainAnswerText,
                            fromAgent: true,
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

                <div style={{ marginTop: '2rem' }}>
                  <button
                    type="button"
                    onClick={() => setTraceOpen((o) => !o)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: '#B0A9A2',
                      }}
                    >
                      How this answer was built
                    </span>
                    <span style={{ fontSize: 11, color: '#C4956A' }}>
                      {traceOpen ? 'Hide trace ↑' : 'See trace ↓'}
                    </span>
                  </button>
                  <div
                    className={`agent-trace-expand${traceOpen ? ' agent-trace-expand-open' : ''}`}
                    style={{ marginTop: traceOpen ? 16 : 0 }}
                  >
                    {result.stages && (
                      <div style={{ paddingTop: 4 }}>
                        <p
                          style={{
                            fontSize: 13,
                            color: '#6B6460',
                            lineHeight: 1.6,
                            marginTop: 0,
                            marginBottom: 16,
                          }}
                        >
                          {buildRevisionSummary(result)}
                        </p>
                        {(result.iterations ?? 0) > 1 && (
                          <div
                            style={{
                              fontSize: 11,
                              color: '#C4956A',
                              textAlign: 'center',
                              padding: '8px 0',
                              borderTop: '0.5px dashed #E0D8D0',
                              borderBottom: '0.5px dashed #E0D8D0',
                              margin: '8px 0',
                            }}
                          >
                            ↻ Revision triggered — answer improved
                          </div>
                        )}
                        {STAGE_ORDER.filter((id) => result.stages?.[id]?.status !== 'skipped').map((id, traceIdx, arr) => {
                          const st = result.stages?.[id] as StagePayload | undefined;
                          if (!st) return null;
                          const meta = TRACE_STAGE_META[id];
                          const out = st.output || '';
                          const isLong = out.length > 480 || out.split('\n').length > 8;
                          const expanded = traceOutputExpanded.has(id);
                          return (
                            <div
                              key={id}
                              style={{
                                display: 'flex',
                                gap: 16,
                                marginBottom: '1rem',
                                position: 'relative',
                              }}
                            >
                              <div
                                style={{
                                  width: 32,
                                  flexShrink: 0,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                }}
                              >
                                <div
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 11,
                                    fontWeight: 500,
                                    background: meta.bg,
                                    color: meta.color,
                                  }}
                                >
                                  {meta.letter}
                                </div>
                                {traceIdx < arr.length - 1 ? (
                                  <div
                                    style={{
                                      width: 1,
                                      minHeight: 36,
                                      background: '#E0D8D0',
                                      marginTop: 4,
                                    }}
                                  />
                                ) : null}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 6,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span style={{ fontSize: 12, fontWeight: 500, color: '#1A1714' }}>
                                    {meta.label}
                                  </span>
                                  {st.model ? (
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
                                  ) : null}
                                  <span style={{ fontSize: 10, color: '#B0A9A2' }}>
                                    {formatDurationMs(st.duration_ms)}
                                  </span>
                                </div>
                                <div style={{ position: 'relative' }}>
                                  <pre
                                    style={{
                                      fontSize: 13,
                                      color: '#6B6460',
                                      lineHeight: 1.7,
                                      maxHeight: expanded || !isLong ? 'none' : 120,
                                      overflow: expanded || !isLong ? 'visible' : 'hidden',
                                      margin: 0,
                                      fontFamily: 'inherit',
                                      whiteSpace: 'pre-wrap',
                                    }}
                                  >
                                    {out || '—'}
                                  </pre>
                                  {isLong ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleTraceOutputExpand(id)}
                                      style={{
                                        marginTop: 6,
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        color: '#C4956A',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {expanded ? 'Show less' : 'Show more'}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {result?.task_id &&
                  (result.refinement_count ?? 0) < 10 &&
                  (result.final_answer || result.stages) &&
                  (!isRunning || isRefining) && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <div
                        style={{
                          margin: '1.5rem 0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
                        <span
                          style={{
                            fontSize: 11,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: '#B0A9A2',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Continue the research
                        </span>
                        <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
                      </div>

                      {!isRefining ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              marginBottom: 12,
                            }}
                          >
                            {[
                              'Go deeper on this',
                              'Challenge the main assumption',
                              'Summarise in 3 points',
                              "What's the opposing view?",
                            ].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setRefinementInput(s)}
                                style={{
                                  background: '#F5F2EF',
                                  border: '0.5px solid #E0D8D0',
                                  borderRadius: 999,
                                  padding: '6px 14px',
                                  fontSize: 12,
                                  color: '#6B6460',
                                  cursor: 'pointer',
                                  transition: 'background 150ms ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#F0EBE3';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#F5F2EF';
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>

                          <div
                            style={{
                              background: '#FFFFFF',
                              border: refineFocus ? '0.5px solid #C4956A' : '0.5px solid #E0D8D0',
                              borderRadius: 14,
                              padding: '12px 14px',
                              display: 'flex',
                              gap: 10,
                              alignItems: 'flex-end',
                              transition: 'border-color 200ms ease',
                            }}
                          >
                            <textarea
                              value={refinementInput}
                              onChange={(e) => setRefinementInput(e.target.value.slice(0, 1000))}
                              onFocus={() => setRefineFocus(true)}
                              onBlur={() => setRefineFocus(false)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  void handleRefine();
                                }
                              }}
                              placeholder="Ask a follow-up, request more depth, challenge an assumption..."
                              disabled={isRefining}
                              style={{
                                flex: 1,
                                border: 'none',
                                outline: 'none',
                                resize: 'none',
                                fontSize: 14,
                                color: '#1A1714',
                                background: 'transparent',
                                minHeight: 44,
                                maxHeight: 120,
                                fontFamily: 'inherit',
                              }}
                            />
                            <button
                              type="button"
                              disabled={!refinementInput.trim() || isRefining}
                              onClick={() => void handleRefine()}
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: refinementInput.trim() ? '#1A1714' : '#F0EBE3',
                                border: 'none',
                                cursor: refinementInput.trim() ? 'pointer' : 'default',
                                transition: 'all 150ms ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: refinementInput.trim() ? '#FAF7F4' : '#C4B8AE',
                                fontSize: 16,
                                flexShrink: 0,
                              }}
                            >
                              {isRefining ? (
                                <span style={{ display: 'inline-flex', animation: 'agentSpin 0.9s linear infinite' }}>
                                  <Loader2 style={{ width: 18, height: 18 }} />
                                </span>
                              ) : (
                                '→'
                              )}
                            </button>
                          </div>
                        </>
                      ) : (
                        <p style={{ fontSize: 12, color: '#6B6460', marginBottom: 0 }}>
                          Refining your answer...
                        </p>
                      )}
                      {refinementError ? (
                        <p style={{ color: '#E57373', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                          {refinementError}
                        </p>
                      ) : null}
                    </div>
                  )}

                {(result?.refinement_count ?? 0) >= 10 && (result?.final_answer || result?.stages) && !isRunning && (
                  <p style={{ fontSize: 12, color: '#6B6460', textAlign: 'center', marginTop: '1.5rem' }}>
                    Maximum refinements reached. Start a new task to continue.
                  </p>
                )}

                <div
                  aria-expanded={challengesVisible || challenges.length > 0 || isChallengingAnswer}
                  style={{
                    marginTop: '2rem',
                    paddingTop: '1.5rem',
                    borderTop: '0.5px solid #F0EBE3',
                  }}
                >
                  {!isChallengingAnswer && challenges.length === 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleChallengeAnswer()}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'transparent',
                          border: '0.5px solid #E0D8D0',
                          borderRadius: 999,
                          padding: '9px 20px',
                          fontSize: 13,
                          color: '#6B6460',
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#C4956A';
                          e.currentTarget.style.color = '#C4956A';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#E0D8D0';
                          e.currentTarget.style.color = '#6B6460';
                        }}
                      >
                        <Zap style={{ width: 16, height: 16 }} />
                        Challenge this answer
                      </button>
                      <p style={{ fontSize: 11, color: '#B0A9A2', marginTop: 6, marginBottom: 0 }}>
                        3 opposing minds will attack this answer
                      </p>
                      {challengeSectionError ? (
                        <p style={{ color: '#E57373', fontSize: 13, marginTop: 10, marginBottom: 0 }}>
                          {challengeSectionError}
                        </p>
                      ) : null}
                    </>
                  ) : null}

                  {isChallengingAnswer ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#6B6460' }}>
                      <span className="agent-chal-dot" style={{ background: '#8C9BAB', animationDelay: '0ms' }} />
                      <span className="agent-chal-dot" style={{ background: '#9B8FAA', animationDelay: '0.15s' }} />
                      <span className="agent-chal-dot" style={{ background: '#B0977E', animationDelay: '0.3s' }} />
                      <span>Three minds are challenging this answer...</span>
                    </div>
                  ) : null}

                  {challenges.length > 0 && !isChallengingAnswer ? (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '1.5rem',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: '#B0A9A2',
                          }}
                        >
                          THE CHALLENGES
                        </span>
                        <span
                          style={{
                            background: 'rgba(229,115,115,0.08)',
                            color: '#E57373',
                            borderRadius: 999,
                            fontSize: 11,
                            padding: '3px 10px',
                          }}
                        >
                          3 objections
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {challenges.map((ch, idx) => {
                          const styles = CHALLENGER_CARD_STYLES[ch.challenger] || {
                            accent: '#C4956A',
                            dot: '#C4956A',
                          };
                          const rebuttalText = rebuttals[ch.challenger];
                          const showRefined =
                            rebuttalText && /##\s*Refined Answer/i.test(rebuttalText);
                          return (
                            <div
                              key={`${ch.challenger}-${idx}`}
                              className="agent-challenge-card-in"
                              style={{
                                animationDelay: `${idx * 100}ms`,
                                background: '#FFFFFF',
                                border: '0.5px solid #E0D8D0',
                                borderRadius: 16,
                                padding: '1.25rem 1.5rem',
                                position: 'relative',
                                paddingLeft: 'calc(1.5rem + 3px)',
                                transition: 'transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateX(3px)';
                                e.currentTarget.style.borderColor = styles.accent;
                                e.currentTarget.style.boxShadow = '0 2px 12px rgba(26,23,20,0.06)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateX(0)';
                                e.currentTarget.style.borderColor = '#E0D8D0';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            >
                              <div
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 12,
                                  bottom: 12,
                                  width: 3,
                                  borderRadius: '2px 0 0 2px',
                                  background: styles.accent,
                                }}
                              />
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 10,
                                }}
                              >
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: styles.dot,
                                    flexShrink: 0,
                                    animation: 'breathe 2.4s ease-in-out infinite',
                                  }}
                                />
                                <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1714' }}>
                                  {ch.challenger}
                                </span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: '#F0EBE3',
                                    color: '#6B6460',
                                    borderRadius: 999,
                                    padding: '2px 8px',
                                    marginLeft: 'auto',
                                  }}
                                >
                                  {ch.model}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, color: '#1A1714', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                {ch.challenge}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleGetRebuttal(ch.challenge, ch.challenger);
                                }}
                                style={{
                                  marginTop: 8,
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  fontSize: 12,
                                  color: '#C4956A',
                                  cursor: 'pointer',
                                  display: 'inline-block',
                                }}
                              >
                                Make Agent respond to this
                              </button>
                              {rebuttalLoadingFor === ch.challenger ? (
                                <div
                                  style={{
                                    marginTop: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: 13,
                                    color: '#6B6460',
                                  }}
                                >
                                  <span className="agent-chal-dot" style={{ background: '#C4956A' }} />
                                  <span className="agent-chal-dot" style={{ background: '#C4956A', animationDelay: '0.15s' }} />
                                  <span className="agent-chal-dot" style={{ background: '#C4956A', animationDelay: '0.3s' }} />
                                  Agent is responding...
                                </div>
                              ) : null}
                              {rebuttalText && rebuttalLoadingFor !== ch.challenger ? (
                                <div
                                  style={{
                                    marginTop: 12,
                                    padding: '14px 16px',
                                    background: 'rgba(196,149,106,0.05)',
                                    border: '0.5px solid rgba(196,149,106,0.2)',
                                    borderRadius: 12,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      marginBottom: 8,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: '#C4956A',
                                        flexShrink: 0,
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#C4956A',
                                      }}
                                    >
                                      Agent responds
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 13, color: '#1A1714', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                    {rebuttalText}
                                  </div>
                                  {showRefined ? (
                                    <div
                                      style={{
                                        marginTop: 8,
                                        background: 'rgba(138,168,153,0.1)',
                                        border: '0.5px solid rgba(138,168,153,0.3)',
                                        borderRadius: 8,
                                        padding: '8px 12px',
                                        fontSize: 12,
                                        color: '#5A8A5A',
                                      }}
                                    >
                                      ↑ Answer was refined based on this challenge
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
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
