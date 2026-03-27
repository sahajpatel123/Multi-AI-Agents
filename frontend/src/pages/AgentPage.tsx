import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ellipsis, Lock, Pencil, Trash2, X } from 'lucide-react';
import { AnalyticalCaveatsSection, type StructuredCaveat } from '../components/AgentCaveatGrid';
import { CalligraphyLoader } from '../components/CalligraphyLoader';
import { ExpertiseSelector } from '../components/ExpertiseSelector';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  challengeAgentAnswer,
  deleteAgentTask,
  getAgentHistory,
  getAgentRebuttal,
  getAgentResult,
  getAgentSavedTask,
  getAgentStatus,
  getCalibrationRatingForTask,
  getCalibrationStats,
  getMe,
  markAgentLiveUpdatesRead,
  postCalibrationRate,
  refineAgentAnswer,
  renameAgentTask,
  runAgentTask,
  toggleAgentTaskLive,
  type AgentChallengeItem,
} from '../api';
import { useTier } from '../context/TierContext';
import { useProfileModal } from '../context/ProfileModalContext';
import { useAuth } from '../hooks/useAuth';
import { User } from '../types';
import { setRedirectIntent } from '../utils/redirectIntent';

/** Agent result view — shared palette (mockup) */
const AR = {
  CREAM: '#F5F0E8',
  SURFACE: '#FAF7F2',
  SURFACE_ALT: '#FDFAF6',
  BORDER: '#E0D5C5',
  BORDER_INNER: '#EDE4D8',
  GOLD: '#C4956A',
  GOLD_MUTED: '#C4A882',
  DARK: '#2C1810',
  TEXT_PRIMARY: '#2C1810',
  TEXT_MID: '#4A3728',
  TEXT_MUTED: '#8C7355',
  TEXT_FAINT: '#A89070',
} as const;

const TEMPORAL_DECAY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  permanent: { bg: '#1A2E1A', text: '#6FCF6F', label: 'TIMELESS' },
  durable: { bg: '#1A2433', text: '#7AB8E8', label: 'DURABLE' },
  seasonal: { bg: '#2E2210', text: '#E8B86D', label: 'SEASONAL' },
  perishable: { bg: '#2E1010', text: '#E87D7D', label: 'PERISHABLE' },
};

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
  caveats?: StructuredCaveat[];
  error?: string;
  source_integrity?: SourceIntegrityPayload;
  contradictions?: any[] | null;
  memory_contradictions?: any[] | null;
  insight_report?: Record<string, unknown> | null;
  memory_saved?: boolean;
  conversation?: ConversationEntry[];
  is_refinement?: boolean;
  refinement_count?: number;
  parent_task_id?: string;
  bridge_from_arena?: boolean;
  intelligence_score?: IntelligenceScorePayload;
  assumptions?: AssumptionsPayload;
  /** Extended blackboard fields (optional until backend persists all) */
  steelman?: Record<string, unknown> | null;
  temporal_profile?: unknown;
  dissent_report?: unknown;
  expertise_level?: string;
  expertise_domain?: string;
  is_live?: boolean;
  live_last_checked?: string | null;
  live_next_check?: string | null;
  live_updates?: any[] | null;
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
  sources?: Array<Record<string, unknown>>;
  contradictions?: Array<{
    topic?: string;
    position_a?: string;
    position_b?: string;
    severity?: string;
  }>;
};

type HistoryTask = {
  task_id: string;
  title?: string | null;
  task_text: string;
  final_score: number | null;
  final_confidence: number | null;
  topics: string[];
  user_feedback: string | null;
  created_at: string;
  is_live?: boolean;
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
  confidence?: number | string;
  type?: string;
};

type ParsedSynthesis = {
  sentences: ParsedSentence[];
  overall_confidence?: number;
  flags?: string[];
  sources_referenced?: string[];
};

type AnswerSentenceConfidence = 'verified' | 'supported' | 'uncertain';

type AnswerSentenceView = {
  text: string;
  confidence: AnswerSentenceConfidence;
};

function numericConfidenceToLevel(c: number): AnswerSentenceConfidence {
  if (c >= 90) return 'verified';
  if (c >= 70) return 'supported';
  return 'uncertain';
}

function sentenceConfidenceLevel(sent: ParsedSentence): AnswerSentenceConfidence {
  const raw = sent.confidence;
  if (typeof raw === 'string') {
    const k = raw.toLowerCase().trim();
    if (k === 'verified' || k === 'high') return 'verified';
    if (k === 'supported' || k === 'medium') return 'supported';
    if (k === 'uncertain' || k === 'low') return 'uncertain';
    const n = Number.parseFloat(k);
    if (!Number.isNaN(n)) return numericConfidenceToLevel(n);
    return 'supported';
  }
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return numericConfidenceToLevel(raw);
  }
  return 'supported';
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

const CALIBRATION_LEVEL_TITLES: Record<number, string> = {
  1: 'Uncertain',
  2: 'Doubtful',
  3: 'Neutral',
  4: 'Confident',
  5: 'Certain',
};

function formatRelativeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  let sec = Math.round((Date.now() - t) / 1000);
  if (sec < 0) sec = 0;
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function splitPlainAnswerToSentences(text: string): AnswerSentenceView[] {
  const t = text.trim();
  if (!t) return [];
  const parts = t.split(/\.\s+/).filter((p) => p.trim().length > 0);
  return parts.map((p, i) => {
    const withDot = i < parts.length - 1 || t.endsWith('.') ? (p.endsWith('.') ? p : `${p}.`) : p;
    return { text: withDot.trim(), confidence: 'supported' as const };
  });
}

const CAVEAT_CATEGORY_KEYS = new Set([
  'time-sensitive',
  'methodological',
  'theory-dependent',
  'completeness',
  'precision',
  'scoring',
  'aesthetic',
]);

function normalizeStructuredCaveat(raw: Record<string, unknown>): StructuredCaveat | null {
  const keyword = typeof raw.keyword === 'string' ? raw.keyword.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!keyword && !description) return null;
  let cat = typeof raw.category === 'string' ? raw.category.toLowerCase().trim().replace(/\s+/g, '-') : 'scoring';
  if (!CAVEAT_CATEGORY_KEYS.has(cat)) cat = 'scoring';
  const sev = typeof raw.severity === 'string' ? raw.severity.toLowerCase() : 'medium';
  const exp = raw.expires;
  const expires =
    cat === 'time-sensitive' && exp != null && String(exp).trim() !== '' && String(exp).toLowerCase() !== 'null'
      ? String(exp).trim()
      : null;
  return {
    category: cat,
    keyword: keyword || description.slice(0, 60),
    description: description || keyword,
    severity: sev === 'high' || sev === 'low' || sev === 'medium' ? sev : 'medium',
    expires,
  };
}

function getStructuredCaveats(result: AgentResult | null): StructuredCaveat[] {
  if (!result) return [];
  const direct = result.caveats;
  if (Array.isArray(direct) && direct.length > 0) {
    const out: StructuredCaveat[] = [];
    for (const item of direct) {
      if (item && typeof item === 'object') {
        const n = normalizeStructuredCaveat(item as Record<string, unknown>);
        if (n) out.push(n);
      }
    }
    if (out.length > 0) return out;
  }
  const jOut = result.stages?.judge?.output?.trim() || '';
  if (!jOut) return [];
  try {
    const parsed = JSON.parse(jOut) as { caveats?: unknown };
    if (!Array.isArray(parsed.caveats)) return [];
    const out: StructuredCaveat[] = [];
    for (const item of parsed.caveats) {
      if (item && typeof item === 'object') {
        const n = normalizeStructuredCaveat(item as Record<string, unknown>);
        if (n) out.push(n);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function sourceShortName(title: string): string {
  const t = title.trim();
  const dashSplit = t.split(/\s*[—–]\s*/);
  if (dashSplit.length >= 2) {
    const left = dashSplit[0].trim();
    const right = dashSplit[dashSplit.length - 1].trim();
    const beforeColon = left.split(':')[0].trim();
    const authorWords = right.split(/\s+/).filter(Boolean);
    const surname = authorWords.length > 0 ? authorWords[authorWords.length - 1]! : right;
    if (beforeColon && surname) return `${surname} — ${beforeColon}`;
  }
  const words = t.split(/\s+/).filter((w) => {
    const core = w.replace(/^[^\w]+|[^\w]+$/g, '');
    return core.length > 0 && !/^(the|a|an)$/i.test(core);
  });
  const short = words.slice(0, 3).join(' ');
  return short || t.slice(0, 48) || 'Source';
}

function sourceCategoryTagStyles(category: string): { bg: string; color: string; label: string } {
  const c = category.toLowerCase();
  if (c.includes('historical')) return { bg: '#EAF0F7', color: '#185FA5', label: 'Historical' };
  if (c.includes('philosophy')) return { bg: '#EEEDFE', color: '#534AB7', label: 'Philosophy' };
  if (c.includes('theory')) return { bg: '#EEEDFE', color: '#534AB7', label: 'Theory' };
  return { bg: '#F0E8DC', color: '#8C7355', label: 'Primary' };
}

function intelligenceLabelFromTotal(score: number): string {
  if (score >= 90) return 'Exceptional';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Solid';
  if (score >= 45) return 'Mixed';
  return 'Weak';
}

const CHALLENGER_CARD_STYLES: Record<string, { accent: string; dot: string }> = {
  'The Analyst': { accent: '#8C9BAB', dot: '#8C9BAB' },
  'The Contrarian': { accent: '#B0977E', dot: '#B0977E' },
  'The Philosopher': { accent: '#9B8FAA', dot: '#9B8FAA' },
};

const AGENT_IDLE_SUGGESTIONS = [
  'Research the top 5 AI startups funded this month',
  'Write a go-to-market strategy for a SaaS product',
  'Analyse the pros and cons of SQL vs NoSQL',
  'What will the AI landscape look like in 2027?',
  'Break down the business model of Notion',
  'What are the strongest arguments against remote work?',
] as const;

const INPUT_STAGE_PILLS = ['Plan', 'Research', 'Solve', 'Critique', 'Verify', 'Synthesise', 'Judge'] as const;

function agentProfileInitials(u: User): string {
  const n = u.name?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    const s = `${first}${last}`.toUpperCase();
    if (s) return s.slice(0, 2);
  }
  const e = u.email?.trim() ?? '';
  return e ? e[0]!.toUpperCase() : 'U';
}

function AgentProfileSidebarRow({ user }: { user: User | null }) {
  const { openModal } = useProfileModal();
  if (!user?.email) return null;
  const label = user.name?.trim() || user.email;
  return (
    <button
      type="button"
      onClick={() => openModal('bottom-left')}
      style={{
        marginTop: 'auto',
        padding: '12px 16px',
        borderTop: '0.5px solid #E0D5C5',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        transition: 'background 0.15s',
        background: 'transparent',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#EDE4D8';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#C4956A',
          color: '#FAF7F2',
          fontSize: 11,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {agentProfileInitials(user)}
      </div>
      <span
        style={{
          fontSize: 12,
          color: '#4A3728',
          fontFamily: 'Georgia, serif',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flex: 1,
        }}
      >
        {label}
      </span>
    </button>
  );
}

type AgentSidebarMenuItemProps = {
  icon: ReactNode;
  label: string;
  color: string;
  hoverBackground: string;
  onClick: () => void;
};

function AgentSidebarMenuItem({
  icon,
  label,
  color,
  hoverBackground,
  onClick,
}: AgentSidebarMenuItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex items-center gap-2"
      style={{
        padding: '8px 12px',
        fontSize: '13px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        color,
        background: isHovered ? hoverBackground : 'transparent',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function agentHistoryDisplayTitle(item: HistoryTask): string {
  const t = item.title?.trim();
  if (t) return t;
  const q = item.task_text || '';
  return q.length > 60 ? `${q.slice(0, 60)}…` : q;
}

export function AgentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const { canUseFeature, isPro } = useTier();
  const canAgent = canUseFeature('agent_mode');
  const { openModal, setActiveTab, isOpen: profileModalOpen } = useProfileModal();

  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [_completedStages, setCompletedStages] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('planner');
  const [_liveStages, setLiveStages] = useState<Partial<Record<StageId, string>>>({});
  const [challenges, setChallenges] = useState<AgentChallengeItem[]>([]);
  const [isChallengingAnswer, setIsChallengingAnswer] = useState(false);
  const [challengesVisible, setChallengesVisible] = useState(false);
  const [challengeSectionError, setChallengeSectionError] = useState<string | null>(null);
  const [rebuttals, setRebuttals] = useState<Record<string, string>>({});
  const [rebuttalLoadingFor, setRebuttalLoadingFor] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState('');
  const [refinementError, setRefinementError] = useState<string | null>(null);
  const [bridgeMeta, setBridgeMeta] = useState<{ taskId: string; originalQuestion: string } | null>(null);
  const [showAllAssumptions, setShowAllAssumptions] = useState(false);
  const [panelIntelOpen, setPanelIntelOpen] = useState(false);
  const [panelAssumptionsOpen, setPanelAssumptionsOpen] = useState(false);
  const [panelDissentOpen, setPanelDissentOpen] = useState(false);
  const [steelmanInnerExpanded, setSteelmanInnerExpanded] = useState(false);
  const [showAllSourcePills, setShowAllSourcePills] = useState(false);
  const [taskHistory, setTaskHistory] = useState<HistoryTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const menuLayerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confActive, setConfActive] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navToggleHovered, setNavToggleHovered] = useState(false);
  const answerAnchorRef = useRef<HTMLDivElement>(null);
  const followUpInputRef = useRef<HTMLInputElement | null>(null);
  const idleTaskInputRef = useRef<HTMLInputElement | null>(null);
  const [suggIdx, setSuggIdx] = useState(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingResult, setRatingResult] = useState<any>(null);
  const [ratingSubmitBusy, setRatingSubmitBusy] = useState(false);
  const [liveToggleBusy, setLiveToggleBusy] = useState(false);
  const [liveUpdatesPanelOpen, setLiveUpdatesPanelOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((current) => !current);
  }, []);

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const [expertiseLevel, setExpertiseLevel] = useState(() => localStorage.getItem('arena_expertise_level') || 'curious');
  const [expertiseDomain, setExpertiseDomain] = useState(() => localStorage.getItem('arena_expertise_domain') || '');

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
    if (!user?.email || authLoading) return;
    let cancelled = false;
    void (async () => {
      try {
        const me = await getMe();
        if (cancelled || !me) return;
        const lvl = (me.expertise_level || 'curious').toLowerCase();
        const dom = me.expertise_domain || '';
        localStorage.setItem('arena_expertise_level', lvl);
        localStorage.setItem('arena_expertise_domain', dom);
        setExpertiseLevel(lvl);
        setExpertiseDomain(dom);
      } catch {
        // keep localStorage / initial state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email, authLoading]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSuggIdx((i) => (i + 1) % AGENT_IDLE_SUGGESTIONS.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void loadTaskHistory();
  }, [loadTaskHistory]);

  useEffect(() => {
    if (!openMenuTaskId && !confirmDeleteTaskId) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuLayerRef.current?.contains(event.target as Node)) return;
      setOpenMenuTaskId(null);
      setConfirmDeleteTaskId(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openMenuTaskId, confirmDeleteTaskId]);

  useEffect(() => {
    if (!editingTaskId) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editingTaskId]);

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
        } catch (e) {
          if (!cancelled) {
            const msg =
              e instanceof ApiError && e.status === 404
                ? 'Task not found.'
                : 'Could not load this task.';
            setError(msg);
          }
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


  const handleRunTask = async () => {
    const t = task.trim();
    if (t.length < 10 || isRunning) return;
    setError(null);
    setBridgeMeta(null);
    if (isMobile) setSidebarOpen(false);
    setResult(null);
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
      const startData = await runAgentTask(t, {
        expertise_level: expertiseLevel,
        expertise_domain: expertiseDomain,
      });
      if (!startData.task_id) {
        throw new Error('No task ID received');
      }
      await pollAgentTaskUntilDone(startData.task_id);
      await loadTaskHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent task failed');
      setIsRunning(false);
      setIsRefining(false);
    }
  };

  const handleRefine = async () => {
    const msg = followUp.trim();
    if (!msg || !result?.task_id || isRefining || isRunning) return;
    setFollowUp('');
    setIsRunning(true);
    setIsRefining(true);
    setRefinementError(null);
    try {
      await refineAgentAnswer(result.task_id, msg);
      await pollAgentTaskUntilDone(result.task_id);
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
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    setEditingTaskId(null);
    setEditingValue('');
    setSearchParams({});
    setBridgeMeta(null);
    setResult(null);
    setError(null);
    setTask('');
    setToastMessage(null);
    setFollowUp('');
    setRefinementError(null);
    setIsRefining(false);
    setCompletedStages([]);
    setCurrentStage('planner');
    setLiveStages({});
    setChallenges([]);
    setChallengesVisible(false);
    setChallengeSectionError(null);
    setRebuttals({});
    setRebuttalLoadingFor(null);
    setIsChallengingAnswer(false);
    setShowAllSourcePills(false);
    if (isMobile) setSidebarOpen(false);
  };

  const runAgainWithSameQuestion = () => {
    const q = (result?.original_task || result?.task || '').trim();
    resetRun();
    if (q) setTask(q);
  };

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

  const answerSentences = useMemo((): AnswerSentenceView[] => {
    if (parsedAnswer?.sentences?.length) {
      return parsedAnswer.sentences.map((s) => ({
        text: s.text,
        confidence: sentenceConfidenceLevel(s),
      }));
    }
    const raw = plainTextFromFinalAnswer(result?.final_answer, parsedAnswer);
    if (raw.trim()) return splitPlainAnswerToSentences(raw);
    return [];
  }, [parsedAnswer, result?.final_answer]);

  const confidenceLegendStats = useMemo(() => {
    const total = answerSentences.length;
    if (total === 0) return null;
    const verifiedCount = answerSentences.filter((s) => s.confidence === 'verified').length;
    const supportedCount = answerSentences.filter((s) => s.confidence === 'supported').length;
    const uncertainCount = answerSentences.filter((s) => s.confidence === 'uncertain').length;
    return {
      total,
      verifiedCount,
      supportedCount,
      uncertainCount,
      verifiedPct: Math.round((verifiedCount / total) * 100),
      supportedPct: Math.round((supportedCount / total) * 100),
      uncertainPct: Math.round((uncertainCount / total) * 100),
    };
  }, [answerSentences]);

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
  const sortedAssumptionItems = useMemo(() => {
    if (!assumptions?.assumptions?.length) return [];
    return [...assumptions.assumptions].sort((a, b) => Number(!!b.flag) - Number(!!a.flag));
  }, [assumptions]);
  const flaggedAssumptions = useMemo(
    () => sortedAssumptionItems.filter((assumption) => assumption.flag),
    [sortedAssumptionItems],
  );
  const visibleAssumptions = useMemo(() => {
    if (!sortedAssumptionItems.length) return [];
    if (showAllAssumptions || flaggedAssumptions.length === 0) {
      return sortedAssumptionItems;
    }
    return flaggedAssumptions;
  }, [sortedAssumptionItems, flaggedAssumptions, showAllAssumptions]);
  const hiddenAssumptionCount = Math.max(
    0,
    (assumptions?.assumptions?.length || 0) - visibleAssumptions.length,
  );

  const intelligenceRows = useMemo(
    () =>
      intelligenceScore
        ? [
            { key: 'research', label: 'Research depth', data: intelligenceScore.research_depth },
            { key: 'reasoning', label: 'Logical soundness', data: intelligenceScore.logical_soundness },
            { key: 'consensus', label: 'Consensus level', data: intelligenceScore.consensus_level },
            { key: 'durability', label: 'Answer durability', data: intelligenceScore.answer_durability },
          ]
        : [],
    [intelligenceScore],
  );

  const currentStageLabel = useMemo(() => {
    const active = STAGES.find((stage) => stage.id === currentStage);
    return active?.label || 'Running';
  }, [currentStage]);

  const handleExpertiseChange = useCallback((level: string, domain: string) => {
    setExpertiseLevel(level);
    setExpertiseDomain(domain);
    localStorage.setItem('arena_expertise_level', level);
    localStorage.setItem('arena_expertise_domain', domain);
  }, []);

  useEffect(() => {
    setShowAllAssumptions(false);
    setPanelIntelOpen(false);
    setPanelAssumptionsOpen(false);
    setPanelDissentOpen(false);
    setSteelmanInnerExpanded(false);
    setShowAllSourcePills(false);
    setFollowUp('');
    setUserRating(null);
    setRatingResult(null);
    setLiveUpdatesPanelOpen(false);
  }, [result?.task_id, result?.refinement_count]);

  useEffect(() => {
    setConfActive(false);
  }, [result?.task_id]);

  useEffect(() => {
    if (!result?.task_id || result.status !== 'complete' || isRunning) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = (await getCalibrationRatingForTask(result.task_id!)) as {
          rated?: boolean;
          data?: {
            user_rating?: number;
            system_score?: number;
            delta?: number;
            verdict?: string;
            created_at?: string;
          };
        };
        if (cancelled) return;
        if (raw.rated && raw.data) {
          setUserRating(raw.data.user_rating ?? null);
          setRatingResult({ ...raw.data, already_rated: true });
          void (async () => {
            try {
              const st = await getCalibrationStats();
              if (cancelled) return;
              setRatingResult((prev: any) =>
                prev && typeof prev === 'object' ? { ...prev, calibration_stats: st } : prev,
              );
            } catch {
              /* optional */
            }
          })();
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result?.task_id, result?.status, isRunning]);

  const handleHistorySelect = useCallback(
    async (item: HistoryTask) => {
      try {
        const data = (await getAgentResult(item.task_id)) as AgentResult;
        setResult({ ...data, task_id: data.task_id || item.task_id });
        setTask(data.task || item.task_text);
        setError(null);
        setToastMessage(null);
        if (isMobile) setSidebarOpen(false);
        setSearchParams({ task_id: item.task_id });
      } catch (e) {
        const msg =
          e instanceof ApiError && e.status === 404
            ? 'Task not found.'
            : 'Could not load this task.';
        setError(msg);
        setToastMessage(null);
      }
    },
    [isMobile, setSearchParams],
  );

  const startRenameAgent = (item: HistoryTask) => {
    const currentLabel = item.title?.trim() || item.task_text;
    setEditingTaskId(item.task_id);
    setEditingValue(currentLabel);
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
  };

  const cancelRenameAgent = () => {
    setEditingTaskId(null);
    setEditingValue('');
  };

  const saveRenameAgent = (taskId: string) => {
    const nextValue = editingValue.trim();
    if (!nextValue) {
      cancelRenameAgent();
      return;
    }
    setTaskHistory((prev) =>
      prev.map((t) => (t.task_id === taskId ? { ...t, title: nextValue } : t)),
    );
    setEditingTaskId(null);
    setEditingValue('');
    void renameAgentTask(taskId, nextValue).catch(() => {
      setToastMessage('Could not rename task');
      void loadTaskHistory();
    });
  };

  const deleteHistoryItem = (taskId: string) => {
    if (result?.task_id === taskId) {
      resetRun();
    }
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    setTaskHistory((prev) => prev.filter((t) => t.task_id !== taskId));
    void deleteAgentTask(taskId).catch(() => {
      setToastMessage('Could not delete task');
      void loadTaskHistory();
    });
  };

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

  const handleCalibrationRateClick = useCallback(
    async (rating: number) => {
      if (!result?.task_id || ratingSubmitBusy) return;
      setRatingSubmitBusy(true);
      try {
        const raw = await postCalibrationRate(result.task_id, rating);
        setUserRating(rating);
        setRatingResult(raw);
      } catch {
        setToastMessage('Could not save calibration');
      } finally {
        setRatingSubmitBusy(false);
      }
    },
    [result?.task_id, ratingSubmitBusy],
  );

  const handleToggleLive = useCallback(async () => {
    if (!result?.task_id || liveToggleBusy) return;
    setLiveToggleBusy(true);
    try {
      const raw = (await toggleAgentTaskLive(result.task_id)) as {
        task?: {
          is_live?: boolean;
          live_last_checked?: string | null;
          live_next_check?: string | null;
          live_updates?: any[];
        };
      };
      const t = raw.task;
      if (t) {
        const tid = result.task_id;
        setResult((prev) =>
          prev
            ? {
                ...prev,
                is_live: !!t.is_live,
                live_last_checked: t.live_last_checked ?? null,
                live_next_check: t.live_next_check ?? null,
                live_updates: Array.isArray(t.live_updates) ? t.live_updates : prev.live_updates,
              }
            : prev,
        );
        setTaskHistory((prev) =>
          prev.map((h) => (h.task_id === tid ? { ...h, is_live: !!t.is_live } : h)),
        );
      }
      void loadTaskHistory();
    } catch {
      setToastMessage('Could not update live thread');
    } finally {
      setLiveToggleBusy(false);
    }
  }, [result?.task_id, liveToggleBusy, loadTaskHistory]);

  const markLiveUpdateRead = useCallback(
    async (updateId?: string) => {
      if (!result?.task_id) return;
      try {
        const raw = (await markAgentLiveUpdatesRead(result.task_id, updateId)) as {
          live_updates?: any[];
        };
        if (raw.live_updates) {
          setResult((prev) => (prev ? { ...prev, live_updates: raw.live_updates } : prev));
        }
      } catch {
        setToastMessage('Could not mark update read');
      }
    },
    [result?.task_id],
  );

  const sourceIntegrity = result?.source_integrity;

  const structuredCaveats = useMemo(() => getStructuredCaveats(result), [result]);

  const liveUpdatesList = useMemo(
    () => (Array.isArray(result?.live_updates) ? result.live_updates : []),
    [result?.live_updates],
  );
  const unreadLiveCount = useMemo(
    () => liveUpdatesList.filter((u: any) => u?.status === 'unread').length,
    [liveUpdatesList],
  );
  const intelligenceTotal = useMemo(() => {
    const t = result?.intelligence_score?.total_score;
    if (typeof t === 'number' && !Number.isNaN(t)) return Math.round(t);
    const f = result?.final_score;
    if (typeof f === 'number' && !Number.isNaN(f)) return Math.round(f);
    return 0;
  }, [result?.intelligence_score?.total_score, result?.final_score]);

  type SourceCardRow = { title: string; meta: string; category: string };

  const sourcesList = useMemo((): SourceCardRow[] => {
    const si = result?.source_integrity;
    const rawSources = si?.sources;
    if (Array.isArray(rawSources) && rawSources.length > 0) {
      return rawSources.map((item, i) => {
        const o = item as Record<string, unknown>;
        const title =
          (typeof o.title === 'string' && o.title) ||
          (typeof o.name === 'string' && o.name) ||
          (typeof o.url === 'string' && o.url) ||
          `Source ${i + 1}`;
        const meta =
          (typeof o.meta === 'string' && o.meta) ||
          (typeof o.note === 'string' && o.note) ||
          (typeof o.description === 'string' && o.description) ||
          '';
        const cat = (typeof o.category === 'string' && o.category) || 'Primary';
        return { title, meta, category: cat };
      });
    }
    const refs = parsedAnswer?.sources_referenced || [];
    return refs.map((s) => ({ title: s, meta: '', category: 'Primary' }));
  }, [result?.source_integrity, parsedAnswer?.sources_referenced]);

  const steelmanData = result?.steelman as any;
  const temporalProfile = result?.temporal_profile as any;
  const dissentReport = result?.dissent_report as any;

  const sourceIntegrityScore = Number(sourceIntegrity?.overall_source_integrity);
  const showSourceIntegrityBar =
    !!sourceIntegrity &&
    ((sourceIntegrity.source_count ?? 0) > 0 ||
      !!sourceIntegrity.summary ||
      (!Number.isNaN(sourceIntegrityScore) && sourceIntegrityScore >= 0));

  const renderAgentHistoryRow = (item: HistoryTask) => {
    const score = item.final_score ?? 0;
    const active = result?.task_id === item.task_id;
    const isMenuOpen = openMenuTaskId === item.task_id;
    const isConfirmingDelete = confirmDeleteTaskId === item.task_id;
    const isEditing = editingTaskId === item.task_id;
    const displayTitle = agentHistoryDisplayTitle(item);
    const scoreBg =
      score >= 80
        ? 'rgba(138,168,153,0.15)'
        : score >= 60
          ? 'rgba(196,149,106,0.12)'
          : 'rgba(229,115,115,0.1)';
    const scoreColor = score >= 80 ? '#5A8A5A' : score >= 60 ? '#B07840' : '#D9534F';

    return (
      <div
        key={item.task_id}
        style={{
          position: 'relative',
          borderRadius: '10px',
          padding: '8px 10px',
          background: active ? '#F0EBE3' : 'transparent',
          borderLeft: active ? '2px solid #C4956A' : '2px solid transparent',
          transition: 'all 150ms ease',
          cursor: isEditing ? 'default' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!active && !isEditing) {
            (e.currentTarget as HTMLDivElement).style.background = '#F0EBE3';
          }
        }}
        onMouseLeave={(e) => {
          if (!active && !isEditing) {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                ref={editInputRef}
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveRenameAgent(item.task_id);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRenameAgent();
                  }
                }}
                onBlur={() => saveRenameAgent(item.task_id)}
                className="w-full bg-white border border-border rounded-md px-2 py-1 text-[13px] text-text-primary outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => void handleHistorySelect(item)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                    fontSize: '13px',
                    color: '#1A1714',
                    fontWeight: 400,
                    lineHeight: '1.35',
                  }}
                >
                  {item.is_live ? (
                    <span
                      aria-hidden
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: '#639922',
                        flexShrink: 0,
                        animation: 'liveDotBlink 2s ease-in-out infinite',
                      }}
                    />
                  ) : null}
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayTitle}
                  </span>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      borderRadius: 999,
                      padding: '1px 7px',
                      background: scoreBg,
                      color: scoreColor,
                    }}
                  >
                    {item.final_score != null ? `${item.final_score}/100` : '—'}
                  </span>
                  <span style={{ fontSize: 10, color: '#C4B8AE' }}>{formatShortDate(item.created_at)}</span>
                </div>
              </button>
            )}
          </div>

          <div
            className="relative shrink-0"
            ref={isMenuOpen || isConfirmingDelete ? menuLayerRef : undefined}
          >
            {!isEditing && (
              <button
                type="button"
                aria-label="History item actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTaskId(null);
                  setEditingValue('');
                  setConfirmDeleteTaskId(null);
                  setOpenMenuTaskId((prev) => (prev === item.task_id ? null : item.task_id));
                }}
                className="flex items-center justify-center"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: isMenuOpen ? '#F0EBE3' : 'transparent',
                  color: '#6B6460',
                  transition: 'all 150ms ease',
                }}
              >
                <Ellipsis className="w-4 h-4" />
              </button>
            )}

            {isMenuOpen && (
              <div
                className="absolute right-0 mt-2"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E0D8D0',
                  borderRadius: '10px',
                  boxShadow: '0 4px 16px rgba(26,23,20,0.08)',
                  padding: '4px',
                  minWidth: '140px',
                  zIndex: 120,
                }}
              >
                <AgentSidebarMenuItem
                  icon={<Pencil className="w-[14px] h-[14px]" />}
                  label="Rename"
                  color="#1A1714"
                  hoverBackground="#F0EBE3"
                  onClick={() => startRenameAgent(item)}
                />
                <AgentSidebarMenuItem
                  icon={<Trash2 className="w-[14px] h-[14px]" />}
                  label="Delete"
                  color="#C0392B"
                  hoverBackground="#FEF2F2"
                  onClick={() => {
                    setOpenMenuTaskId(null);
                    setConfirmDeleteTaskId(item.task_id);
                  }}
                />
              </div>
            )}

            {isConfirmingDelete && (
              <div
                className="absolute right-0 mt-2"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E0D8D0',
                  borderRadius: '10px',
                  boxShadow: '0 4px 16px rgba(26,23,20,0.08)',
                  padding: '10px',
                  minWidth: '160px',
                  zIndex: 120,
                }}
              >
                <p className="text-[13px]" style={{ color: '#1A1714', marginBottom: '10px' }}>
                  Delete this prompt?
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteTaskId(null)}
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      color: '#6B6460',
                      background: '#F0EBE3',
                      transition: 'all 150ms ease',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteHistoryItem(item.task_id)}
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      background: '#C0392B',
                      transition: 'all 150ms ease',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#FAF7F4',
      }}
      data-expertise-level={expertiseLevel}
      data-expertise-domain={expertiseDomain}
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
        @keyframes liveDotBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
.agent-chal-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: agentChalDotPulse 1.2s ease-in-out infinite;
        }
        .answer-text {
          font-size: 15px;
          line-height: 1.82;
          color: #2C1810;
          font-family: Georgia, 'Times New Roman', serif;
          margin-bottom: 8px;
        }
        .answer-text span {
          color: #2C1810;
          transition: color 0.45s ease;
        }
        @media (max-width: 768px) {
          .agent-confidence-legend-rows > div {
            flex-wrap: wrap;
          }
        }
        .agent-follow-shell:focus-within {
          border-color: #c4956a !important;
        }
        .agent-follow-shell input::placeholder {
          color: #c4a882;
        }
        .answer-text.conf-active span.verified {
          color: #2D6A0A;
        }
        .answer-text.conf-active span.supported {
          color: #8B5A00;
        }
        .answer-text.conf-active span.uncertain {
          color: #C0392B;
        }
        .agent-bottom-input-shell {
          border: 0.5px solid #d4c4b0;
          transition: border-color 0.25s ease;
        }
        .agent-bottom-input-shell:focus-within {
          border-color: #c4956a;
        }
        @keyframes agentIdleSuggFadeUp {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .agent-idle-suggestion-text {
          animation: agentIdleSuggFadeUp 0.4s ease forwards;
        }
      `}</style>
      <div
        style={{
          width: sidebarOpen ? 224 : 0,
          minWidth: sidebarOpen ? 224 : 0,
          overflow: 'hidden',
          transition:
            'width 0.32s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
          flexShrink: 0,
        }}
      >
        <aside
          style={{
            width: 224,
            height: '100%',
            minHeight: '100%',
            background: '#F5F2EF',
            borderRight: '0.5px solid #E0D8D0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: isMobile ? 'space-between' : 'flex-start',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#6B6460', cursor: 'pointer' }}
            >
              ← Home
            </button>
            {isMobile ? (
              <button type="button" onClick={closeSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6460' }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            ) : null}
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
              <div className="space-y-1">{taskHistory.map((item) => renderAgentHistoryRow(item))}</div>
            )}
          </div>
          <AgentProfileSidebarRow user={user} />
        </aside>
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
          <header
            style={{
              height: '52px',
              position: 'sticky',
              top: 0,
              zIndex: 100,
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              background: 'rgba(245, 240, 232, 0.72)',
              borderBottom: 'none',
              display: 'flex',
              alignItems: 'center',
              padding: '0 20px',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={isMobile ? openSidebar : toggleSidebar}
              onMouseEnter={() => setNavToggleHovered(true)}
              onMouseLeave={() => setNavToggleHovered(false)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M3 5H15" stroke={navToggleHovered ? '#2C1810' : '#8C7355'} strokeWidth="1.5" strokeLinecap="round" />
                <path d="M3 9H15" stroke={navToggleHovered ? '#2C1810' : '#8C7355'} strokeWidth="1.5" strokeLinecap="round" />
                <path d="M3 13H15" stroke={navToggleHovered ? '#2C1810' : '#8C7355'} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
              <div
                style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4956A' }}
                className="breathe"
              />
              <span className="wordmark-text" style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714' }}>
                Agent
              </span>
            </div>
            {isRunning ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#C4956A' }}>{currentStageLabel}</span>
              </div>
            ) : null}
          </header>

      {toastMessage ? (
        <div style={{ position: 'fixed', top: 64, right: 20, zIndex: 80, background: '#1A1714', color: '#FAF7F4', padding: '10px 14px', borderRadius: 10, fontSize: 12 }}>
          {toastMessage}
        </div>
      ) : null}

      <main
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          boxSizing: 'border-box',
          overflowY: 'auto',
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
            <h1 style={{ fontSize: 28, fontWeight: 400, color: '#1A1714', marginBottom: '0.5rem' }}>Agent</h1>
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

            {!isRunning && !result && (
              <>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 920,
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 'calc(100vh - 52px - 120px)',
                    paddingBottom: 120,
                    paddingTop: 24,
                    paddingLeft: 16,
                    paddingRight: 16,
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: 180,
                      fontWeight: 500,
                      fontStyle: 'italic',
                      color: 'rgba(196, 149, 106, 0.04)',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      zIndex: 0,
                      whiteSpace: 'nowrap',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    think.
                  </div>
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        marginBottom: 14,
                      }}
                    >
                      <div style={{ width: 32, height: '0.5px', background: '#D4C4B0' }} />
                      <span
                        style={{
                          fontSize: 10,
                          letterSpacing: '0.22em',
                          textTransform: 'uppercase',
                          color: '#C4A882',
                          textAlign: 'center',
                        }}
                      >
                        Agent Mode
                      </span>
                      <div style={{ width: 32, height: '0.5px', background: '#D4C4B0' }} />
                    </div>
                    <h1
                      style={{
                        fontSize: 42,
                        fontWeight: 500,
                        color: '#2C1810',
                        textAlign: 'center',
                        lineHeight: 1.1,
                        margin: '0 0 6px',
                        maxWidth: 640,
                      }}
                    >
                      What do you need to{' '}
                      <span style={{ color: '#C4956A', fontStyle: 'italic' }}>truly</span> know?
                    </h1>
                    <p
                      style={{
                        fontSize: 14,
                        color: '#A89070',
                        fontStyle: 'italic',
                        textAlign: 'center',
                        margin: '0 0 14px',
                        maxWidth: 520,
                      }}
                    >
                      Seven stages of reasoning, working for you.
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        justifyContent: 'center',
                        maxWidth: 640,
                      }}
                    >
                      {INPUT_STAGE_PILLS.map((label) => (
                        <div
                          key={label}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 10,
                            letterSpacing: '0.08em',
                            color: '#B8A898',
                            padding: '3px 10px',
                            borderRadius: 10,
                            border: '0.5px solid #E0D5C5',
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: '#D4C4B0',
                              flexShrink: 0,
                            }}
                          />
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 24px 24px',
                    background: 'linear-gradient(to top, rgba(245,240,232,1) 60%, rgba(245,240,232,0) 100%)',
                    zIndex: 50,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ pointerEvents: 'auto', maxWidth: 640, margin: '0 auto' }}>
                    <div style={{ marginBottom: 12 }}>
                      <ExpertiseSelector
                        level={expertiseLevel}
                        domain={expertiseDomain}
                        onChange={handleExpertiseChange}
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: '#C4A882',
                          flexShrink: 0,
                        }}
                        aria-hidden
                      />
                      <span
                        key={suggIdx}
                        role="button"
                        tabIndex={0}
                        className="agent-idle-suggestion-text"
                        onClick={() => {
                          setTask(AGENT_IDLE_SUGGESTIONS[suggIdx]);
                          requestAnimationFrame(() => idleTaskInputRef.current?.focus());
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setTask(AGENT_IDLE_SUGGESTIONS[suggIdx]);
                            requestAnimationFrame(() => idleTaskInputRef.current?.focus());
                          }
                        }}
                        style={{
                          fontSize: 13,
                          color: '#A89070',
                          fontStyle: 'italic',
                          fontFamily: 'Georgia, serif',
                          cursor: 'pointer',
                          textAlign: 'center',
                          maxWidth: 'min(100%, 520px)',
                          lineHeight: 1.35,
                        }}
                      >
                        {AGENT_IDLE_SUGGESTIONS[suggIdx]}
                      </span>
                    </div>
                    <form
                      className="agent-bottom-input-shell"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (task.trim().length >= 10 && !isRunning) void handleRunTask();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        background: '#FDFAF6',
                        borderRadius: 32,
                        padding: '12px 12px 12px 20px',
                      }}
                    >
                      <span
                        className="breathe"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#C4956A',
                          flexShrink: 0,
                        }}
                        aria-hidden
                      />
                      <input
                        ref={idleTaskInputRef}
                        type="text"
                        value={task}
                        disabled={isRunning}
                        placeholder=""
                        onChange={(e) => setTask(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          border: 'none',
                          background: 'transparent',
                          outline: 'none',
                          fontSize: 14,
                          color: '#2C1810',
                          fontFamily: 'Georgia, serif',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={task.trim().length < 10 || isRunning}
                        onMouseEnter={(e) => {
                          if (task.trim().length >= 10 && !isRunning) {
                            e.currentTarget.style.background = '#B07850';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            task.trim().length >= 10 && !isRunning ? '#C4956A' : '#D4C4B0';
                        }}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          border: 'none',
                          cursor: task.trim().length >= 10 && !isRunning ? 'pointer' : 'default',
                          background: task.trim().length >= 10 && !isRunning ? '#C4956A' : '#D4C4B0',
                          transition: 'background 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                        aria-label="Run task"
                      >
                        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <line
                            x1="12"
                            y1="19"
                            x2="12"
                            y2="5"
                            stroke="#FAF7F2"
                            strokeWidth={2}
                            strokeLinecap="round"
                          />
                          <polyline
                            points="5,12 12,5 19,12"
                            fill="none"
                            stroke="#FAF7F2"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}

            {error && (
              <p style={{ color: '#E57373', fontSize: 13, marginTop: '1rem' }}>{error}</p>
            )}

            {isRunning && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '60vh',
                background: '#F5F0E8',
              }}>
                <CalligraphyLoader stage={currentStage} />
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
                    background: AR.SURFACE,
                    border: `0.5px solid ${AR.BORDER}`,
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
                  {unreadLiveCount > 0 && !isRunning ? (
                    <div
                      style={{
                        background: '#EAF3DE',
                        border: '0.5px solid #97C459',
                        borderRadius: 8,
                        padding: '10px 14px',
                        marginBottom: 16,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <svg
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden
                      >
                        <path
                          d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                          stroke="#3B6D11"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span style={{ fontSize: 13, color: '#2C1810', flex: '1 1 140px' }}>
                        {unreadLiveCount} new update{unreadLiveCount === 1 ? '' : 's'} found since you ran this
                      </span>
                      <button
                        type="button"
                        onClick={() => setLiveUpdatesPanelOpen((o) => !o)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: 12,
                          color: '#3B6D11',
                          fontWeight: 500,
                          fontFamily: 'Georgia, serif',
                          textDecoration: 'underline',
                        }}
                      >
                        {liveUpdatesPanelOpen ? 'Hide updates ↑' : 'See updates →'}
                      </button>
                    </div>
                  ) : null}
                  {liveUpdatesPanelOpen && liveUpdatesList.length > 0 && !isRunning ? (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: '12px 14px',
                        background: AR.SURFACE_ALT,
                        border: `0.5px solid ${AR.BORDER}`,
                        borderRadius: 10,
                      }}
                    >
                      {liveUpdatesList.map((u: any, ui: number) => (
                        <div
                          key={String(u?.id ?? ui)}
                          style={{
                            marginBottom: ui < liveUpdatesList.length - 1 ? 12 : 10,
                            paddingBottom: ui < liveUpdatesList.length - 1 ? 12 : 0,
                            borderBottom:
                              ui < liveUpdatesList.length - 1 ? `0.5px solid ${AR.BORDER_INNER}` : 'none',
                          }}
                        >
                          <div style={{ fontSize: 11, color: '#A89070', marginBottom: 6 }}>
                            {formatRelativeShort(String(u?.found_at ?? ''))}
                          </div>
                          <div style={{ fontSize: 13, color: '#4A3728', lineHeight: 1.5 }}>
                            {String(u?.summary ?? '')}
                          </div>
                          {u?.status === 'unread' ? (
                            <button
                              type="button"
                              onClick={() => void markLiveUpdateRead(String(u.id ?? ''))}
                              style={{
                                marginTop: 8,
                                fontSize: 11,
                                color: AR.GOLD,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                textDecoration: 'underline',
                                fontFamily: 'Georgia, serif',
                              }}
                            >
                              Mark as read
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => void markLiveUpdateRead()}
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          color: '#8C7355',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          fontFamily: 'Georgia, serif',
                        }}
                      >
                        Mark all read
                      </button>
                    </div>
                  ) : null}
                  {answerSentences.length > 0 ? (
                    <div className={`answer-text ${confActive ? 'conf-active' : ''}`} style={{ marginBottom: 12 }}>
                      {answerSentences.map((sentence, i) => (
                        <span key={`${i}-${sentence.text.slice(0, 32)}`} className={sentence.confidence}>
                          {sentence.text}{' '}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 15,
                        lineHeight: 1.8,
                        color: '#2C1810',
                        fontFamily: 'Georgia, serif',
                        fontStyle: 'italic',
                        whiteSpace: 'pre-wrap',
                        marginBottom: '24px',
                      }}
                    >
                      {plainAnswerText || result.final_answer || 'No final answer returned.'}
                    </div>
                  )}
                  {Array.isArray(result.contradictions) &&
                    result.contradictions.length > 0 &&
                    (result.contradictions[0] as { claim_new?: string })?.claim_new && (
                      <div
                        style={{
                          background: '#FDF5F0',
                          border: '0.5px solid #E8A898',
                          borderRadius: 10,
                          padding: '16px 18px',
                          marginBottom: 16,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <svg
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden
                          >
                            <path
                              d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                              stroke="#D85A30"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span
                            style={{
                              fontSize: 12,
                              color: '#D85A30',
                              fontWeight: 500,
                            }}
                          >
                            Contradicts your past research
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 8,
                              background: '#FCF0EE',
                              color: '#993C1D',
                            }}
                          >
                            {result.contradictions.length}
                          </span>
                        </div>
                        {result.contradictions.map((raw: any, ci: number) => {
                          const sev = String(raw?.severity || 'nuanced').toLowerCase();
                          const borderLeft =
                            sev === 'direct' ? '#D85A30' : '#BA7517';
                          const tid = String(raw?.task_id_old || '').trim();
                          return (
                            <div
                              key={`pipe-contra-${ci}`}
                              style={{
                                marginTop: 10,
                                background: '#FDFAF6',
                                borderRadius: 8,
                                padding: '12px 14px',
                                borderLeft: `3px solid ${borderLeft}`,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.12em',
                                  color: '#D85A30',
                                  marginBottom: 4,
                                }}
                              >
                                This answer says:
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: '#2C1810',
                                  marginBottom: 10,
                                  lineHeight: 1.45,
                                }}
                              >
                                {String(raw?.claim_new || '')}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.12em',
                                  color: '#8C7355',
                                  marginBottom: 4,
                                }}
                              >
                                You previously found:
                              </div>
                              <div style={{ fontSize: 12, color: '#6B5040', lineHeight: 1.45 }}>
                                {String(raw?.claim_old || '')}
                                {tid ? (
                                  <>
                                    {' '}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const hit = taskHistory.find((t) => t.task_id === tid);
                                        if (hit) void handleHistorySelect(hit);
                                        else
                                          void (async () => {
                                            try {
                                              const data = (await getAgentResult(tid)) as AgentResult;
                                              setResult({ ...data, task_id: data.task_id || tid });
                                              setTask(data.task || '');
                                              setError(null);
                                              setSearchParams({ task_id: tid });
                                            } catch {
                                              setToastMessage('Could not open that task.');
                                            }
                                          })();
                                      }}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        color: '#C4956A',
                                        fontSize: 12,
                                        textDecoration: 'underline',
                                        fontFamily: 'Georgia, serif',
                                      }}
                                    >
                                      {String(raw?.task_title || 'Open past task')}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                              {raw?.resolution_hint ? (
                                <div
                                  style={{
                                    marginTop: 10,
                                    fontSize: 12,
                                    fontStyle: 'italic',
                                    color: '#A89070',
                                    lineHeight: 1.45,
                                  }}
                                >
                                  → {String(raw.resolution_hint)}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  {Array.isArray(result.memory_contradictions) &&
                    result.memory_contradictions.length > 0 && (
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
                            {result.memory_contradictions
                              .map((c: ContradictionItem) => c.summary)
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                      </div>
                    )}
                  {(confidenceLegendStats || sourcesList.length > 0) && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 14,
                        marginBottom: 16,
                        alignItems: 'stretch',
                      }}
                    >
                      <div
                        style={{
                          flex: '1 1 0',
                          minWidth: 260,
                          background: '#FAF7F2',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 10,
                          padding: '14px 16px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: '#C4A882',
                            marginBottom: 10,
                          }}
                        >
                          Confidence
                        </div>
                        {confidenceLegendStats ? (
                          <>
                            <div className="agent-confidence-legend-rows">
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 6,
                                }}
                              >
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#639922',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ fontSize: 12, color: AR.TEXT_MID }}>Verified</span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: AR.TEXT_FAINT,
                                    fontFamily: 'ui-monospace, monospace',
                                    marginLeft: 'auto',
                                  }}
                                >
                                  {confidenceLegendStats.verifiedPct}%
                                </span>
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 6,
                                }}
                              >
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#BA7517',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ fontSize: 12, color: AR.TEXT_MID }}>Supported</span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: AR.TEXT_FAINT,
                                    fontFamily: 'ui-monospace, monospace',
                                    marginLeft: 'auto',
                                  }}
                                >
                                  {confidenceLegendStats.supportedPct}%
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: '#D85A30',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ fontSize: 12, color: AR.TEXT_MID }}>Uncertain</span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: AR.TEXT_FAINT,
                                    fontFamily: 'ui-monospace, monospace',
                                    marginLeft: 'auto',
                                  }}
                                >
                                  {confidenceLegendStats.uncertainPct}%
                                </span>
                              </div>
                            </div>
                            <div
                              style={{
                                marginTop: 8,
                                height: 4,
                                background: '#EDE4D8',
                                borderRadius: 2,
                                overflow: 'hidden',
                                display: 'flex',
                              }}
                            >
                              {confidenceLegendStats.verifiedPct > 0 ? (
                                <div style={{ width: `${confidenceLegendStats.verifiedPct}%`, background: '#639922' }} />
                              ) : null}
                              {confidenceLegendStats.supportedPct > 0 ? (
                                <div style={{ width: `${confidenceLegendStats.supportedPct}%`, background: '#BA7517' }} />
                              ) : null}
                              {confidenceLegendStats.uncertainPct > 0 ? (
                                <div style={{ width: `${confidenceLegendStats.uncertainPct}%`, background: '#D85A30' }} />
                              ) : null}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginTop: 5,
                              }}
                            >
                              <span style={{ fontSize: 10, color: '#A89070' }}>Verified</span>
                              <span style={{ fontSize: 10, color: '#A89070' }}>Supported</span>
                              <span style={{ fontSize: 10, color: '#A89070' }}>Uncertain</span>
                            </div>
                            {answerSentences.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setConfActive((v) => !v)}
                                style={{
                                  marginTop: 12,
                                  fontSize: 11,
                                  color: AR.GOLD,
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontFamily: 'Georgia, serif',
                                  textDecoration: 'underline',
                                  textDecorationStyle: 'dotted',
                                }}
                              >
                                {confActive ? 'Hide highlights in answer' : 'Highlight in answer'}
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <p style={{ fontSize: 12, color: AR.TEXT_MUTED, margin: 0, lineHeight: 1.5 }}>
                            Per-sentence confidence appears when the answer uses structured sentences.
                          </p>
                        )}
                      </div>
                      <div
                        style={{
                          flex: '1 1 0',
                          minWidth: 260,
                          background: '#FAF7F2',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 10,
                          padding: '14px 16px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: '#C4A882',
                            marginBottom: 10,
                          }}
                        >
                          Sources used · {sourcesList.length}
                        </div>
                        {sourcesList.length === 0 ? (
                          <p style={{ fontSize: 12, color: AR.TEXT_MUTED, margin: 0 }}>No sources listed.</p>
                        ) : (
                          <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {(showAllSourcePills ? sourcesList : sourcesList.slice(0, 5)).map((src, si) => {
                                const tag = sourceCategoryTagStyles(src.category);
                                return (
                                  <div
                                    key={`${si}-${src.title.slice(0, 20)}`}
                                    style={{
                                      background: '#F0E8DC',
                                      border: '0.5px solid #D4C4B0',
                                      borderRadius: 12,
                                      padding: '4px 10px',
                                      display: 'flex',
                                      gap: 5,
                                      alignItems: 'center',
                                      transition: 'border-color 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.borderColor = '#C4956A';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.borderColor = '#D4C4B0';
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 9,
                                        color: '#A89070',
                                        fontFamily: 'ui-monospace, monospace',
                                      }}
                                    >
                                      {String(si + 1).padStart(2, '0')}
                                    </span>
                                    <span style={{ fontSize: 11, color: '#4A3728' }}>
                                      {sourceShortName(src.title)}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        background: tag.bg,
                                        color: tag.color,
                                      }}
                                    >
                                      {tag.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            {sourcesList.length > 5 ? (
                              <button
                                type="button"
                                onClick={() => setShowAllSourcePills((v) => !v)}
                                style={{
                                  marginTop: 8,
                                  fontSize: 11,
                                  color: '#C4956A',
                                  cursor: 'pointer',
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  fontFamily: 'Georgia, serif',
                                }}
                              >
                                {showAllSourcePills
                                  ? 'Show less'
                                  : `+${sourcesList.length - 5} more →`}
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {steelmanData?.opposing_position &&
                  String(steelmanData.opposing_position).trim().length > 0 ? (
                    <div
                      style={{
                        background: '#FAF7F2',
                        borderRadius: 10,
                        border: '0.5px solid #E0D5C5',
                        borderLeft: '3px solid #8C7355',
                        marginBottom: 20,
                        padding: '18px 20px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 12,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: '0.16em',
                            textTransform: 'uppercase',
                            color: '#8C7355',
                          }}
                        >
                          THE STEELMAN
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            background: '#F0E8DC',
                            color: '#8C7355',
                            border: '0.5px solid #D4C4B0',
                            padding: '2px 8px',
                            borderRadius: 8,
                          }}
                        >
                          strongest opposing view
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontStyle: 'italic',
                          color: '#2C1810',
                          lineHeight: 1.65,
                          marginBottom: 12,
                          paddingLeft: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 32,
                            color: '#D4C4B0',
                            lineHeight: 0,
                            verticalAlign: '-8px',
                            marginRight: 4,
                            fontFamily: 'Georgia, serif',
                          }}
                          aria-hidden
                        >
                          &ldquo;
                        </span>
                        {String(steelmanData.opposing_position)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSteelmanInnerExpanded((v) => !v)}
                        style={{
                          fontSize: 12,
                          color: '#8C7355',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textDecorationStyle: 'dotted',
                          display: 'inline-block',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontFamily: 'Georgia, serif',
                        }}
                      >
                        {steelmanInnerExpanded ? 'Collapse ↑' : 'See full steelman ↓'}
                      </button>
                      {steelmanInnerExpanded ? (
                        <div style={{ marginTop: 14 }}>
                          {Array.isArray(steelmanData.key_arguments) &&
                          steelmanData.key_arguments.length > 0 ? (
                            <div style={{ marginBottom: 14 }}>
                              <div
                                style={{
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.08em',
                                  color: '#A89070',
                                  marginBottom: 8,
                                }}
                              >
                                Core arguments
                              </div>
                              {steelmanData.key_arguments.slice(0, 3).map((arg: string, ai: number) => (
                                <div key={ai} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                  <span
                                    style={{
                                      width: 5,
                                      height: 5,
                                      borderRadius: '50%',
                                      background: '#C4956A',
                                      flexShrink: 0,
                                      marginTop: 6,
                                    }}
                                  />
                                  <span style={{ fontSize: 13, color: '#4A3728', lineHeight: 1.55 }}>
                                    {arg}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {steelmanData.strongest_evidence ? (
                            <div style={{ marginBottom: 14 }}>
                              <div
                                style={{
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.08em',
                                  color: '#A89070',
                                  marginBottom: 7,
                                }}
                              >
                                Strongest evidence
                              </div>
                              <div
                                style={{
                                  background: '#F5EFE6',
                                  padding: '8px 12px',
                                  borderLeft: '2px solid #C4956A',
                                  fontSize: 13,
                                  color: '#4A3728',
                                  lineHeight: 1.55,
                                }}
                              >
                                {String(steelmanData.strongest_evidence)}
                              </div>
                            </div>
                          ) : null}
                          {steelmanData.concession ? (
                            <div>
                              <div
                                style={{
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.08em',
                                  color: '#A89070',
                                  marginBottom: 7,
                                }}
                              >
                                What it gets right
                              </div>
                              <div style={{ fontSize: 13, color: '#6B4A2A', lineHeight: 1.55 }}>
                                <span style={{ color: '#8C7355' }}>✓ </span>
                                {String(steelmanData.concession)}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {temporalProfile ? (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '10px 16px',
                          background: AR.SURFACE,
                          borderTop: '1px solid #E8DDD0',
                          borderBottom: '1px solid #E8DDD0',
                          marginBottom: 0,
                        }}
                      >
                        {(() => {
                          const dc = String(temporalProfile.decay_class || 'durable').toLowerCase();
                          const cfg = TEMPORAL_DECAY_STYLES[dc] || TEMPORAL_DECAY_STYLES.durable;
                          return (
                            <span
                              style={{
                                padding: '3px 10px',
                                borderRadius: 4,
                                fontSize: 10,
                                letterSpacing: '0.14em',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                background: cfg.bg,
                                color: cfg.text,
                              }}
                            >
                              {cfg.label}
                            </span>
                          );
                        })()}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              color: AR.TEXT_MUTED,
                              fontWeight: 500,
                            }}
                          >
                            {String(temporalProfile.half_life || '—')}
                            {' · '}
                            {String(temporalProfile.decay_reason || '').slice(0, 40)}
                            {String(temporalProfile.decay_reason || '').length > 40 ? '…' : ''}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: AR.TEXT_FAINT,
                              fontStyle: 'italic',
                            }}
                          >
                            {String(temporalProfile.decay_reason || '').length > 40
                              ? String(temporalProfile.decay_reason).slice(40)
                              : ''}
                          </div>
                        </div>
                        {temporalProfile.recheck_by ? (
                          <span style={{ fontSize: 11, color: AR.TEXT_MUTED, whiteSpace: 'nowrap' }}>
                            ◷ Re-check by {String(temporalProfile.recheck_by)}
                          </span>
                        ) : null}
                      </div>
                      {Array.isArray(temporalProfile.time_sensitive_claims) &&
                      temporalProfile.time_sensitive_claims.length > 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 5,
                            padding: '8px 16px 10px',
                            background: AR.SURFACE,
                            borderBottom: '1px solid #E8DDD0',
                            marginBottom: 16,
                          }}
                        >
                          {temporalProfile.time_sensitive_claims.map((c: string, ci: number) => (
                            <span
                              key={ci}
                              style={{
                                fontSize: 11,
                                color: AR.TEXT_MUTED,
                                background: '#F0E8DC',
                                borderRadius: 12,
                                padding: '2px 10px',
                                border: '0.5px solid #DDD0BC',
                              }}
                            >
                              <span style={{ fontSize: 10, color: AR.GOLD }}>⚑ </span>
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div style={{ marginBottom: 16 }} />
                      )}
                    </>
                  ) : null}
                  {showSourceIntegrityBar ? (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          margin: '28px 0 16px',
                        }}
                      >
                        <div style={{ flex: 1, height: 0.5, background: AR.BORDER }} />
                        <span
                          style={{
                            fontSize: 10,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: AR.GOLD_MUTED,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Source integrity
                        </span>
                        <div style={{ flex: 1, height: 0.5, background: AR.BORDER }} />
                      </div>
                      <div
                        style={{
                          background: AR.SURFACE,
                          border: `0.5px solid ${AR.BORDER}`,
                          borderRadius: 8,
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          marginBottom: 16,
                        }}
                      >
                        {(() => {
                          const sc = Number(sourceIntegrity?.overall_source_integrity) || 0;
                          const pct = Math.min(100, Math.max(0, sc));
                          const fill =
                            sc < 50 ? '#D85A30' : sc < 75 ? '#BA7517' : '#639922';
                          const tierLabel = sc >= 75 ? 'High' : sc >= 50 ? 'Medium' : 'Low';
                          const tierColor = sc >= 75 ? '#3B6D11' : sc >= 50 ? '#854F0B' : '#993C1D';
                          return (
                            <>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    height: 5,
                                    background: AR.BORDER_INNER,
                                    borderRadius: 3,
                                    overflow: 'hidden',
                                    marginBottom: 6,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${pct}%`,
                                      height: '100%',
                                      background: fill,
                                      transition: 'width 0.5s ease',
                                    }}
                                  />
                                </div>
                                <div style={{ fontSize: 12, color: AR.TEXT_MID }}>
                                  {sourceIntegrity?.summary ||
                                    'Sources assessed for consistency and credibility.'}
                                </div>
                              </div>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  whiteSpace: 'nowrap',
                                  color: tierColor,
                                }}
                              >
                                {tierLabel}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </>
                  ) : null}
                  {intelligenceScore ? (
                    <div
                      style={{
                        background: AR.SURFACE,
                        border: `0.5px solid ${AR.BORDER}`,
                        borderRadius: 10,
                        overflow: 'hidden',
                        marginBottom: 16,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setPanelIntelOpen((o) => !o)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '11px 16px',
                          cursor: 'pointer',
                          transition: 'background 0.12s',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          font: 'inherit',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F5EFE6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: '0.16em',
                              textTransform: 'uppercase',
                              color: AR.TEXT_MUTED,
                            }}
                          >
                            Intelligence score
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 8px',
                              borderRadius: 8,
                              border: '0.5px solid #D4C4B0',
                              color: AR.TEXT_MUTED,
                              background: '#F0E8DC',
                            }}
                          >
                            {Number(intelligenceScore.total_score || 0)} / 100
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: AR.GOLD_MUTED,
                            transform: panelIntelOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.25s',
                          }}
                        >
                          ▾
                        </span>
                      </button>
                      <div
                        style={{
                          maxHeight: panelIntelOpen ? 1000 : 0,
                          overflow: 'hidden',
                          transition: 'max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                          borderTop: panelIntelOpen ? `0.5px solid ${AR.BORDER_INNER}` : 'none',
                        }}
                      >
                        <div style={{ padding: '14px 16px' }}>
                          {(() => {
                            const total = Number(intelligenceScore.total_score || 0);
                            return (
                              <>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'auto 1fr',
                                    gridTemplateRows: 'auto auto',
                                    gap: '12px 20px',
                                    alignItems: 'center',
                                  }}
                                >
                                  <div
                                    style={{
                                      gridRow: '1 / 3',
                                      gridColumn: 1,
                                      fontSize: 42,
                                      color: AR.TEXT_PRIMARY,
                                      fontWeight: 500,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {total}
                                  </div>
                                  <span
                                    style={{
                                      gridRow: 1,
                                      gridColumn: 2,
                                      fontSize: 11,
                                      letterSpacing: '0.10em',
                                      textTransform: 'uppercase',
                                      color: AR.TEXT_FAINT,
                                      alignSelf: 'end',
                                    }}
                                  >
                                    {intelligenceLabelFromTotal(total)}
                                  </span>
                                  {intelligenceScore.one_line_verdict ? (
                                    <span
                                      style={{
                                        gridRow: 2,
                                        gridColumn: 2,
                                        fontSize: 13,
                                        color: AR.TEXT_MUTED,
                                        fontStyle: 'italic',
                                        alignSelf: 'start',
                                      }}
                                    >
                                      {intelligenceScore.one_line_verdict}
                                    </span>
                                  ) : (
                                    <span style={{ gridRow: 2, gridColumn: 2 }} />
                                  )}
                                </div>
                                <div style={{ marginTop: 14 }}>
                                  {intelligenceRows.map((row) => {
                                    const value = Number(row.data?.score || 0);
                                    return (
                                      <div
                                        key={row.key}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 10,
                                          marginBottom: 6,
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: 11,
                                            color: AR.TEXT_MUTED,
                                            width: 120,
                                            flexShrink: 0,
                                          }}
                                        >
                                          {row.label}
                                        </span>
                                        <div
                                          style={{
                                            flex: 1,
                                            height: 4,
                                            background: AR.BORDER_INNER,
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                          }}
                                        >
                                          <div
                                            style={{
                                              width: `${Math.max(0, Math.min(100, (value / 25) * 100))}%`,
                                              height: 4,
                                              background: AR.GOLD,
                                              transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                                            }}
                                          />
                                        </div>
                                        <span
                                          style={{
                                            fontSize: 11,
                                            color: AR.TEXT_FAINT,
                                            fontFamily: 'ui-monospace, monospace',
                                            width: 28,
                                            textAlign: 'right',
                                            flexShrink: 0,
                                          }}
                                        >
                                          {value}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {hasRefinementMetadataNote ? (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: AR.TEXT_FAINT,
                                      fontStyle: 'italic',
                                      display: 'block',
                                      marginTop: 8,
                                    }}
                                  >
                                    Updated after refinement
                                  </span>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {assumptions ? (
                    <div
                      style={{
                        background: AR.SURFACE,
                        border: `0.5px solid ${AR.BORDER}`,
                        borderRadius: 10,
                        overflow: 'hidden',
                        marginBottom: 16,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setPanelAssumptionsOpen((o) => !o)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '11px 16px',
                          cursor: 'pointer',
                          transition: 'background 0.12s',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          font: 'inherit',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F5EFE6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: '0.16em',
                              textTransform: 'uppercase',
                              color: AR.TEXT_MUTED,
                            }}
                          >
                            This answer assumes
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 8px',
                              borderRadius: 8,
                              border: '0.5px solid #D4C4B0',
                              color: AR.TEXT_MUTED,
                              background: '#F0E8DC',
                            }}
                          >
                            {assumptions.assumption_count || assumptions.assumptions?.length || 0} assumptions
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: AR.GOLD_MUTED,
                            transform: panelAssumptionsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.25s',
                          }}
                        >
                          ▾
                        </span>
                      </button>
                      <div
                        style={{
                          maxHeight: panelAssumptionsOpen ? 1000 : 0,
                          overflow: 'hidden',
                          transition: 'max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                          borderTop: panelAssumptionsOpen ? `0.5px solid ${AR.BORDER_INNER}` : 'none',
                        }}
                      >
                        <div style={{ padding: '14px 16px' }}>
                          {assumptions.summary ? (
                            <p
                              style={{
                                fontSize: 13,
                                color: AR.TEXT_FAINT,
                                fontStyle: 'italic',
                                marginTop: 0,
                                marginBottom: 12,
                                lineHeight: 1.5,
                              }}
                            >
                              {assumptions.summary}
                            </p>
                          ) : null}
                          {visibleAssumptions.map((assumption, idx) => {
                            const criticality = (assumption.criticality || 'medium').toLowerCase();
                            const critBadge =
                              criticality === 'high'
                                ? {
                                    bg: '#FCF0EE',
                                    color: '#993C1D',
                                    border: '0.5px solid #F0997B',
                                    label: 'HIGH',
                                  }
                                : criticality === 'low'
                                  ? {
                                      bg: '#F5F5F0',
                                      color: '#5F5E5A',
                                      border: '0.5px solid #D3D1C7',
                                      label: 'LOW',
                                    }
                                  : {
                                      bg: '#FDF6EC',
                                      color: '#854F0B',
                                      border: '0.5px solid #E8C87A',
                                      label: 'MEDIUM',
                                    };
                            return (
                              <div
                                key={`${assumption.assumption || 'assumption'}-${idx}`}
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  marginBottom: 10,
                                  padding: '10px 13px',
                                  background: AR.SURFACE_ALT,
                                  borderRadius: assumption.flag ? 0 : 6,
                                  border: `0.5px solid ${AR.BORDER_INNER}`,
                                  borderLeft: assumption.flag ? `3px solid ${AR.GOLD}` : undefined,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: 9,
                                      letterSpacing: '0.10em',
                                      textTransform: 'uppercase',
                                      padding: '1px 7px',
                                      borderRadius: 8,
                                      display: 'inline-block',
                                      marginBottom: 4,
                                      background: critBadge.bg,
                                      color: critBadge.color,
                                      border: critBadge.border,
                                    }}
                                  >
                                    {critBadge.label}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 13,
                                      color: AR.TEXT_PRIMARY,
                                      lineHeight: 1.5,
                                      marginBottom: 4,
                                    }}
                                  >
                                    {assumption.assumption}
                                  </div>
                                  {assumption.if_wrong ? (
                                    <div style={{ fontSize: 11, color: '#C0392B' }}>
                                      <span style={{ color: AR.TEXT_MUTED }}>If wrong: </span>
                                      {assumption.if_wrong}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          {hiddenAssumptionCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setShowAllAssumptions((current) => !current)}
                              style={{
                                marginTop: 4,
                                fontSize: 11,
                                color: AR.GOLD,
                                cursor: 'pointer',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                letterSpacing: '0.06em',
                              }}
                            >
                              {showAllAssumptions ? 'Show less ↑' : `Show all (${hiddenAssumptionCount} more) ↓`}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {dissentReport?.positions?.length > 0 ? (
                    <div
                      style={{
                        background: AR.SURFACE,
                        border: `0.5px solid ${AR.BORDER}`,
                        borderRadius: 10,
                        overflow: 'hidden',
                        marginBottom: 16,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setPanelDissentOpen((o) => !o)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '11px 16px',
                          cursor: 'pointer',
                          transition: 'background 0.12s',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          font: 'inherit',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F5EFE6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: '0.16em',
                              textTransform: 'uppercase',
                              color: AR.TEXT_MUTED,
                            }}
                          >
                            Minority report
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: '2px 8px',
                              borderRadius: 8,
                              border: '0.5px solid #D4C4B0',
                              color: AR.TEXT_MUTED,
                              background: '#F0E8DC',
                            }}
                          >
                            dissent
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: AR.GOLD_MUTED,
                            transform: panelDissentOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.25s',
                          }}
                        >
                          ▾
                        </span>
                      </button>
                      <div
                        style={{
                          maxHeight: panelDissentOpen ? 1000 : 0,
                          overflow: 'hidden',
                          transition: 'max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                          borderTop: panelDissentOpen ? `0.5px solid ${AR.BORDER_INNER}` : 'none',
                        }}
                      >
                        <div style={{ padding: '14px 16px' }}>
                          {dissentReport.minority_view_summary ? (
                            <p
                              style={{
                                fontSize: 13,
                                color: AR.TEXT_FAINT,
                                fontStyle: 'italic',
                                marginTop: 0,
                                marginBottom: 12,
                              }}
                            >
                              {String(dissentReport.minority_view_summary)}
                            </p>
                          ) : null}
                          {dissentReport.positions.map((pos: any, pi: number) => {
                            const str = String(pos.strength || 'moderate').toLowerCase();
                            const border =
                              str === 'strong'
                                ? AR.GOLD
                                : str === 'weak'
                                  ? '#B8A898'
                                  : AR.TEXT_MUTED;
                            const strColor =
                              str === 'strong' ? AR.GOLD : str === 'weak' ? '#B8A898' : AR.TEXT_MUTED;
                            const impact = Number(pos.confidence_impact ?? 0);
                            const impactColor = Math.abs(impact) >= 15 ? '#C0392B' : '#BA7517';
                            return (
                              <div
                                key={pi}
                                style={{
                                  padding: '12px 14px',
                                  background: AR.SURFACE_ALT,
                                  borderRadius: 6,
                                  marginBottom: 10,
                                  borderLeft: `3px solid ${border}`,
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 13,
                                    color: AR.TEXT_PRIMARY,
                                    lineHeight: 1.55,
                                    marginBottom: 7,
                                  }}
                                >
                                  {String(pos.claim || pos.position || '')}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 14,
                                    alignItems: 'baseline',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 10,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.12em',
                                      color: strColor,
                                    }}
                                  >
                                    {str}
                                  </span>
                                  {pos.why_excluded ? (
                                    <span style={{ fontSize: 12, color: AR.TEXT_FAINT }}>
                                      <span style={{ color: AR.TEXT_MUTED }}>Excluded: </span>
                                      {String(pos.why_excluded)}
                                    </span>
                                  ) : null}
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontFamily: 'ui-monospace, monospace',
                                      color: impactColor,
                                    }}
                                  >
                                    −{Math.abs(Math.round(impact))} pts
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <AnalyticalCaveatsSection caveats={structuredCaveats} />
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginTop: 4,
                      paddingTop: 20,
                      borderTop: `0.5px solid ${AR.BORDER_INNER}`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(plainAnswerText);
                      }}
                      style={{
                        padding: '9px 18px',
                        border: '0.5px solid #D4C4B0',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'Georgia, serif',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = AR.GOLD;
                        e.currentTarget.style.color = AR.GOLD;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#D4C4B0';
                        e.currentTarget.style.color = '#6B5040';
                      }}
                    >
                      Copy answer
                    </button>
                    <button
                      type="button"
                      onClick={runAgainWithSameQuestion}
                      style={{
                        padding: '9px 18px',
                        border: '0.5px solid #D4C4B0',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'Georgia, serif',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = AR.GOLD;
                        e.currentTarget.style.color = AR.GOLD;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#D4C4B0';
                        e.currentTarget.style.color = '#6B5040';
                      }}
                    >
                      Run again
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRedirectIntent('/arena');
                        navigate('/app', {
                          state: {
                            agentStressPrompt: plainAnswerText,
                            fromAgent: true,
                          },
                        });
                      }}
                      style={{
                        padding: '9px 18px',
                        border: `0.5px solid ${AR.GOLD}`,
                        borderRadius: 6,
                        background: '#FAF3EA',
                        color: AR.GOLD,
                        fontSize: 13,
                        fontFamily: 'Georgia, serif',
                        cursor: 'pointer',
                      }}
                    >
                      Stress test in Arena →
                    </button>
                    {result.task_id && result.memory_saved ? (
                      <button
                        type="button"
                        disabled={liveToggleBusy}
                        onClick={() => void handleToggleLive()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '9px 14px',
                          border: result.is_live ? '0.5px solid #5A8C6A' : '0.5px solid #D4C4B0',
                          borderRadius: 6,
                          background: result.is_live ? '#EAF3DE' : 'transparent',
                          color: result.is_live ? '#3B6D11' : '#6B5040',
                          fontSize: 13,
                          fontFamily: 'Georgia, serif',
                          cursor: liveToggleBusy ? 'default' : 'pointer',
                          opacity: liveToggleBusy ? 0.7 : 1,
                        }}
                      >
                        {result.is_live ? (
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 006.95 0M12 20h.01"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path
                              d="M17 21H7a2 2 0 01-2-2v-6a2 2 0 012-2h10a2 2 0 012 2v6a2 2 0 01-2 2zM12 3v4M8.5 7h7"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path d="M3 3l18 18" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                          </svg>
                        )}
                        {result.is_live ? 'Live thread' : 'Make it live'}
                      </button>
                    ) : null}
                  </div>
                  {result.is_live && !isRunning ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        alignItems: 'center',
                        marginTop: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: '#639922',
                          animation: 'liveDotBlink 2s ease-in-out infinite',
                        }}
                      />
                      <span style={{ fontSize: 11, color: '#8C7355' }}>
                        Checking for updates every 24h
                      </span>
                      <span style={{ fontSize: 11, color: '#A89070' }}>
                        Last checked: {formatRelativeShort(result.live_last_checked)}
                      </span>
                    </div>
                  ) : null}
                  {result.status === 'complete' &&
                  !isRunning &&
                  result.task_id &&
                  user?.email ? (
                    <div style={{ marginTop: 16, marginBottom: 8 }}>
                      {!ratingResult?.verdict && userRating === null ? (
                        <>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#8C7355',
                              fontStyle: 'italic',
                              marginBottom: 10,
                            }}
                          >
                            How confident are you in this answer?
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                title={CALIBRATION_LEVEL_TITLES[n]}
                                disabled={ratingSubmitBusy}
                                onClick={() => void handleCalibrationRateClick(n)}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  border:
                                    userRating === n
                                      ? '0.5px solid #C4956A'
                                      : '0.5px solid #D4C4B0',
                                  background: userRating === n ? '#C4956A' : 'transparent',
                                  color: userRating === n ? '#FAF7F2' : '#8C7355',
                                  fontSize: 12,
                                  cursor: ratingSubmitBusy ? 'default' : 'pointer',
                                  fontFamily: 'Georgia, serif',
                                }}
                                onMouseEnter={(e) => {
                                  if (userRating === n || ratingSubmitBusy) return;
                                  e.currentTarget.style.borderColor = '#C4956A';
                                }}
                                onMouseLeave={(e) => {
                                  if (userRating === n) return;
                                  e.currentTarget.style.borderColor = '#D4C4B0';
                                }}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : null}
                      {ratingResult?.verdict ? (
                        <div
                          style={{
                            background:
                              Math.abs(Number(ratingResult.delta ?? 0)) <= 10
                                ? '#EAF3DE'
                                : Number(ratingResult.delta ?? 0) > 10
                                  ? '#FDF6EC'
                                  : '#FCF0EE',
                            borderRadius: 8,
                            padding: '12px 16px',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#2C1810', marginBottom: 8 }}>
                            {String(ratingResult.verdict)}
                          </div>
                          <div style={{ fontSize: 12, color: '#6B5040', marginBottom: 6 }}>
                            Your rating: {Number(ratingResult.user_rating ?? userRating ?? 0)}/5 · System score:{' '}
                            {Number(ratingResult.system_score ?? intelligenceTotal)}/100
                          </div>
                          {ratingResult.calibration_stats ? (
                            <div style={{ fontSize: 12, color: '#8C7355', fontStyle: 'italic' }}>
                              Avg. calibration gap:{' '}
                              {Number(
                                (ratingResult.calibration_stats as { avg_delta?: number }).avg_delta ?? 0,
                              ).toFixed(1)}{' '}
                              (positive = you tend to underestimate)
                            </div>
                          ) : null}
                          {ratingResult.calibration_stats ? (
                            <>
                              <div style={{ marginTop: 12, fontSize: 11, color: '#8C7355' }}>
                                Your calibration score:{' '}
                                <strong style={{ color: '#2C1810' }}>
                                  {Number(
                                    (ratingResult.calibration_stats as { calibration_score?: number })
                                      ?.calibration_score ?? 0,
                                  )}
                                  /100
                                </strong>
                              </div>
                              <div
                                style={{
                                  height: 6,
                                  background: '#EDE4D8',
                                  borderRadius: 3,
                                  marginTop: 6,
                                  maxWidth: 280,
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(
                                      100,
                                      Number(
                                        (ratingResult.calibration_stats as { calibration_score?: number })
                                          ?.calibration_score ?? 0,
                                      ),
                                    )}%`,
                                    background: '#C4956A',
                                    borderRadius: 3,
                                  }}
                                />
                              </div>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              if (profileModalOpen) setActiveTab('usage');
                              else openModal('top-right', 'usage');
                            }}
                            style={{
                              marginTop: 10,
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              fontSize: 12,
                              color: '#C4956A',
                              fontFamily: 'Georgia, serif',
                              textDecoration: 'underline',
                            }}
                          >
                            See your calibration history →
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {result.insight_report &&
                    taskHistory.length >= 3 &&
                    (() => {
                      const ir = result.insight_report as Record<string, unknown>;
                      const patterns = Array.isArray(ir.patterns)
                        ? (ir.patterns as unknown[]).map((p) => String(p))
                        : [];
                      const blind = Array.isArray(ir.blind_spots)
                        ? (ir.blind_spots as unknown[]).map((b) => String(b))
                        : [];
                      const evolution = String(ir.evolution || '');
                      const synthesis = String(ir.synthesis || '');
                      return (
                        <div
                          style={{
                            background: '#FAF7F2',
                            border: '0.5px solid #E0D5C5',
                            borderRadius: 10,
                            marginBottom: 20,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              background: '#2C1810',
                              padding: '13px 20px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                letterSpacing: '0.16em',
                                textTransform: 'uppercase',
                                color: '#C4956A',
                              }}
                            >
                              Across your research
                            </span>
                          </div>
                          <div style={{ padding: '16px 18px 18px' }}>
                            <div
                              style={{
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: '0.12em',
                                color: '#A89070',
                                marginBottom: 8,
                              }}
                            >
                              Recurring themes
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 6,
                              }}
                            >
                              {patterns
                                .filter((p) => p.trim())
                                .map((p, pi) => (
                                  <span
                                    key={`ip-${pi}-${p.slice(0, 24)}`}
                                    style={{
                                      background: '#F0E8DC',
                                      border: '0.5px solid #D4C4B0',
                                      borderRadius: 12,
                                      fontSize: 12,
                                      color: '#4A3728',
                                      padding: '4px 12px',
                                    }}
                                  >
                                    {p}
                                  </span>
                                ))}
                            </div>
                            <div style={{ marginTop: 12 }}>
                              <div
                                style={{
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.12em',
                                  color: '#A89070',
                                  marginBottom: 6,
                                }}
                              >
                                How your thinking is shifting
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontStyle: 'italic',
                                  color: '#8C7355',
                                  lineHeight: 1.5,
                                }}
                              >
                                {evolution || '—'}
                              </div>
                            </div>
                            <div style={{ marginTop: 12 }}>
                              <div
                                style={{
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.12em',
                                  color: '#A89070',
                                  marginBottom: 8,
                                }}
                              >
                                Angles you haven&apos;t explored
                              </div>
                              {blind
                                .filter((b) => b.trim())
                                .map((b, bi) => (
                                  <div
                                    key={`ib-${bi}-${b.slice(0, 24)}`}
                                    style={{
                                      fontSize: 12,
                                      color: '#C0392B',
                                      marginBottom: 4,
                                      lineHeight: 1.45,
                                    }}
                                  >
                                    → {b}
                                  </div>
                                ))}
                            </div>
                            {synthesis ? (
                              <div
                                style={{
                                  marginTop: 12,
                                  fontSize: 13,
                                  color: '#4A3728',
                                  lineHeight: 1.55,
                                }}
                              >
                                {synthesis}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginTop: 28,
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
                        onClick={() => {
                          setFollowUp(s);
                          requestAnimationFrame(() => followUpInputRef.current?.focus());
                        }}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 20,
                          border: '0.5px solid #D4C4B0',
                          background: 'transparent',
                          color: '#6B5040',
                          fontSize: 13,
                          fontFamily: 'Georgia, serif',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = AR.GOLD;
                          e.currentTarget.style.color = AR.GOLD;
                          e.currentTarget.style.background = '#FAF3EA';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#D4C4B0';
                          e.currentTarget.style.color = '#6B5040';
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {result?.task_id &&
                  (result.refinement_count ?? 0) < 10 &&
                  (result.final_answer || result.stages) &&
                  (!isRunning || isRefining) ? (
                    <div style={{ marginBottom: 20 }}>
                      {!isRefining ? (
                        <div
                          className="agent-follow-shell"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            border: '0.5px solid #D4C4B0',
                            borderRadius: 12,
                            padding: '12px 16px',
                            background: AR.SURFACE_ALT,
                            transition: 'border-color 0.2s',
                            marginBottom: 8,
                          }}
                        >
                          <input
                            ref={followUpInputRef}
                            type="text"
                            value={followUp}
                            onChange={(e) => setFollowUp(e.target.value.slice(0, 1000))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleRefine();
                              }
                            }}
                            placeholder="Ask a follow-up, request more depth, challenge an assumption..."
                            disabled={isRefining}
                            style={{
                              flex: 1,
                              border: 'none',
                              background: 'transparent',
                              outline: 'none',
                              fontSize: 14,
                              color: AR.TEXT_PRIMARY,
                              fontFamily: 'Georgia, serif',
                            }}
                          />
                          <button
                            type="button"
                            disabled={!followUp.trim() || isRefining}
                            onClick={() => void handleRefine()}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              border: 'none',
                              background: followUp.trim() ? AR.GOLD : '#E8DDD0',
                              transition: 'background 0.2s, cursor 0.2s',
                              cursor: followUp.trim() ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isRefining ? (
                              <span
                                style={{
                                  width: 14,
                                  height: 14,
                                  border: '2px solid #F0EBE3',
                                  borderTopColor: AR.GOLD,
                                  borderRadius: '50%',
                                  animation: 'agentSpin 0.9s linear infinite',
                                  display: 'inline-block',
                                }}
                              />
                            ) : (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden
                              >
                                <path
                                  d="M5 12h14M13 6l6 6-6 6"
                                  stroke={followUp.trim() ? AR.SURFACE : '#B8A898'}
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: AR.TEXT_MUTED, marginBottom: 0 }}>
                          Refining your answer...
                        </p>
                      )}
                      {refinementError ? (
                        <p style={{ color: '#E57373', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                          {refinementError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                <div
                  aria-expanded={challengesVisible || challenges.length > 0 || isChallengingAnswer}
                  style={{ marginTop: 0 }}
                >
                  {!isChallengingAnswer && challenges.length === 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleChallengeAnswer()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '9px 18px',
                          border: '0.5px solid #D4C4B0',
                          borderRadius: 20,
                          background: 'transparent',
                          color: '#6B5040',
                          fontSize: 13,
                          fontFamily: 'Georgia, serif',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = AR.GOLD;
                          e.currentTarget.style.color = AR.GOLD;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#D4C4B0';
                          e.currentTarget.style.color = '#6B5040';
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                        Challenge this answer
                      </button>
                      <p style={{ fontSize: 12, color: AR.TEXT_FAINT, marginTop: 4, marginBottom: 0 }}>
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

                {(result?.refinement_count ?? 0) >= 10 &&
                  (result?.final_answer || result?.stages) &&
                  !isRunning && (
                    <p
                      style={{
                        fontSize: 12,
                        color: AR.TEXT_MUTED,
                        textAlign: 'center',
                        marginTop: '1.5rem',
                      }}
                    >
                      Maximum refinements reached. Start a new task to continue.
                    </p>
                  )}
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
