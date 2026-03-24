import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2, Lock, PanelLeft, X, Zap } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  challengeAgentAnswer,
  getAgentHistory,
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

const STAGE_RUNNING_MESSAGES: Record<StageId, string> = {
  planner: 'Breaking down your task and deciding which stages to run...',
  researcher: 'Searching for relevant information and sources...',
  solver: 'Building the primary answer using all available context...',
  critic: 'Finding weaknesses, gaps, and flaws in the answer...',
  verifier: 'Cross-checking facts and assigning confidence scores to each claim...',
  synthesizer: 'Producing the final clean answer from all pipeline output...',
  judge: 'Scoring the answer and deciding if it passes the quality bar...',
};

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

type IntelligenceDimension = {
  score?: number;
  label?: string;
  reason?: string;
};

type IntelligenceScorePayload = {
  research_depth?: IntelligenceDimension;
  logical_soundness?: IntelligenceDimension;
  consensus_level?: IntelligenceDimension;
  answer_durability?: IntelligenceDimension;
  total_score?: number;
  score_label?: string;
  one_line_verdict?: string;
};

type AssumptionItem = {
  assumption?: string;
  category?: string;
  criticality?: string;
  if_wrong?: string;
  flag?: boolean;
};

type AssumptionsPayload = {
  assumptions?: AssumptionItem[];
  most_critical?: number;
  assumption_count?: number;
  summary?: string;
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
  intelligence_score?: IntelligenceScorePayload;
  assumptions?: AssumptionsPayload;
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

function formatShortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function totalScoreColor(score: number): string {
  if (score >= 80) return '#5A8A5A';
  if (score >= 60) return '#C4956A';
  return '#E57373';
}

function dimensionScoreColor(score: number): string {
  if (score >= 20) return '#8AA899';
  if (score >= 13) return '#C4956A';
  return '#E57373';
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
  const [expandedStage, setExpandedStage] = useState<StageId | null>(null);
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
  const [scoreTooltip, setScoreTooltip] = useState<string | null>(null);
  const [scoreCopied, setScoreCopied] = useState(false);
  const [showAllAssumptions, setShowAllAssumptions] = useState(false);
  const [taskHistory, setTaskHistory] = useState<HistoryTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const answerAnchorRef = useRef<HTMLDivElement>(null);

  const urlTaskId = searchParams.get('task_id');

  const loadTaskHistory = useCallback(async () => {
    if (!canAgent || authLoading) return;
    setHistoryLoading(true);
    try {
      const raw = (await getAgentHistory(1)) as HistoryPayload;
      setTaskHistory(raw.tasks || []);
    } catch {
      setTaskHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [authLoading, canAgent]);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    void loadTaskHistory();
  }, [loadTaskHistory]);

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
    setExpandedStage((current) => (current === id ? null : id));
  }, []);

  const handleRunTask = async () => {
    const t = task.trim();
    if (t.length < 10 || isRunning) return;
    setError(null);
    setBridgeMeta(null);
    setSidebarOpen(false);
    setResult(null);
    setExpandedStage(null);
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
      await loadTaskHistory();
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
    setTask('');
    setToastMessage(null);
    setRefinementInput('');
    setRefinementError(null);
    setIsRefining(false);
    setExpandedStage(null);
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
    setSidebarOpen(false);
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

  const expandedPayload: StagePayload | null =
    expandedStage && result?.stages ? (result.stages[expandedStage] as StagePayload) : null;
  const expandedStageState =
    expandedStage ? stageVisual.find((stage) => stage.id === expandedStage)?.state || 'pending' : 'pending';

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

  const plainAnswerText = useMemo(
    () => plainTextFromFinalAnswer(result?.final_answer, parsedAnswer),
    [result?.final_answer, parsedAnswer],
  );

  const intelligenceScore = useMemo(() => {
    const candidate = result?.intelligence_score;
    if (!candidate || Object.keys(candidate).length === 0) return null;
    return candidate;
  }, [result?.intelligence_score]);

  const assumptions = useMemo(() => {
    const candidate = result?.assumptions;
    if (!candidate?.assumptions || candidate.assumptions.length === 0) return null;
    return candidate;
  }, [result?.assumptions]);

  const hasRefinementMetadataNote = (result?.refinement_count ?? 0) > 0;
  const flaggedAssumptions = useMemo(
    () => assumptions?.assumptions?.filter((assumption) => assumption.flag) || [],
    [assumptions],
  );
  const visibleAssumptions = useMemo(() => {
    if (!assumptions?.assumptions) return [];
    if (showAllAssumptions || flaggedAssumptions.length === 0) {
      return assumptions.assumptions;
    }
    return flaggedAssumptions;
  }, [assumptions, flaggedAssumptions, showAllAssumptions]);
  const hiddenAssumptionCount = Math.max(
    0,
    (assumptions?.assumptions?.length || 0) - visibleAssumptions.length,
  );

  const intelligenceRows = useMemo(
    () =>
      intelligenceScore
        ? [
            { key: 'research', label: 'Research', data: intelligenceScore.research_depth },
            { key: 'reasoning', label: 'Reasoning', data: intelligenceScore.logical_soundness },
            { key: 'consensus', label: 'Consensus', data: intelligenceScore.consensus_level },
            { key: 'durability', label: 'Durability', data: intelligenceScore.answer_durability },
          ]
        : [],
    [intelligenceScore],
  );

  const currentTaskLabel = useMemo(() => {
    const raw = (result?.original_task || result?.task || task || '').trim();
    if (!raw) return '';
    return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
  }, [result?.original_task, result?.task, task]);

  const currentStageLabel = useMemo(() => {
    const active = STAGES.find((stage) => stage.id === currentStage);
    return active?.label || 'Running';
  }, [currentStage]);

  useEffect(() => {
    setShowAllAssumptions(false);
    setScoreTooltip(null);
    setScoreCopied(false);
  }, [result?.task_id, result?.refinement_count]);

  const handleShareScore = useCallback(async () => {
    if (!intelligenceScore) return;
    const total = Number(intelligenceScore.total_score || 0);
    const label = intelligenceScore.score_label || 'Unscored';
    const lines = [
      `Intelligence Score: ${total}/100 (${label})`,
      '',
      `Research: ${Number(intelligenceScore.research_depth?.score || 0)}/25`,
      `Reasoning: ${Number(intelligenceScore.logical_soundness?.score || 0)}/25`,
      `Consensus: ${Number(intelligenceScore.consensus_level?.score || 0)}/25`,
      `Durability: ${Number(intelligenceScore.answer_durability?.score || 0)}/25`,
      '',
      intelligenceScore.one_line_verdict || '',
      '',
      'Analysed by Arena Agent',
      'try.arena.ai',
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setScoreCopied(true);
    window.setTimeout(() => setScoreCopied(false), 2000);
  }, [intelligenceScore]);

  const handleHistorySelect = useCallback(
    async (item: HistoryTask) => {
      try {
        const data = (await getAgentResult(item.task_id)) as AgentResult;
        setResult({ ...data, task_id: data.task_id || item.task_id });
        setTask(data.task || item.task_text);
        setError(null);
        setToastMessage(null);
        setSidebarOpen(false);
        setSearchParams({ task_id: item.task_id });
      } catch {
        setToastMessage('This task has expired. Start a new task.');
      }
    },
    [setSearchParams],
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
        height: isMobile ? 'auto' : '100vh',
        background: '#FAF7F4',
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
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
        @keyframes stagePulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .agent-chal-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: agentChalDotPulse 1.2s ease-in-out infinite;
        }
      `}</style>
      {!isMobile ? (
        <aside
          style={{
            width: 260,
            flexShrink: 0,
            background: '#F5F2EF',
            borderRight: '0.5px solid #E0D8D0',
            height: '100vh',
            position: 'sticky',
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => navigate('/app')}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#6B6460', cursor: 'pointer' }}
            >
              ← Arena
            </button>
          </div>
          <div style={{ height: '0.5px', background: '#E8E2DA', margin: '0 16px 12px' }} />
          <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1714' }}>Agent</span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C4956A', animation: 'breathe 2.4s infinite' }} />
          </div>
          <button
            type="button"
            onClick={resetRun}
            style={{
              margin: '12px 16px',
              width: 'calc(100% - 32px)',
              padding: '9px 16px',
              background: '#1A1714',
              color: '#FAF7F4',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              textAlign: 'center',
            }}
          >
            New task
          </button>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#B0A9A2', padding: '12px 4px 6px', marginBottom: 4 }}>
              History
            </div>
            {historyLoading ? (
              <div style={{ fontSize: 12, color: '#C4B8AE', textAlign: 'center', padding: '2rem 0' }}>Loading…</div>
            ) : taskHistory.length === 0 ? (
              <div style={{ fontSize: 12, color: '#C4B8AE', textAlign: 'center', padding: '2rem 0' }}>No tasks yet</div>
            ) : (
              taskHistory.map((item) => {
                const score = item.final_score ?? 0;
                const active = result?.task_id === item.task_id;
                const scoreBg =
                  score >= 80
                    ? 'rgba(138,168,153,0.15)'
                    : score >= 60
                      ? 'rgba(196,149,106,0.12)'
                      : 'rgba(229,115,115,0.1)';
                const scoreColor = score >= 80 ? '#5A8A5A' : score >= 60 ? '#B07840' : '#D9534F';
                return (
                  <button
                    key={item.task_id}
                    type="button"
                    onClick={() => void handleHistorySelect(item)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      marginBottom: 4,
                      transition: 'background 150ms ease',
                      background: active ? '#EDEAE6' : 'transparent',
                      border: 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = 'rgba(26,23,20,0.05)';
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: '#1A1714',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.task_text}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 10, borderRadius: 999, padding: '1px 7px', background: scoreBg, color: scoreColor }}>
                        {item.final_score != null ? `${item.final_score}/100` : '—'}
                      </span>
                      <span style={{ fontSize: 10, color: '#C4B8AE' }}>{formatShortDate(item.created_at)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      ) : (
        <>
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.28)', zIndex: 59 }}
            />
          )}
          <aside
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: 260,
              maxWidth: '85vw',
              background: '#F5F2EF',
              borderRight: '0.5px solid #E0D8D0',
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 200ms ease',
            }}
          >
            <div style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => navigate('/app')} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#6B6460', cursor: 'pointer' }}>
                ← Arena
              </button>
              <button type="button" onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6460' }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div style={{ height: '0.5px', background: '#E8E2DA', margin: '0 16px 12px' }} />
            <button
              type="button"
              onClick={resetRun}
              style={{ margin: '0 16px 12px', padding: '9px 16px', background: '#1A1714', color: '#FAF7F4', borderRadius: 10, border: 'none' }}
            >
              New task
            </button>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
              {taskHistory.map((item) => (
                <button
                  key={item.task_id}
                  type="button"
                  onClick={() => void handleHistorySelect(item)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: 'none', background: result?.task_id === item.task_id ? '#EDEAE6' : 'transparent', marginBottom: 4 }}
                >
                  <div style={{ fontSize: 12, color: '#1A1714', lineHeight: 1.4 }}>{item.task_text}</div>
                </button>
              ))}
            </div>
          </aside>
        </>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100vh' }}>
      <header
        style={{
          height: '52px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          background: 'rgba(250,247,244,0.9)',
          borderBottom: '0.5px solid #E0D8D0',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 12,
          flexShrink: 0,
        }}
      >
        {isMobile ? (
          <button type="button" onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6460', padding: 0 }}>
            <PanelLeft style={{ width: 16, height: 16 }} />
          </button>
        ) : null}
        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: currentTaskLabel ? 12 : 13, color: currentTaskLabel ? '#6B6460' : '#1A1714', fontStyle: currentTaskLabel ? 'italic' : 'normal', fontWeight: currentTaskLabel ? 400 : 500 }}>
          {currentTaskLabel || 'Agent Mode'}
        </div>
        {isRunning ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, border: '2px solid #F0EBE3', borderTopColor: '#C4956A', borderRadius: '50%', animation: 'agentSpin 1s linear infinite' }} />
            <span style={{ fontSize: 12, color: '#C4956A' }}>{currentStageLabel}</span>
          </div>
        ) : null}
        <div style={{ marginLeft: 'auto' }}>
          <UserMenu user={user} isLoading={authLoading} onSignInClick={() => navigate('/signin')} onLogout={logout} />
        </div>
      </header>

      {toastMessage ? (
        <div style={{ position: 'fixed', top: 64, right: 20, zIndex: 80, background: '#1A1714', color: '#FAF7F4', padding: '10px 14px', borderRadius: 10, fontSize: 12 }}>
          {toastMessage}
        </div>
      ) : null}

      <main
        style={{
          flex: 1,
          width: '100%',
          boxSizing: 'border-box',
          overflowY: isMobile ? 'auto' : 'auto',
          padding: isMobile ? '1rem' : '1.5rem',
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
                  expandedStage={expandedStage}
                  onToggle={toggleStage}
                  expandedPayload={expandedPayload}
                  expandedStageState={expandedStageState}
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
                      Original task
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

                {result.conversation && result.conversation.length > 2 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    {result.conversation.map((msg, idx) => {
                      const isUser = msg.role === 'user';
                      const text = msg.content || '';
                      const short = !isUser && text.length > 200 ? `${text.slice(0, 200)}…` : text;
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
                            {msg.refinement_type ? (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: '#B0A9A2',
                                  marginTop: 3,
                                  textAlign: isUser ? 'right' : 'left',
                                }}
                              >
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
                      marginBottom: '1.5rem',
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
                  {intelligenceScore ? (
                    <div style={{ marginTop: '1.5rem', marginBottom: parsedAnswer ? '1rem' : 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '1.5rem',
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-end',
                              color: totalScoreColor(Number(intelligenceScore.total_score || 0)),
                              lineHeight: 1,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 42,
                                fontWeight: 400,
                                letterSpacing: '-0.03em',
                              }}
                            >
                              {Number(intelligenceScore.total_score || 0)}
                            </span>
                            <span
                              style={{
                                fontSize: 18,
                                color: '#B0A9A2',
                                marginLeft: 2,
                                marginBottom: 4,
                              }}
                            >
                              /100
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: totalScoreColor(Number(intelligenceScore.total_score || 0)),
                              marginTop: -2,
                            }}
                          >
                            {intelligenceScore.score_label || 'Solid'}
                          </div>
                        </div>
                        <div style={{ width: 220, maxWidth: '100%' }}>
                          {intelligenceRows.map((row) => {
                            const value = Number(row.data?.score || 0);
                            const color = dimensionScoreColor(value);
                            const tooltipKey = `${row.key}-${value}`;
                            return (
                              <div
                                key={row.key}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 6,
                                  position: 'relative',
                                }}
                                onMouseEnter={() => setScoreTooltip(tooltipKey)}
                                onMouseLeave={() => setScoreTooltip((current) => (current === tooltipKey ? null : current))}
                              >
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: '#B0A9A2',
                                    width: 80,
                                    flexShrink: 0,
                                    textAlign: 'right',
                                  }}
                                >
                                  {row.label}
                                </span>
                                <div
                                  style={{
                                    flex: 1,
                                    height: 4,
                                    background: '#F0EBE3',
                                    borderRadius: 999,
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${Math.max(0, Math.min(100, (value / 25) * 100))}%`,
                                      height: 4,
                                      borderRadius: 999,
                                      background: color,
                                      transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)',
                                    }}
                                  />
                                </div>
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    color,
                                    width: 24,
                                    textAlign: 'right',
                                  }}
                                >
                                  {value}
                                </span>
                                {scoreTooltip === tooltipKey && row.data?.reason ? (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      right: 0,
                                      top: 'calc(100% + 6px)',
                                      background: '#1A1714',
                                      color: '#FAF7F4',
                                      fontSize: 11,
                                      padding: '6px 10px',
                                      borderRadius: 8,
                                      maxWidth: 200,
                                      zIndex: 10,
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    {row.data.reason}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {intelligenceScore.one_line_verdict ? (
                        <p
                          style={{
                            fontSize: 13,
                            color: '#6B6460',
                            fontStyle: 'italic',
                            marginTop: 0,
                            marginBottom: '1rem',
                          }}
                        >
                          {intelligenceScore.one_line_verdict}
                        </p>
                      ) : null}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => void handleShareScore()}
                          style={{
                            background: 'transparent',
                            border: '0.5px solid #E0D8D0',
                            borderRadius: 999,
                            padding: '5px 14px',
                            fontSize: 11,
                            color: scoreCopied ? '#C4956A' : '#6B6460',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#C4956A';
                            e.currentTarget.style.color = '#C4956A';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#E0D8D0';
                            e.currentTarget.style.color = scoreCopied ? '#C4956A' : '#6B6460';
                          }}
                        >
                          {scoreCopied ? 'Copied!' : 'Share this score'}
                        </button>
                        {hasRefinementMetadataNote ? (
                          <span style={{ fontSize: 10, color: '#B0A9A2', fontStyle: 'italic' }}>
                            Updated after refinement
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
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
                  {assumptions ? (
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
                          marginBottom: 12,
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: '#B0A9A2',
                          }}
                        >
                          This answer assumes
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            background: 'rgba(196,149,106,0.1)',
                            color: '#C4956A',
                            borderRadius: 999,
                            padding: '2px 10px',
                          }}
                        >
                          {assumptions.assumption_count || assumptions.assumptions?.length || 0} assumptions
                        </span>
                      </div>
                      {assumptions.summary ? (
                        <p
                          style={{
                            fontSize: 13,
                            color: '#6B6460',
                            fontStyle: 'italic',
                            marginTop: 0,
                            marginBottom: 14,
                            lineHeight: 1.6,
                          }}
                        >
                          {assumptions.summary}
                        </p>
                      ) : null}
                      {hasRefinementMetadataNote ? (
                        <div style={{ fontSize: 10, color: '#B0A9A2', fontStyle: 'italic', marginBottom: 10 }}>
                          Updated after refinement
                        </div>
                      ) : null}
                      {visibleAssumptions.map((assumption, idx) => {
                        const criticality = (assumption.criticality || 'medium').toLowerCase();
                        const criticalityStyle =
                          criticality === 'high'
                            ? { bg: 'rgba(229,115,115,0.1)', color: '#E57373', text: 'High' }
                            : criticality === 'low'
                              ? { bg: 'rgba(138,168,153,0.1)', color: '#8AA899', text: 'Low' }
                              : { bg: 'rgba(196,149,106,0.1)', color: '#C4956A', text: 'Medium' };
                        return (
                          <div
                            key={`${assumption.assumption || 'assumption'}-${idx}`}
                            style={{
                              display: 'flex',
                              gap: 10,
                              alignItems: 'flex-start',
                              padding: '10px 0',
                              borderBottom:
                                idx === visibleAssumptions.length - 1 ? 'none' : '0.5px solid #F0EBE3',
                              position: 'relative',
                              paddingLeft: assumption.flag ? 10 : 0,
                            }}
                          >
                            {assumption.flag ? (
                              <div
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 8,
                                  bottom: 8,
                                  width: 2.5,
                                  background: '#C4956A',
                                  borderRadius: 999,
                                }}
                              />
                            ) : null}
                            <div
                              style={{
                                width: 20,
                                flexShrink: 0,
                                fontSize: 11,
                                fontWeight: 500,
                                color: '#B0A9A2',
                                marginTop: 1,
                              }}
                            >
                              {idx + 1}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: '#1A1714',
                                  fontWeight: 400,
                                  lineHeight: 1.5,
                                  marginBottom: 4,
                                }}
                              >
                                {assumption.assumption}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 6,
                                  marginTop: 5,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10,
                                    background: 'rgba(229,115,115,0.08)',
                                    color: '#E57373',
                                    borderRadius: 4,
                                    padding: '1px 6px',
                                    flexShrink: 0,
                                    marginTop: 1,
                                    fontWeight: 500,
                                  }}
                                >
                                  If wrong
                                </span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: '#6B6460',
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {assumption.if_wrong}
                                </span>
                              </div>
                            </div>
                            <div
                              style={{
                                flexShrink: 0,
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontSize: 10,
                                fontWeight: 500,
                                background: criticalityStyle.bg,
                                color: criticalityStyle.color,
                              }}
                            >
                              {criticalityStyle.text}
                            </div>
                          </div>
                        );
                      })}
                      {hiddenAssumptionCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowAllAssumptions((current) => !current)}
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: '#C4956A',
                            cursor: 'pointer',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                          }}
                        >
                          {showAllAssumptions
                            ? 'Show fewer assumptions'
                            : `Show ${hiddenAssumptionCount} more assumptions`}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
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
                      gap: 12,
                      margin: '1.5rem 0',
                      cursor: 'pointer',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <div style={{ flex: 1, height: '0.5px', background: '#F0EBE3' }} />
                    <span style={{ fontSize: 12, color: '#C4B8AE' }}>{traceOpen ? '▴' : '▾'}</span>
                    <div style={{ flex: 1, height: '0.5px', background: '#F0EBE3' }} />
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
                      <div style={{ margin: '1.5rem 0', height: '0.5px', background: '#F0EBE3' }} />

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
    </div>
  );
}

function StageDotsRow({
  stages,
  stageVisual,
  expandedStage,
  onToggle,
  expandedPayload,
  expandedStageState,
}: {
  stages: typeof STAGES;
  stageVisual: { id: StageId; state: string }[];
  expandedStage: StageId | null;
  onToggle: (id: StageId) => void;
  expandedPayload: StagePayload | null;
  expandedStageState: string;
}) {
  const expandedStageMeta = expandedStage ? stages.find((x) => x.id === expandedStage) : null;
  const detailBody =
    expandedStageState === 'running' ? (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[0, 1, 2].map((idx) => (
            <span
              key={idx}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#C4956A',
                display: 'inline-block',
                animation: 'stagePulse 1.2s infinite',
                animationDelay: `${idx * 0.2}s`,
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 13, color: '#6B6460', lineHeight: 1.7 }}>
          {expandedStage ? STAGE_RUNNING_MESSAGES[expandedStage] : ''}
        </div>
      </div>
    ) : expandedStageState === 'skipped' ? (
      <div style={{ fontSize: 13, color: '#B0A9A2', fontStyle: 'italic', lineHeight: 1.7 }}>
        This stage was skipped by the Planner — not needed for this task.
      </div>
    ) : expandedStageState === 'pending' ? (
      <div style={{ fontSize: 13, color: '#B0A9A2', fontStyle: 'italic', lineHeight: 1.7 }}>
        Waiting to run...
      </div>
    ) : (
      <div style={{ fontSize: 13, color: '#1A1714', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {expandedPayload?.output || '—'}
      </div>
    );

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
                    transition: 'transform 150ms ease',
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
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
                  {vis === 'pending' && <span style={{ color: '#C4B8AE', fontSize: 10 }}>·</span>}
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

      {expandedStage && (
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
              {expandedStageMeta?.label}
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
          {detailBody}
        </div>
      )}
    </>
  );
}
