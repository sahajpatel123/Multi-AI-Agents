import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Copy, Ellipsis, Lock, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { AnalyticalCaveatsSection, type StructuredCaveat } from '../components/AgentCaveatGrid';
import { AgentAnswerMarkdown } from '../components/AgentAnswerMarkdown';
import { Button } from '../components/Button';
import { HighlightQuery } from '../components/HighlightQuery';
import { Icons } from '../components/Icons';
import { CalligraphyLoader } from '../components/CalligraphyLoader';
import MicroLoader from '../components/MicroLoader';
import { RazorpayCheckout } from '../components/RazorpayCheckout';
import { TemplatesModal } from '../components/TemplatesModal';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  LocalExecutionRequiredError,
  addRoomTask,
  agentDetailMessage,
  challengeAgentAnswer,
  createRoom,
  crossPollinateAgentAnswer,
  deleteAgentTask,
  exportAgentTaskPdf,
  exportOrchestrationPdf,
  getAgentHistory,
  getMyRooms,
  getAgentWatchlist,
  getAgentOrchestration,
  getAgentRebuttal,
  getAgentResult,
  getAgentSavedTask,
  getAgentStatus,
  getAgentTaskAnswerFeedback,
  getAgentTemplates,
  getMcpIntegrations,
  getCalibrationRatingForTask,
  getCalibrationStats,
  markAgentLiveUpdatesRead,
  postAgentOrchestrate,
  postAgentWatchlist,
  postAgentTaskAnswerFeedback,
  postCalibrationRate,
  refineAgentAnswer,
  renameAgentTask,
  runAgentTask,
  recordConduraHandoff,
  saveConduraHandoffDraft,
  uploadAgentFile,
  toggleAgentTaskLive,
  type AgentChallengeItem,
  type AgentTaskTemplate,
  type TaskAnswerFeedback,
} from '../api';
import { ConduraInstallCTA } from '../components/ConduraInstallCTA';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
import { TemporalEvolutionPanel } from '../components/TemporalEvolutionPanel';
import { buildHandoffPayload } from '../lib/conduraHandoff';
import { dispatchHandoff, pairDevice, ConduraClientError } from '../lib/conduraClient';
import { getOrCreateSigningKey, rotateSigningKey } from '../lib/conduraHandoffCrypto';
import type { HandoffPayload } from '../types/condura';
import { usePanel } from '../context/PanelContext';
import { useTier } from '../context/TierContext';
import { useProfileModal } from '../context/ProfileModalContext';
import { useAuth } from '../hooks/useAuth';
import { useBusyDocumentTitle } from '../hooks/useBusyDocumentTitle';
import { useBusyNavigationGuard } from '../hooks/useBusyNavigationGuard';
import { agentWorkInFlight } from '../lib/busyNavigationGuard';
import { titleForAgentBusy } from '../lib/documentTitle';
import {
  formatHistoryConfidenceBadge,
  formatHistoryRowRelative,
  historyItemCopyText,
  historyItemRerunText,
  historyRowTimeTitle,
} from '../lib/agentHistoryRow';
import { isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';
import { User } from '../types';
// setRedirectIntent is unused but kept for future use
import {
  clearDismissedAgentChips,
  dismissAgentChip,
  loadDismissedAgentChipIds,
  pickRecentAgentChips,
} from '../lib/agentRecentChips';
import {
  AGENT_REFINE_MAX_CHARS,
  AGENT_TASK_MAX_CHARS,
  agentMinLengthHint,
  charBudgetLabel,
  charBudgetTone,
  clampToMax,
} from '../lib/charBudget';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { formatAgentAnswerExport } from '../lib/agentAnswerExport';
import { formatAgentHistoryExport } from '../lib/agentHistoryExport';
import {
  AGENT_HISTORY_SORT_OPTIONS,
  agentHistorySortLabel,
  sortAgentHistoryItems,
  type AgentHistorySort,
} from '../lib/agentHistorySort';
import {
  AGENT_HISTORY_STATUS_OPTIONS,
  agentHistoryStatusLabel,
  filterAgentHistoryByStatus,
  type AgentHistoryStatusFilter,
} from '../lib/agentHistoryStatusFilter';
import {
  AGENT_HISTORY_FEEDBACK_OPTIONS,
  agentHistoryFeedbackFilterUseful,
  agentHistoryFeedbackLabel,
  filterAgentHistoryByFeedback,
  type AgentHistoryFeedbackFilter,
} from '../lib/agentHistoryFeedbackFilter';
import {
  AGENT_HISTORY_RECENCY_OPTIONS,
  agentHistoryRecencyFilterUseful,
  agentHistoryRecencyLabel,
  filterAgentHistoryByRecency,
  type AgentHistoryRecencyFilter,
} from '../lib/agentHistoryRecencyFilter';
import {
  AGENT_HISTORY_CONFIDENCE_OPTIONS,
  agentHistoryConfidenceFilterUseful,
  agentHistoryConfidenceLabel,
  filterAgentHistoryByConfidence,
  type AgentHistoryConfidenceFilter,
} from '../lib/agentHistoryConfidenceFilter';
import {
  AGENT_HISTORY_SCORE_OPTIONS,
  agentHistoryScoreFilterUseful,
  agentHistoryScoreLabel,
  filterAgentHistoryByScore,
  type AgentHistoryScoreFilter,
} from '../lib/agentHistoryScoreFilter';
import {
  AGENT_HISTORY_TOPIC_ALL,
  agentHistoryTopicFilterUseful,
  agentHistoryTopicLabel,
  collectHistoryTopicOptions,
  filterAgentHistoryByTopic,
  type AgentHistoryTopicFilter,
} from '../lib/agentHistoryTopicFilter';
import {
  AGENT_ROOMS_ACTIVITY_OPTIONS,
  agentRoomsActivityLabel,
  filterAgentRoomsByActivity,
  roomNeedsAttention,
  type AgentRoomsActivityFilter,
} from '../lib/agentRoomsActivityFilter';
import {
  AGENT_ROOMS_OCCUPANCY_OPTIONS,
  agentRoomsOccupancyFilterUseful,
  agentRoomsOccupancyLabel,
  filterAgentRoomsByOccupancy,
  type AgentRoomsOccupancyFilter,
} from '../lib/agentRoomsOccupancyFilter';
import {
  AGENT_ROOMS_MEMBERSHIP_OPTIONS,
  agentRoomsMembershipFilterUseful,
  agentRoomsMembershipLabel,
  filterAgentRoomsByMembership,
  type AgentRoomsMembershipFilter,
} from '../lib/agentRoomsMembershipFilter';
import { formatAgentRoomsExport } from '../lib/agentRoomsExport';
import {
  formatAgentRoomMetaLine,
  roomActivityTitle,
  roomInviteUrl,
} from '../lib/agentRoomsRow';
import {
  AGENT_ROOMS_SORT_OPTIONS,
  agentRoomsSortLabel,
  sortAgentRooms,
  type AgentRoomsSort,
} from '../lib/agentRoomsSort';
import {
  AGENT_TASK_TITLE_MAX,
  agentTaskRenameCaughtErrorMessage,
  agentTaskRenameIssueMessage,
  validateAgentTaskTitle,
} from '../lib/agentTaskRename';
import { agentToastAriaLive, agentToastKind, agentToastRole } from '../lib/agentToast';
import { motionDuration } from '../lib/motion';
import {
  clearPromptDraft,
  loadPromptDraft,
  savePromptDraft,
} from '../lib/promptDraft';
import {
  roomCreateButtonLabel,
  roomCreateCaughtErrorMessage,
  roomNameIssueMessage,
  ROOM_NAME_MAX,
  validateRoomName,
} from '../lib/roomCreate';
import { roomsListBodyMode } from '../lib/roomsListView';
import {
  buildRoomInviteShareData,
  canUseNativeShare,
  invokeNativeShare,
} from '../lib/shareUrl';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import {
  domainForExpertiseLevel,
  normalizeExpertiseLevel,
} from '../lib/expertiseSelector';

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

/** localStorage keys for Agent compose drafts (parity with Arena prompt drafts). */
const AGENT_TASK_DRAFT_KEY = 'agent_task_draft:v1';
const agentFollowUpDraftKey = (taskId: string) => `agent_followup_draft:v1:${taskId}`;

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
  orchestration_id?: string | null;
  watchlist_item_id?: string | null;
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

function parseSynthesisFromFinalAnswer(finalAnswer: string | undefined): ParsedSynthesis | null {
  if (!finalAnswer) return null;
  try {
    const parsed = JSON.parse(finalAnswer) as ParsedSynthesis;
    if (parsed && Array.isArray(parsed.sentences)) return parsed;
    return null;
  } catch {
    return null;
  }
}

const CALIBRATION_LEVEL_TITLES: Record<number, string> = {
  1: 'Uncertain',
  2: 'Doubtful',
  3: 'Neutral',
  4: 'Confident',
  5: 'Certain',
};

function formatRelativeShort(iso: string | null | undefined, nowMs?: number): string {
  return formatHistoryRowRelative(iso, nowMs);
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

function formatTemplateSlotLabel(slotKey: string): string {
  return slotKey
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function agentTemplatePreviewNodes(tpl: AgentTaskTemplate, slots: Record<string, string>): ReactNode[] {
  const s = tpl.prompt_template;
  const nodes: ReactNode[] = [];
  const re = /\{([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={`tp-${i++}`} style={{ color: '#2C1810' }}>
          {s.slice(last, m.index)}
        </span>,
      );
    }
    const name = m[1];
    const val = (slots[name] ?? '').trim();
    nodes.push(
      <span
        key={`tp-${i++}`}
        style={{
          color: val ? '#2C1810' : '#C4956A',
          fontStyle: val ? 'normal' : 'italic',
          fontWeight: val ? 500 : 400,
        }}
      >
        {val || `[${name}]`}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    nodes.push(
      <span key={`tp-${i++}`} style={{ color: '#2C1810' }}>
        {s.slice(last)}
      </span>,
    );
  }
  return nodes;
}

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
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const { canUseFeature, isPro, isPlus, refreshTier } = useTier();
  const hasAgentAccess =
    (user?.tier ?? '').toUpperCase() === 'PRO' || user?.agent_addon_active === true;
  const canOrchestrate = canUseFeature('agent_orchestrate');
  const canWatchlist = canUseFeature('agent_watchlist');
  const { openModal, setActiveTab, isOpen: profileModalOpen } = useProfileModal();

  const [agentAddonCheckout, setAgentAddonCheckout] = useState(false);
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [crossPollinateBusy, setCrossPollinateBusy] = useState(false);
  /** Bumped to cancel in-flight poll loops (run / refine / bridge). */
  const runGenerationRef = useRef(0);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conduraCtaOpen, setConduraCtaOpen] = useState(false);
  const [conduraCtaMessage, setConduraCtaMessage] = useState(
    'Arena cannot control your computer from the browser. Install Condura (free, local-first) for on-device actions.',
  );
  const [conduraCtaTitle, setConduraCtaTitle] = useState('This needs your machine');
  const [conduraInstallUrl, setConduraInstallUrl] = useState('https://condura.app');
  const [pendingHandoff, setPendingHandoff] = useState<HandoffPayload | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [_completedStages, setCompletedStages] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('planner');
  const [_liveStages, setLiveStages] = useState<Partial<Record<StageId, string>>>({});
  const [challenges, setChallenges] = useState<AgentChallengeItem[]>([]);
  const [isChallengingAnswer, setIsChallengingAnswer] = useState(false);
  const agentBusy = agentWorkInFlight({ isRunning, isRefining, isChallengingAnswer });
  useBusyNavigationGuard(agentBusy);
  useBusyDocumentTitle(
    agentBusy,
    titleForAgentBusy({
      stage: currentStage,
      refining: isRefining && !isRunning,
      challenging: isChallengingAnswer && !isRunning,
    }),
    '/agent',
  );
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
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historySort, setHistorySort] = useState<AgentHistorySort>('newest');
  const [historyStatusFilter, setHistoryStatusFilter] =
    useState<AgentHistoryStatusFilter>('all');
  const [historyScoreFilter, setHistoryScoreFilter] =
    useState<AgentHistoryScoreFilter>('all');
  const [historyConfidenceFilter, setHistoryConfidenceFilter] =
    useState<AgentHistoryConfidenceFilter>('all');
  const [historyRecencyFilter, setHistoryRecencyFilter] =
    useState<AgentHistoryRecencyFilter>('all');
  const [historyFeedbackFilter, setHistoryFeedbackFilter] =
    useState<AgentHistoryFeedbackFilter>('all');
  const [historyTopicFilter, setHistoryTopicFilter] =
    useState<AgentHistoryTopicFilter>(AGENT_HISTORY_TOPIC_ALL);
  const [historyCopyStatus, setHistoryCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [historyDownloadStatus, setHistoryDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const historyCopyTimerRef = useRef<number | null>(null);
  const historyDownloadTimerRef = useRef<number | null>(null);
  const [roomsCopyStatus, setRoomsCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [roomsDownloadStatus, setRoomsDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [roomLinkCopyStatus, setRoomLinkCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const roomsCopyTimerRef = useRef<number | null>(null);
  const roomsDownloadTimerRef = useRef<number | null>(null);
  const roomLinkCopyTimerRef = useRef<number | null>(null);
  const [dismissedChipIds, setDismissedChipIds] = useState<Set<string>>(
    () => loadDismissedAgentChipIds(),
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);
  /** Ticks every 60s so history / live-update relative clocks stay honest. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const renameCancelledRef = useRef(false);
  const menuLayerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const historySearchRef = useRef<HTMLInputElement | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confActive, setConfActive] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return false;
    return localStorage.getItem('arena_sidebar') !== 'closed';
  });

  useEffect(() => {
    if (isMobile) setSteelmanInnerExpanded(false);
  }, [isMobile]);
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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesClosing, setTemplatesClosing] = useState(false);
  const [templateCategories, setTemplateCategories] = useState<Record<string, AgentTaskTemplate[]>>({});
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesLoadFailed, setTemplatesLoadFailed] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTaskTemplate | null>(null);
  const [templateSlots, setTemplateSlots] = useState<Record<string, string>>({});
  const [taskAnswerFeedback, setTaskAnswerFeedback] = useState<TaskAnswerFeedback | null | undefined>(undefined);
  const [answerFeedbackSubmitBusy, setAnswerFeedbackSubmitBusy] = useState(false);
  const [feedbackEditMode, setFeedbackEditMode] = useState(false);
  const [pendingVerdict, setPendingVerdict] = useState<'correct' | 'partial' | 'wrong' | null>(null);
  const [pendingNote, setPendingNote] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [multiTasks, setMultiTasks] = useState(['', '', '', '']);
  const [activeTaskCount, setActiveTaskCount] = useState(2);
  const [orchActiveId, setOrchActiveId] = useState<string | null>(null);
  const [orchPoll, setOrchPoll] = useState<any | null>(null);
  const [orchResult, setOrchResult] = useState<any | null>(null);
  const [orchExpandedIdx, setOrchExpandedIdx] = useState<number | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [mcpSubHovered, setMcpSubHovered] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [activeMcpSources, setActiveMcpSources] = useState<number[]>([]);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const attachZoneRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [watchlisted, setWatchlisted] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [watchlistPickHours, setWatchlistPickHours] = useState<24 | 72 | 168>(24);
  const [watchUnread, setWatchUnread] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [showRoomCreate, setShowRoomCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomNameError, setRoomNameError] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<any>(null);
  const roomNameInputRef = useRef<HTMLInputElement | null>(null);
  const [myRooms, setMyRooms] = useState<any[]>([]);
  const [myRoomsLoading, setMyRoomsLoading] = useState(false);
  const [myRoomsLoadFailed, setMyRoomsLoadFailed] = useState(false);
  const [roomsSearchQuery, setRoomsSearchQuery] = useState('');
  const [roomsSort, setRoomsSort] = useState<AgentRoomsSort>('recent');
  const [roomsActivityFilter, setRoomsActivityFilter] =
    useState<AgentRoomsActivityFilter>('all');
  const [roomsOccupancyFilter, setRoomsOccupancyFilter] =
    useState<AgentRoomsOccupancyFilter>('all');
  const [roomsMembershipFilter, setRoomsMembershipFilter] =
    useState<AgentRoomsMembershipFilter>('all');
  const roomsSearchRef = useRef<HTMLInputElement | null>(null);
  const [copyRoomLinkFeedback, setCopyRoomLinkFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [shareRoomInviteStatus, setShareRoomInviteStatus] = useState<'idle' | 'shared' | 'failed'>('idle');
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [copyAnswerFeedback, setCopyAnswerFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadAnswerFeedback, setDownloadAnswerFeedback] = useState<'idle' | 'done' | 'failed'>('idle');
  const pendingRoomHandledRef = useRef<string | null>(null);

  const closeTemplatesModal = useCallback(() => {
    setTemplatesClosing(true);
    window.setTimeout(() => {
      setTemplatesOpen(false);
      setTemplatesClosing(false);
    }, 220);
  }, []);

  const assembledTemplatePrompt = useMemo(() => {
    if (!selectedTemplate) return '';
    let s = selectedTemplate.prompt_template;
    for (const key of selectedTemplate.slots) {
      const val = (templateSlots[key] ?? '').trim();
      s = s.split(`{${key}}`).join(val);
    }
    return s;
  }, [selectedTemplate, templateSlots]);

  const allTemplateSlotsFilled = useMemo(() => {
    if (!selectedTemplate) return false;
    return selectedTemplate.slots.every((key) => (templateSlots[key] ?? '').trim().length > 0);
  }, [selectedTemplate, templateSlots]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem('arena_sidebar', next ? 'open' : 'closed'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const urlTaskId = searchParams.get('task_id');

  const { panel } = usePanel();
  const personaIds = panel.map((p) => p.id);

  const expertiseLevelForRun = normalizeExpertiseLevel(user?.expertise_level);
  const expertiseDomainForRun =
    domainForExpertiseLevel(expertiseLevelForRun, user?.expertise_domain || '');

  const loadTaskHistory = useCallback(async () => {
    if (!hasAgentAccess || authLoading) return;
    setHistoryLoading(true);
    try {
      const raw = (await getAgentHistory(1)) as HistoryPayload;
      setTaskHistory(raw.tasks || []);
      setHistoryLoadFailed(false);
    } catch {
      setTaskHistory([]);
      setHistoryLoadFailed(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [authLoading, hasAgentAccess]);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!hasAgentAccess || authLoading || !user?.email) return;
    let cancelled = false;
    void getMcpIntegrations()
      .then((list) => {
        if (!cancelled) setIntegrations(list);
      })
      .catch(() => {
        if (!cancelled) setIntegrations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [hasAgentAccess, authLoading, user?.email]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAttachMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachMenuOpen]);

  // `/` focuses compose (parity with Arena) when not typing in another field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBareSlashKey(e) || !shouldCaptureSlashFocus(e.target)) return;
      e.preventDefault();
      if (result?.status === 'complete' && followUpInputRef.current) {
        followUpInputRef.current.focus();
        return;
      }
      const prompt = document.getElementById('agent-prompt') as HTMLInputElement | null;
      if (prompt && !prompt.disabled) {
        prompt.focus();
        return;
      }
      idleTaskInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result?.status]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (attachZoneRef.current && !attachZoneRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    setNativeShareAvailable(canUseNativeShare());
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSuggIdx((i) => (i + 1) % AGENT_IDLE_SUGGESTIONS.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  const loadAgentTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const r = await getAgentTemplates();
      setTemplateCategories(r.categories || {});
      setTemplatesLoadFailed(false);
    } catch {
      setTemplateCategories({});
      setTemplatesLoadFailed(true);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgentTemplates();
  }, [loadAgentTemplates]);

  useEffect(() => {
    const tid = result?.task_id;
    if (!tid || !user || isRunning) {
      setTaskAnswerFeedback(undefined);
      return;
    }
    let cancelled = false;
    setTaskAnswerFeedback(undefined);
    setFeedbackEditMode(false);
    setPendingVerdict(null);
    setPendingNote('');
    void getAgentTaskAnswerFeedback(tid)
      .then((r) => {
        if (!cancelled) setTaskAnswerFeedback(r);
      })
      .catch(() => {
        if (!cancelled) setTaskAnswerFeedback(null);
      });
    return () => {
      cancelled = true;
    };
  }, [result?.task_id, user, isRunning]);

  useEffect(() => {
    void loadTaskHistory();
  }, [loadTaskHistory]);

  const loadMyRooms = useCallback(async () => {
    if (!user) {
      setMyRooms([]);
      setMyRoomsLoadFailed(false);
      setMyRoomsLoading(false);
      return;
    }
    setMyRoomsLoading(true);
    try {
      const r = await getMyRooms();
      setMyRooms(r.rooms || []);
      setMyRoomsLoadFailed(false);
    } catch {
      setMyRooms([]);
      setMyRoomsLoadFailed(true);
    } finally {
      setMyRoomsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadMyRooms();
  }, [loadMyRooms]);

  useEffect(() => {
    if (searchParams.get('createRoom') === '1') {
      setShowRoomCreate(true);
      setCreatedRoom(null);
      setRoomName('');
      setRoomNameError(null);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete('createRoom');
          return n;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (!q?.trim()) return;
    try {
      setTask(decodeURIComponent(q));
    } catch {
      setTask(q);
    }
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete('q');
        return n;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (result?.status !== 'complete' || !result.task_id || !user) return;
    let slug: string | null = null;
    let rname: string | null = null;
    try {
      slug = sessionStorage.getItem('pending_room_slug');
      rname = sessionStorage.getItem('pending_room_name');
    } catch {
      return;
    }
    if (!slug) return;
    const key = `${slug}:${result.task_id}`;
    if (pendingRoomHandledRef.current === key) return;
    pendingRoomHandledRef.current = key;
    void addRoomTask(slug, result.task_id)
      .then(() => {
        try {
          sessionStorage.removeItem('pending_room_slug');
          sessionStorage.removeItem('pending_room_name');
        } catch {
          /* ignore */
        }
        setToastMessage(rname ? `Task added to ${rname}` : 'Task added to room');
        void loadMyRooms();
      })
      .catch(() => {
        try {
          sessionStorage.removeItem('pending_room_slug');
          sessionStorage.removeItem('pending_room_name');
        } catch {
          /* ignore */
        }
      });
  }, [result?.status, result?.task_id, user, loadMyRooms]);

  useEffect(() => {
    try {
      const prefill = sessionStorage.getItem('arena_prefill_question');
      if (prefill) {
        setTask(prefill);
        sessionStorage.removeItem('arena_prefill_question');
      }
    } catch { /* ignore */ }
  }, []);

  // Restore idle compose draft after q/prefill effects (do not clobber deep links).
  useEffect(() => {
    if (searchParams.get('task_id') || searchParams.get('q')) return;
    setTask((prev) => {
      if (prev.trim()) return prev;
      const stored = loadPromptDraft(AGENT_TASK_DRAFT_KEY);
      return stored || prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount after deep-link reads
  }, []);

  // Debounced autosave for idle Agent compose (not while viewing a finished result).
  useEffect(() => {
    if (result || isRunning || multiMode || selectedTemplate) return;
    const handle = window.setTimeout(() => {
      savePromptDraft(AGENT_TASK_DRAFT_KEY, task);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [task, result, isRunning, multiMode, selectedTemplate]);

  // Per-task follow-up draft: restore when opening a completed task; save while typing.
  useEffect(() => {
    if (!result?.task_id || result.status !== 'complete') {
      setFollowUp('');
      return;
    }
    setFollowUp(loadPromptDraft(agentFollowUpDraftKey(result.task_id)) || '');
  }, [result?.task_id, result?.status]);

  useEffect(() => {
    if (!result?.task_id || result.status !== 'complete') return;
    const handle = window.setTimeout(() => {
      savePromptDraft(agentFollowUpDraftKey(result.task_id!), followUp);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [followUp, result?.task_id, result?.status]);

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
    if (!urlTaskId || !hasAgentAccess || authLoading) return;
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
  }, [urlTaskId, hasAgentAccess, authLoading]);

  useEffect(() => {
    if (!canWatchlist || authLoading || !user?.email) {
      setWatchlisted(false);
      return;
    }
    const q = (result?.original_task || result?.task || '').trim();
    if (!q || result?.status !== 'complete') {
      setWatchlisted(false);
      return;
    }
    let cancelled = false;
    void getAgentWatchlist()
      .then((payload) => {
        if (cancelled) return;
        const items = payload.items || [];
        const on = items.some((i) => (i.question || '').trim() === q && i.is_active);
        setWatchlisted(on);
      })
      .catch(() => {
        if (!cancelled) setWatchlisted(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    result?.original_task,
    result?.task,
    result?.status,
    canWatchlist,
    authLoading,
    user?.email,
  ]);

  useEffect(() => {
    setShowScheduler(false);
  }, [result?.task_id]);

  useEffect(() => {
    if (!canWatchlist || authLoading || !user?.email) {
      setWatchUnread(false);
      return;
    }
    let cancelled = false;
    void getAgentWatchlist()
      .then((payload) => {
        if (cancelled) return;
        const lastViewed = Number(localStorage.getItem('watchlist_last_viewed') || 0);
        let hasNew = false;
        for (const it of payload.items || []) {
          const ca = it.latest_task?.created_at;
          if (ca && new Date(ca).getTime() > lastViewed) {
            hasNew = true;
            break;
          }
        }
        setWatchUnread(hasNew);
      })
      .catch(() => {
        if (!cancelled) setWatchUnread(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canWatchlist, authLoading, user?.email, location.pathname, taskHistory.length]);

  useEffect(() => {
    const st = location.state as {
      bridgeTaskId?: string;
      bridgeMode?: boolean;
      originalQuestion?: string;
    } | null;
    if (st?.bridgeTaskId && st.bridgeMode && hasAgentAccess && !authLoading) {
      setBridgeMeta({
        taskId: st.bridgeTaskId,
        originalQuestion: typeof st.originalQuestion === 'string' ? st.originalQuestion : '',
      });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, hasAgentAccess, authLoading]);

  const pollAgentTaskUntilDone = useCallback(async (taskId: string) => {
    const generation = runGenerationRef.current;
    const maxAttempts = 60;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      if (runGenerationRef.current !== generation) {
        // User stopped (or a newer run superseded this poll).
        return;
      }
      try {
        const statusData = await getAgentStatus(taskId);
        if (runGenerationRef.current !== generation) return;
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
          if (runGenerationRef.current !== generation) return;
          try {
            const resultData = (await getAgentResult(taskId)) as AgentResult;
            if (runGenerationRef.current !== generation) return;
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
            if (runGenerationRef.current !== generation) return;
            setError(resultErr instanceof Error ? resultErr.message : 'Could not load agent result');
          }
          setIsRunning(false);
          setIsRefining(false);
          return;
        }
      } catch (pollErr) {
        if (runGenerationRef.current !== generation) return;
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
    if (runGenerationRef.current !== generation) return;
    setError('Task timed out. Please try again.');
    setIsRunning(false);
    setIsRefining(false);
  }, []);

  const handleStopAgentWork = useCallback(() => {
    runGenerationRef.current += 1;
    setIsRunning(false);
    setIsRefining(false);
    setIsChallengingAnswer(false);
    setToastMessage('Stopped.');
  }, []);

  useEffect(() => {
    if (!bridgeMeta?.taskId || !hasAgentAccess || authLoading) return;
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
  }, [bridgeMeta, hasAgentAccess, authLoading, pollAgentTaskUntilDone]);

  useEffect(() => {
    if (result?.bridge_from_arena && bridgeMeta) {
      setBridgeMeta(null);
    }
  }, [result?.bridge_from_arena, bridgeMeta]);


  const uploadAttachmentFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setAttachMenuOpen(false);
    setUploadErr(null);
    try {
      const data = await uploadAgentFile(file);
      setAttachments((prev) => [...prev, data]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 413) {
        setUploadErr('File too large (max 10MB)');
      } else {
        setUploadErr(e instanceof Error ? e.message : 'Upload failed');
      }
    }
  }, []);

  const handleRunTask = async () => {
    if (!hasAgentAccess) return;
    const t = clampToMax(
      (selectedTemplate ? assembledTemplatePrompt : task).trim(),
    );
    if (t.length < 10 || isRunning) return;
    if (selectedTemplate && !allTemplateSlotsFilled) return;
    runGenerationRef.current += 1;
    setError(null);
    setBridgeMeta(null);
    if (isMobile) setSidebarOpen(false);
    setResult(null);
    setOrchResult(null);
    setOrchActiveId(null);
    setOrchPoll(null);
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
      if (selectedTemplate?.execution && selectedTemplate.execution !== 'web') {
        const capability = selectedTemplate.capability_id || 'app.open_in_linear';
        const payload = await buildHandoffPayload({
          capability,
          summary: t.slice(0, 200),
          args: { task: t, source_prompt: t },
          sessionId: `agent-${Date.now()}`,
          userId: user?.id ?? 'guest',
        });
        setPendingHandoff(payload);
        setConduraCtaTitle('This needs your machine');
        setConduraCtaMessage(
          selectedTemplate.execution === 'hybrid_prep'
            ? 'Arena stays in the browser for research. Writing files or opening local apps needs Condura on your computer — we will not pretend it succeeded here.'
            : 'Arena cannot open apps or control your machine from the web. Condura (free, local-first) handles on-device actions.',
        );
        setConduraInstallUrl('https://condura.app');
        setConduraCtaOpen(true);
        setIsRunning(false);
        return;
      }
      const startData = await runAgentTask(t, {
        expertise_level: expertiseLevelForRun,
        expertise_domain: expertiseDomainForRun,
        attachment_ids: attachments.map((a) => a.file_id),
        mcp_integration_ids: activeMcpSources,
      });
      if (!startData.task_id) {
        throw new Error('No task ID received');
      }
      // Pipeline accepted a real task — draft is safely delivered.
      clearPromptDraft(AGENT_TASK_DRAFT_KEY);
      await pollAgentTaskUntilDone(startData.task_id);
      await loadTaskHistory();
      setAttachments([]);
      setActiveMcpSources([]);
    } catch (e) {
      if (e instanceof LocalExecutionRequiredError) {
        setConduraCtaTitle(e.detail.title || 'This needs your machine');
        setConduraCtaMessage(e.detail.message);
        setConduraInstallUrl(e.detail.install_url || 'https://condura.app');
        try {
          const payload = await buildHandoffPayload({
            capability: e.detail.execution_environment || 'app.open_in_linear',
            summary: t.slice(0, 200),
            args: { task: t },
            sessionId: `agent-${Date.now()}`,
            userId: user?.id ?? 'guest',
          });
          setPendingHandoff(payload);
        } catch {
          setPendingHandoff(null);
        }
        setConduraCtaOpen(true);
        setIsRunning(false);
        setIsRefining(false);
        return;
      }
      if (e instanceof ApiError && e.status === 429) {
        setError('Daily limit reached. Resets at midnight UTC.');
      } else {
        setError(e instanceof Error ? e.message : 'Agent task failed');
      }
      setIsRunning(false);
      setIsRefining(false);
    }
  };

  const handleOrchestrateRun = async () => {
    if (!hasAgentAccess) return;
    const qs = multiTasks.slice(0, activeTaskCount).map((t) => t.trim());
    if (qs.length !== activeTaskCount || qs.some((q) => q.length < 10) || isRunning) return;
    runGenerationRef.current += 1;
    try {
      sessionStorage.removeItem('pending_room_slug');
      sessionStorage.removeItem('pending_room_name');
    } catch {
      /* ignore */
    }
    setError(null);
    setBridgeMeta(null);
    setResult(null);
    setOrchResult(null);
    setOrchPoll(null);
    setOrchExpandedIdx(null);
    if (isMobile) setSidebarOpen(false);
    setIsRunning(true);
    setIsRefining(false);
    try {
      const { orchestration_id } = await postAgentOrchestrate({
        questions: qs,
        expertise_level: expertiseLevelForRun,
        expertise_domain: expertiseDomainForRun,
      });
      setOrchActiveId(orchestration_id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Orchestration failed');
      setIsRunning(false);
      setOrchActiveId(null);
    }
  };

  useEffect(() => {
    if (!orchActiveId || !isRunning) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await getAgentOrchestration(orchActiveId);
        if (cancelled) return;
        setOrchPoll(data);
        if (data.status === 'complete') {
          const tids: string[] = data.task_ids || [];
          const tasks = await Promise.all(tids.map((tid) => getAgentResult(tid)));
          if (!cancelled) {
            setOrchResult({ orchestration: data, tasks });
            setIsRunning(false);
            setOrchActiveId(null);
            setOrchPoll(null);
            void loadTaskHistory();
          }
        } else if (data.status === 'failed') {
          if (!cancelled) {
            setError('Multi-task run failed or timed out.');
            setIsRunning(false);
            setOrchActiveId(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Orchestration poll failed');
          setIsRunning(false);
          setOrchActiveId(null);
        }
      }
    };

    void tick();
    const intervalId = setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [orchActiveId, isRunning, loadTaskHistory]);

  const handleExportTaskPdf = async () => {
    if (!result?.task_id || exportingPdf) return;
    setExportingPdf(true);
    try {
      const blob = await exportAgentTaskPdf(result.task_id);
      const ext = blob.type.includes('pdf') ? 'pdf' : 'html';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arena-report-${result.task_id.slice(0, 8)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCrossPollinate = async () => {
    if (!result?.task_id || isRunning || isRefining || crossPollinateBusy) return;
    const taskId = result.task_id;
    const plainAnswer = plainAnswerText || '';
    const answerText = plainAnswer.trim() || result.final_answer || '';

    if (!answerText) {
      setError('No answer to cross-pollinate');
      return;
    }

    setError(null);
    setCrossPollinateBusy(true);
    try {
      const bridge = await crossPollinateAgentAnswer(taskId, personaIds);
      const clientIntel = result?.intelligence_score?.total_score;
      const intel =
        typeof bridge.intel_score === 'number' && Number.isFinite(bridge.intel_score)
          ? bridge.intel_score
          : typeof clientIntel === 'number' && Number.isFinite(clientIntel)
            ? clientIntel
            : null;
      navigate('/app', {
        state: {
          agentStressPrompt: answerText,
          fromAgent: true,
          crossPollinateSource: bridge.original_task_id || taskId,
          crossPollinateIntelScore: intel,
        },
      });
    } catch (e) {
      const msg = e instanceof ApiError ? agentDetailMessage(e.detail, 'Cross-pollination failed') : e instanceof Error ? e.message : 'Cross-pollination failed';
      setError(msg);
      setCrossPollinateBusy(false);
    }
  };

  const handleExportOrchestrationPdf = async () => {
    const oid = orchResult?.orchestration?.id as string | undefined;
    if (!oid || exportingPdf) return;
    setExportingPdf(true);
    try {
      const blob = await exportOrchestrationPdf(oid);
      const ext = blob.type.includes('pdf') ? 'pdf' : 'html';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arena-orchestration-${oid.slice(0, 8)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleConfirmWatchlist = async () => {
    const q = (result?.original_task || result?.task || '').trim();
    if (!q || !canWatchlist || watchlistBusy) return;
    setWatchlistBusy(true);
    setError(null);
    try {
      await postAgentWatchlist({
        question: q,
        interval_hours: watchlistPickHours,
        expertise_level: expertiseLevelForRun,
        expertise_domain: expertiseDomainForRun,
      });
      setWatchlisted(true);
      setShowScheduler(false);
      setToastMessage('Added to watchlist.');
      void loadTaskHistory();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? typeof e.detail === 'string'
            ? e.detail
            : e.message
          : e instanceof Error
            ? e.message
            : 'Could not add to watchlist';
      setError(msg);
    } finally {
      setWatchlistBusy(false);
    }
  };

  // Esc closes the watchlist cadence picker (when not busy).
  useEffect(() => {
    if (!showScheduler || watchlistBusy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowScheduler(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showScheduler, watchlistBusy]);

  const handleRefine = async () => {
    const msg = followUp.trim();
    if (!msg || !result?.task_id || isRefining || isRunning) return;
    if (msg.length > AGENT_REFINE_MAX_CHARS) {
      setRefinementError(
        `Follow-up is too long — keep it to ${AGENT_REFINE_MAX_CHARS} characters.`,
      );
      return;
    }
    runGenerationRef.current += 1;
    // Clear only after we know we'll send; restore on failure so the draft isn't lost.
    setFollowUp('');
    setIsRunning(true);
    setIsRefining(true);
    setRefinementError(null);
    try {
      await refineAgentAnswer(result.task_id, msg);
      clearPromptDraft(agentFollowUpDraftKey(result.task_id));
      await pollAgentTaskUntilDone(result.task_id);
    } catch (err) {
      setFollowUp(msg);
      setRefinementError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Refinement failed.',
      );
      followUpInputRef.current?.focus();
    } finally {
      setIsRunning(false);
      setIsRefining(false);
    }
  };

  const resetRun = () => {
    try {
      sessionStorage.removeItem('pending_room_slug');
      sessionStorage.removeItem('pending_room_name');
    } catch {
      /* ignore */
    }
    pendingRoomHandledRef.current = null;
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
    setSelectedTemplate(null);
    setTemplateSlots({});
    setTemplatesOpen(false);
    setTemplatesClosing(false);
    setTaskAnswerFeedback(undefined);
    setFeedbackEditMode(false);
    setPendingVerdict(null);
    setPendingNote('');
    setOrchActiveId(null);
    setOrchPoll(null);
    setOrchResult(null);
    setOrchExpandedIdx(null);
    setMultiMode(false);
    setWatchlisted(false);
    setShowScheduler(false);
    setWatchlistPickHours(24);
    if (isMobile) setSidebarOpen(false);
  };

  const runAgainWithSameQuestion = () => {
    const q = (result?.original_task || result?.task || '').trim();
    resetRun();
    if (q) setTask(q);
  };

  /** Seed the compose box from a history row without loading that result. */
  const rerunFromHistory = useCallback(
    (item: HistoryTask) => {
      const q = historyItemRerunText(item);
      setOpenMenuTaskId(null);
      setConfirmDeleteTaskId(null);
      if (!q) {
        setToastMessage('No question to re-run on this task.');
        return;
      }
      resetRun();
      setTask(q);
      setToastMessage('Question ready — press Research when you want.');
      window.setTimeout(() => idleTaskInputRef.current?.focus(), 0);
    },
    // resetRun is stable enough via state setters; intentional omit of full deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const copyHistoryQuestion = useCallback(async (item: HistoryTask) => {
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    const text = historyItemCopyText(item);
    if (!text) {
      setToastMessage('Nothing to copy on this task.');
      return;
    }
    const ok = await copyToClipboard(text);
    setToastMessage(ok ? 'Question copied.' : 'Could not copy — try again.');
  }, []);

  const closeRoomCreate = useCallback(() => {
    if (creatingRoom) return;
    setShowRoomCreate(false);
    setCreatedRoom(null);
    setRoomName('');
    setRoomNameError(null);
    setCopyRoomLinkFeedback('idle');
    setShareRoomInviteStatus('idle');
  }, [creatingRoom]);

  useEffect(() => {
    if (!showRoomCreate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRoomCreate();
      }
    };
    window.addEventListener('keydown', onKey);
    const focusId = window.setTimeout(() => {
      if (!createdRoom) roomNameInputRef.current?.focus();
    }, 40);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusId);
    };
  }, [showRoomCreate, closeRoomCreate, createdRoom]);

  const handleCreateResearchRoom = async () => {
    if (!user || creatingRoom) return;
    const issue = validateRoomName(roomName);
    if (issue) {
      setRoomNameError(roomNameIssueMessage(issue));
      roomNameInputRef.current?.focus();
      return;
    }
    setRoomNameError(null);
    setCreatingRoom(true);
    try {
      const n = roomName.trim();
      const tid = result?.status === 'complete' ? result?.task_id : undefined;
      const payload: { name: string; task_id?: string } = { name: n };
      if (tid) payload.task_id = tid;
      const data = await createRoom(payload);
      setCreatedRoom(data);
      void loadMyRooms();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : roomCreateCaughtErrorMessage(e);
      setRoomNameError(msg);
      setToastMessage(msg);
    } finally {
      setCreatingRoom(false);
    }
  };

  const parsedAnswer = useMemo(
    () => parseSynthesisFromFinalAnswer(result?.final_answer),
    [result?.final_answer],
  );

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
    return [];
  }, [parsedAnswer]);

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

  const displayConfidenceLegend = useMemo(() => {
    if (!confidenceLegendStats) return null;
    const cal = user?.feedback_calibration;
    if (!cal?.reliable || cal.adjustment === 0) return confidenceLegendStats;
    const adj = cal.adjustment;
    let v = confidenceLegendStats.verifiedPct;
    let s = confidenceLegendStats.supportedPct;
    let u = confidenceLegendStats.uncertainPct;
    if (adj < 0) {
      let take = -adj;
      const fromV = Math.min(v, take);
      v -= fromV;
      u += fromV;
      take -= fromV;
      if (take > 0) {
        const fromS = Math.min(s, take);
        s -= fromS;
        u += fromS;
      }
    }
    return {
      ...confidenceLegendStats,
      verifiedPct: Math.round(v),
      supportedPct: Math.round(s),
      uncertainPct: Math.round(u),
    };
  }, [confidenceLegendStats, user?.feedback_calibration]);

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

  const filteredTaskHistory = useMemo(() => {
    const byStatus = filterAgentHistoryByStatus(
      taskHistory.map((item) => ({ ...item, isLive: item.is_live })),
      historyStatusFilter,
    );
    const byScore = filterAgentHistoryByScore(byStatus, historyScoreFilter);
    const byConfidence = filterAgentHistoryByConfidence(byScore, historyConfidenceFilter);
    const byRecency = filterAgentHistoryByRecency(byConfidence, historyRecencyFilter);
    const byFeedback = filterAgentHistoryByFeedback(byRecency, historyFeedbackFilter);
    const byTopic = filterAgentHistoryByTopic(byFeedback, historyTopicFilter);
    const searched = filterBySearchQuery(byTopic, historySearchQuery, (item) => [
      item.title,
      item.task_text,
      agentHistoryDisplayTitle(item),
      ...(item.topics || []),
    ]);
    return sortAgentHistoryItems(
      searched.map((item) => ({
        ...item,
        id: item.task_id,
        title: item.title,
        question: item.task_text,
        score: item.final_score,
        createdAt: item.created_at,
        isLive: item.is_live,
      })),
      historySort,
    );
  }, [
    taskHistory,
    historySearchQuery,
    historySort,
    historyStatusFilter,
    historyScoreFilter,
    historyConfidenceFilter,
    historyRecencyFilter,
    historyFeedbackFilter,
    historyTopicFilter,
  ]);

  const historyScoreFilterUseful = useMemo(
    () => agentHistoryScoreFilterUseful(taskHistory),
    [taskHistory],
  );

  const historyConfidenceFilterUseful = useMemo(
    () => agentHistoryConfidenceFilterUseful(taskHistory),
    [taskHistory],
  );

  const historyRecencyFilterUseful = useMemo(
    () => agentHistoryRecencyFilterUseful(taskHistory),
    [taskHistory],
  );

  const historyFeedbackFilterUseful = useMemo(
    () => agentHistoryFeedbackFilterUseful(taskHistory),
    [taskHistory],
  );

  const historyTopicOptions = useMemo(
    () => collectHistoryTopicOptions(taskHistory),
    [taskHistory],
  );

  const historyTopicFilterUseful = useMemo(
    () => agentHistoryTopicFilterUseful(taskHistory),
    [taskHistory],
  );

  // Drop topic filter when that topic no longer appears in history.
  useEffect(() => {
    if (historyTopicFilter === AGENT_HISTORY_TOPIC_ALL) return;
    if (!historyTopicOptions.some((o) => o.value === historyTopicFilter)) {
      setHistoryTopicFilter(AGENT_HISTORY_TOPIC_ALL);
    }
  }, [historyTopicFilter, historyTopicOptions]);

  const roomsBodyMode = roomsListBodyMode({
    loading: myRoomsLoading,
    loadFailed: myRoomsLoadFailed,
    itemCount: myRooms.length,
  });

  const historyBodyMode = roomsListBodyMode({
    loading: historyLoading,
    loadFailed: historyLoadFailed,
    itemCount: taskHistory.length,
  });

  const filteredMyRooms = useMemo(() => {
    const annotated = myRooms.map((r: any) => ({
      ...r,
      memberCount: r.member_count,
      taskCount: r.task_count,
      createdAt: r.created_at,
      activityAt: r.synthesis_updated_at || r.last_seen_at || r.created_at,
      synthesisUpdatedAt: r.synthesis_updated_at,
      lastSeenAt: r.last_seen_at,
    }));
    const byActivity = filterAgentRoomsByActivity(annotated, roomsActivityFilter);
    const byOccupancy = filterAgentRoomsByOccupancy(byActivity, roomsOccupancyFilter);
    const byMembership = filterAgentRoomsByMembership(byOccupancy, roomsMembershipFilter);
    const searched = filterBySearchQuery(byMembership, roomsSearchQuery, (r) => [
      r.name,
      r.slug,
      r.topic,
      r.description,
    ]);
    return sortAgentRooms(searched, roomsSort);
  }, [
    myRooms,
    roomsSearchQuery,
    roomsSort,
    roomsActivityFilter,
    roomsOccupancyFilter,
    roomsMembershipFilter,
  ]);

  const roomsOccupancyFilterUseful = useMemo(
    () =>
      agentRoomsOccupancyFilterUseful(
        myRooms.map((r: any) => ({ taskCount: r.task_count })),
      ),
    [myRooms],
  );

  const roomsMembershipFilterUseful = useMemo(
    () =>
      agentRoomsMembershipFilterUseful(
        myRooms.map((r: any) => ({ memberCount: r.member_count })),
      ),
    [myRooms],
  );

  useEffect(() => {
    return () => {
      if (historyCopyTimerRef.current != null) {
        window.clearTimeout(historyCopyTimerRef.current);
      }
      if (historyDownloadTimerRef.current != null) {
        window.clearTimeout(historyDownloadTimerRef.current);
      }
      if (roomsCopyTimerRef.current != null) {
        window.clearTimeout(roomsCopyTimerRef.current);
      }
      if (roomsDownloadTimerRef.current != null) {
        window.clearTimeout(roomsDownloadTimerRef.current);
      }
    };
  }, []);

  const buildFilteredRoomsMarkdown = () => {
    const q = roomsSearchQuery.trim();
    const filterBits: string[] = [];
    if (roomsActivityFilter !== 'all') {
      filterBits.push(`activity: ${agentRoomsActivityLabel(roomsActivityFilter)}`);
    }
    if (roomsOccupancyFilter !== 'all') {
      filterBits.push(`occupancy: ${agentRoomsOccupancyLabel(roomsOccupancyFilter)}`);
    }
    if (roomsMembershipFilter !== 'all') {
      filterBits.push(`membership: ${agentRoomsMembershipLabel(roomsMembershipFilter)}`);
    }
    if (q) filterBits.push(`search: “${q}”`);
    if (roomsSort !== 'recent') filterBits.push(`sort: ${agentRoomsSortLabel(roomsSort)}`);
    return formatAgentRoomsExport({
      items: filteredMyRooms.map((r: any) => ({
        name: r.name,
        slug: r.slug,
        topic: r.topic,
        description: r.description,
        memberCount:
          typeof r.memberCount === 'number'
            ? r.memberCount
            : typeof r.member_count === 'number'
              ? r.member_count
              : null,
        taskCount:
          typeof r.taskCount === 'number'
            ? r.taskCount
            : typeof r.task_count === 'number'
              ? r.task_count
              : null,
        createdAt: r.createdAt || r.created_at,
        activityAt: r.activityAt || r.synthesis_updated_at || r.last_seen_at || r.created_at,
        roomId: r.id,
      })),
      totalCount: myRooms.length,
      filterNote: filterBits.length ? filterBits.join(' · ') : undefined,
    });
  };

  const copyFilteredRooms = async () => {
    const markdown = buildFilteredRoomsMarkdown();
    const ok = await copyToClipboard(markdown);
    if (roomsCopyTimerRef.current != null) {
      window.clearTimeout(roomsCopyTimerRef.current);
    }
    setRoomsCopyStatus(ok ? 'copied' : 'failed');
    if (!ok) {
      setToastMessage('Could not copy rooms — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    roomsCopyTimerRef.current = window.setTimeout(() => {
      setRoomsCopyStatus('idle');
      roomsCopyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copyRoomInviteLink = async (slug: string | null | undefined) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = roomInviteUrl(slug, origin);
    if (!url) {
      setToastMessage('No invite link for this room.');
      return;
    }
    const ok = await copyToClipboard(url);
    if (roomLinkCopyTimerRef.current != null) {
      window.clearTimeout(roomLinkCopyTimerRef.current);
    }
    setRoomLinkCopyStatus(ok ? 'copied' : 'failed');
    setToastMessage(ok ? 'Room invite link copied.' : 'Could not copy invite link — try again.');
    const hold = motionDuration(ok ? 2000 : 2800);
    roomLinkCopyTimerRef.current = window.setTimeout(() => {
      setRoomLinkCopyStatus('idle');
      roomLinkCopyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const downloadFilteredRooms = () => {
    const markdown = buildFilteredRoomsMarkdown();
    const ok = downloadMarkdownFile(markdown, 'agent-rooms');
    if (roomsDownloadTimerRef.current != null) {
      window.clearTimeout(roomsDownloadTimerRef.current);
    }
    setRoomsDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download rooms — try Copy instead.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    roomsDownloadTimerRef.current = window.setTimeout(() => {
      setRoomsDownloadStatus('idle');
      roomsDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const buildFilteredHistoryMarkdown = () => {
    const q = historySearchQuery.trim();
    const filterBits: string[] = [];
    if (historyStatusFilter !== 'all') {
      filterBits.push(`status: ${agentHistoryStatusLabel(historyStatusFilter)}`);
    }
    if (historyScoreFilter !== 'all') {
      filterBits.push(`score: ${agentHistoryScoreLabel(historyScoreFilter)}`);
    }
    if (historyConfidenceFilter !== 'all') {
      filterBits.push(`confidence: ${agentHistoryConfidenceLabel(historyConfidenceFilter)}`);
    }
    if (historyRecencyFilter !== 'all') {
      filterBits.push(`recency: ${agentHistoryRecencyLabel(historyRecencyFilter)}`);
    }
    if (historyFeedbackFilter !== 'all') {
      filterBits.push(`feedback: ${agentHistoryFeedbackLabel(historyFeedbackFilter)}`);
    }
    if (historyTopicFilter !== AGENT_HISTORY_TOPIC_ALL) {
      filterBits.push(
        `topic: ${agentHistoryTopicLabel(historyTopicFilter, historyTopicOptions)}`,
      );
    }
    if (q) filterBits.push(`search: “${q}”`);
    if (historySort !== 'newest') filterBits.push(`sort: ${agentHistorySortLabel(historySort)}`);
    return formatAgentHistoryExport({
      items: filteredTaskHistory.map((item) => ({
        title: item.title,
        question: item.task_text,
        score: item.final_score,
        confidence: item.final_confidence,
        createdAt: item.created_at,
        topics: item.topics,
        isLive: item.is_live,
        taskId: item.task_id,
      })),
      totalCount: taskHistory.length,
      filterNote: filterBits.length ? filterBits.join(' · ') : undefined,
    });
  };

  const copyFilteredHistory = async () => {
    const markdown = buildFilteredHistoryMarkdown();
    const ok = await copyToClipboard(markdown);
    if (historyCopyTimerRef.current != null) {
      window.clearTimeout(historyCopyTimerRef.current);
    }
    setHistoryCopyStatus(ok ? 'copied' : 'failed');
    if (!ok) {
      setToastMessage('Could not copy history — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historyCopyTimerRef.current = window.setTimeout(() => {
      setHistoryCopyStatus('idle');
      historyCopyTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const downloadFilteredHistory = () => {
    const markdown = buildFilteredHistoryMarkdown();
    const ok = downloadMarkdownFile(markdown, 'agent-research-history');
    if (historyDownloadTimerRef.current != null) {
      window.clearTimeout(historyDownloadTimerRef.current);
    }
    setHistoryDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download history — try Copy instead.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historyDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryDownloadStatus('idle');
      historyDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

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
    renameCancelledRef.current = false;
    setEditingTaskId(item.task_id);
    setEditingValue(currentLabel);
    setRenameError(null);
    setRenameBusy(false);
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
  };

  const cancelRenameAgent = () => {
    renameCancelledRef.current = true;
    setEditingTaskId(null);
    setEditingValue('');
    setRenameError(null);
    setRenameBusy(false);
  };

  const saveRenameAgent = async (taskId: string) => {
    if (renameBusy || renameCancelledRef.current) return;
    const nextValue = editingValue.trim();
    const issue = validateAgentTaskTitle(nextValue);
    if (issue) {
      setRenameError(agentTaskRenameIssueMessage(issue));
      editInputRef.current?.focus();
      return;
    }
    const previous = taskHistory.find((t) => t.task_id === taskId);
    const previousTitle = previous?.title ?? null;
    setRenameError(null);
    setRenameBusy(true);
    // Optimistic update with validated title.
    setTaskHistory((prev) =>
      prev.map((t) => (t.task_id === taskId ? { ...t, title: nextValue } : t)),
    );
    try {
      const res = await renameAgentTask(taskId, nextValue);
      if (renameCancelledRef.current) return;
      const saved = (res.title || nextValue).trim() || nextValue;
      setTaskHistory((prev) =>
        prev.map((t) => (t.task_id === taskId ? { ...t, title: saved } : t)),
      );
      setEditingTaskId(null);
      setEditingValue('');
      setRenameBusy(false);
    } catch (err) {
      if (renameCancelledRef.current) return;
      setTaskHistory((prev) =>
        prev.map((t) =>
          t.task_id === taskId ? { ...t, title: previousTitle } : t,
        ),
      );
      const msg =
        err instanceof ApiError
          ? err.message
          : agentTaskRenameCaughtErrorMessage(err);
      setRenameError(msg);
      setToastMessage(msg);
      setRenameBusy(false);
      editInputRef.current?.focus();
    }
  };

  const deleteHistoryItem = (taskId: string) => {
    const removed = taskHistory.find((t) => t.task_id === taskId) ?? null;
    const wasActive = result?.task_id === taskId;
    if (wasActive) {
      resetRun();
    }
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    setTaskHistory((prev) => prev.filter((t) => t.task_id !== taskId));
    void deleteAgentTask(taskId).catch(() => {
      if (removed) {
        setTaskHistory((prev) => {
          if (prev.some((t) => t.task_id === taskId)) return prev;
          return [removed, ...prev];
        });
      }
      setToastMessage('Could not delete task');
      void loadTaskHistory();
    });
  };

  const handleChallengeAnswer = useCallback(async () => {
    if (!result || isChallengingAnswer) return;
    const generation = ++runGenerationRef.current;
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
      if (runGenerationRef.current !== generation) return;
      setChallenges(data.challenges || []);
    } catch (err) {
      if (runGenerationRef.current !== generation) return;
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Challenge failed. Try again.';
      setChallengeSectionError(msg);
      setChallenges([]);
    } finally {
      if (runGenerationRef.current === generation) {
        setIsChallengingAnswer(false);
      }
    }
  }, [result, plainAnswerText, task, isChallengingAnswer]);

  const handleGetRebuttal = useCallback(
    async (challengeText: string, challengerKey: string) => {
      if (!result) return;
      setRebuttalLoadingFor(challengerKey);
      try {
        const plainAnswer = plainAnswerText || result.final_answer || '';
        const data = await getAgentRebuttal(result.task || task, plainAnswer, challengeText);
        setRebuttals((prev) => ({ ...prev, [challengerKey]: data.rebuttal }));
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unknown error';
        setRebuttals((prev) => ({
          ...prev,
          [challengerKey]: `Rebuttal failed: ${msg}`,
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
              <div onClick={(e) => e.stopPropagation()}>
                <input
                  ref={editInputRef}
                  value={editingValue}
                  maxLength={AGENT_TASK_TITLE_MAX + 20}
                  disabled={renameBusy}
                  aria-invalid={Boolean(renameError)}
                  aria-describedby={renameError ? `rename-error-${item.task_id}` : undefined}
                  aria-label="Rename research task"
                  onChange={(e) => {
                    setEditingValue(e.target.value);
                    if (renameError) setRenameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void saveRenameAgent(item.task_id);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRenameAgent();
                    }
                  }}
                  onBlur={() => {
                    // Skip if Esc already cancelled (blur still fires after cancel).
                    if (!renameCancelledRef.current) {
                      void saveRenameAgent(item.task_id);
                    }
                  }}
                  className="w-full bg-white border border-border rounded-md px-2 py-1 text-[13px] text-text-primary outline-none"
                  style={{
                    borderColor: renameError ? '#D85A30' : undefined,
                    opacity: renameBusy ? 0.75 : 1,
                  }}
                />
                {renameError && editingTaskId === item.task_id ? (
                  <p
                    id={`rename-error-${item.task_id}`}
                    role="alert"
                    style={{
                      margin: '4px 0 0',
                      fontSize: 11,
                      color: '#D85A30',
                      lineHeight: 1.35,
                    }}
                  >
                    {renameError}
                  </p>
                ) : null}
              </div>
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
                  {item.watchlist_item_id ? (
                    <svg
                      width={12}
                      height={12}
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                      style={{ flexShrink: 0, color: '#C4956A' }}
                    >
                      <path
                        d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                  {item.is_live ? (
                    <span
                      aria-hidden
                      title="Updates weekly"
                      style={{
                        width: 5,
                        height: 5,
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
                    <HighlightQuery text={displayTitle} query={historySearchQuery} />
                  </span>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      borderRadius: 999,
                      padding: '1px 7px',
                      background: scoreBg,
                      color: scoreColor,
                    }}
                  >
                    {item.final_score != null ? `${item.final_score}/100` : '—'}
                  </span>
                  {(() => {
                    const confBadge = formatHistoryConfidenceBadge(item.final_confidence);
                    if (!confBadge) return null;
                    return (
                      <span
                        title={`Confidence ${confBadge}`}
                        aria-label={`Confidence ${confBadge}`}
                        style={{
                          fontSize: 10,
                          letterSpacing: '0.04em',
                          borderRadius: 999,
                          padding: '1px 7px',
                          background: 'rgba(196,149,106,0.12)',
                          color: '#8C5A2C',
                        }}
                      >
                        {confBadge}
                      </span>
                    );
                  })()}
                  {item.user_feedback ? (
                    <span
                      title={`You rated this ${item.user_feedback}`}
                      aria-label={`Your rating: ${item.user_feedback}`}
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        borderRadius: 999,
                        padding: '1px 7px',
                        background:
                          item.user_feedback === 'accurate'
                            ? 'rgba(138,168,153,0.18)'
                            : item.user_feedback === 'partial'
                              ? 'rgba(196,149,106,0.18)'
                              : 'rgba(217,83,79,0.15)',
                        color:
                          item.user_feedback === 'accurate'
                            ? '#3F6B4A'
                            : item.user_feedback === 'partial'
                              ? '#8C5A2C'
                              : '#9C2F2A',
                      }}
                    >
                      {item.user_feedback === 'accurate'
                        ? 'Accurate'
                        : item.user_feedback === 'partial'
                          ? 'Partial'
                          : 'Inaccurate'}
                    </span>
                  ) : null}
                  <span
                    style={{ fontSize: 11, color: '#A89070' }}
                    title={historyRowTimeTitle(item.created_at) || undefined}
                  >
                    {formatRelativeShort(item.created_at, nowMs)}
                  </span>
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
                  minWidth: '160px',
                  zIndex: 120,
                }}
              >
                <AgentSidebarMenuItem
                  icon={<RotateCcw className="w-[14px] h-[14px]" />}
                  label="Re-run"
                  color="#1A1714"
                  hoverBackground="#F0EBE3"
                  onClick={() => rerunFromHistory(item)}
                />
                <AgentSidebarMenuItem
                  icon={<Copy className="w-[14px] h-[14px]" />}
                  label="Copy question"
                  color="#1A1714"
                  hoverBackground="#F0EBE3"
                  onClick={() => void copyHistoryQuestion(item)}
                />
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

  if (!user) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: '#F5F0E8',
        }}
      >
        <MicroLoader />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100dvh',
        minHeight: '100dvh',
        overflow: 'hidden',
        background: '#FAF7F4',
      }}
      data-expertise-level={expertiseLevelForRun}
      data-expertise-domain={expertiseDomainForRun}
    >
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes roomPanelFadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
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
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
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
        .agent-answer-main {
          max-width: 100%;
          overflow-x: hidden;
          padding: 0;
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
        @keyframes attachMenuFade {
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
      {isMobile && sidebarOpen ? (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 590,
          }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      ) : null}
      <div
        style={{
          width: isMobile ? 0 : sidebarOpen ? 200 : 0,
          minWidth: isMobile ? 0 : sidebarOpen ? 200 : 0,
          maxWidth: isMobile ? 0 : sidebarOpen ? 200 : 0,
          overflow: 'hidden',
          flexShrink: 0,
          transition: 'width 0.28s cubic-bezier(0.16,1,0.3,1), min-width 0.28s cubic-bezier(0.16,1,0.3,1)',
          height: '100vh',
          position: 'relative',
        }}
      >
        <aside
          style={{
            position: isMobile ? 'fixed' : 'relative',
            top: 0,
            left: 0,
            width: isMobile ? 'min(85vw, 300px)' : 200,
            minWidth: isMobile ? undefined : 200,
            height: '100%',
            minHeight: '100vh',
            background: '#F5F0E8',
            borderRight: sidebarOpen ? '0.5px solid #EDE4D8' : 'none',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box',
            zIndex: isMobile ? 600 : undefined,
            paddingTop: isMobile ? 52 : 0,
            transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : undefined,
            transition: isMobile ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
          }}
        >
          {isMobile ? (
            <div
              style={{
                padding: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={closeSidebar}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6460' }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
          ) : null}
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
          {canWatchlist ? (
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem('watchlist_last_viewed', String(Date.now()));
                } catch {
                  /* ignore */
                }
                setWatchUnread(false);
                navigate('/agent/watchlist');
                if (isMobile) setSidebarOpen(false);
              }}
              style={{
                margin: '0 16px 10px',
                width: 'calc(100% - 32px)',
                padding: '8px 14px',
                background: 'transparent',
                color: '#6B5040',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                border: '0.5px solid #E0D5C5',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontFamily: 'Georgia, serif',
              }}
            >
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {watchUnread ? (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#C4956A',
                    }}
                  />
                ) : null}
              </span>
              Watchlist
            </button>
          ) : null}
          {user ? (
            <div style={{ padding: '0 16px 12px', borderBottom: '0.5px solid #E8E2DA' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 4px 6px',
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#B0A9A2' }}>
                  Rooms
                </div>
                {roomsBodyMode === 'list' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: '#A89070' }}>
                      {filteredMyRooms.length}
                      {roomsSearchQuery.trim() ||
                      roomsActivityFilter !== 'all' ||
                      roomsOccupancyFilter !== 'all' ||
                      roomsMembershipFilter !== 'all'
                        ? ` / ${myRooms.length}`
                        : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyFilteredRooms()}
                      title="Copy current rooms view as markdown"
                      aria-label={
                        roomsCopyStatus === 'copied'
                          ? 'Rooms copied'
                          : roomsCopyStatus === 'failed'
                            ? 'Copy failed'
                            : 'Copy rooms list as markdown'
                      }
                      style={{
                        background: 'none',
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 6,
                        padding: '2px 7px',
                        fontSize: 10,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color:
                          roomsCopyStatus === 'failed'
                            ? '#D85A30'
                            : roomsCopyStatus === 'copied'
                              ? '#5A8C6A'
                              : '#A89070',
                        cursor: 'pointer',
                        fontFamily: 'Georgia, serif',
                        lineHeight: 1.4,
                      }}
                    >
                      {roomsCopyStatus === 'copied'
                        ? 'Copied'
                        : roomsCopyStatus === 'failed'
                          ? 'Failed'
                          : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadFilteredRooms()}
                      title="Download current rooms view as markdown"
                      aria-label={
                        roomsDownloadStatus === 'done'
                          ? 'Rooms downloaded'
                          : roomsDownloadStatus === 'failed'
                            ? 'Download failed'
                            : 'Download rooms list as markdown'
                      }
                      style={{
                        background: 'none',
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 6,
                        padding: '2px 7px',
                        fontSize: 10,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color:
                          roomsDownloadStatus === 'failed'
                            ? '#D85A30'
                            : roomsDownloadStatus === 'done'
                              ? '#5A8C6A'
                              : '#A89070',
                        cursor: 'pointer',
                        fontFamily: 'Georgia, serif',
                        lineHeight: 1.4,
                      }}
                    >
                      {roomsDownloadStatus === 'done'
                        ? 'Downloaded'
                        : roomsDownloadStatus === 'failed'
                          ? 'Failed'
                          : 'Download'}
                    </button>
                  </div>
                ) : null}
              </div>
              {roomsBodyMode === 'loading' ? (
                <div style={{ fontSize: 11, color: '#C4B8AE', padding: '4px 0' }}>Loading…</div>
              ) : roomsBodyMode === 'load_error' ? (
                <div role="alert" style={{ fontSize: 12, color: '#8C7355', padding: '4px 2px 8px', lineHeight: 1.45 }}>
                  Could not load rooms.
                  <button
                    type="button"
                    onClick={() => void loadMyRooms()}
                    style={{
                      display: 'block',
                      marginTop: 6,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#C4956A',
                      fontSize: 12,
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                      textDecoration: 'underline',
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : roomsBodyMode === 'empty' ? (
                <div style={{ fontSize: 12, color: '#C4B8AE', padding: '4px 2px 6px', lineHeight: 1.45 }}>
                  No rooms yet — create one to research with others.
                </div>
              ) : (
                <>
                  {myRooms.length > 1 ? (
                    <div
                      role="group"
                      aria-label="Filter rooms by synthesis activity"
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {AGENT_ROOMS_ACTIVITY_OPTIONS.map((opt) => {
                        const selected = roomsActivityFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setRoomsActivityFilter(opt.value)}
                            aria-pressed={selected}
                            style={{
                              padding: '3px 9px',
                              borderRadius: 999,
                              border: selected ? 'none' : '0.5px solid #D4C4B0',
                              background: selected ? '#C4956A' : 'transparent',
                              color: selected ? '#FAF7F2' : '#8C7355',
                              fontSize: 10,
                              fontFamily: 'Georgia, serif',
                              cursor: 'pointer',
                              lineHeight: 1.35,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {roomsOccupancyFilterUseful ? (
                    <div
                      role="group"
                      aria-label="Filter rooms by task occupancy"
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {AGENT_ROOMS_OCCUPANCY_OPTIONS.map((opt) => {
                        const selected = roomsOccupancyFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setRoomsOccupancyFilter(opt.value)}
                            aria-pressed={selected}
                            style={{
                              padding: '3px 9px',
                              borderRadius: 999,
                              border: selected
                                ? '0.5px solid #C4956A'
                                : '0.5px solid #D4C4B0',
                              background: selected ? '#F0E6DA' : 'transparent',
                              color: selected ? '#4A3728' : '#8C7355',
                              fontSize: 10,
                              fontFamily: 'Georgia, serif',
                              cursor: 'pointer',
                              lineHeight: 1.35,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {roomsMembershipFilterUseful ? (
                    <div
                      role="group"
                      aria-label="Filter rooms by membership size"
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {AGENT_ROOMS_MEMBERSHIP_OPTIONS.map((opt) => {
                        const selected = roomsMembershipFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setRoomsMembershipFilter(opt.value)}
                            aria-pressed={selected}
                            style={{
                              padding: '3px 9px',
                              borderRadius: 999,
                              border: selected
                                ? '0.5px solid #C4956A'
                                : '0.5px solid #D4C4B0',
                              background: selected ? '#F0E6DA' : 'transparent',
                              color: selected ? '#4A3728' : '#8C7355',
                              fontSize: 10,
                              fontFamily: 'Georgia, serif',
                              cursor: 'pointer',
                              lineHeight: 1.35,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {myRooms.length > 1 ? (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                      <select
                        value={roomsSort}
                        onChange={(e) => setRoomsSort(e.target.value as AgentRoomsSort)}
                        aria-label="Sort rooms"
                        title="Sort rooms"
                        style={{
                          fontSize: 11,
                          fontFamily: 'Georgia, serif',
                          color: '#4A3728',
                          background: '#FAF7F4',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 6,
                          padding: '5px 8px',
                          cursor: 'pointer',
                          flex: '0 1 auto',
                          maxWidth: '100%',
                        }}
                      >
                        {AGENT_ROOMS_SORT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {myRooms.length > 2 ? (
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <input
                        ref={roomsSearchRef}
                        type="search"
                        value={roomsSearchQuery}
                        onChange={(e) => setRoomsSearchQuery(e.target.value)}
                        placeholder="Search rooms…"
                        aria-label="Search your rooms"
                        autoComplete="off"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          fontSize: 12,
                          fontFamily: 'Georgia, serif',
                          color: '#2C1810',
                          background: '#FAF7F4',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 8,
                          padding: '6px 26px 6px 10px',
                          outline: 'none',
                        }}
                      />
                      {roomsSearchQuery ? (
                        <button
                          type="button"
                          aria-label="Clear rooms search"
                          onClick={() => {
                            setRoomsSearchQuery('');
                            roomsSearchRef.current?.focus();
                          }}
                          style={{
                            position: 'absolute',
                            right: 6,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: '#A89070',
                            lineHeight: 1,
                            padding: 4,
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {filteredMyRooms.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#C4B8AE', padding: '4px 2px 8px', lineHeight: 1.45 }}>
                      {roomsSearchQuery.trim()
                        ? `No rooms match “${roomsSearchQuery.trim()}”${
                            roomsActivityFilter !== 'all'
                              ? ` in ${agentRoomsActivityLabel(roomsActivityFilter).toLowerCase()}`
                              : ''
                          }${
                            roomsOccupancyFilter !== 'all'
                              ? ` · ${agentRoomsOccupancyLabel(roomsOccupancyFilter)}`
                              : ''
                          }${
                            roomsMembershipFilter !== 'all'
                              ? ` · ${agentRoomsMembershipLabel(roomsMembershipFilter)}`
                              : ''
                          }`
                        : roomsMembershipFilter !== 'all' &&
                            roomsActivityFilter === 'all' &&
                            roomsOccupancyFilter === 'all'
                          ? roomsMembershipFilter === 'solo'
                            ? 'No solo rooms in this view.'
                            : 'No shared rooms in this view.'
                          : roomsOccupancyFilter !== 'all' && roomsActivityFilter === 'all'
                            ? roomsOccupancyFilter === 'empty'
                              ? 'No empty rooms — every room has tasks.'
                              : 'No rooms with tasks in this view.'
                            : roomsActivityFilter === 'needs_attention'
                              ? 'No rooms with new synthesis right now.'
                              : roomsActivityFilter === 'caught_up'
                                ? 'No caught-up rooms in this view.'
                                : 'No rooms in this view.'}
                      <button
                        type="button"
                        onClick={() => {
                          setRoomsSearchQuery('');
                          setRoomsActivityFilter('all');
                          setRoomsOccupancyFilter('all');
                          setRoomsMembershipFilter('all');
                          roomsSearchRef.current?.focus();
                        }}
                        style={{
                          display: 'block',
                          marginTop: 6,
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#C4956A',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
                          textDecoration: 'underline',
                        }}
                      >
                        {(roomsActivityFilter !== 'all' ||
                          roomsOccupancyFilter !== 'all' ||
                          roomsMembershipFilter !== 'all') &&
                        !roomsSearchQuery.trim()
                          ? 'Show all rooms'
                          : 'Clear filters'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {filteredMyRooms.map((r: any) => {
                        const rName = (r.name || 'Room');
                        const hasUnread = roomNeedsAttention({
                          synthesisUpdatedAt: r.synthesisUpdatedAt || r.synthesis_updated_at,
                          lastSeenAt: r.lastSeenAt || r.last_seen_at,
                        });
                        const metaLine = formatAgentRoomMetaLine(
                          {
                            memberCount: r.memberCount ?? r.member_count,
                            taskCount: r.taskCount ?? r.task_count,
                            activityAt: r.activityAt,
                            synthesisUpdatedAt: r.synthesisUpdatedAt || r.synthesis_updated_at,
                            lastSeenAt: r.lastSeenAt || r.last_seen_at,
                            createdAt: r.createdAt || r.created_at,
                          },
                          { nowMs, needsAttention: hasUnread },
                        );
                        const activityTitle = roomActivityTitle({
                          activityAt: r.activityAt,
                          synthesisUpdatedAt: r.synthesisUpdatedAt || r.synthesis_updated_at,
                          lastSeenAt: r.lastSeenAt || r.last_seen_at,
                          createdAt: r.createdAt || r.created_at,
                        });
                        return (
                          <div
                            key={r.id}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 4,
                              borderRadius: 6,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#F5EFE6';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                navigate(`/room/${encodeURIComponent(r.slug)}`);
                                if (isMobile) setSidebarOpen(false);
                              }}
                              style={{
                                textAlign: 'left',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '6px 4px 6px 8px',
                                borderRadius: 6,
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 6,
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div
                                  title={rName}
                                  style={{
                                    fontSize: 13,
                                    color: '#2C1810',
                                    fontWeight: 400,
                                    lineHeight: 1.3,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <HighlightQuery text={rName} query={roomsSearchQuery} />
                                </div>
                                <div
                                  style={{ fontSize: 10, color: '#A89070', marginTop: 1 }}
                                  title={activityTitle || undefined}
                                >
                                  {metaLine ||
                                    `${r.member_count ?? 0} members · ${r.task_count ?? 0} tasks`}
                                </div>
                              </div>
                              {hasUnread ? (
                                <span
                                  title="New synthesis since your last visit"
                                  aria-label="New synthesis"
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: '#C4956A',
                                    flexShrink: 0,
                                    marginTop: 5,
                                  }}
                                />
                              ) : null}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyRoomInviteLink(r.slug);
                              }}
                              title="Copy room invite link"
                              aria-label={`Copy invite link for ${rName}`}
                              style={{
                                flexShrink: 0,
                                marginTop: 4,
                                marginRight: 4,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 11,
                                color:
                                  roomLinkCopyStatus === 'failed'
                                    ? '#D85A30'
                                    : roomLinkCopyStatus === 'copied'
                                      ? '#5A8C6A'
                                      : '#C4956A',
                                fontFamily: 'Georgia, serif',
                                padding: '4px 6px',
                                borderRadius: 6,
                              }}
                            >
                              Link
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setCreatedRoom(null);
                  setRoomName('');
                  setRoomNameError(null);
                  setShowRoomCreate(true);
                  if (isMobile) setSidebarOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#C4956A',
                  cursor: 'pointer',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  transition: 'background 0.15s',
                  marginTop: '4px',
                  background: 'none',
                  border: 'none',
                  width: '100%',
                  fontFamily: 'Georgia, serif',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F5EFE6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New room
              </button>
            </div>
          ) : null}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '12px 4px 6px',
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#B0A9A2',
                }}
              >
                History
              </div>
              {taskHistory.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: '#A89070' }}>
                    {filteredTaskHistory.length}
                    {historySearchQuery.trim() ||
                    historyStatusFilter !== 'all' ||
                    historyScoreFilter !== 'all' ||
                    historyConfidenceFilter !== 'all' ||
                    historyRecencyFilter !== 'all' ||
                    historyFeedbackFilter !== 'all' ||
                    historyTopicFilter !== AGENT_HISTORY_TOPIC_ALL
                      ? ` / ${taskHistory.length}`
                      : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyFilteredHistory()}
                    title="Copy current history view as markdown"
                    aria-label={
                      historyCopyStatus === 'copied'
                        ? 'History copied'
                        : historyCopyStatus === 'failed'
                          ? 'Copy failed'
                          : 'Copy research history as markdown'
                    }
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 6,
                      padding: '2px 7px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color:
                        historyCopyStatus === 'failed'
                          ? '#D85A30'
                          : historyCopyStatus === 'copied'
                            ? '#5A8C6A'
                            : '#A89070',
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                      lineHeight: 1.4,
                    }}
                  >
                    {historyCopyStatus === 'copied'
                      ? 'Copied'
                      : historyCopyStatus === 'failed'
                        ? 'Failed'
                        : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFilteredHistory()}
                    title="Download current history view as markdown"
                    aria-label={
                      historyDownloadStatus === 'done'
                        ? 'History downloaded'
                        : historyDownloadStatus === 'failed'
                          ? 'Download failed'
                          : 'Download research history as markdown'
                    }
                    style={{
                      background: 'none',
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 6,
                      padding: '2px 7px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color:
                        historyDownloadStatus === 'failed'
                          ? '#D85A30'
                          : historyDownloadStatus === 'done'
                            ? '#5A8C6A'
                            : '#A89070',
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                      lineHeight: 1.4,
                    }}
                  >
                    {historyDownloadStatus === 'done'
                      ? 'Downloaded'
                      : historyDownloadStatus === 'failed'
                        ? 'Failed'
                        : 'Download'}
                  </button>
                </div>
              ) : null}
            </div>
            {taskHistory.length > 0 ? (
              <div style={{ marginBottom: 10, position: 'relative', padding: '0 2px' }}>
                <div
                  role="group"
                  aria-label="Filter history by update status"
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginBottom: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  {AGENT_HISTORY_STATUS_OPTIONS.map((opt) => {
                    const selected = historyStatusFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setHistoryStatusFilter(opt.value)}
                        aria-pressed={selected}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 999,
                          border: selected ? 'none' : '0.5px solid #D4C4B0',
                          background: selected ? '#C4956A' : 'transparent',
                          color: selected ? '#FAF7F2' : '#8C7355',
                          fontSize: 11,
                          fontFamily: 'Georgia, serif',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {historyScoreFilterUseful ? (
                  <div
                    role="group"
                    aria-label="Filter history by score"
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {AGENT_HISTORY_SCORE_OPTIONS.map((opt) => {
                      const selected = historyScoreFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setHistoryScoreFilter(opt.value)}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'Georgia, serif',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {historyConfidenceFilterUseful ? (
                  <div
                    role="group"
                    aria-label="Filter history by confidence"
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {AGENT_HISTORY_CONFIDENCE_OPTIONS.map((opt) => {
                      const selected = historyConfidenceFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setHistoryConfidenceFilter(opt.value)}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'Georgia, serif',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {historyRecencyFilterUseful ? (
                  <div
                    role="group"
                    aria-label="Filter history by recency"
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {AGENT_HISTORY_RECENCY_OPTIONS.map((opt) => {
                      const selected = historyRecencyFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setHistoryRecencyFilter(opt.value)}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'Georgia, serif',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {historyFeedbackFilterUseful ? (
                  <div
                    role="group"
                    aria-label="Filter history by your feedback"
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {AGENT_HISTORY_FEEDBACK_OPTIONS.map((opt) => {
                      const selected = historyFeedbackFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setHistoryFeedbackFilter(opt.value)}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'Georgia, serif',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {historyTopicFilterUseful ? (
                  <div
                    role="group"
                    aria-label="Filter history by topic"
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {historyTopicOptions.map((opt) => {
                      const selected = historyTopicFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setHistoryTopicFilter(opt.value)}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'Georgia, serif',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <select
                    value={historySort}
                    onChange={(e) => setHistorySort(e.target.value as AgentHistorySort)}
                    aria-label="Sort research history"
                    title="Sort research history"
                    style={{
                      fontSize: 11,
                      fontFamily: 'Georgia, serif',
                      color: '#4A3728',
                      background: '#FAF7F4',
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 6,
                      padding: '5px 8px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      maxWidth: '100%',
                    }}
                  >
                    {AGENT_HISTORY_SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={historySearchRef}
                    type="search"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Search history…"
                    aria-label="Search research history"
                    autoComplete="off"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 12,
                      fontFamily: 'Georgia, serif',
                      color: '#2C1810',
                      background: '#FAF7F4',
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 8,
                      padding: '7px 28px 7px 10px',
                      outline: 'none',
                    }}
                  />
                  {historySearchQuery ? (
                    <button
                      type="button"
                      aria-label="Clear history search"
                      onClick={() => {
                        setHistorySearchQuery('');
                        historySearchRef.current?.focus();
                      }}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: '#A89070',
                        lineHeight: 1,
                        padding: 4,
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {historyBodyMode === 'loading' ? (
              <div style={{ fontSize: 12, color: '#C4B8AE', textAlign: 'center', padding: '2rem 0' }}>Loading…</div>
            ) : historyBodyMode === 'load_error' ? (
              <div
                role="alert"
                style={{ fontSize: 12, color: '#8C7355', textAlign: 'center', padding: '1.5rem 0.75rem', lineHeight: 1.5 }}
              >
                Could not load research history.
                <br />
                <span style={{ color: '#A89070' }}>Your past tasks are safe — try again.</span>
                <button
                  type="button"
                  onClick={() => void loadTaskHistory()}
                  style={{
                    display: 'block',
                    margin: '10px auto 0',
                    fontSize: 12,
                    color: '#C4956A',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Georgia, serif',
                    textDecoration: 'underline',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : historyBodyMode === 'empty' ? (
              <div style={{ fontSize: 12, color: '#C4B8AE', textAlign: 'center', padding: '2rem 1rem', lineHeight: 1.5 }}>
                No research yet.
                <br />
                <span style={{ color: '#A89070' }}>Ask something hard below — it will show up here.</span>
              </div>
            ) : filteredTaskHistory.length === 0 ? (
              <div style={{ fontSize: 12, color: '#C4B8AE', textAlign: 'center', padding: '1.5rem 0.75rem', lineHeight: 1.5 }}>
                {historySearchQuery.trim()
                  ? `No history matches “${historySearchQuery.trim()}”${
                      historyStatusFilter !== 'all'
                        ? ` in ${agentHistoryStatusLabel(historyStatusFilter).toLowerCase()}`
                        : ''
                    }${
                      historyScoreFilter !== 'all'
                        ? ` · ${agentHistoryScoreLabel(historyScoreFilter)}`
                        : ''
                    }${
                      historyConfidenceFilter !== 'all'
                        ? ` · ${agentHistoryConfidenceLabel(historyConfidenceFilter)}`
                        : ''
                    }${
                      historyRecencyFilter !== 'all'
                        ? ` · ${agentHistoryRecencyLabel(historyRecencyFilter)}`
                        : ''
                    }${
                      historyFeedbackFilter !== 'all'
                        ? ` · ${agentHistoryFeedbackLabel(historyFeedbackFilter)}`
                        : ''
                    }${
                      historyTopicFilter !== AGENT_HISTORY_TOPIC_ALL
                        ? ` · ${agentHistoryTopicLabel(historyTopicFilter, historyTopicOptions)}`
                        : ''
                    }`
                  : historyRecencyFilter !== 'all' &&
                      historyStatusFilter === 'all' &&
                      historyScoreFilter === 'all' &&
                      historyConfidenceFilter === 'all' &&
                      historyFeedbackFilter === 'all' &&
                      historyTopicFilter === AGENT_HISTORY_TOPIC_ALL
                    ? `No tasks from ${agentHistoryRecencyLabel(historyRecencyFilter).toLowerCase()}.`
                    : historyFeedbackFilter !== 'all' &&
                        historyStatusFilter === 'all' &&
                        historyScoreFilter === 'all' &&
                        historyConfidenceFilter === 'all' &&
                        historyRecencyFilter === 'all' &&
                        historyTopicFilter === AGENT_HISTORY_TOPIC_ALL
                      ? `No tasks marked ${agentHistoryFeedbackLabel(historyFeedbackFilter).toLowerCase()}.`
                      : historyTopicFilter !== AGENT_HISTORY_TOPIC_ALL &&
                          historyStatusFilter === 'all' &&
                          historyScoreFilter === 'all' &&
                          historyConfidenceFilter === 'all' &&
                          historyRecencyFilter === 'all' &&
                          historyFeedbackFilter === 'all'
                        ? `No tasks tagged ${agentHistoryTopicLabel(historyTopicFilter, historyTopicOptions)}.`
                        : historyConfidenceFilter !== 'all' &&
                            historyStatusFilter === 'all' &&
                            historyScoreFilter === 'all' &&
                            historyTopicFilter === AGENT_HISTORY_TOPIC_ALL &&
                            historyRecencyFilter === 'all' &&
                            historyFeedbackFilter === 'all'
                          ? `No tasks with confidence ${agentHistoryConfidenceLabel(historyConfidenceFilter)}.`
                          : historyScoreFilter !== 'all' && historyStatusFilter === 'all'
                            ? `No tasks with score ${agentHistoryScoreLabel(historyScoreFilter)}.`
                            : historyStatusFilter === 'live'
                              ? 'No live weekly-update tasks yet.'
                              : historyStatusFilter === 'completed'
                                ? 'No one-off research tasks in this view.'
                                : 'No matching history.'}
                <br />
                <button
                  type="button"
                  onClick={() => {
                    setHistorySearchQuery('');
                    setHistoryStatusFilter('all');
                    setHistoryScoreFilter('all');
                    setHistoryConfidenceFilter('all');
                    setHistoryRecencyFilter('all');
                    setHistoryFeedbackFilter('all');
                    setHistoryTopicFilter(AGENT_HISTORY_TOPIC_ALL);
                    historySearchRef.current?.focus();
                  }}
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: '#C4956A',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Georgia, serif',
                    textDecoration: 'underline',
                  }}
                >
                  {(historyStatusFilter !== 'all' ||
                    historyScoreFilter !== 'all' ||
                    historyConfidenceFilter !== 'all' ||
                    historyRecencyFilter !== 'all' ||
                    historyFeedbackFilter !== 'all' ||
                    historyTopicFilter !== AGENT_HISTORY_TOPIC_ALL) &&
                  !historySearchQuery.trim()
                    ? 'Show all history'
                    : 'Clear filters'}
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTaskHistory.map((item) => renderAgentHistoryRow(item))}
              </div>
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
                padding: 6,
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: navToggleHovered ? '#2C1810' : '#8C7355',
                transition: 'background 0.15s',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.outline = 'none'; }}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen && !isMobile ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flex: 1,
                minWidth: 0,
                justifyContent: isMobile ? 'center' : 'flex-start',
              }}
            >
              <div
                style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4956A' }}
                className="breathe"
              />
              <button
                type="button"
                onClick={() => navigate('/')}
                className="wordmark-text"
                style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  color: '#1A1714',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  transition: 'color 0.15s ease',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#C4956A';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#1A1714';
                }}
              >
                Agent
              </button>
            </div>
            {isMobile && user ? (
              <button
                type="button"
                onClick={() => openModal('bottom-left')}
                aria-label="Profile and settings"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#C4956A',
                  color: '#FAF7F2',
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1.5px solid #E0D8D0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {agentProfileInitials(user)}
              </button>
            ) : null}
            {isRunning || isRefining || isChallengingAnswer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: '#C4956A' }}>
                  {isChallengingAnswer && !isRunning
                    ? 'Challenging…'
                    : isRefining && !isRunning
                      ? 'Refining…'
                      : currentStageLabel}
                </span>
                <button
                  type="button"
                  onClick={handleStopAgentWork}
                  title="Stop generating"
                  aria-label="Stop generating"
                  style={{
                    fontSize: 12,
                    fontFamily: 'Georgia, serif',
                    color: '#993C1D',
                    background: 'transparent',
                    border: '0.5px solid rgba(153, 60, 29, 0.35)',
                    borderRadius: 8,
                    padding: '5px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Stop
                </button>
              </div>
            ) : null}
          </header>

      {toastMessage ? (
        (() => {
          const kind = agentToastKind(toastMessage);
          const isError = kind === 'error';
          return (
            <div
              role={agentToastRole(kind)}
              aria-live={agentToastAriaLive(kind)}
              style={{
                position: 'fixed',
                top: 64,
                right: 20,
                zIndex: 80,
                background: isError ? '#4A2A22' : '#1A1714',
                color: '#FAF7F4',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 12,
                maxWidth: 'min(360px, calc(100vw - 40px))',
                lineHeight: 1.45,
                boxShadow: '0 8px 24px rgba(26,23,20,0.18)',
              }}
            >
              {toastMessage}
            </div>
          );
        })()
      ) : null}

      <main
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          boxSizing: 'border-box',
          overflowY: 'auto',
          padding: isMobile ? '14px 16px' : '1.5rem',
        }}
      >
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

            {!isRunning && !result && !orchResult && (
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
                  {!hasAgentAccess ? (
                    isPlus && user ? (
                      <div style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.25rem', width: '100%' }}>
                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                          <Lock style={{ width: 32, height: 32, color: '#C4956A' }} />
                        </div>
                        <h1
                          style={{
                            fontSize: 28,
                            fontWeight: 400,
                            color: '#1A1714',
                            marginBottom: '0.5rem',
                            textAlign: 'center',
                          }}
                        >
                          Agent
                        </h1>
                        <p
                          style={{
                            fontSize: 14,
                            color: '#6B6460',
                            lineHeight: 1.7,
                            marginBottom: '1.5rem',
                            textAlign: 'center',
                          }}
                        >
                          A 7-stage AI pipeline that researches, solves, critiques, verifies, and synthesises. Unlock it on
                          your Plus plan or upgrade to Pro.
                        </p>
                        {agentAddonCheckout && user.email ? (
                          <RazorpayCheckout
                            planKey="agent_addon"
                            agentAddon
                            prefillEmail={user.email}
                            onSuccess={async () => {
                              setAgentAddonCheckout(false);
                              await refreshUser();
                              await refreshTier();
                            }}
                            onError={() => setAgentAddonCheckout(false)}
                            onClose={() => setAgentAddonCheckout(false)}
                          />
                        ) : null}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 16,
                            background: '#FAF7F2',
                            border: '0.5px solid #E0D5C5',
                            borderRadius: 12,
                            padding: 24,
                            alignItems: 'stretch',
                            maxWidth: 560,
                            margin: '0 auto',
                          }}
                        >
                          <div style={{ borderRight: '0.5px solid #EDE4D8', paddingRight: 16 }}>
                            <div
                              style={{
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                color: '#A89070',
                                marginBottom: 8,
                              }}
                            >
                              Add to Plus
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 28, color: '#2C1810', fontWeight: 500 }}>₹599</span>
                              <span style={{ fontSize: 14, color: '#A89070' }}>/month</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#8C7355', fontStyle: 'italic', margin: '0 0 12px', lineHeight: 1.5 }}>
                              Agent Mode on your current plan
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#4A3728' }}>
                              <span>✓ Full 7-stage pipeline</span>
                              <span>✓ Plus limits apply (100K/day)</span>
                              <span>✓ Cancel anytime</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAgentAddonCheckout(true)}
                              style={{
                                width: '100%',
                                background: '#2C1810',
                                color: '#C4956A',
                                borderRadius: 20,
                                padding: '9px 18px',
                                fontSize: 13,
                                fontFamily: 'Georgia, serif',
                                border: 'none',
                                cursor: 'pointer',
                                marginTop: 12,
                              }}
                            >
                              Add Agent Mode →
                            </button>
                          </div>
                          <div style={{ paddingLeft: 4 }}>
                            <div
                              style={{
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                color: '#A89070',
                                marginBottom: 8,
                              }}
                            >
                              Upgrade to Pro
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 28, color: '#2C1810', fontWeight: 500 }}>₹2,499</span>
                              <span style={{ fontSize: 14, color: '#A89070' }}>/month</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#8C7355', fontStyle: 'italic', margin: '0 0 12px', lineHeight: 1.5 }}>
                              3× more credits + priority routing
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#4A3728' }}>
                              <span>✓ 300K credits/day</span>
                              <span>✓ Priority model routing</span>
                              <span>✓ Loyalty reward after 10 months</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate('/pricing')}
                              style={{
                                width: '100%',
                                background: 'transparent',
                                color: '#C4956A',
                                borderRadius: 20,
                                padding: '9px 18px',
                                fontSize: 13,
                                fontFamily: 'Georgia, serif',
                                border: '0.5px solid #C4956A',
                                cursor: 'pointer',
                                marginTop: 12,
                              }}
                            >
                              Upgrade to Pro →
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          maxWidth: 480,
                          margin: '0 auto',
                          textAlign: 'center',
                          padding: '3rem 2rem',
                          width: '100%',
                        }}
                      >
                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                          <Lock style={{ width: 32, height: 32, color: '#C4956A' }} />
                        </div>
                        <h1 style={{ fontSize: 28, fontWeight: 400, color: '#1A1714', marginBottom: '0.5rem' }}>Agent</h1>
                        <p style={{ fontSize: 14, color: '#6B6460', lineHeight: 1.7, marginBottom: '2rem' }}>
                          A 7-stage AI pipeline that researches, solves, critiques, verifies, and synthesises. Not just an
                          answer — a process.
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
                    )
                  ) : (
                    <>
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
                        fontSize: isMobile ? 28 : 42,
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
                        fontSize: 17,
                        color: '#8C7355',
                        fontStyle: 'italic',
                        textAlign: 'center',
                        margin: '0 0 14px',
                        maxWidth: 520,
                      }}
                    >
                      Seven stages of reasoning — plan through judge — working for you.
                    </p>
                    <div
                      className="horizontal-scroll"
                      style={{
                        display: 'flex',
                        flexWrap: 'nowrap',
                        gap: 6,
                        justifyContent: isMobile ? 'flex-start' : 'center',
                        maxWidth: 640,
                        width: '100%',
                        padding: isMobile ? '0 4px' : undefined,
                      }}
                    >
                      {INPUT_STAGE_PILLS.map((label) => (
                        <div
                          key={label}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            letterSpacing: '0.04em',
                            color: '#B8A898',
                            padding: '5px 14px',
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
                    </>
                  )}
                </div>

                <div
                  className="fixed-input-bar"
                  style={{
                    position: 'fixed',
                    bottom: 0,
                    left: isMobile ? 0 : sidebarOpen ? 224 : 0,
                    right: 0,
                    transition: 'left 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
                    padding: isMobile
                      ? '12px 16px max(20px, env(safe-area-inset-bottom, 20px))'
                      : '16px 24px 24px',
                    background: 'linear-gradient(to top, rgba(245,240,232,1) 60%, rgba(245,240,232,0) 100%)',
                    zIndex: 50,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ pointerEvents: 'auto', maxWidth: 640, margin: '0 auto' }}>
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
                    {(() => {
                      const recentChips = pickRecentAgentChips(
                        taskHistory,
                        4,
                        dismissedChipIds,
                      );
                      if (recentChips.length === 0) return null;
                      return (
                      <div
                        role="list"
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginBottom: 12,
                          maxWidth: 640,
                          marginLeft: 'auto',
                          marginRight: 'auto',
                        }}
                        aria-label="Recent research"
                      >
                        {recentChips.map((chip) => (
                          <div
                            key={chip.task_id}
                            role="listitem"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              maxWidth: isMobile ? '46vw' : 220,
                              background: 'rgba(255,255,255,0.72)',
                              border: '0.5px solid #E0D8D0',
                              borderRadius: 999,
                              overflow: 'hidden',
                            }}
                          >
                            <button
                              type="button"
                              title={chip.task_text}
                              aria-label={`Reuse recent research: ${chip.label}`}
                              onClick={() => {
                                setSelectedTemplate(null);
                                setTemplateSlots({});
                                setMultiMode(false);
                                setTask(chip.task_text);
                                requestAnimationFrame(() => idleTaskInputRef.current?.focus());
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Backspace' || e.key === 'Delete') {
                                  e.preventDefault();
                                  setDismissedChipIds(dismissAgentChip(chip.task_id));
                                }
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setDismissedChipIds(dismissAgentChip(chip.task_id));
                              }}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: 12,
                                color: '#6B6460',
                                background: 'transparent',
                                border: 'none',
                                padding: '6px 4px 6px 12px',
                                cursor: 'pointer',
                                fontFamily: 'Georgia, serif',
                                textAlign: 'left',
                              }}
                            >
                              {chip.label}
                            </button>
                            <button
                              type="button"
                              aria-label={`Hide recent research: ${chip.label}`}
                              title="Hide this chip (local only)"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDismissedChipIds(dismissAgentChip(chip.task_id));
                              }}
                              style={{
                                flexShrink: 0,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 14,
                                color: '#A89070',
                                lineHeight: 1,
                                padding: '6px 10px 6px 4px',
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          title="Show all recent chips again (local)"
                          aria-label="Reset hidden recent research chips"
                          onClick={() => setDismissedChipIds(clearDismissedAgentChips())}
                          style={{
                            fontSize: 11,
                            color: '#A89070',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            fontFamily: 'Georgia, serif',
                            textDecoration: 'underline',
                            textUnderlineOffset: 3,
                          }}
                        >
                          Reset chips
                        </button>
                      </div>
                      );
                    })()}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Icons.grid(14)}
                        onClick={() => setTemplatesOpen(true)}
                      >
                        Templates
                      </Button>
                      {canOrchestrate ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon={Icons.layers(14)}
                          onClick={() => {
                            setMultiMode((m) => {
                              const next = !m;
                              if (next) {
                                setSelectedTemplate(null);
                                setTemplateSlots({});
                              }
                              return next;
                            });
                          }}
                          style={
                            multiMode
                              ? {
                                  borderColor: '#C4956A',
                                  color: '#C4956A',
                                  background: '#FAF3EA',
                                }
                              : undefined
                          }
                        >
                          Multi-task
                        </Button>
                      ) : null}
                    </div>
                    <TemplatesModal
                      open={templatesOpen}
                      closing={templatesClosing}
                      categories={templateCategories}
                      loading={templatesLoading}
                      loadFailed={templatesLoadFailed}
                      onRetryLoad={() => {
                        void loadAgentTemplates();
                      }}
                      onClose={closeTemplatesModal}
                      onSelect={(t) => {
                        const next: Record<string, string> = {};
                        t.slots.forEach((k) => {
                          next[k] = '';
                        });
                        setTemplateSlots(next);
                        setSelectedTemplate(t);
                        setMultiMode(false);
                      }}
                    />
                    <form
                      className="agent-bottom-input-shell"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!hasAgentAccess) return;
                        if (multiMode && canOrchestrate) {
                          const qs = multiTasks.slice(0, activeTaskCount).map((x) => x.trim());
                          if (
                            qs.length === activeTaskCount &&
                            qs.every((q) => q.length >= 10) &&
                            !isRunning
                          ) {
                            void handleOrchestrateRun();
                          }
                          return;
                        }
                        const ready = selectedTemplate
                          ? allTemplateSlotsFilled && assembledTemplatePrompt.trim().length >= 10
                          : task.trim().length >= 10;
                        if (ready && !isRunning) void handleRunTask();
                      }}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection:
                          multiMode ||
                          selectedTemplate ||
                          (!multiMode && !selectedTemplate && (attachments.length > 0 || activeMcpSources.length > 0))
                            ? 'column'
                            : 'row',
                        alignItems:
                          multiMode ||
                          selectedTemplate ||
                          (!multiMode && !selectedTemplate && (attachments.length > 0 || activeMcpSources.length > 0))
                            ? 'stretch'
                            : 'center',
                        gap: 12,
                        background: '#FDFAF6',
                        borderRadius:
                          multiMode ||
                          selectedTemplate ||
                          (!multiMode && !selectedTemplate && (attachments.length > 0 || activeMcpSources.length > 0))
                            ? 20
                            : 32,
                        padding: '12px 12px 12px 20px',
                      }}
                    >
                      {multiMode && canOrchestrate ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: 10,
                            }}
                          >
                            <span style={{ fontSize: 12, color: '#8C7355' }}>
                              Run {activeTaskCount} tasks in parallel
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button
                                type="button"
                                disabled={activeTaskCount <= 2 || isRunning}
                                onClick={() => setActiveTaskCount((n) => Math.max(2, n - 1))}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  border: '0.5px solid #D4C4B0',
                                  background: '#FAF7F2',
                                  cursor: activeTaskCount <= 2 ? 'default' : 'pointer',
                                  fontSize: 16,
                                  color: '#8C7355',
                                }}
                              >
                                −
                              </button>
                              <span style={{ fontSize: 12, color: '#8C7355', minWidth: 16, textAlign: 'center' }}>
                                {activeTaskCount}
                              </span>
                              <button
                                type="button"
                                disabled={activeTaskCount >= 4 || isRunning}
                                onClick={() => setActiveTaskCount((n) => Math.min(4, n + 1))}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  border: '0.5px solid #D4C4B0',
                                  background: '#FAF7F2',
                                  cursor: activeTaskCount >= 4 ? 'default' : 'pointer',
                                  fontSize: 16,
                                  color: '#8C7355',
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {Array.from({ length: activeTaskCount }, (_, i) => {
                            const placeholders = [
                              'First research question...',
                              'Second research question...',
                              'Third research question...',
                              'Fourth research question...',
                            ];
                            return (
                              <div
                                key={i}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 10,
                                  background: '#FDFAF6',
                                  border: '0.5px solid #E0D5C5',
                                  borderRadius: 24,
                                  padding: '8px 12px 8px 10px',
                                }}
                              >
                                <div
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    background: '#F0E8DC',
                                    color: '#8C7355',
                                    fontSize: 11,
                                    fontFamily: 'ui-monospace, monospace',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    marginTop: 2,
                                  }}
                                >
                                  {String(i + 1).padStart(2, '0')}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <textarea
                                    value={multiTasks[i] ?? ''}
                                    maxLength={AGENT_TASK_MAX_CHARS}
                                    onChange={(e) =>
                                      setMultiTasks((prev) => {
                                        const next = [...prev];
                                        next[i] = clampToMax(e.target.value, AGENT_TASK_MAX_CHARS);
                                        return next;
                                      })
                                    }
                                    placeholder={placeholders[i]}
                                    disabled={isRunning}
                                    rows={2}
                                    aria-label={`Multi-task question ${i + 1}`}
                                    style={{
                                      width: '100%',
                                      border: 'none',
                                      background: 'transparent',
                                      resize: 'vertical',
                                      fontSize: 14,
                                      fontFamily: 'Georgia, serif',
                                      color: '#2C1810',
                                      outline: 'none',
                                    }}
                                  />
                                  {(multiTasks[i] ?? '').length >= Math.floor(AGENT_TASK_MAX_CHARS * 0.85) ? (
                                    <div
                                      style={{
                                        fontSize: 10,
                                        textAlign: 'right',
                                        color:
                                          charBudgetTone((multiTasks[i] ?? '').length) === 'danger'
                                            ? '#D85A30'
                                            : charBudgetTone((multiTasks[i] ?? '').length) === 'warn'
                                              ? '#B07840'
                                              : '#A89070',
                                      }}
                                    >
                                      {charBudgetLabel((multiTasks[i] ?? '').length)}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          {!multiTasks.slice(0, activeTaskCount).every((t) => t.trim().length >= 10) ? (
                            <p style={{ fontSize: 11, color: '#A89070', margin: 0 }}>
                              Each question needs at least 10 characters (max {AGENT_TASK_MAX_CHARS}).
                            </p>
                          ) : null}
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              type="submit"
                              disabled={
                                !multiTasks.slice(0, activeTaskCount).every((t) => t.trim().length >= 10) ||
                                isRunning ||
                                !hasAgentAccess
                              }
                              style={{
                                padding: '10px 18px',
                                borderRadius: 20,
                                border: 'none',
                                background:
                                  multiTasks.slice(0, activeTaskCount).every((t) => t.trim().length >= 10) &&
                                  !isRunning &&
                                  hasAgentAccess
                                    ? '#C4956A'
                                    : '#D4C4B0',
                                color: '#FDFAF6',
                                fontSize: 13,
                                fontFamily: 'Georgia, serif',
                                cursor:
                                  multiTasks.slice(0, activeTaskCount).every((t) => t.trim().length >= 10) &&
                                  !isRunning &&
                                  hasAgentAccess
                                    ? 'pointer'
                                    : 'default',
                              }}
                            >
                              Run {activeTaskCount} tasks →
                            </button>
                          </div>
                        </>
                      ) : selectedTemplate ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              flexWrap: 'wrap',
                            }}
                          >
                            <span
                              style={{
                                background: '#2C1810',
                                color: '#C4956A',
                                borderRadius: 20,
                                padding: '4px 12px',
                                fontSize: 11,
                                fontFamily: 'Georgia, serif',
                              }}
                            >
                              {selectedTemplate.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTemplate(null);
                                setTemplateSlots({});
                              }}
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: 12,
                                color: '#A89070',
                                fontFamily: 'Georgia, serif',
                                padding: 0,
                              }}
                            >
                              × Clear template
                            </button>
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              lineHeight: 1.55,
                              fontFamily: 'Georgia, serif',
                              padding: '10px 12px',
                              background: '#FAF7F2',
                              border: '0.5px solid #E0D5C5',
                              borderRadius: 8,
                              minHeight: 48,
                            }}
                          >
                            {agentTemplatePreviewNodes(selectedTemplate, templateSlots)}
                          </div>
                          {selectedTemplate.slots.map((slotKey) => (
                            <div key={slotKey}>
                              <label
                                style={{
                                  display: 'block',
                                  fontSize: 10,
                                  textTransform: 'uppercase',
                                  color: '#A89070',
                                  marginBottom: 4,
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {formatTemplateSlotLabel(slotKey)}
                              </label>
                              <input
                                type="text"
                                value={templateSlots[slotKey] ?? ''}
                                disabled={isRunning}
                                onChange={(e) =>
                                  setTemplateSlots((prev) => ({ ...prev, [slotKey]: e.target.value }))
                                }
                                style={{
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  border: '0.5px solid #D4C4B0',
                                  borderRadius: 6,
                                  padding: '7px 12px',
                                  fontSize: 13,
                                  fontFamily: 'Georgia, serif',
                                  outline: 'none',
                                  background: '#fff',
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = '#C4956A';
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = '#D4C4B0';
                                }}
                              />
                            </div>
                          ))}
                          {!allTemplateSlotsFilled ? (
                            <p style={{ fontSize: 11, color: '#A89070', margin: 0 }}>Fill all fields</p>
                          ) : null}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                            <button
                              type="submit"
                              disabled={
                                !allTemplateSlotsFilled ||
                                assembledTemplatePrompt.trim().length < 10 ||
                                isRunning ||
                                !hasAgentAccess
                              }
                              onMouseEnter={(e) => {
                                if (
                                  allTemplateSlotsFilled &&
                                  assembledTemplatePrompt.trim().length >= 10 &&
                                  !isRunning &&
                                  hasAgentAccess
                                ) {
                                  e.currentTarget.style.background = '#B07850';
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background =
                                  allTemplateSlotsFilled &&
                                  assembledTemplatePrompt.trim().length >= 10 &&
                                  !isRunning &&
                                  hasAgentAccess
                                    ? '#C4956A'
                                    : '#D4C4B0';
                              }}
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                border: 'none',
                                cursor:
                                  allTemplateSlotsFilled &&
                                  assembledTemplatePrompt.trim().length >= 10 &&
                                  !isRunning &&
                                  hasAgentAccess
                                    ? 'pointer'
                                    : 'default',
                                background:
                                  allTemplateSlotsFilled &&
                                  assembledTemplatePrompt.trim().length >= 10 &&
                                  !isRunning &&
                                  hasAgentAccess
                                    ? '#C4956A'
                                    : '#D4C4B0',
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
                          </div>
                        </>
                      ) : (
                        <>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.doc,.docx,.txt"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              files.forEach(file => void uploadAttachmentFile(file));
                              e.target.value = '';
                            }}
                          />
                          <div
                            ref={attachZoneRef}
                            tabIndex={-1}
                            style={{
                              position: 'relative',
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                              minWidth: 0,
                            }}
                            onBlur={(e) => {
                              if (!attachZoneRef.current?.contains(e.relatedTarget as Node)) {
                                setAttachMenuOpen(false);
                              }
                            }}
                          >
                            {uploadErr ? (
                              <div
                                role="alert"
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: 8,
                                  margin: 0,
                                }}
                              >
                                <p style={{ fontSize: 11, color: '#C0392B', margin: 0, flex: 1, lineHeight: 1.4 }}>
                                  {uploadErr}
                                </p>
                                <button
                                  type="button"
                                  aria-label="Dismiss upload error"
                                  onClick={() => setUploadErr(null)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    color: '#A89070',
                                    lineHeight: 1,
                                    padding: 0,
                                    flexShrink: 0,
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ) : null}
                            {attachments.length > 0 || activeMcpSources.length > 0 ? (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                {attachments.map((a: any) => (
                                  <span
                                    key={a.file_id}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      borderRadius: 8,
                                      padding: '4px 10px',
                                      marginRight: 4,
                                      background: '#F0E8DC',
                                      border: '0.5px solid #D4C4B0',
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: 4,
                                        background: '#FAF7F2',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" aria-hidden>
                                        <path
                                          d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
                                          stroke="#C4956A"
                                          strokeWidth={1.2}
                                        />
                                        <path d="M14 2v6h6" stroke="#C4956A" strokeWidth={1.2} />
                                      </svg>
                                    </span>
                                    <span style={{ fontSize: 12, color: '#4A3728', maxWidth: 120 }} title={a.filename}>
                                      {(a.filename || 'file').length > 20
                                        ? `${(a.filename || 'file').slice(0, 20)}…`
                                        : a.filename || 'file'}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label="Remove attachment"
                                      onClick={() =>
                                        setAttachments((prev) => prev.filter((x) => x.file_id !== a.file_id))
                                      }
                                      style={{
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        color: '#A89070',
                                        padding: 0,
                                        lineHeight: 1,
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                {activeMcpSources.map((iid) => {
                                  const integ = integrations.find((x: any) => x.id === iid);
                                  const label = integ?.display_name || integ?.service || 'MCP';
                                  const svc = String(integ?.service || '');
                                  const bg =
                                    svc === 'github' ? '#2C1810' : svc === 'google_drive' ? '#185FA5' : '#2C1810';
                                  const fg = svc === 'github' ? '#FAF7F2' : '#FAF7F2';
                                  return (
                                    <span
                                      key={`mcp-${iid}`}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        borderRadius: 8,
                                        padding: '4px 10px',
                                        marginRight: 4,
                                        background: '#EEEDFE',
                                        border: '0.5px solid #AFA9EC',
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 18,
                                          height: 18,
                                          borderRadius: 4,
                                          background: bg,
                                          color: fg,
                                          fontSize: 9,
                                          fontWeight: 600,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        {svc === 'google_drive' ? 'G' : svc === 'github' ? 'gh' : 'N'}
                                      </span>
                                      <span style={{ fontSize: 12, color: '#26215C', maxWidth: 120 }}>{label}</span>
                                      <button
                                        type="button"
                                        aria-label="Remove MCP source"
                                        onClick={() =>
                                          setActiveMcpSources((prev) => prev.filter((x) => x !== iid))
                                        }
                                        style={{
                                          border: 'none',
                                          background: 'none',
                                          cursor: 'pointer',
                                          fontSize: 12,
                                          color: '#A89070',
                                          padding: 0,
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            ) : null}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                width: '100%',
                              }}
                            >
                              <button
                                type="button"
                                aria-expanded={attachMenuOpen}
                                aria-haspopup="menu"
                                onClick={() => setAttachMenuOpen((o) => !o)}
                                style={{
                                  width: isMobile ? 32 : 28,
                                  height: isMobile ? 32 : 28,
                                  borderRadius: '50%',
                                  background: attachMenuOpen ? '#E8DDD0' : '#F0E8DC',
                                  border: attachMenuOpen ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                  transition: 'all 0.15s',
                                }}
                              >
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
                                  <path
                                    d="M12 5v14M5 12h14"
                                    stroke={attachMenuOpen ? '#C4956A' : '#8C7355'}
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                              <input
                                id="agent-prompt"
                                ref={idleTaskInputRef}
                                type="text"
                                value={task}
                                disabled={isRunning}
                                placeholder=""
                                maxLength={AGENT_TASK_MAX_CHARS}
                                aria-label="Research task"
                                onChange={(e) => setTask(clampToMax(e.target.value))}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  border: 'none',
                                  background: 'transparent',
                                  outline: 'none',
                                  fontSize: isMobile ? 16 : 14,
                                  color: '#2C1810',
                                  fontFamily: 'Georgia, serif',
                                }}
                              />
                              <span
                                aria-live="polite"
                                title="Character budget (server max 2000)"
                                style={{
                                  fontSize: 10,
                                  fontFamily: 'Georgia, serif',
                                  color:
                                    charBudgetTone(task.length) === 'danger'
                                      ? '#993C1D'
                                      : charBudgetTone(task.length) === 'warn'
                                        ? '#C4956A'
                                        : charBudgetTone(task.length) === 'ready'
                                          ? '#8C7355'
                                          : '#C4B8AE',
                                  flexShrink: 0,
                                  minWidth: isMobile ? 0 : 52,
                                  textAlign: 'right',
                                  display: isMobile && task.length < 10 ? 'none' : 'inline',
                                }}
                              >
                                {task.length >= 10 || task.length >= Math.floor(AGENT_TASK_MAX_CHARS * 0.85)
                                  ? charBudgetLabel(task.length)
                                  : ''}
                              </span>
                              <button
                                type="submit"
                                disabled={task.trim().length < 10 || isRunning || !hasAgentAccess}
                                title={
                                  !hasAgentAccess
                                    ? 'Agent Mode requires Pro or the Agent add-on'
                                    : isRunning
                                      ? 'Running…'
                                      : task.trim().length < 10
                                        ? agentMinLengthHint(task) || 'Type at least 10 characters'
                                        : 'Run research task'
                                }
                                onMouseEnter={(e) => {
                                  if (task.trim().length >= 10 && !isRunning && hasAgentAccess) {
                                    e.currentTarget.style.background = '#B07850';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background =
                                    task.trim().length >= 10 && !isRunning && hasAgentAccess
                                      ? '#C4956A'
                                      : '#D4C4B0';
                                }}
                                style={{
                                  width: isMobile ? 32 : 34,
                                  height: isMobile ? 32 : 34,
                                  borderRadius: '50%',
                                  border: 'none',
                                  cursor:
                                    task.trim().length >= 10 && !isRunning && hasAgentAccess ? 'pointer' : 'default',
                                  background:
                                    task.trim().length >= 10 && !isRunning && hasAgentAccess ? '#C4956A' : '#D4C4B0',
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
                            </div>
                            {agentMinLengthHint(task) ? (
                              <p
                                role="status"
                                style={{
                                  margin: '8px 0 0',
                                  fontSize: 11,
                                  color: '#A89070',
                                  fontFamily: 'Georgia, serif',
                                  textAlign: 'center',
                                }}
                              >
                                {agentMinLengthHint(task)}
                              </p>
                            ) : null}
                            {attachMenuOpen && !isMobile ? (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: 'calc(100% + 8px)',
                                  left: 0,
                                  background: '#FDFAF6',
                                  border: '0.5px solid #DDD0BC',
                                  borderRadius: 12,
                                  width: 220,
                                  boxShadow: '0 4px 16px rgba(44,24,16,0.08)',
                                  zIndex: 100,
                                  animation: 'attachMenuFade 0.2s ease',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setAttachMenuOpen(false); fileInputRef.current?.click(); }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 14px',
                                    cursor: 'pointer',
                                    borderRadius: '12px 12px 0 0',
                                    border: 'none',
                                    background: 'transparent',
                                    width: '100%',
                                    textAlign: 'left',
                                    font: 'inherit',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#F5EFE6')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  <span
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 7,
                                      background: '#EAF0F7',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                                    </svg>
                                  </span>
                                  <span>
                                    <span style={{ display: 'block', fontSize: 13, color: '#2C1810' }}>
                                      Add files or photos
                                    </span>
                                    <span style={{ fontSize: 10, color: '#A89070' }}>Images, PDFs, docs…</span>
                                  </span>
                                </button>
                                <div style={{ height: 0.5, background: '#EDE4D8', margin: '0 8px' }} />
                                <div
                                  style={{ position: 'relative' }}
                                  onMouseEnter={() => setMcpSubHovered(true)}
                                  onMouseLeave={() => setMcpSubHovered(false)}
                                >
                                  <button
                                    type="button"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                      padding: '10px 14px',
                                      cursor: 'pointer',
                                      borderRadius: '0 0 12px 12px',
                                      border: 'none',
                                      background: mcpSubHovered ? '#F0EBF8' : 'transparent',
                                      width: '100%',
                                      textAlign: 'left',
                                      font: 'inherit',
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 7,
                                        background: '#EEEDFE',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
                                        <path
                                          d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                                          stroke="#534AB7"
                                          strokeWidth={1.2}
                                        />
                                      </svg>
                                    </span>
                                    <span style={{ flex: 1 }}>
                                      <span style={{ display: 'block', fontSize: 13, color: '#2C1810' }}>MCP</span>
                                      <span style={{ fontSize: 10, color: '#A89070' }}>
                                        {integrations.length > 0
                                          ? `${integrations.length} connected`
                                          : 'Connect tools'}
                                      </span>
                                    </span>
                                    <span style={{ fontSize: 11, color: '#C4A882' }}>›</span>
                                  </button>
                                  {mcpSubHovered ? (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        left: 224,
                                        bottom: 0,
                                        background: '#FDFAF6',
                                        border: '0.5px solid #DDD0BC',
                                        borderRadius: 12,
                                        width: 200,
                                        boxShadow: '0 4px 16px rgba(44,24,16,0.08)',
                                        zIndex: 101,
                                      }}
                                    >
                                      {integrations.map((integ: any) => {
                                        const sel = activeMcpSources.includes(integ.id);
                                        return (
                                          <button
                                            key={integ.id}
                                            type="button"
                                            onClick={() => {
                                              setActiveMcpSources((prev) =>
                                                prev.includes(integ.id)
                                                  ? prev.filter((x) => x !== integ.id)
                                                  : [...prev, integ.id],
                                              );
                                            }}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 8,
                                              padding: '9px 13px',
                                              cursor: 'pointer',
                                              border: 'none',
                                              background: 'transparent',
                                              width: '100%',
                                              textAlign: 'left',
                                              font: 'inherit',
                                            }}
                                          >
                                            <span
                                              style={{
                                                width: 22,
                                                height: 22,
                                                borderRadius: 5,
                                                background:
                                                  integ.service === 'github'
                                                    ? '#2C1810'
                                                    : integ.service === 'google_drive'
                                                      ? '#EAF0F7'
                                                      : '#F0E8DC',
                                                color:
                                                  integ.service === 'google_drive' ? '#185FA5' : '#FAF7F2',
                                                fontSize: 10,
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                              }}
                                            >
                                              {integ.service === 'google_drive'
                                                ? 'G'
                                                : integ.service === 'github'
                                                  ? 'gh'
                                                  : 'N'}
                                            </span>
                                            <span style={{ fontSize: 12, color: '#2C1810', flex: 1 }}>
                                              {integ.display_name || integ.service}
                                            </span>
                                            {sel ? (
                                              <span style={{ fontSize: 12, color: '#534AB7' }}>✓</span>
                                            ) : (
                                              <span
                                                style={{
                                                  width: 6,
                                                  height: 6,
                                                  borderRadius: '50%',
                                                  background: '#639922',
                                                  marginLeft: 'auto',
                                                }}
                                              />
                                            )}
                                          </button>
                                        );
                                      })}
                                      {integrations.length > 0 ? (
                                        <div style={{ height: 0.5, background: '#EDE4D8' }} />
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAttachMenuOpen(false);
                                          setActiveTab('integrations');
                                          openModal('bottom-left', 'integrations');
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 8,
                                          padding: '9px 13px',
                                          cursor: 'pointer',
                                          border: 'none',
                                          background: 'transparent',
                                          width: '100%',
                                          fontSize: 12,
                                          color: '#C4956A',
                                          fontFamily: 'Georgia, serif',
                                        }}
                                      >
                                        Manage MCP →
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                            {attachMenuOpen && isMobile ? (
                              <div
                                style={{
                                  position: 'fixed',
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  zIndex: 200,
                                  background: '#FDFAF6',
                                  borderRadius: '16px 16px 0 0',
                                  border: '0.5px solid #DDD0BC',
                                  boxShadow: '0 -4px 24px rgba(44,24,16,0.12)',
                                  padding: '12px 0 calc(12px + env(safe-area-inset-bottom))',
                                  animation: 'attachMenuFade 0.2s ease',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setAttachMenuOpen(false); fileInputRef.current?.click(); }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '12px 16px',
                                    width: '100%',
                                    border: 'none',
                                    background: 'none',
                                    font: 'inherit',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 7,
                                      background: '#EAF0F7',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                                    </svg>
                                  </span>
                                  <span>
                                    <span style={{ display: 'block', fontSize: 13, color: '#2C1810' }}>Add files or photos</span>
                                    <span style={{ fontSize: 10, color: '#A89070' }}>Images, PDFs, docs…</span>
                                  </span>
                                </button>
                                <div style={{ height: 0.5, background: '#EDE4D8', margin: '4px 0' }} />
                                {integrations.map((integ: any) => (
                                  <button
                                    key={integ.id}
                                    type="button"
                                    onClick={() => {
                                      setActiveMcpSources((prev) =>
                                        prev.includes(integ.id)
                                          ? prev.filter((x) => x !== integ.id)
                                          : [...prev, integ.id],
                                      );
                                    }}
                                    style={{
                                      padding: '12px 16px',
                                      width: '100%',
                                      border: 'none',
                                      background: 'none',
                                      fontSize: 13,
                                      textAlign: 'left',
                                    }}
                                  >
                                    {integ.display_name || integ.service}{' '}
                                    {activeMcpSources.includes(integ.id) ? '✓' : ''}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAttachMenuOpen(false);
                                    setActiveTab('integrations');
                                    openModal('bottom-left', 'integrations');
                                  }}
                                  style={{
                                    padding: '12px 16px',
                                    width: '100%',
                                    border: 'none',
                                    background: 'none',
                                    fontSize: 12,
                                    color: '#C4956A',
                                    fontFamily: 'Georgia, serif',
                                  }}
                                >
                                  Manage MCP →
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </form>
                  </div>
                </div>
              </>
            )}

            {error ? (
              <div
                role="alert"
                style={{
                  marginTop: '1rem',
                  maxWidth: 640,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  padding: '12px 14px',
                  background: '#FDF5F0',
                  border: '0.5px solid rgba(216, 90, 48, 0.35)',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <p
                    style={{
                      margin: 0,
                      flex: 1,
                      fontSize: 13,
                      color: '#993C1D',
                      lineHeight: 1.5,
                    }}
                  >
                    {error}
                  </p>
                  <button
                    type="button"
                    aria-label="Dismiss error"
                    onClick={() => setError(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 16,
                      color: '#A89070',
                      lineHeight: 1,
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--sm"
                    onClick={() => {
                      setError(null);
                      requestAnimationFrame(() => {
                        idleTaskInputRef.current?.focus();
                        followUpInputRef.current?.focus();
                      });
                    }}
                  >
                    Edit compose
                  </button>
                </div>
              </div>
            ) : null}

            {isRunning && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '60vh',
                  background: '#F5F0E8',
                  padding: '24px 16px',
                }}
              >
                {orchActiveId && orchPoll?.child_tasks?.length ? (
                  <div style={{ width: '100%', maxWidth: 520 }}>
                    {orchPoll.child_tasks.map((c: any, idx: number) => {
                      const curRaw = String(c.current_stage || 'planner');
                      const cur: StageId = STAGE_ORDER.includes(curRaw as StageId)
                        ? (curRaw as StageId)
                        : 'planner';
                      const curIdx = Math.max(0, STAGE_ORDER.indexOf(cur));
                      return (
                        <div
                          key={c.task_id || idx}
                          style={{
                            marginBottom: 18,
                            padding: '12px 14px',
                            background: '#FDFAF6',
                            border: '0.5px solid #E0D5C5',
                            borderRadius: 10,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              color: '#4A3728',
                              marginBottom: 8,
                              lineHeight: 1.4,
                            }}
                          >
                            {(c.question_snippet || '').slice(0, 50)}
                            {(c.question_snippet || '').length > 50 ? '…' : ''}
                          </div>
                          <div style={{ fontSize: 11, color: '#8C7355', marginBottom: 6 }}>
                            {STAGES.find((s) => s.id === cur)?.label || cur}
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {STAGE_ORDER.map((sid, i) => (
                              <span
                                key={sid}
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: i <= curIdx && c.status !== 'failed' ? '#C4956A' : '#E0D5C5',
                                }}
                              />
                            ))}
                          </div>
                          {c.status === 'failed' ? (
                            <div style={{ fontSize: 11, color: '#C0392B', marginTop: 6 }}>Failed</div>
                          ) : null}
                        </div>
                      );
                    })}
                    {orchPoll?.child_tasks?.length &&
                    orchPoll.child_tasks.every((c: any) => c.status === 'complete') &&
                    orchPoll.status === 'running' ? (
                      <p style={{ fontSize: 13, color: '#8C7355', fontStyle: 'italic', textAlign: 'center' }}>
                        Synthesising findings…
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <CalligraphyLoader stage={currentStage} />
                )}
              </div>
            )}

            {orchResult && !isRunning && orchResult.orchestration ? (
              <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 48 }}>
                <div
                  style={{
                    background: '#2C1810',
                    color: '#C4956A',
                    padding: '14px 18px',
                    borderRadius: '10px 10px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Unified synthesis</span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: 'rgba(196,149,106,0.25)',
                    }}
                  >
                    {(orchResult.orchestration.task_ids || []).length} tasks combined
                  </span>
                </div>
                <div
                  style={{
                    background: '#FAF7F2',
                    border: '0.5px solid #E0D5C5',
                    borderTop: 'none',
                    borderRadius: '0 0 10px 10px',
                    padding: '20px 18px',
                  }}
                >
                  <p
                    style={{
                      fontSize: 15,
                      fontFamily: 'Georgia, serif',
                      lineHeight: 1.8,
                      color: '#2C1810',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {orchResult.orchestration.synthesis || '—'}
                  </p>
                  {Array.isArray(orchResult.orchestration.synthesis_bullets) &&
                  orchResult.orchestration.synthesis_bullets.length > 0 ? (
                    <ul style={{ margin: '16px 0 0', paddingLeft: 22, fontSize: 13, color: '#4A3728' }}>
                      {orchResult.orchestration.synthesis_bullets.map((b: string, i: number) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {b}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {Array.isArray(orchResult.orchestration.conflicts) &&
                  orchResult.orchestration.conflicts.length > 0 ? (
                    <div style={{ marginTop: 20 }}>
                      <div
                        style={{
                          fontSize: 12,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: '#A89070',
                          marginBottom: 10,
                        }}
                      >
                        Where tasks disagreed
                      </div>
                      {orchResult.orchestration.conflicts.map((c: any, i: number) => (
                        <div
                          key={i}
                          style={{
                            borderLeft: '3px solid #E8C87A',
                            padding: '10px 14px',
                            marginBottom: 8,
                            background: '#FDF6EC',
                            fontSize: 13,
                            color: '#4A3728',
                          }}
                        >
                          <b>
                            Task {c.task_a} vs Task {c.task_b}
                          </b>
                          <div style={{ marginTop: 4 }}>{c.conflict}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
                    <button
                      type="button"
                      disabled={exportingPdf}
                      onClick={() => void handleExportOrchestrationPdf()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 18px',
                        border: '0.5px solid #D4C4B0',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'Georgia, serif',
                        cursor: exportingPdf ? 'default' : 'pointer',
                        opacity: exportingPdf ? 0.85 : 1,
                      }}
                    >
                      {exportingPdf ? (
                        <svg
                          width={14}
                          height={14}
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden
                          style={{ animation: 'agentSpin 0.8s linear infinite' }}
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="9"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeDasharray="28 40"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : null}
                      {exportingPdf ? 'Exporting…' : 'Export all as PDF'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const oid = orchResult.orchestration.id;
                        const tids = orchResult.orchestration.task_ids || [];
                        try {
                          localStorage.setItem(`arena_orch_${oid}`, JSON.stringify({ task_ids: tids, at: Date.now() }));
                          setToastMessage('Saved this multi-task session in your browser.');
                        } catch {
                          setToastMessage('Could not save session.');
                        }
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
                    >
                      Save as session
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 24 }}>
                  {(orchResult.tasks || []).map((tr: AgentResult, ti: number) => {
                    const q = (tr.original_task || tr.task || '').trim();
                    const open = orchExpandedIdx === ti;
                    const trParsed = parseSynthesisFromFinalAnswer(tr.final_answer);
                    const trSentences: AnswerSentenceView[] = trParsed?.sentences?.length
                      ? trParsed.sentences.map((s) => ({
                          text: s.text,
                          confidence: sentenceConfidenceLevel(s),
                        }))
                      : [];
                    return (
                      <div
                        key={tr.task_id || ti}
                        style={{
                          marginBottom: 10,
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: '#FDFAF6',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setOrchExpandedIdx(open ? null : ti)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '12px 14px',
                            border: 'none',
                            background: open ? '#F0E8DC' : '#FAF7F2',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontFamily: 'Georgia, serif',
                            color: '#2C1810',
                          }}
                        >
                          Task {ti + 1} — {q.length > 72 ? `${q.slice(0, 72)}…` : q || 'Untitled'}
                          <span style={{ float: 'right', color: '#8C7355' }}>{open ? '▾' : '▸'}</span>
                        </button>
                        {open ? (
                          <div style={{ padding: '14px 16px', fontSize: 13, color: '#1A1714', lineHeight: 1.75 }}>
                            {trSentences.length > 0 ? (
                              <div className="answer-text conf-active" style={{ marginBottom: 0 }}>
                                {trSentences.map((sentence, si) => (
                                  <span key={`${ti}-${si}-${sentence.text.slice(0, 24)}`} className={sentence.confidence}>
                                    {sentence.text}{' '}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="agent-answer-main answer-body">
                                <AgentAnswerMarkdown
                                  markdown={
                                    plainTextFromFinalAnswer(tr.final_answer, trParsed) ||
                                    tr.final_answer ||
                                    ''
                                  }
                                  question={q}
                                  emptyMessage="No final answer returned."
                                />
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {result &&
              !orchResult &&
              (result.final_answer || result.stages) &&
              (!isRunning || isRefining) && (
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
                      <div style={{ flex: '1 1 140px' }}>
                        <span style={{ fontSize: 13, color: '#2C1810', display: 'block' }}>
                          Arena found new information on this topic since your last run
                        </span>
                        {liveUpdatesList.length > 0 && liveUpdatesList[0]?.found_at ? (
                          <span style={{ fontSize: 11, color: '#5A8C3A', marginTop: 2, display: 'block' }}>
                            Found {formatRelativeShort(String(liveUpdatesList[0].found_at), nowMs)}
                          </span>
                        ) : null}
                      </div>
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
                        {liveUpdatesPanelOpen ? 'Hide updates ↑' : 'See what changed →'}
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
                            {formatRelativeShort(String(u?.found_at ?? ''), nowMs)}
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
                    <div className="agent-answer-main answer-body" style={{ marginBottom: '24px' }}>
                      <AgentAnswerMarkdown
                        markdown={plainAnswerText || result.final_answer || ''}
                        question={(result.original_task || result.task || '').trim()}
                        emptyMessage="No final answer returned."
                      />
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
                        flexDirection: isMobile ? 'column' : 'row',
                        flexWrap: 'wrap',
                        gap: 14,
                        marginBottom: 16,
                        alignItems: 'stretch',
                      }}
                    >
                      <div
                        style={{
                          flex: '1 1 0',
                          minWidth: isMobile ? '100%' : 260,
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
                        {displayConfidenceLegend ? (
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
                                  {displayConfidenceLegend.verifiedPct}%
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
                                  {displayConfidenceLegend.supportedPct}%
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
                                  {displayConfidenceLegend.uncertainPct}%
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
                              {displayConfidenceLegend.verifiedPct > 0 ? (
                                <div style={{ width: `${displayConfidenceLegend.verifiedPct}%`, background: '#639922' }} />
                              ) : null}
                              {displayConfidenceLegend.supportedPct > 0 ? (
                                <div style={{ width: `${displayConfidenceLegend.supportedPct}%`, background: '#BA7517' }} />
                              ) : null}
                              {displayConfidenceLegend.uncertainPct > 0 ? (
                                <div style={{ width: `${displayConfidenceLegend.uncertainPct}%`, background: '#D85A30' }} />
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
                            {user?.feedback_calibration?.reliable &&
                            user.feedback_calibration.adjustment !== 0 ? (
                              <p
                                style={{
                                  fontSize: 11,
                                  fontStyle: 'italic',
                                  color: '#A89070',
                                  marginTop: 8,
                                  marginBottom: 0,
                                }}
                              >
                                Confidence adjusted by {Math.abs(user.feedback_calibration.adjustment)} pts based on
                                your feedback history
                              </p>
                            ) : null}
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
                          minWidth: isMobile ? '100%' : 260,
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
                  {result?.status === 'complete' && result?.task_id ? (
                    <TemporalEvolutionPanel
                      taskId={String(result.task_id)}
                      question={
                        result.original_task || result.task || task || undefined
                      }
                    />
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
                                      fontSize: isMobile ? 48 : 42,
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={Icons.copy(14)}
                      title="Copy answer as markdown (question + answer)"
                      onClick={() => {
                        const md = formatAgentAnswerExport({
                          question:
                            result.original_task ||
                            result.task ||
                            task ||
                            '',
                          answer: plainAnswerText || result.final_answer || '',
                          taskId: result.task_id,
                        });
                        void copyToClipboard(md).then((ok) => {
                          setCopyAnswerFeedback(ok ? 'copied' : 'failed');
                          const hold = motionDuration(ok ? 2000 : 2800);
                          window.setTimeout(
                            () => setCopyAnswerFeedback('idle'),
                            hold > 0 ? hold : 0,
                          );
                        });
                      }}
                    >
                      {copyAnswerFeedback === 'copied'
                        ? 'Copied!'
                        : copyAnswerFeedback === 'failed'
                          ? 'Copy failed'
                          : 'Copy'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={Icons.download(14)}
                      title="Download answer as a markdown file"
                      onClick={() => {
                        const question =
                          result.original_task || result.task || task || '';
                        const md = formatAgentAnswerExport({
                          question,
                          answer: plainAnswerText || result.final_answer || '',
                          taskId: result.task_id,
                        });
                        const stem = `agent-${(question || result.task_id || 'answer').slice(0, 48)}`;
                        const ok = downloadMarkdownFile(md, stem);
                        setDownloadAnswerFeedback(ok ? 'done' : 'failed');
                        const hold = motionDuration(ok ? 2000 : 2800);
                        window.setTimeout(
                          () => setDownloadAnswerFeedback('idle'),
                          hold > 0 ? hold : 0,
                        );
                      }}
                    >
                      {downloadAnswerFeedback === 'done'
                        ? 'Downloaded'
                        : downloadAnswerFeedback === 'failed'
                          ? 'Download failed'
                          : 'Download .md'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" icon={Icons.refresh(14)} onClick={runAgainWithSameQuestion}>
                      Run again
                    </Button>
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={exportingPdf ? undefined : Icons.download(14)}
                        loading={exportingPdf}
                        disabled={exportingPdf}
                        onClick={() => void handleExportTaskPdf()}
                      >
                        {exportingPdf ? 'Exporting…' : 'Export PDF'}
                      </Button>
                    ) : null}
                    {result.status === 'complete' && !isRunning && user?.email ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Icons.bell(14, watchlisted)}
                        disabled={watchlisted}
                        onClick={() => {
                          if (!canWatchlist) {
                            setToastMessage('Watchlist is available on Arena Plus and Pro.');
                            return;
                          }
                          if (watchlisted) return;
                          setShowScheduler(true);
                        }}
                        style={
                          watchlisted
                            ? {
                                borderColor: AR.GOLD,
                                color: AR.GOLD,
                                background: '#FAF3EA',
                              }
                            : undefined
                        }
                      >
                        {watchlisted ? 'Watching' : 'Watch this'}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={crossPollinateBusy ? undefined : Icons.refresh(14)}
                      loading={crossPollinateBusy}
                      disabled={crossPollinateBusy || isRunning || isRefining}
                      title="Send this answer to Arena so four minds can challenge it"
                      onClick={() => void handleCrossPollinate()}
                    >
                      {crossPollinateBusy ? 'Opening Arena…' : 'Cross-pollinate to Arena'}
                    </Button>
                    {result.task_id && result.memory_saved ? (
                      <button
                        type="button"
                        disabled={liveToggleBusy}
                        onClick={() => void handleToggleLive()}
                        title={result.is_live ? 'This task re-runs weekly. Click to stop.' : 'Arena will re-research this topic weekly and notify you of new findings'}
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
                        {result.is_live ? (<>Updating weekly <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#639922', marginLeft: 2, animation: 'liveDotBlink 2s ease-in-out infinite' }} /></>) : 'Auto-update weekly'}
                      </button>
                    ) : null}
                    {result.status === 'complete' && !isRunning && user ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={Icons.users(14)}
                        onClick={() => {
                          setCreatedRoom(null);
                          setRoomName('');
                          setRoomNameError(null);
                          setShowRoomCreate(true);
                        }}
                      >
                        Create room
                      </Button>
                    ) : null}
                  </div>
                  {showScheduler && result.status === 'complete' && !isRunning && canWatchlist ? (
                    <div
                      role="group"
                      aria-label="Watchlist schedule"
                      style={{
                        marginTop: 8,
                        background: '#FAF7F2',
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 8,
                        padding: '12px 16px',
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#8C7355' }} id="watchlist-cadence-label">
                        Auto-run this task every
                      </div>
                      <div
                        role="radiogroup"
                        aria-labelledby="watchlist-cadence-label"
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}
                      >
                        {(
                          [
                            { h: 24 as const, label: 'Daily' },
                            { h: 72 as const, label: 'Every 3 days' },
                            { h: 168 as const, label: 'Weekly' },
                          ] as const
                        ).map(({ h, label }) => {
                          const selected = watchlistPickHours === h;
                          return (
                            <button
                              key={h}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              disabled={watchlistBusy}
                              onClick={() => setWatchlistPickHours(h)}
                              style={{
                                padding: '6px 14px',
                                borderRadius: 999,
                                border: 'none',
                                cursor: watchlistBusy ? 'default' : 'pointer',
                                fontSize: 12,
                                fontFamily: 'Georgia, serif',
                                background: selected ? '#C4956A' : '#F0E8DC',
                                color: selected ? '#FAF7F2' : '#8C7355',
                                opacity: watchlistBusy ? 0.75 : 1,
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => setShowScheduler(false)}
                          disabled={watchlistBusy}
                          style={{
                            padding: '7px 14px',
                            borderRadius: 20,
                            border: '0.5px solid #D4C4B0',
                            background: 'transparent',
                            color: '#8C7355',
                            fontSize: 12,
                            fontFamily: 'Georgia, serif',
                            cursor: watchlistBusy ? 'default' : 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          icon={watchlistBusy ? undefined : Icons.bell(14)}
                          loading={watchlistBusy}
                          disabled={watchlistBusy}
                          onClick={() => void handleConfirmWatchlist()}
                        >
                          {watchlistBusy ? 'Saving…' : 'Start watching'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
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
                        Last checked: {formatRelativeShort(result.live_last_checked, nowMs)}
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
                        <div style={{ marginBottom: 8 }}>
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
                            }}
                          >
                            <input
                              id="agent-follow-up"
                              ref={followUpInputRef}
                              type="text"
                              value={followUp}
                              maxLength={AGENT_REFINE_MAX_CHARS}
                              onChange={(e) => {
                                setFollowUp(clampToMax(e.target.value, AGENT_REFINE_MAX_CHARS));
                                if (refinementError) setRefinementError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleRefine();
                                }
                              }}
                              placeholder="Ask a follow-up, request more depth, challenge an assumption..."
                              aria-label="Follow-up research question"
                              aria-describedby={
                                refinementError
                                  ? 'agent-refine-error'
                                  : followUp.length > 0
                                    ? 'agent-refine-budget'
                                    : undefined
                              }
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
                              aria-label="Send follow-up"
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
                            </button>
                          </div>
                          {followUp.length > 0 ? (
                            <div
                              id="agent-refine-budget"
                              title={`Character budget (server max ${AGENT_REFINE_MAX_CHARS})`}
                              style={{
                                marginTop: 6,
                                fontSize: 11,
                                textAlign: 'right',
                                color:
                                  charBudgetTone(followUp.length, AGENT_REFINE_MAX_CHARS) === 'danger'
                                    ? '#D85A30'
                                    : charBudgetTone(followUp.length, AGENT_REFINE_MAX_CHARS) === 'warn'
                                      ? '#B07840'
                                      : '#A89070',
                              }}
                            >
                              {charBudgetLabel(followUp.length, AGENT_REFINE_MAX_CHARS)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p
                          role="status"
                          aria-live="polite"
                          aria-busy="true"
                          style={{ fontSize: 12, color: AR.TEXT_MUTED, marginBottom: 0 }}
                        >
                          Refining your answer...
                        </p>
                      )}
                      {refinementError ? (
                        <p
                          id="agent-refine-error"
                          role="alert"
                          style={{ color: '#E57373', fontSize: 12, marginTop: 8, marginBottom: 0 }}
                        >
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
                        <div style={{ marginTop: 10 }}>
                          <p
                            role="alert"
                            style={{ color: '#E57373', fontSize: 13, margin: 0, lineHeight: 1.45 }}
                          >
                            {challengeSectionError}
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleChallengeAnswer()}
                            style={{
                              marginTop: 8,
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: 12,
                              color: AR.GOLD,
                              cursor: 'pointer',
                              fontFamily: 'Georgia, serif',
                              textDecoration: 'underline',
                            }}
                          >
                            Try challenge again
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {isChallengingAnswer ? (
                    <div
                      role="status"
                      aria-live="polite"
                      aria-busy="true"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#6B6460' }}
                    >
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

                {user &&
                result?.task_id &&
                !isRunning &&
                !!(result?.final_answer || result?.stages) ? (
                  <div
                    style={{
                      marginTop: 28,
                      paddingTop: 20,
                      borderTop: '0.5px solid #EDE4D8',
                    }}
                  >
                    {taskAnswerFeedback === undefined ? null : taskAnswerFeedback &&
                      taskAnswerFeedback.verdict &&
                      !feedbackEditMode ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 14px',
                              borderRadius: 8,
                              fontSize: 12,
                              fontFamily: 'Georgia, serif',
                              border: '0.5px solid',
                              ...(taskAnswerFeedback.verdict === 'correct'
                                ? {
                                    background: '#EAF3DE',
                                    borderColor: '#97C459',
                                    color: '#3B6D11',
                                  }
                                : taskAnswerFeedback.verdict === 'partial'
                                  ? {
                                      background: '#FDF6EC',
                                      borderColor: '#E8C87A',
                                      color: '#854F0B',
                                    }
                                  : {
                                      background: '#FCF0EE',
                                      borderColor: '#F0997B',
                                      color: '#993C1D',
                                    }),
                            }}
                          >
                            {taskAnswerFeedback.verdict === 'correct'
                              ? '✓'
                              : taskAnswerFeedback.verdict === 'partial'
                                ? '~'
                                : '✗'}{' '}
                            You marked this{' '}
                            {taskAnswerFeedback.verdict === 'partial'
                              ? 'partially correct'
                              : taskAnswerFeedback.verdict === 'correct'
                                ? 'correct'
                                : 'wrong'}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: '#A89070', marginTop: 8, marginBottom: 0 }}>
                          Thanks — this improves future calibration
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setFeedbackEditMode(true);
                            setPendingVerdict(null);
                            setPendingNote('');
                          }}
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            marginTop: 6,
                            fontSize: 11,
                            color: '#C4956A',
                            cursor: 'pointer',
                            fontFamily: 'Georgia, serif',
                            textDecoration: 'underline',
                          }}
                        >
                          Change →
                        </button>
                      </div>
                    ) : (
                      <div>
                        {!pendingVerdict ? (
                          <>
                            <p
                              style={{
                                fontSize: 12,
                                fontStyle: 'italic',
                                color: '#8C7355',
                                marginBottom: 0,
                              }}
                            >
                              Was this answer accurate?
                            </p>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                                marginTop: 8,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setPendingVerdict('correct')}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  borderRadius: 8,
                                  padding: '7px 16px',
                                  fontSize: 12,
                                  fontFamily: 'Georgia, serif',
                                  border: '0.5px solid #97C459',
                                  background: '#EAF3DE',
                                  color: '#3B6D11',
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#C0DD97';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#EAF3DE';
                                }}
                              >
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
                                  <path
                                    d="M5 12l4 4L19 6"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                Correct
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingVerdict('partial')}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  borderRadius: 8,
                                  padding: '7px 16px',
                                  fontSize: 12,
                                  fontFamily: 'Georgia, serif',
                                  border: '0.5px solid #E8C87A',
                                  background: '#FDF6EC',
                                  color: '#854F0B',
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#FAC775';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#FDF6EC';
                                }}
                              >
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
                                  <path
                                    d="M4 14c2-4 6-6 10-4s4 6 2 8"
                                    stroke="currentColor"
                                    strokeWidth={1.8}
                                    strokeLinecap="round"
                                    fill="none"
                                  />
                                </svg>
                                Partially
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingVerdict('wrong')}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  borderRadius: 8,
                                  padding: '7px 16px',
                                  fontSize: 12,
                                  fontFamily: 'Georgia, serif',
                                  border: '0.5px solid #F0997B',
                                  background: '#FCF0EE',
                                  color: '#993C1D',
                                  cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#F5C4B3';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#FCF0EE';
                                }}
                              >
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
                                  <path
                                    d="M6 6l12 12M18 6L6 18"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                Wrong
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={pendingNote}
                              onChange={(e) => setPendingNote(e.target.value)}
                              placeholder="What was wrong or missing? (optional)"
                              style={{
                                fontSize: 12,
                                fontFamily: 'Georgia, serif',
                                border: '0.5px solid #D4C4B0',
                                borderRadius: 6,
                                padding: '8px 12px',
                                width: '100%',
                                boxSizing: 'border-box',
                                marginTop: 8,
                                outline: 'none',
                                background: '#fff',
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderColor = '#C4956A';
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderColor = '#D4C4B0';
                              }}
                            />
                            <button
                              type="button"
                              disabled={answerFeedbackSubmitBusy}
                              onClick={() => {
                                if (!result.task_id || !pendingVerdict) return;
                                setAnswerFeedbackSubmitBusy(true);
                                void postAgentTaskAnswerFeedback(result.task_id, {
                                  verdict: pendingVerdict,
                                  note: pendingNote.trim() || null,
                                })
                                  .then(async () => {
                                    setTaskAnswerFeedback({
                                      verdict: pendingVerdict,
                                      note: pendingNote.trim() || null,
                                      created_at: new Date().toISOString(),
                                    });
                                    setPendingVerdict(null);
                                    setPendingNote('');
                                    setFeedbackEditMode(false);
                                    await refreshUser();
                                  })
                                  .catch(() => {})
                                  .finally(() => setAnswerFeedbackSubmitBusy(false));
                              }}
                              style={{
                                marginTop: 10,
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: '#C4956A',
                                color: '#FDFAF6',
                                fontSize: 12,
                                fontFamily: 'Georgia, serif',
                                cursor: answerFeedbackSubmitBusy ? 'default' : 'pointer',
                                opacity: answerFeedbackSubmitBusy ? 0.7 : 1,
                              }}
                            >
                              Submit feedback
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingVerdict(null);
                                setPendingNote('');
                              }}
                              style={{
                                marginLeft: 10,
                                marginTop: 10,
                                border: 'none',
                                background: 'none',
                                color: '#8C7355',
                                fontSize: 11,
                                cursor: 'pointer',
                                fontFamily: 'Georgia, serif',
                              }}
                            >
                              Back
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}

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
      </main>
      </div>
      {showRoomCreate && user ? (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !creatingRoom) closeRoomCreate();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 11000,
            background: 'rgba(26, 23, 20, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 100%)',
              background: '#FAF7F2',
              border: '0.5px solid #E0D5C5',
              borderRadius: 14,
              padding: '20px 22px 18px',
              boxShadow: '0 16px 40px rgba(26,23,20,0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2
                  id="create-room-title"
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 500,
                    color: '#2C1810',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  Create a research room
                </h2>
                <p style={{ fontSize: 12, color: '#A89070', fontStyle: 'italic', margin: '8px 0 0', lineHeight: 1.5 }}>
                  {result?.status === 'complete' && result?.task_id
                    ? 'Collaborate on this topic. This completed task can be added to the room automatically.'
                    : 'Collaborate on a topic. Each member runs their own tasks — the room synthesises findings automatically.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={creatingRoom}
                onClick={() => closeRoomCreate()}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  color: '#8C7355',
                  cursor: creatingRoom ? 'default' : 'pointer',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>

            {!createdRoom ? (
              <div style={{ marginTop: 16 }}>
                <label
                  htmlFor="create-room-name"
                  style={{
                    display: 'block',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#A89070',
                    marginBottom: 6,
                  }}
                >
                  Room name
                </label>
                <input
                  ref={roomNameInputRef}
                  id="create-room-name"
                  type="text"
                  value={roomName}
                  maxLength={ROOM_NAME_MAX + 20}
                  disabled={creatingRoom}
                  onChange={(e) => {
                    setRoomName(e.target.value);
                    if (roomNameError) setRoomNameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCreateResearchRoom();
                    }
                  }}
                  placeholder="e.g. AI Startup Funding"
                  aria-invalid={Boolean(roomNameError)}
                  aria-describedby={roomNameError ? 'create-room-error' : undefined}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: roomNameError ? '0.5px solid #D85A30' : '0.5px solid #D4C4B0',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#2C1810',
                    fontFamily: 'Georgia, serif',
                    background: '#FDFAF6',
                    outline: 'none',
                  }}
                />
                {roomNameError ? (
                  <p
                    id="create-room-error"
                    role="alert"
                    style={{ margin: '8px 0 0', fontSize: 12, color: '#D85A30', lineHeight: 1.45 }}
                  >
                    {roomNameError}
                  </p>
                ) : null}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => void handleCreateResearchRoom()}
                    disabled={creatingRoom}
                    aria-busy={creatingRoom}
                    style={{
                      background: '#2C1810',
                      color: '#C4956A',
                      borderRadius: 20,
                      padding: '9px 20px',
                      fontSize: 13,
                      fontFamily: 'Georgia, serif',
                      border: 'none',
                      cursor: creatingRoom ? 'wait' : 'pointer',
                      opacity: creatingRoom ? 0.75 : 1,
                    }}
                  >
                    {roomCreateButtonLabel(creatingRoom)}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeRoomCreate()}
                    disabled={creatingRoom}
                    style={{
                      background: 'transparent',
                      border: '0.5px solid #D4C4B0',
                      color: '#8C7355',
                      borderRadius: 20,
                      padding: '9px 20px',
                      fontSize: 13,
                      fontFamily: 'Georgia, serif',
                      cursor: creatingRoom ? 'default' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <p role="status" style={{ margin: '0 0 10px', fontSize: 13, color: '#4A3728' }}>
                  Room ready. Share the invite link with collaborators.
                </p>
                <div
                  style={{
                    background: '#F0E8DC',
                    border: '0.5px solid #D4C4B0',
                    borderRadius: 8,
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: '#8C7355',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ wordBreak: 'break-all' }}>
                    {(createdRoom.share_url || '').replace(/^https?:\/\//, '')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {nativeShareAvailable ? (
                      <button
                        type="button"
                        onClick={() => {
                          const url =
                            createdRoom.share_url ||
                            `${window.location.origin}/room/${createdRoom.slug}`;
                          const data = buildRoomInviteShareData({
                            roomName: createdRoom.name || roomName || 'Research room',
                            shareUrl: url,
                          });
                          void invokeNativeShare(data).then(async (result) => {
                            if (result === 'shared') {
                              setShareRoomInviteStatus('shared');
                              window.setTimeout(() => setShareRoomInviteStatus('idle'), 2200);
                              return;
                            }
                            if (result === 'cancelled') return;
                            const ok = await copyToClipboard(url);
                            setCopyRoomLinkFeedback(ok ? 'copied' : 'failed');
                            setShareRoomInviteStatus(ok ? 'idle' : 'failed');
                            window.setTimeout(() => {
                              setCopyRoomLinkFeedback('idle');
                              setShareRoomInviteStatus('idle');
                            }, 1800);
                          });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color:
                            shareRoomInviteStatus === 'failed'
                              ? '#D85A30'
                              : shareRoomInviteStatus === 'shared'
                                ? '#5A8C6A'
                                : '#C4956A',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontFamily: 'Georgia, serif',
                        }}
                      >
                        {shareRoomInviteStatus === 'shared'
                          ? 'Shared!'
                          : shareRoomInviteStatus === 'failed'
                            ? 'Share failed'
                            : 'Share…'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        const url =
                          createdRoom.share_url ||
                          `${window.location.origin}/room/${createdRoom.slug}`;
                        void copyToClipboard(url).then((ok) => {
                          setCopyRoomLinkFeedback(ok ? 'copied' : 'failed');
                          window.setTimeout(() => setCopyRoomLinkFeedback('idle'), 1800);
                        });
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copyRoomLinkFeedback === 'failed' ? '#D85A30' : '#C4956A',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontFamily: 'Georgia, serif',
                      }}
                    >
                      {copyRoomLinkFeedback === 'copied'
                        ? 'Copied!'
                        : copyRoomLinkFeedback === 'failed'
                          ? 'Couldn’t copy'
                          : 'Copy link'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/room/${encodeURIComponent(createdRoom.slug)}`)}
                    style={{
                      background: '#2C1810',
                      color: '#C4956A',
                      border: 'none',
                      borderRadius: 20,
                      padding: '9px 18px',
                      fontSize: 13,
                      fontFamily: 'Georgia, serif',
                      cursor: 'pointer',
                    }}
                  >
                    Open room →
                  </button>
                  <button
                    type="button"
                    onClick={() => closeRoomCreate()}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: 13,
                      color: '#8C7355',
                      cursor: 'pointer',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <KeyboardShortcutsHelp surface="agent" />
      <ConduraInstallCTA
        open={conduraCtaOpen}
        onClose={() => {
          setConduraCtaOpen(false);
          setPendingHandoff(null);
        }}
        title={conduraCtaTitle}
        message={conduraCtaMessage}
        installUrl={conduraInstallUrl}
        handoffPayload={pendingHandoff}
        onSaveDraft={async () => {
          if (!pendingHandoff) return;
          await saveConduraHandoffDraft({
            capability: pendingHandoff.intent.capability,
            payload: pendingHandoff as unknown as Record<string, unknown>,
          });
        }}
        onSendToCondura={async () => {
          if (!pendingHandoff) return;
          try {
            const { run_id } = await dispatchHandoff(pendingHandoff);
            await recordConduraHandoff({
              capability: pendingHandoff.intent.capability,
              execution_env: 'condura',
              condura_run_id: run_id,
              summary: pendingHandoff.intent.summary,
              status: 'dispatched',
            });
            setConduraCtaOpen(false);
            setPendingHandoff(null);
            setError(null);
          } catch (err) {
            if (err instanceof ConduraClientError) {
              if (err.kind === 'unknown_device' || err.kind === 'key_mismatch') {
                if (err.kind === 'key_mismatch') await rotateSigningKey();
                const { publicKeyJwk } = await getOrCreateSigningKey();
                await pairDevice(publicKeyJwk);
                const { run_id } = await dispatchHandoff(pendingHandoff);
                await recordConduraHandoff({
                  capability: pendingHandoff.intent.capability,
                  execution_env: 'condura',
                  condura_run_id: run_id,
                  summary: pendingHandoff.intent.summary,
                  status: 'dispatched',
                });
                setConduraCtaOpen(false);
                setPendingHandoff(null);
                return;
              }
              throw new Error(err.message);
            }
            throw err;
          }
        }}
      />
    </div>
  );
}
