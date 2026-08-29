import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Copy, Ellipsis, Link2, Lock, Pencil, Pin, RotateCcw, Trash2, X } from 'lucide-react';
import { AnalyticalCaveatsSection, type StructuredCaveat } from '../components/AgentCaveatGrid';
import { AgentAnswerMarkdown } from '../components/AgentAnswerMarkdown';
import { AgentHistorySourceBadge } from '../components/AgentHistorySourceBadge';
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
  cancelAgentOrchestration,
  cancelAgentTask,
  challengeAgentAnswer,
  createRoom,
  createAgentTaskShare,
  crossPollinateAgentAnswer,
  deleteAgentTask,
  deleteAgentTasks,
  exportAgentTasksJsonl,
  exportAgentOrchestrationsCsv,
  exportAgentOrchestrationsJson,
  exportAgentOrchestrationsMarkdown,
  fetchAgentOrchestrationsMarkdownText,
  exportAgentTaskCsv,
  exportAgentTaskPdf,
  exportAgentTaskMarkdown,
  exportAgentTaskJson,
  exportOrchestrationJson,
  exportOrchestrationMarkdown,
  exportOrchestrationPdf,
  fetchAgentTaskCsvText,
  fetchAgentTaskJsonText,
  fetchAgentTaskMarkdownText,
  getDiscoverRooms,
  getAgentHistory,
  getMyRooms,
  getAgentWatchlist,
  getAgentOrchestration,
  getAgentRebuttal,
  getAgentResult,
  getAgentSavedTask,
  getAgentStatus,
  getAgentTaskAnswerFeedback,
  getRateLimitDetail,
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
  revokeAgentTaskShare,
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
import { RateLimitNotice } from '../components/RateLimitNotice';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
import { EmptyState } from '../components/EmptyState';
import { PromptPipelineStatus } from '../components/PromptPipelineStatus';
import { AgentAccuracyVerdict } from '../components/AgentAccuracyVerdict';
import { RoomsDiscoverPanel } from '../components/RoomsDiscoverPanel';
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
import {
  isAgentCopyAnswerKey,
  isAgentCopyReportHtmlKey,
  isAgentCopyReportCsvKey,
  isAgentCopyReportKey,
  isAgentCopyReportJsonKey,
  isAgentDownloadAnswerKey,
  isAgentDownloadJsonKey,
  isAgentDownloadReportCsvKey,
  isAgentDownloadReportHtmlKey,
  isAgentDownloadReportMarkdownKey,
  isAgentNewTaskKey,
} from '../lib/keyboardShortcuts';
import {
  isAriaModalOpen,
  isBareSlashKey,
  shouldCaptureSlashFocus,
} from '../lib/slashFocus';
import { User } from '../types';
// setRedirectIntent is unused but kept for future use
import {
  clearDismissedAgentChips,
  dismissAgentChip,
  loadDismissedAgentChipIds,
  pickRecentAgentChips,
} from '../lib/agentRecentChips';
import {
  AGENT_HISTORY_PIN_FILTER_ALL,
  AGENT_HISTORY_PIN_FILTER_OPTIONS,
  AGENT_HISTORY_PINS_MAX,
  agentHistoryPinFilterLabel,
  agentHistoryPinFilterUseful,
  countChangedAgentHistoryPins,
  filterAgentHistoryByPin,
  loadAgentHistoryPins,
  removeAgentHistoryPins,
  pinAgentHistoryTasks,
  subscribeToAgentHistoryPins,
  toggleAgentHistoryPin,
  unpinAgentHistoryTasks,
  type AgentHistoryPinFilter,
} from '../lib/agentHistoryPins';
import { reconcileAgentHistoryBulkDeleteIds } from '../lib/agentHistoryBulkDelete';
import {
  AGENT_REFINE_MAX_CHARS,
  AGENT_TASK_MAX_CHARS,
  agentMinLengthHint,
  charBudgetLabel,
  charBudgetTone,
  clampToMax,
} from '../lib/charBudget';
import { copyCsvToClipboard, copyHtmlToClipboard, copyToClipboard } from '../lib/clipboard';
import { copyAgentOrchestrationJson } from '../lib/agentOrchestrationJsonClipboard';
import { copyAgentOrchestrationMarkdown } from '../lib/agentOrchestrationMarkdownClipboard';
import {
  downloadBlobFile,
  downloadHtmlFile,
  downloadMarkdownFile,
  downloadTextFile,
  withDownloadDate,
} from '../lib/downloadTextFile';
import { formatAgentAnswerExport } from '../lib/agentAnswerExport';
import {
  formatAgentReportClipboard,
  invalidateAgentReportCopy,
} from '../lib/agentReportClipboard';
import { formatAgentReportHtml, selectAgentReportSources } from '../lib/agentReportHtml';
import {
  formatAgentHistoryCsv,
  formatAgentHistoryExport,
  formatAgentHistoryHtml,
  formatAgentHistoryItemCopy,
  formatAgentHistoryJson,
  formatAgentHistoryJsonl,
} from '../lib/agentHistoryExport';
import { copyAgentHistoryCsv } from '../lib/agentHistoryCsvClipboard';
import { copyAgentHistoryHtml } from '../lib/agentHistoryHtmlClipboard';
import { copyAgentHistoryJson } from '../lib/agentHistoryJsonClipboard';
import { copyAgentHistoryJsonl } from '../lib/agentHistoryJsonlClipboard';
import {
  copySelectedAgentHistoryCsv,
  copySelectedAgentHistoryHtml,
  copySelectedAgentHistoryJson,
  copySelectedAgentHistoryJsonl,
  copySelectedAgentHistoryMarkdown,
} from '../lib/agentHistorySelectionClipboard';
import {
  formatSelectedAgentHistoryCsv,
  formatSelectedAgentHistoryHtml,
  formatSelectedAgentHistoryJson,
  formatSelectedAgentHistoryJsonl,
  formatSelectedAgentHistoryMarkdown,
} from '../lib/agentHistorySelectionExport';
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
  AGENT_HISTORY_SOURCE_ALL,
  agentHistorySourceFilterUseful,
  agentHistorySourceLabel,
  collectHistorySourceOptions,
  filterAgentHistoryBySource,
  type AgentHistorySourceFilter,
} from '../lib/agentHistorySourceFilter';
import {
  loadAgentHistoryViewPreferences,
  persistAgentHistoryViewPreferences,
  shouldReconcileAgentHistoryDynamicFilters,
} from '../lib/agentHistoryViewPreferences';
import {
  buildAgentHistoryViewUrl,
  readAgentHistoryViewFromSearchParams,
} from '../lib/agentHistoryViewLink';
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
import { takeAgentPrefillQuestion } from '../lib/agentPrefill';
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
  CREAM: '#0B0C0A',
  SURFACE: '#151713',
  SURFACE_ALT: '#1D201B',
  BORDER: '#35382F',
  BORDER_INNER: '#272A25',
  GOLD: '#F0B84E',
  GOLD_MUTED: '#9A7A3C',
  DARK: '#F3F0E7',
  TEXT_PRIMARY: '#F3F0E7',
  TEXT_MID: '#CDD0C8',
  TEXT_MUTED: '#A0A39A',
  TEXT_FAINT: '#74776F',
} as const;

const AGENT_HISTORY_BULK_DELETE_MAX = 50;

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
  sources?: unknown[];
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
  is_shared?: boolean;
  share_url?: string | null;
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
  'The Analyst': { accent: '#5ED8FF', dot: '#5ED8FF' },
  'The Contrarian': { accent: '#FF6652', dot: '#FF6652' },
  'The Philosopher': { accent: '#A98CF8', dot: '#A98CF8' },
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
        <span key={`tp-${i++}`} style={{ color: '#F3F0E7' }}>
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
          color: val ? '#F3F0E7' : '#F0B84E',
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
      <span key={`tp-${i++}`} style={{ color: '#F3F0E7' }}>
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
      className="agent-profile-row"
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#F0B84E',
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
          fontFamily: 'var(--vp-font-sans)',
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
  /** Task id currently being polled, so Stop can cancel it on the backend. */
  const activeTaskIdRef = useRef<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<ReturnType<typeof getRateLimitDetail>>(null);
  const [errorCopied, setErrorCopied] = useState(false);
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
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>(() => loadAgentHistoryPins());
  const [selectedHistoryTaskIds, setSelectedHistoryTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [initialHistoryState] = useState(() => {
    const saved = loadAgentHistoryViewPreferences();
    const shared = readAgentHistoryViewFromSearchParams(searchParams, saved);
    return {
      preferences: shared?.preferences ?? saved,
      searchQuery: shared?.searchQuery ?? '',
      fromSharedUrl: shared !== null,
    };
  });
  const initialHistoryViewPreferences = initialHistoryState.preferences;
  const initialHistorySearchQuery = initialHistoryState.searchQuery;
  const [historySearchQuery, setHistorySearchQuery] = useState(initialHistorySearchQuery);
  const [historySort, setHistorySort] = useState<AgentHistorySort>(
    initialHistoryViewPreferences.sort,
  );
  const [historyStatusFilter, setHistoryStatusFilter] =
    useState<AgentHistoryStatusFilter>(initialHistoryViewPreferences.status);
  const [historyScoreFilter, setHistoryScoreFilter] =
    useState<AgentHistoryScoreFilter>(initialHistoryViewPreferences.score);
  const [historyConfidenceFilter, setHistoryConfidenceFilter] =
    useState<AgentHistoryConfidenceFilter>(initialHistoryViewPreferences.confidence);
  const [historyRecencyFilter, setHistoryRecencyFilter] =
    useState<AgentHistoryRecencyFilter>(initialHistoryViewPreferences.recency);
  const [historyFeedbackFilter, setHistoryFeedbackFilter] =
    useState<AgentHistoryFeedbackFilter>(initialHistoryViewPreferences.feedback);
  const [historyTopicFilter, setHistoryTopicFilter] =
    useState<AgentHistoryTopicFilter>(initialHistoryViewPreferences.topic);
  const [historySourceFilter, setHistorySourceFilter] =
    useState<AgentHistorySourceFilter>(initialHistoryViewPreferences.source);
  const [historyPinFilter, setHistoryPinFilter] =
    useState<AgentHistoryPinFilter>(initialHistoryViewPreferences.pin);
  /** A shared view is a one-time presentation override, not a new local default. */
  const historyViewEditedRef = useRef(!initialHistoryState.fromSharedUrl);
  const [historyCopyStatus, setHistoryCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [historyDownloadStatus, setHistoryDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [historyHtmlDownloadStatus, setHistoryHtmlDownloadStatus] = useState<
    'idle' | 'done' | 'failed'
  >('idle');
  const [historyCsvDownloadStatus, setHistoryCsvDownloadStatus] =
    useState<'idle' | 'done' | 'failed'>('idle');
  const [historyCsvCopyStatus, setHistoryCsvCopyStatus] =
    useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const [historyJsonDownloadStatus, setHistoryJsonDownloadStatus] =
    useState<'idle' | 'done' | 'failed'>('idle');
  const [historyJsonCopyStatus, setHistoryJsonCopyStatus] =
    useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const [historyHtmlCopyStatus, setHistoryHtmlCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle');
  const [historyJsonlDownloadStatus, setHistoryJsonlDownloadStatus] = useState<
    'idle' | 'busy' | 'done' | 'failed'
  >('idle');
  const [historyFilteredJsonlDownloadStatus, setHistoryFilteredJsonlDownloadStatus] = useState<
    'idle' | 'done' | 'failed'
  >('idle');
  const [historySelectedJsonlDownloadStatus, setHistorySelectedJsonlDownloadStatus] = useState<
    'idle' | 'busy' | 'done' | 'failed'
  >('idle');
  const [historySelectedJsonlCopyStatus, setHistorySelectedJsonlCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle');
  const [historySelectedCsvDownloadStatus, setHistorySelectedCsvDownloadStatus] = useState<
    'idle' | 'busy' | 'done' | 'failed'
  >('idle');
  const [historySelectedCsvCopyStatus, setHistorySelectedCsvCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle');
  const [historySelectedJsonDownloadStatus, setHistorySelectedJsonDownloadStatus] = useState<
    'idle' | 'busy' | 'done' | 'failed'
  >('idle');
  const [historySelectedJsonCopyStatus, setHistorySelectedJsonCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle');
  const [historySelectedMarkdownCopyStatus, setHistorySelectedMarkdownCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle');
  const [historySelectedMarkdownDownloadStatus, setHistorySelectedMarkdownDownloadStatus] =
    useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [historySelectedHtmlDownloadStatus, setHistorySelectedHtmlDownloadStatus] =
    useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [historySelectedHtmlCopyStatus, setHistorySelectedHtmlCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle');
  const [historyJsonlCopyStatus, setHistoryJsonlCopyStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle');
  const historyCopyTimerRef = useRef<number | null>(null);
  const historyDownloadTimerRef = useRef<number | null>(null);
  const historyHtmlDownloadTimerRef = useRef<number | null>(null);
  const historyCsvDownloadTimerRef = useRef<number | null>(null);
  const historyCsvCopyTimerRef = useRef<number | null>(null);
  /** Prevent duplicate CSV clipboard writes and stale feedback after reset. */
  const historyCsvCopyInFlightRef = useRef(false);
  const historyCsvCopyRunIdRef = useRef(0);
  const historyJsonDownloadTimerRef = useRef<number | null>(null);
  const historyJsonCopyTimerRef = useRef<number | null>(null);
  const historyHtmlCopyTimerRef = useRef<number | null>(null);
  /** Prevent duplicate JSON clipboard writes and stale feedback after reset. */
  const historyJsonCopyInFlightRef = useRef(false);
  const historyJsonCopyRunIdRef = useRef(0);
  /** Prevent duplicate rich-HTML clipboard writes and stale feedback. */
  const historyHtmlCopyInFlightRef = useRef(false);
  const historyHtmlCopyRunIdRef = useRef(0);
  const historyJsonlDownloadTimerRef = useRef<number | null>(null);
  const historyFilteredJsonlDownloadTimerRef = useRef<number | null>(null);
  const historySelectedJsonlDownloadTimerRef = useRef<number | null>(null);
  const historySelectedJsonlCopyTimerRef = useRef<number | null>(null);
  const historySelectedCsvDownloadTimerRef = useRef<number | null>(null);
  const historySelectedCsvCopyTimerRef = useRef<number | null>(null);
  const historySelectedJsonDownloadTimerRef = useRef<number | null>(null);
  const historySelectedJsonCopyTimerRef = useRef<number | null>(null);
  const historySelectedMarkdownDownloadTimerRef = useRef<number | null>(null);
  const historySelectedHtmlDownloadTimerRef = useRef<number | null>(null);
  const historySelectedHtmlCopyTimerRef = useRef<number | null>(null);
  /** Prevent rapid or re-entrant activations from creating duplicate files. */
  const historySelectedJsonlDownloadBusyRef = useRef(false);
  /** Prevent duplicate selected JSONL clipboard writes and stale feedback. */
  const historySelectedJsonlCopyInFlightRef = useRef(false);
  const historySelectedJsonlCopyRunIdRef = useRef(0);
  const historySelectedCsvDownloadBusyRef = useRef(false);
  /** Prevent duplicate selected CSV clipboard writes and stale feedback. */
  const historySelectedCsvCopyInFlightRef = useRef(false);
  const historySelectedCsvCopyRunIdRef = useRef(0);
  const historySelectedJsonDownloadBusyRef = useRef(false);
  const historySelectedJsonCopyInFlightRef = useRef(false);
  const historySelectedJsonCopyRunIdRef = useRef(0);
  const historySelectedMarkdownCopyTimerRef = useRef<number | null>(null);
  /** Prevent duplicate Markdown clipboard writes and stale feedback after reset. */
  const historySelectedMarkdownCopyInFlightRef = useRef(false);
  const historySelectedMarkdownCopyRunIdRef = useRef(0);
  const historySelectedMarkdownDownloadBusyRef = useRef(false);
  const historySelectedHtmlDownloadBusyRef = useRef(false);
  /** Prevent duplicate selected HTML clipboard writes and stale feedback. */
  const historySelectedHtmlCopyInFlightRef = useRef(false);
  const historySelectedHtmlCopyRunIdRef = useRef(0);
  const historyJsonlDownloadBusyRef = useRef(false);
  const historyJsonlCopyTimerRef = useRef<number | null>(null);
  const historyJsonlCopyInFlightRef = useRef(false);
  const historyJsonlCopyRunIdRef = useRef(0);
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
  const [historyHasLoaded, setHistoryHasLoaded] = useState(false);
  /** Ticks every 60s so history / live-update relative clocks stay honest. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);
  const [historyBulkDeleteConfirm, setHistoryBulkDeleteConfirm] = useState(false);
  const [historyBulkDeleteBusy, setHistoryBulkDeleteBusy] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const renameCancelledRef = useRef(false);
  const menuLayerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const historySearchRef = useRef<HTMLInputElement | null>(null);
  const historySelectVisibleRef = useRef<HTMLInputElement | null>(null);
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
  const [exportingMd, setExportingMd] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingHtml, setExportingHtml] = useState(false);
  const [exportingOrchestrationJson, setExportingOrchestrationJson] = useState(false);
  const [copyingOrchestrationJson, setCopyingOrchestrationJson] = useState(false);
  const [exportingOrchestrationMarkdown, setExportingOrchestrationMarkdown] = useState(false);
  const [exportingOrchestrationHistory, setExportingOrchestrationHistory] = useState(false);
  const [copyOrchestrationHistoryStatus, setCopyOrchestrationHistoryStatus] = useState<
    'idle' | 'copying' | 'copied' | 'failed'
  >('idle');
  const copyOrchestrationHistoryTimerRef = useRef<number | null>(null);
  const copyOrchestrationHistoryInFlightRef = useRef(false);
  const copyOrchestrationHistoryRunIdRef = useRef(0);
  const orchestrationHistoryBusy =
    exportingOrchestrationHistory || copyOrchestrationHistoryStatus === 'copying';
  /** Guards Shift+L / toolbar clicks so a report download can never double-fire. */
  const exportMdInFlightRef = useRef(false);
  const exportReportRunIdRef = useRef(0);
  /** Guards Shift+K / toolbar clicks so a report CSV download can never double-fire. */
  const exportCsvInFlightRef = useRef(false);
  const exportCsvRunIdRef = useRef(0);
  /** Guards the synchronous HTML download against rapid repeat activation. */
  const exportHtmlInFlightRef = useRef(false);
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
  /** Monotonic request id so a slow discover response can't overwrite a newer search. */
  const discoverRequestIdRef = useRef(0);
  const [myRooms, setMyRooms] = useState<any[]>([]);
  const [myRoomsLoading, setMyRoomsLoading] = useState(false);
  const [myRoomsLoadFailed, setMyRoomsLoadFailed] = useState(false);
  const [roomsTab, setRoomsTab] = useState<'mine' | 'discover'>('mine');
  const [discoverRooms, setDiscoverRooms] = useState<any[]>([]);
  const [discoverTotal, setDiscoverTotal] = useState(0);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverLoadFailed, setDiscoverLoadFailed] = useState(false);
  const [discoverLoadingMore, setDiscoverLoadingMore] = useState(false);
  const [discoverLoadMoreFailed, setDiscoverLoadMoreFailed] = useState(false);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discoverSearchQuery, setDiscoverSearchQuery] = useState('');
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
  const [copyingReport, setCopyingReport] = useState(false);
  const [copyReportFeedback, setCopyReportFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyReportInFlightRef = useRef(false);
  const copyReportRunIdRef = useRef(0);
  const copyReportFeedbackTimerRef = useRef<number | null>(null);
  const [copyingReportJson, setCopyingReportJson] = useState(false);
  const [copyReportJsonFeedback, setCopyReportJsonFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyReportJsonInFlightRef = useRef(false);
  const copyReportJsonRunIdRef = useRef(0);
  const copyReportJsonFeedbackTimerRef = useRef<number | null>(null);
  const [copyingReportCsv, setCopyingReportCsv] = useState(false);
  const [copyReportCsvFeedback, setCopyReportCsvFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyReportCsvInFlightRef = useRef(false);
  const copyReportCsvRunIdRef = useRef(0);
  const copyReportCsvFeedbackTimerRef = useRef<number | null>(null);
  const [copyingReportHtml, setCopyingReportHtml] = useState(false);
  const [copyReportHtmlFeedback, setCopyReportHtmlFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyReportHtmlInFlightRef = useRef(false);
  const copyReportHtmlRunIdRef = useRef(0);
  const copyReportHtmlFeedbackTimerRef = useRef<number | null>(null);
  const [sharingTask, setSharingTask] = useState(false);
  const [revokingTaskShare, setRevokingTaskShare] = useState(false);
  const [taskShareFeedback, setTaskShareFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [taskShareActive, setTaskShareActive] = useState(false);
  const taskShareInFlightRef = useRef(false);
  const taskShareFeedbackTimerRef = useRef<number | null>(null);
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
      setHistoryHasLoaded(true);
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

  const loadDiscoverRooms = useCallback(
    async (query: string = discoverSearchQuery, page = 1) => {
      const requestId = ++discoverRequestIdRef.current;
      if (!user) {
        setDiscoverRooms([]);
        setDiscoverTotal(0);
        setDiscoverLoadFailed(false);
        setDiscoverLoading(false);
        setDiscoverLoadingMore(false);
        setDiscoverLoadMoreFailed(false);
        return;
      }
      setDiscoverLoading(page === 1);
      setDiscoverLoadingMore(page > 1);
      setDiscoverLoadMoreFailed(false);
      try {
        const r = await getDiscoverRooms(query, page, 20);
        if (requestId !== discoverRequestIdRef.current) return;
        setDiscoverRooms((prev) => {
          if (page === 1) return r.rooms || [];
          const seen = new Set(prev.map((room) => room?.id));
          return [...prev, ...(r.rooms || []).filter((room) => !seen.has(room.id))];
        });
        setDiscoverTotal(r.total || 0);
        setDiscoverPage(page);
        setDiscoverLoadFailed(false);
      } catch {
        if (requestId !== discoverRequestIdRef.current) return;
        if (page === 1) {
          setDiscoverRooms([]);
          setDiscoverTotal(0);
          setDiscoverLoadFailed(true);
        } else {
          setDiscoverLoadMoreFailed(true);
        }
      } finally {
        if (requestId === discoverRequestIdRef.current) {
          setDiscoverLoading(false);
          setDiscoverLoadingMore(false);
        }
      }
    },
    [discoverSearchQuery, user],
  );

  const handleRoomsTabChange = (tab: 'mine' | 'discover') => {
    setRoomsTab(tab);
    if (tab === 'discover' && discoverRooms.length === 0 && !discoverLoading) {
      void loadDiscoverRooms();
    }
  };

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
    const prefill = takeAgentPrefillQuestion({
      hasExplicitTask: searchParams.has('task_id') || searchParams.has('q'),
    });
    if (prefill) setTask(prefill);
  }, [searchParams]);

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
    if (!historyBulkDeleteConfirm || historyBulkDeleteBusy) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setHistoryBulkDeleteConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyBulkDeleteBusy, historyBulkDeleteConfirm]);

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
    activeTaskIdRef.current = taskId;
    const clearActiveTask = () => {
      if (activeTaskIdRef.current === taskId) activeTaskIdRef.current = null;
    };
    const maxAttempts = 60;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      if (runGenerationRef.current !== generation) {
        // User stopped (or a newer run superseded this poll).
        clearActiveTask();
        return;
      }
      try {
        const statusData = await getAgentStatus(taskId);
        if (runGenerationRef.current !== generation) {
          clearActiveTask();
          return;
        }
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
        if (st === 'cancelled') {
          clearActiveTask();
          setIsRunning(false);
          setIsRefining(false);
          setCurrentStage('done');
          setToastMessage('Task cancelled.');
          return;
        }
        if (st === 'complete' || st === 'failed') {
          if (runGenerationRef.current !== generation) {
            clearActiveTask();
            return;
          }
          try {
            const resultData = (await getAgentResult(taskId)) as AgentResult;
            if (runGenerationRef.current !== generation) {
              clearActiveTask();
              return;
            }
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
            if (runGenerationRef.current !== generation) {
              clearActiveTask();
              return;
            }
            setError(resultErr instanceof Error ? resultErr.message : 'Could not load agent result');
          }
          setIsRunning(false);
          setIsRefining(false);
          clearActiveTask();
          return;
        }
      } catch (pollErr) {
        if (runGenerationRef.current !== generation) {
          clearActiveTask();
          return;
        }
        if (pollErr instanceof ApiError && (pollErr.status === 401 || pollErr.status === 403)) {
          setError(pollErr.message || 'Authentication required');
          setIsRunning(false);
          setIsRefining(false);
          clearActiveTask();
          return;
        }
        await wait(5000);
        continue;
      }
      await wait(3000);
    }
    if (runGenerationRef.current !== generation) {
      clearActiveTask();
      return;
    }
    setError('Task timed out. Please try again.');
    setIsRunning(false);
    setIsRefining(false);
    clearActiveTask();
  }, []);

  const handleStopAgentWork = useCallback(() => {
    runGenerationRef.current += 1;
    const taskId = activeTaskIdRef.current;
    activeTaskIdRef.current = null;
    const orchId = orchActiveId;
    setOrchActiveId(null);
    setOrchPoll(null);
    setIsRunning(false);
    setIsRefining(false);
    setIsChallengingAnswer(false);
    setToastMessage('Stopped.');
    if (orchId) {
      // Multi-task runs are polled as an orchestration rather than per
      // task, so Stop must ask the backend to cancel every child pipeline
      // at once — otherwise the whole run keeps spending token budget.
      void cancelAgentOrchestration(orchId)
        .then((res) => {
          if (res.status === 'cancelled') {
            setToastMessage('Tasks cancelled.');
          }
        })
        .catch(() => {
          // Best-effort, same contract as task cancel: Stop must never
          // fail on a network hiccup; the client poll is already gone.
        });
    } else if (taskId) {
      // Stop used to only abandon the client poll while the backend kept
      // running every remaining stage and spending token budget. Ask the
      // backend to stop at the next stage boundary too.
      void cancelAgentTask(taskId)
        .then((res) => {
          if (res.status === 'cancelling' || res.status === 'cancelled') {
            setToastMessage('Task cancelled.');
          }
        })
        .catch(() => {
          // The task may have just finished server-side; the poll is
          // already stopped either way. Never fail Stop on a network hiccup.
        });
    }
  }, [orchActiveId]);

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
    activeTaskIdRef.current = null;
    const generation = ++runGenerationRef.current;
    setError(null);
    setRateLimit(null);
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
      if (runGenerationRef.current !== generation) {
        // The user started a fresh task (or pressed Stop) while the task was
        // being created. Abandon the client poll and ask the backend to cancel
        // the just-created pipeline so no orphaned run keeps spending tokens.
        void cancelAgentTask(startData.task_id).catch(() => {});
        return;
      }
      // Pipeline accepted a real task — draft is safely delivered.
      clearPromptDraft(AGENT_TASK_DRAFT_KEY);
      await pollAgentTaskUntilDone(startData.task_id);
      await loadTaskHistory();
      setAttachments([]);
      setActiveMcpSources([]);
    } catch (e) {
      if (runGenerationRef.current !== generation) return;
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
      const rateLimitDetail =
        e instanceof ApiError && e.status === 429 ? getRateLimitDetail(e.detail) : null;
      if (rateLimitDetail) {
        setRateLimit(rateLimitDetail);
        setError(null);
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
    activeTaskIdRef.current = null;
    const generation = ++runGenerationRef.current;
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
      if (runGenerationRef.current !== generation) {
        // A fresh task or Stop superseded this orchestration while it was
        // being created. Cancel it best-effort so the backend doesn't keep
        // running child pipelines for an abandoned UI.
        void cancelAgentOrchestration(orchestration_id).catch(() => {});
        return;
      }
      setOrchActiveId(orchestration_id);
    } catch (e) {
      if (runGenerationRef.current !== generation) return;
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
        } else if (data.status === 'cancelled') {
          if (!cancelled) {
            setToastMessage('Multi-task run cancelled.');
            setIsRunning(false);
            setOrchActiveId(null);
            setOrchPoll(null);
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

  const handleExportTaskHtml = useCallback(() => {
    if (!result?.task_id || result.status !== 'complete' || exportHtmlInFlightRef.current) return;
    const taskId = result.task_id;
    exportHtmlInFlightRef.current = true;
    setExportingHtml(true);
    try {
      const question = result.original_task || result.task || task || '';
      const parsed = parseSynthesisFromFinalAnswer(result.final_answer);
      const html = formatAgentReportHtml({
        title: question,
        question,
        answer: plainTextFromFinalAnswer(result.final_answer, parsed),
        sources: selectAgentReportSources({
          sources: result.sources,
          sourceIntegritySources: result.source_integrity?.sources,
          answerSources: parsed?.sources_referenced,
        }),
        finalScore: result.final_score,
        finalConfidence: result.final_confidence,
      });
      const ok = downloadHtmlFile(html, `arena-report-${taskId.slice(0, 8)}`);
      if (!ok) setError('Could not download the HTML report — try Report .md instead.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download the HTML report.');
    } finally {
      exportHtmlInFlightRef.current = false;
      setExportingHtml(false);
    }
  }, [result, task]);

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

  const handleExportTaskMarkdown = useCallback(async () => {
    if (!result?.task_id || result.status !== 'complete' || exportMdInFlightRef.current) return;
    const taskId = result.task_id;
    const runId = ++exportReportRunIdRef.current;
    exportMdInFlightRef.current = true;
    setExportingMd(true);
    try {
      const blob = await exportAgentTaskMarkdown(taskId);
      if (exportReportRunIdRef.current !== runId) return;
      const ok = downloadBlobFile(
        blob,
        `arena-report-${taskId.slice(0, 8)}.md`,
      );
      if (!ok) setError('Export failed');
    } catch (e) {
      if (exportReportRunIdRef.current !== runId) return;
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      if (exportReportRunIdRef.current === runId) {
        exportMdInFlightRef.current = false;
        setExportingMd(false);
      }
    }
  }, [result?.status, result?.task_id]);

  const handleExportTaskCsv = useCallback(async () => {
    if (!result?.task_id || result.status !== 'complete' || exportCsvInFlightRef.current) return;
    const taskId = result.task_id;
    const runId = ++exportCsvRunIdRef.current;
    exportCsvInFlightRef.current = true;
    setExportingCsv(true);
    try {
      const blob = await exportAgentTaskCsv(taskId);
      if (exportCsvRunIdRef.current !== runId) return;
      const ok = downloadBlobFile(
        blob,
        `arena-report-${taskId.slice(0, 8)}.csv`,
      );
      if (!ok) setError('Export failed');
    } catch (e) {
      if (exportCsvRunIdRef.current !== runId) return;
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      if (exportCsvRunIdRef.current === runId) {
        exportCsvInFlightRef.current = false;
        setExportingCsv(false);
      }
    }
  }, [result?.status, result?.task_id]);

  const handleExportTaskJson = useCallback(async () => {
    if (!result?.task_id || exportingJson) return;
    setExportingJson(true);
    try {
      const blob = await exportAgentTaskJson(result.task_id);
      const ok = downloadBlobFile(
        blob,
        `arena-task-${result.task_id.slice(0, 8)}.json`,
      );
      if (!ok) setError('Export failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingJson(false);
    }
  }, [exportingJson, result?.task_id]);

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

  const handleExportOrchestrationMarkdown = async () => {
    const oid = orchResult?.orchestration?.id as string | undefined;
    if (!oid || exportingOrchestrationMarkdown) return;
    setExportingOrchestrationMarkdown(true);
    try {
      const blob = await exportOrchestrationMarkdown(oid);
      const ok = downloadBlobFile(blob, `arena-orchestration-${oid.slice(0, 8)}.md`);
      if (!ok) setError('Markdown export failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Markdown export failed');
    } finally {
      setExportingOrchestrationMarkdown(false);
    }
  };

  const handleExportOrchestrationJson = async () => {
    const oid = orchResult?.orchestration?.id as string | undefined;
    if (!oid || exportingOrchestrationJson || copyingOrchestrationJson) return;
    setExportingOrchestrationJson(true);
    try {
      const blob = await exportOrchestrationJson(oid);
      const ok = downloadBlobFile(blob, `arena-orchestration-${oid.slice(0, 8)}.json`);
      if (!ok) setError('JSON export failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON export failed');
    } finally {
      setExportingOrchestrationJson(false);
    }
  };

  const handleCopyOrchestrationJson = async () => {
    const oid = orchResult?.orchestration?.id as string | undefined;
    if (!oid || exportingOrchestrationJson || copyingOrchestrationJson) return;
    setCopyingOrchestrationJson(true);
    try {
      const blob = await exportOrchestrationJson(oid);
      const ok = await copyAgentOrchestrationJson(blob);
      if (ok) {
        setToastMessage('Orchestration JSON copied.');
      } else {
        setError('Could not copy orchestration JSON — try the JSON download instead.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy orchestration JSON.');
    } finally {
      setCopyingOrchestrationJson(false);
    }
  };

  const handleExportOrchestrationHistoryCsv = useCallback(async () => {
    if (orchestrationHistoryBusy) return;
    setExportingOrchestrationHistory(true);
    try {
      const blob = await exportAgentOrchestrationsCsv();
      const ok = downloadBlobFile(
        blob,
        `${withDownloadDate('arena-orchestrations')}.csv`,
      );
      if (!ok) setError('Could not download orchestration history — try again.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not download orchestration history — try again.',
      );
    } finally {
      setExportingOrchestrationHistory(false);
    }
  }, [orchestrationHistoryBusy]);

  const handleExportOrchestrationHistoryJson = useCallback(async () => {
    if (orchestrationHistoryBusy) return;
    setExportingOrchestrationHistory(true);
    try {
      const blob = await exportAgentOrchestrationsJson();
      const ok = downloadBlobFile(
        blob,
        `${withDownloadDate('arena-orchestrations')}.json`,
      );
      if (!ok) setError('Could not download orchestration history — try again.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not download orchestration history — try again.',
      );
    } finally {
      setExportingOrchestrationHistory(false);
    }
  }, [orchestrationHistoryBusy]);

  const handleExportOrchestrationHistoryMarkdown = useCallback(async () => {
    if (orchestrationHistoryBusy) return;
    setExportingOrchestrationHistory(true);
    try {
      const blob = await exportAgentOrchestrationsMarkdown();
      const ok = downloadBlobFile(
        blob,
        `${withDownloadDate('arena-orchestrations')}.md`,
      );
      if (!ok) setError('Could not download orchestration history — try again.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not download orchestration history — try again.',
      );
    } finally {
      setExportingOrchestrationHistory(false);
    }
  }, [orchestrationHistoryBusy]);

  const handleCopyOrchestrationHistoryMarkdown = useCallback(async () => {
    if (orchestrationHistoryBusy || copyOrchestrationHistoryInFlightRef.current) return;
    const runId = ++copyOrchestrationHistoryRunIdRef.current;
    copyOrchestrationHistoryInFlightRef.current = true;
    if (copyOrchestrationHistoryTimerRef.current != null) {
      window.clearTimeout(copyOrchestrationHistoryTimerRef.current);
      copyOrchestrationHistoryTimerRef.current = null;
    }
    setCopyOrchestrationHistoryStatus('copying');
    try {
      const markdown = await fetchAgentOrchestrationsMarkdownText();
      if (copyOrchestrationHistoryRunIdRef.current !== runId) return;
      const ok = await copyAgentOrchestrationMarkdown(markdown);
      if (copyOrchestrationHistoryRunIdRef.current !== runId) return;
      setCopyOrchestrationHistoryStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setError('Could not copy orchestration history — try the Markdown download instead.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      copyOrchestrationHistoryTimerRef.current = window.setTimeout(() => {
        if (copyOrchestrationHistoryRunIdRef.current !== runId) return;
        setCopyOrchestrationHistoryStatus('idle');
        copyOrchestrationHistoryTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } catch (e) {
      if (copyOrchestrationHistoryRunIdRef.current !== runId) return;
      setCopyOrchestrationHistoryStatus('failed');
      setError(
        e instanceof Error
          ? e.message
          : 'Could not copy orchestration history — try the Markdown download instead.',
      );
      const hold = motionDuration(2800);
      copyOrchestrationHistoryTimerRef.current = window.setTimeout(() => {
        if (copyOrchestrationHistoryRunIdRef.current !== runId) return;
        setCopyOrchestrationHistoryStatus('idle');
        copyOrchestrationHistoryTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (copyOrchestrationHistoryRunIdRef.current === runId) {
        copyOrchestrationHistoryInFlightRef.current = false;
      }
    }
  }, [orchestrationHistoryBusy]);

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
    activeTaskIdRef.current = null;
    const generation = ++runGenerationRef.current;
    // Clear only after we know we'll send; restore on failure so the draft isn't lost.
    setFollowUp('');
    setIsRunning(true);
    setIsRefining(true);
    setRefinementError(null);
    try {
      await refineAgentAnswer(result.task_id, msg);
      if (runGenerationRef.current !== generation) {
        // A fresh task (or Stop) superseded this refinement while the request
        // was in flight. Cancel the newly-refined pipeline best-effort so the
        // backend doesn't keep spending tokens on a task the user abandoned.
        void cancelAgentTask(result.task_id).catch(() => {});
        return;
      }
      clearPromptDraft(agentFollowUpDraftKey(result.task_id));
      await pollAgentTaskUntilDone(result.task_id);
    } catch (err) {
      if (runGenerationRef.current !== generation) return;
      setFollowUp(msg);
      setRefinementError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Refinement failed.',
      );
      followUpInputRef.current?.focus();
    } finally {
      if (runGenerationRef.current === generation) {
        setIsRunning(false);
        setIsRefining(false);
      }
    }
  };

  const resetRun = useCallback(() => {
    try {
      sessionStorage.removeItem('pending_room_slug');
      sessionStorage.removeItem('pending_room_name');
    } catch {
      /* ignore */
    }
    pendingRoomHandledRef.current = null;
    setCrossPollinateBusy(false);
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    setHistoryBulkDeleteConfirm(false);
    setEditingTaskId(null);
    setEditingValue('');
    setSelectedHistoryTaskIds(new Set());
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
    setAnswerFeedbackSubmitBusy(false);
    setPendingVerdict(null);
    setPendingNote('');
    setOrchActiveId(null);
    setOrchPoll(null);
    setOrchResult(null);
    setOrchExpandedIdx(null);
    setMultiMode(false);
    setMultiTasks(['', '', '', '']);
    setActiveTaskCount(2);
    setWatchlisted(false);
    setShowScheduler(false);
    setWatchlistPickHours(24);
    setAttachments([]);
    setActiveMcpSources([]);
    setAttachMenuOpen(false);
    setUploadErr(null);
    setExportingPdf(false);
    setExportingMd(false);
    setExportingJson(false);
    setExportingCsv(false);
    setExportingHtml(false);
    exportReportRunIdRef.current += 1;
    exportMdInFlightRef.current = false;
    exportCsvRunIdRef.current += 1;
    exportCsvInFlightRef.current = false;
    exportHtmlInFlightRef.current = false;
    setCopyAnswerFeedback('idle');
    setDownloadAnswerFeedback('idle');
    copyReportRunIdRef.current += 1;
    copyReportInFlightRef.current = false;
    if (copyReportFeedbackTimerRef.current != null) {
      window.clearTimeout(copyReportFeedbackTimerRef.current);
      copyReportFeedbackTimerRef.current = null;
    }
    setCopyingReport(false);
    setCopyReportFeedback('idle');
    copyReportJsonRunIdRef.current += 1;
    copyReportJsonInFlightRef.current = false;
    if (copyReportJsonFeedbackTimerRef.current != null) {
      window.clearTimeout(copyReportJsonFeedbackTimerRef.current);
      copyReportJsonFeedbackTimerRef.current = null;
    }
    setCopyingReportJson(false);
    setCopyReportJsonFeedback('idle');
    copyReportCsvRunIdRef.current += 1;
    copyReportCsvInFlightRef.current = false;
    if (copyReportCsvFeedbackTimerRef.current != null) {
      window.clearTimeout(copyReportCsvFeedbackTimerRef.current);
      copyReportCsvFeedbackTimerRef.current = null;
    }
    setCopyingReportCsv(false);
    setCopyReportCsvFeedback('idle');
    invalidateAgentReportCopy(
      {
        runId: copyReportHtmlRunIdRef,
        inFlight: copyReportHtmlInFlightRef,
        feedbackTimer: copyReportHtmlFeedbackTimerRef,
      },
      window.clearTimeout,
    );
    setCopyingReportHtml(false);
    setCopyReportHtmlFeedback('idle');
    historyCsvCopyRunIdRef.current += 1;
    historyCsvCopyInFlightRef.current = false;
    if (historyCsvCopyTimerRef.current != null) {
      window.clearTimeout(historyCsvCopyTimerRef.current);
      historyCsvCopyTimerRef.current = null;
    }
    setHistoryCsvCopyStatus('idle');
    historyJsonCopyRunIdRef.current += 1;
    historyJsonCopyInFlightRef.current = false;
    if (historyJsonCopyTimerRef.current != null) {
      window.clearTimeout(historyJsonCopyTimerRef.current);
      historyJsonCopyTimerRef.current = null;
    }
    setHistoryJsonCopyStatus('idle');
    historyHtmlCopyRunIdRef.current += 1;
    historyHtmlCopyInFlightRef.current = false;
    if (historyHtmlCopyTimerRef.current != null) {
      window.clearTimeout(historyHtmlCopyTimerRef.current);
      historyHtmlCopyTimerRef.current = null;
    }
    setHistoryHtmlCopyStatus('idle');
    historyJsonlCopyRunIdRef.current += 1;
    historyJsonlCopyInFlightRef.current = false;
    if (historyJsonlCopyTimerRef.current != null) {
      window.clearTimeout(historyJsonlCopyTimerRef.current);
      historyJsonlCopyTimerRef.current = null;
    }
    setHistoryJsonlCopyStatus('idle');
    if (historySelectedJsonlDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonlDownloadTimerRef.current);
      historySelectedJsonlDownloadTimerRef.current = null;
    }
    historySelectedJsonlDownloadBusyRef.current = false;
    setHistorySelectedJsonlDownloadStatus('idle');
    historySelectedJsonlCopyRunIdRef.current += 1;
    historySelectedJsonlCopyInFlightRef.current = false;
    if (historySelectedJsonlCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonlCopyTimerRef.current);
      historySelectedJsonlCopyTimerRef.current = null;
    }
    setHistorySelectedJsonlCopyStatus('idle');
    if (historySelectedCsvDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedCsvDownloadTimerRef.current);
      historySelectedCsvDownloadTimerRef.current = null;
    }
    historySelectedCsvDownloadBusyRef.current = false;
    setHistorySelectedCsvDownloadStatus('idle');
    historySelectedCsvCopyRunIdRef.current += 1;
    historySelectedCsvCopyInFlightRef.current = false;
    if (historySelectedCsvCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedCsvCopyTimerRef.current);
      historySelectedCsvCopyTimerRef.current = null;
    }
    setHistorySelectedCsvCopyStatus('idle');
    if (historySelectedJsonDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonDownloadTimerRef.current);
      historySelectedJsonDownloadTimerRef.current = null;
    }
    historySelectedJsonDownloadBusyRef.current = false;
    setHistorySelectedJsonDownloadStatus('idle');
    historySelectedJsonCopyRunIdRef.current += 1;
    historySelectedJsonCopyInFlightRef.current = false;
    if (historySelectedJsonCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonCopyTimerRef.current);
      historySelectedJsonCopyTimerRef.current = null;
    }
    setHistorySelectedJsonCopyStatus('idle');
    historySelectedMarkdownCopyRunIdRef.current += 1;
    historySelectedMarkdownCopyInFlightRef.current = false;
    if (historySelectedMarkdownCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedMarkdownCopyTimerRef.current);
      historySelectedMarkdownCopyTimerRef.current = null;
    }
    setHistorySelectedMarkdownCopyStatus('idle');
    if (historySelectedMarkdownDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedMarkdownDownloadTimerRef.current);
      historySelectedMarkdownDownloadTimerRef.current = null;
    }
    historySelectedMarkdownDownloadBusyRef.current = false;
    setHistorySelectedMarkdownDownloadStatus('idle');
    if (historySelectedHtmlDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedHtmlDownloadTimerRef.current);
      historySelectedHtmlDownloadTimerRef.current = null;
    }
    historySelectedHtmlDownloadBusyRef.current = false;
    setHistorySelectedHtmlDownloadStatus('idle');
    historySelectedHtmlCopyRunIdRef.current += 1;
    historySelectedHtmlCopyInFlightRef.current = false;
    if (historySelectedHtmlCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedHtmlCopyTimerRef.current);
      historySelectedHtmlCopyTimerRef.current = null;
    }
    setHistorySelectedHtmlCopyStatus('idle');
    setUserRating(null);
    setRatingResult(null);
    setRatingSubmitBusy(false);
    setLiveToggleBusy(false);
    setLiveUpdatesPanelOpen(false);
    setSuggIdx(0);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, setSearchParams]);

  /**
   * New task from the sidebar or Shift+N: stop any active Agent work first
   * (client poll plus the backend pipeline), then clear the page to a fresh,
   * empty compose box. Mirrors Arena's New task, which aborts in-flight SSE
   * before resetting the UI.
   */
  const startFreshAgentTask = useCallback(() => {
    if (isRunning || isRefining || isChallengingAnswer) {
      handleStopAgentWork();
    }
    resetRun();
    window.setTimeout(() => idleTaskInputRef.current?.focus(), 0);
  }, [handleStopAgentWork, isChallengingAnswer, isRefining, isRunning, resetRun]);

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

  const copyHistoryResearch = useCallback(async (item: HistoryTask) => {
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    const text = formatAgentHistoryItemCopy({
      title: item.title,
      question: item.task_text,
      score: item.final_score,
      confidence: item.final_confidence,
      createdAt: item.created_at,
      topics: item.topics,
      isLive: item.is_live,
      taskId: item.task_id,
    });
    if (!text) {
      setToastMessage('Nothing to copy on this research.');
      return;
    }
    const ok = await copyToClipboard(text);
    setToastMessage(ok ? 'Research snapshot copied.' : 'Could not copy — try again.');
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

  const completedAnswerMarkdown = useMemo(
    () =>
      formatAgentAnswerExport({
        question: result?.original_task || result?.task || task || '',
        answer: plainAnswerText || result?.final_answer || '',
        taskId: result?.task_id,
      }),
    [
      plainAnswerText,
      result?.final_answer,
      result?.original_task,
      result?.task,
      result?.task_id,
      task,
    ],
  );

  const handleCopyAnswer = useCallback(() => {
    if (!result?.task_id) return;
    void copyToClipboard(completedAnswerMarkdown).then((ok) => {
      setCopyAnswerFeedback(ok ? 'copied' : 'failed');
      const hold = motionDuration(ok ? 2000 : 2800);
      window.setTimeout(() => setCopyAnswerFeedback('idle'), hold > 0 ? hold : 0);
    });
  }, [completedAnswerMarkdown, result?.task_id]);

  const handleDownloadAnswer = useCallback(() => {
    if (!result?.task_id) return;
    const question = result?.original_task || result?.task || task || '';
    const stem = `agent-${(question || result.task_id).slice(0, 48)}`;
    const ok = downloadMarkdownFile(completedAnswerMarkdown, stem);
    setDownloadAnswerFeedback(ok ? 'done' : 'failed');
    const hold = motionDuration(ok ? 2000 : 2800);
    window.setTimeout(() => setDownloadAnswerFeedback('idle'), hold > 0 ? hold : 0);
  }, [completedAnswerMarkdown, result?.original_task, result?.task, result?.task_id, task]);

  const handleCopyTaskMarkdown = useCallback(async () => {
    if (!result?.task_id || result.status !== 'complete' || copyReportInFlightRef.current) return;
    const taskId = result.task_id;
    const runId = ++copyReportRunIdRef.current;
    copyReportInFlightRef.current = true;
    setCopyingReport(true);
    setCopyReportFeedback('idle');
    if (copyReportFeedbackTimerRef.current != null) {
      window.clearTimeout(copyReportFeedbackTimerRef.current);
      copyReportFeedbackTimerRef.current = null;
    }
    try {
      const markdown = await fetchAgentTaskMarkdownText(taskId);
      if (copyReportRunIdRef.current !== runId) return;
      const ok = await copyToClipboard(markdown);
      if (copyReportRunIdRef.current !== runId) return;
      setCopyReportFeedback(ok ? 'copied' : 'failed');
      if (!ok) {
        setError('Could not copy the research report. Try the Report .md download instead.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      copyReportFeedbackTimerRef.current = window.setTimeout(() => {
        setCopyReportFeedback('idle');
        copyReportFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } catch (e) {
      if (copyReportRunIdRef.current !== runId) return;
      setCopyReportFeedback('failed');
      setError(e instanceof Error ? e.message : 'Could not copy the research report.');
      const hold = motionDuration(2800);
      copyReportFeedbackTimerRef.current = window.setTimeout(() => {
        setCopyReportFeedback('idle');
        copyReportFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (copyReportRunIdRef.current === runId) {
        copyReportInFlightRef.current = false;
        setCopyingReport(false);
      }
    }
  }, [result?.status, result?.task_id]);

  const handleCopyTaskJson = useCallback(async () => {
    if (!result?.task_id || result.status !== 'complete' || copyReportJsonInFlightRef.current) return;
    const taskId = result.task_id;
    const runId = ++copyReportJsonRunIdRef.current;
    copyReportJsonInFlightRef.current = true;
    setCopyingReportJson(true);
    setCopyReportJsonFeedback('idle');
    if (copyReportJsonFeedbackTimerRef.current != null) {
      window.clearTimeout(copyReportJsonFeedbackTimerRef.current);
      copyReportJsonFeedbackTimerRef.current = null;
    }
    try {
      const json = await fetchAgentTaskJsonText(taskId);
      if (copyReportJsonRunIdRef.current !== runId) return;
      const ok = await copyToClipboard(json);
      if (copyReportJsonRunIdRef.current !== runId) return;
      setCopyReportJsonFeedback(ok ? 'copied' : 'failed');
      if (!ok) {
        setError('Could not copy the research report. Try the Report .json download instead.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      copyReportJsonFeedbackTimerRef.current = window.setTimeout(() => {
        setCopyReportJsonFeedback('idle');
        copyReportJsonFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } catch (e) {
      if (copyReportJsonRunIdRef.current !== runId) return;
      setCopyReportJsonFeedback('failed');
      setError(e instanceof Error ? e.message : 'Could not copy the research report.');
      const hold = motionDuration(2800);
      copyReportJsonFeedbackTimerRef.current = window.setTimeout(() => {
        setCopyReportJsonFeedback('idle');
        copyReportJsonFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (copyReportJsonRunIdRef.current === runId) {
        copyReportJsonInFlightRef.current = false;
        setCopyingReportJson(false);
      }
    }
  }, [result?.status, result?.task_id]);

  const handleCopyTaskCsv = useCallback(async () => {
    if (!result?.task_id || result.status !== 'complete' || copyReportCsvInFlightRef.current) return;
    const taskId = result.task_id;
    const runId = ++copyReportCsvRunIdRef.current;
    copyReportCsvInFlightRef.current = true;
    setCopyingReportCsv(true);
    setCopyReportCsvFeedback('idle');
    if (copyReportCsvFeedbackTimerRef.current != null) {
      window.clearTimeout(copyReportCsvFeedbackTimerRef.current);
      copyReportCsvFeedbackTimerRef.current = null;
    }
    try {
      const csv = await fetchAgentTaskCsvText(taskId);
      if (copyReportCsvRunIdRef.current !== runId) return;
      const ok = await copyCsvToClipboard(csv);
      if (copyReportCsvRunIdRef.current !== runId) return;
      setCopyReportCsvFeedback(ok ? 'copied' : 'failed');
      if (!ok) {
        setError('Could not copy the research report. Try the Report .csv download instead.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      copyReportCsvFeedbackTimerRef.current = window.setTimeout(() => {
        setCopyReportCsvFeedback('idle');
        copyReportCsvFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } catch (e) {
      if (copyReportCsvRunIdRef.current !== runId) return;
      setCopyReportCsvFeedback('failed');
      setError(e instanceof Error ? e.message : 'Could not copy the research report.');
      const hold = motionDuration(2800);
      copyReportCsvFeedbackTimerRef.current = window.setTimeout(() => {
        setCopyReportCsvFeedback('idle');
        copyReportCsvFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (copyReportCsvRunIdRef.current === runId) {
        copyReportCsvInFlightRef.current = false;
        setCopyingReportCsv(false);
      }
    }
  }, [result?.status, result?.task_id]);

  const handleCopyTaskHtml = useCallback(async () => {
    if (!result?.task_id || result.status !== 'complete' || copyReportHtmlInFlightRef.current) return;
    const taskId = result.task_id;
    const runId = ++copyReportHtmlRunIdRef.current;
    copyReportHtmlInFlightRef.current = true;
    setCopyingReportHtml(true);
    setCopyReportHtmlFeedback('idle');
    if (copyReportHtmlFeedbackTimerRef.current != null) {
      window.clearTimeout(copyReportHtmlFeedbackTimerRef.current);
      copyReportHtmlFeedbackTimerRef.current = null;
    }

    try {
      const question = result.original_task || result.task || task || '';
      const parsed = parsedAnswer;
      const payload = formatAgentReportClipboard({
        question,
        answer: plainAnswerText || result.final_answer || '',
        taskId,
        sources: result.sources,
        sourceIntegritySources: result.source_integrity?.sources,
        answerSources: parsed?.sources_referenced,
        finalScore: result.final_score,
        finalConfidence: result.final_confidence,
      });
      const ok = await copyHtmlToClipboard(payload.html, payload.plainText);
      if (copyReportHtmlRunIdRef.current !== runId) return;
      setCopyReportHtmlFeedback(ok ? 'copied' : 'failed');
      if (!ok) {
        setError('Could not copy the rich report. Try the Report .html download instead.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      copyReportHtmlFeedbackTimerRef.current = window.setTimeout(() => {
        if (copyReportHtmlRunIdRef.current !== runId) return;
        setCopyReportHtmlFeedback('idle');
        copyReportHtmlFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } catch (e) {
      if (copyReportHtmlRunIdRef.current !== runId) return;
      setCopyReportHtmlFeedback('failed');
      setError(e instanceof Error ? e.message : 'Could not copy the rich report.');
      const hold = motionDuration(2800);
      copyReportHtmlFeedbackTimerRef.current = window.setTimeout(() => {
        if (copyReportHtmlRunIdRef.current !== runId) return;
        setCopyReportHtmlFeedback('idle');
        copyReportHtmlFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (copyReportHtmlRunIdRef.current === runId) {
        copyReportHtmlInFlightRef.current = false;
        setCopyingReportHtml(false);
      }
    }
  }, [parsedAnswer, plainAnswerText, result, task]);

  /**
   * Publish a completed report as a public link and copy it to the
   * clipboard. The backend is idempotent, so repeat clicks return the same
   * link; the in-flight ref prevents a double-fire from racing two copies.
   */
  const handleShareTask = useCallback(async () => {
    if (!result?.task_id || result.status !== 'complete' || taskShareInFlightRef.current) return;
    taskShareInFlightRef.current = true;
    setSharingTask(true);
    setTaskShareFeedback('idle');
    if (taskShareFeedbackTimerRef.current != null) {
      window.clearTimeout(taskShareFeedbackTimerRef.current);
      taskShareFeedbackTimerRef.current = null;
    }
    try {
      const share = await createAgentTaskShare(result.task_id);
      const absoluteUrl = `${window.location.origin}${share.shareUrl}`;
      const ok = await copyToClipboard(absoluteUrl);
      setTaskShareFeedback(ok ? 'copied' : 'failed');
      setTaskShareActive(true);
      if (!ok) {
        setError('Could not copy the share link — try again.');
      }
      const hold = motionDuration(ok ? 2200 : 3200);
      taskShareFeedbackTimerRef.current = window.setTimeout(() => {
        setTaskShareFeedback('idle');
        taskShareFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } catch (e) {
      setTaskShareFeedback('failed');
      setError(e instanceof Error ? e.message : 'Could not share this report.');
      const hold = motionDuration(3200);
      taskShareFeedbackTimerRef.current = window.setTimeout(() => {
        setTaskShareFeedback('idle');
        taskShareFeedbackTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      taskShareInFlightRef.current = false;
      setSharingTask(false);
    }
  }, [result?.status, result?.task_id]);

  const handleRevokeTaskShare = useCallback(async () => {
    if (!result?.task_id || revokingTaskShare) return;
    setRevokingTaskShare(true);
    try {
      await revokeAgentTaskShare(result.task_id);
      setTaskShareActive(false);
      setTaskShareFeedback('idle');
      setToastMessage('Public link revoked.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke the share link.');
    } finally {
      setRevokingTaskShare(false);
    }
  }, [result?.task_id, revokingTaskShare]);

  // A task that was shared in a previous session keeps its public link.
  // Restore the share affordance from the persisted payload so a reload or
  // a later visit still shows "Copy link" and "Stop sharing".
  useEffect(() => {
    setTaskShareActive(Boolean(result?.share_url));
    setTaskShareFeedback('idle');
  }, [result?.task_id, result?.share_url]);

  // Keyboard-first exports for a completed Agent result: Shift+C / Shift+D /
  // Shift+E / Shift+I / Shift+J / Shift+K / Shift+L / Shift+O / Shift+P mirror
  // the result toolbar buttons.
  // Form controls are skipped so normal Shift+letter typing is never swallowed.
  useEffect(() => {
    if (result?.status !== 'complete' || !result?.task_id || isRunning) return;
    const onKey = (e: KeyboardEvent) => {
      // Never export through an open dialog (templates, room create, shortcut
      // help, etc.) — the modal owns the keystroke.
      if (isAriaModalOpen()) return;
      if (!shouldCaptureSlashFocus(e.target)) return;
      if (isAgentCopyAnswerKey(e)) {
        e.preventDefault();
        handleCopyAnswer();
      } else if (isAgentDownloadAnswerKey(e)) {
        e.preventDefault();
        handleDownloadAnswer();
      } else if (isAgentDownloadJsonKey(e)) {
        e.preventDefault();
        void handleExportTaskJson();
      } else if (isAgentDownloadReportMarkdownKey(e)) {
        e.preventDefault();
        void handleExportTaskMarkdown();
      } else if (isAgentDownloadReportHtmlKey(e)) {
        e.preventDefault();
        handleExportTaskHtml();
      } else if (isAgentDownloadReportCsvKey(e)) {
        e.preventDefault();
        void handleExportTaskCsv();
      } else if (isAgentCopyReportHtmlKey(e)) {
        e.preventDefault();
        void handleCopyTaskHtml();
      } else if (isAgentCopyReportKey(e)) {
        e.preventDefault();
        void handleCopyTaskMarkdown();
      } else if (isAgentCopyReportJsonKey(e)) {
        e.preventDefault();
        void handleCopyTaskJson();
      } else if (isAgentCopyReportCsvKey(e)) {
        e.preventDefault();
        void handleCopyTaskCsv();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    handleCopyAnswer,
    handleDownloadAnswer,
    handleCopyTaskMarkdown,
    handleCopyTaskJson,
    handleCopyTaskCsv,
    handleCopyTaskHtml,
    handleExportTaskJson,
    handleExportTaskMarkdown,
    handleExportTaskHtml,
    handleExportTaskCsv,
    isRunning,
    result?.status,
    result?.task_id,
  ]);

  // Shift+N starts a fresh Agent task from anywhere on the page, mirroring the
  // sidebar's New task button without needing the sidebar open. Form controls
  // are skipped so Shift+letter typing is never swallowed, and open dialogs
  // keep ownership of their keystrokes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isAriaModalOpen()) return;
      if (!shouldCaptureSlashFocus(e.target)) return;
      if (!isAgentNewTaskKey(e)) return;
      e.preventDefault();
      startFreshAgentTask();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startFreshAgentTask]);

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
    const bySource = filterAgentHistoryBySource(byTopic, historySourceFilter);
    const byPin = filterAgentHistoryByPin(bySource, historyPinFilter, pinnedTaskIds);
    const searched = filterBySearchQuery(byPin, historySearchQuery, (item) => [
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
      pinnedTaskIds,
    );
  }, [
    taskHistory,
    pinnedTaskIds,
    historySearchQuery,
    historySort,
    historyStatusFilter,
    historyScoreFilter,
    historyConfidenceFilter,
    historyRecencyFilter,
    historyFeedbackFilter,
    historyTopicFilter,
    historySourceFilter,
    historyPinFilter,
  ]);

  const visibleHistoryTaskIds = useMemo(
    () => filteredTaskHistory.map((item) => item.task_id),
    [filteredTaskHistory],
  );
  const allVisibleHistorySelected =
    visibleHistoryTaskIds.length > 0 &&
    visibleHistoryTaskIds.every((taskId) => selectedHistoryTaskIds.has(taskId));
  const someVisibleHistorySelected = visibleHistoryTaskIds.some((taskId) =>
    selectedHistoryTaskIds.has(taskId),
  );
  const selectedHistoryTaskIdList = useMemo(() => {
    const available = new Set(taskHistory.map((item) => item.task_id));
    return [...selectedHistoryTaskIds].filter((taskId) => available.has(taskId));
  }, [selectedHistoryTaskIds, taskHistory]);
  const selectedHistoryPinnedCount = useMemo(
    () => selectedHistoryTaskIdList.filter((taskId) => pinnedTaskIds.includes(taskId)).length,
    [pinnedTaskIds, selectedHistoryTaskIdList],
  );
  const historySelectionLocked = historyBulkDeleteBusy || historyBulkDeleteConfirm;

  // A refresh can remove tasks that were selected in an older view. Keep the
  // selection bounded to retained history so bulk actions never target stale
  // ids, while still preserving selected rows hidden by a temporary filter.
  useEffect(() => {
    const available = new Set(taskHistory.map((item) => item.task_id));
    setSelectedHistoryTaskIds((previous) => {
      const next = new Set([...previous].filter((taskId) => available.has(taskId)));
      return next.size === previous.size ? previous : next;
    });
  }, [taskHistory]);

  // Clipboard writes can outlive a checkbox change. Invalidate their
  // completion feedback when the selected set changes so a late result for
  // the previous set cannot be presented as confirmation for the new one.
  useEffect(() => {
    historySelectedJsonlCopyRunIdRef.current += 1;
    historySelectedJsonlCopyInFlightRef.current = false;
    if (historySelectedJsonlCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonlCopyTimerRef.current);
      historySelectedJsonlCopyTimerRef.current = null;
    }
    setHistorySelectedJsonlCopyStatus('idle');
    historySelectedHtmlCopyRunIdRef.current += 1;
    historySelectedHtmlCopyInFlightRef.current = false;
    if (historySelectedHtmlCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedHtmlCopyTimerRef.current);
      historySelectedHtmlCopyTimerRef.current = null;
    }
    setHistorySelectedHtmlCopyStatus('idle');
  }, [selectedHistoryTaskIdList]);

  useEffect(() => {
    if (historySelectVisibleRef.current) {
      historySelectVisibleRef.current.indeterminate =
        someVisibleHistorySelected && !allVisibleHistorySelected;
    }
  }, [allVisibleHistorySelected, someVisibleHistorySelected]);

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

  const historySourceOptions = useMemo(
    () => collectHistorySourceOptions(taskHistory),
    [taskHistory],
  );

  const historySourceFilterUseful = useMemo(
    () => agentHistorySourceFilterUseful(taskHistory),
    [taskHistory],
  );

  const historyPinFilterUseful = useMemo(
    () => agentHistoryPinFilterUseful(taskHistory, pinnedTaskIds),
    [taskHistory, pinnedTaskIds],
  );

  // Keep the pinned-only view current when another tab changes browser-local pins.
  useEffect(() => subscribeToAgentHistoryPins(setPinnedTaskIds), []);

  const historyViewReady = shouldReconcileAgentHistoryDynamicFilters({
    hasLoaded: historyHasLoaded,
    loading: historyLoading,
    loadFailed: historyLoadFailed,
  });

  const markHistoryViewEdited = useCallback(() => {
    historyViewEditedRef.current = true;
  }, []);

  // Keep the user's history view stable across visits; free-text search stays transient.
  // A shared URL is a presentation override and must not overwrite the
  // recipient's saved defaults until they explicitly change a filter.
  useEffect(() => {
    if (!historyViewEditedRef.current) return;
    persistAgentHistoryViewPreferences({
      sort: historySort,
      status: historyStatusFilter,
      score: historyScoreFilter,
      confidence: historyConfidenceFilter,
      recency: historyRecencyFilter,
      feedback: historyFeedbackFilter,
      topic: historyTopicFilter,
      source: historySourceFilter,
      pin: historyPinFilter,
    });
  }, [
    historySort,
    historyStatusFilter,
    historyScoreFilter,
    historyConfidenceFilter,
    historyRecencyFilter,
    historyFeedbackFilter,
    historyTopicFilter,
    historySourceFilter,
    historyPinFilter,
  ]);

  // Drop topic filter when that topic no longer appears in history.
  useEffect(() => {
    if (!historyViewReady) return;
    if (historyTopicFilter === AGENT_HISTORY_TOPIC_ALL) return;
    if (!historyTopicOptions.some((o) => o.value === historyTopicFilter)) {
      setHistoryTopicFilter(AGENT_HISTORY_TOPIC_ALL);
    }
  }, [historyTopicFilter, historyTopicOptions, historyViewReady]);

  // Drop a source filter when the last matching source disappears.
  useEffect(() => {
    if (!historyViewReady) return;
    if (historySourceFilter === AGENT_HISTORY_SOURCE_ALL) return;
    if (!historySourceOptions.some((option) => option.value === historySourceFilter)) {
      setHistorySourceFilter(AGENT_HISTORY_SOURCE_ALL);
    }
  }, [historySourceFilter, historySourceOptions, historyViewReady]);

  // Avoid leaving an invisible active filter after the last retained pin is removed.
  useEffect(() => {
    if (!historyViewReady) return;
    if (historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL || historyPinFilterUseful) return;
    setHistoryPinFilter(AGENT_HISTORY_PIN_FILTER_ALL);
  }, [historyPinFilter, historyPinFilterUseful, historyViewReady]);

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
      if (historyHtmlDownloadTimerRef.current != null) {
        window.clearTimeout(historyHtmlDownloadTimerRef.current);
      }
      if (historyCsvDownloadTimerRef.current != null) {
        window.clearTimeout(historyCsvDownloadTimerRef.current);
      }
      if (historyCsvCopyTimerRef.current != null) {
        window.clearTimeout(historyCsvCopyTimerRef.current);
        historyCsvCopyTimerRef.current = null;
      }
      historyCsvCopyRunIdRef.current += 1;
      historyCsvCopyInFlightRef.current = false;
      if (historyJsonDownloadTimerRef.current != null) {
        window.clearTimeout(historyJsonDownloadTimerRef.current);
      }
      if (historyJsonCopyTimerRef.current != null) {
        window.clearTimeout(historyJsonCopyTimerRef.current);
        historyJsonCopyTimerRef.current = null;
      }
      if (historyHtmlCopyTimerRef.current != null) {
        window.clearTimeout(historyHtmlCopyTimerRef.current);
        historyHtmlCopyTimerRef.current = null;
      }
      if (historyJsonlDownloadTimerRef.current != null) {
        window.clearTimeout(historyJsonlDownloadTimerRef.current);
      }
      if (historyJsonlCopyTimerRef.current != null) {
        window.clearTimeout(historyJsonlCopyTimerRef.current);
        historyJsonlCopyTimerRef.current = null;
      }
      if (historyFilteredJsonlDownloadTimerRef.current != null) {
        window.clearTimeout(historyFilteredJsonlDownloadTimerRef.current);
      }
      if (historySelectedJsonlDownloadTimerRef.current != null) {
        window.clearTimeout(historySelectedJsonlDownloadTimerRef.current);
      }
      if (historySelectedJsonlCopyTimerRef.current != null) {
        window.clearTimeout(historySelectedJsonlCopyTimerRef.current);
      }
      if (historySelectedCsvDownloadTimerRef.current != null) {
        window.clearTimeout(historySelectedCsvDownloadTimerRef.current);
      }
      if (historySelectedCsvCopyTimerRef.current != null) {
        window.clearTimeout(historySelectedCsvCopyTimerRef.current);
        historySelectedCsvCopyTimerRef.current = null;
      }
      if (historySelectedJsonDownloadTimerRef.current != null) {
        window.clearTimeout(historySelectedJsonDownloadTimerRef.current);
      }
      if (historySelectedJsonCopyTimerRef.current != null) {
        window.clearTimeout(historySelectedJsonCopyTimerRef.current);
      }
      if (historySelectedMarkdownCopyTimerRef.current != null) {
        window.clearTimeout(historySelectedMarkdownCopyTimerRef.current);
      }
      if (historySelectedMarkdownDownloadTimerRef.current != null) {
        window.clearTimeout(historySelectedMarkdownDownloadTimerRef.current);
      }
      if (historySelectedHtmlDownloadTimerRef.current != null) {
        window.clearTimeout(historySelectedHtmlDownloadTimerRef.current);
      }
      if (historySelectedHtmlCopyTimerRef.current != null) {
        window.clearTimeout(historySelectedHtmlCopyTimerRef.current);
      }
      historySelectedJsonlDownloadBusyRef.current = false;
      historySelectedJsonlCopyRunIdRef.current += 1;
      historySelectedJsonlCopyInFlightRef.current = false;
      historySelectedCsvDownloadBusyRef.current = false;
      historySelectedCsvCopyRunIdRef.current += 1;
      historySelectedCsvCopyInFlightRef.current = false;
      historySelectedJsonDownloadBusyRef.current = false;
      historySelectedJsonCopyRunIdRef.current += 1;
      historySelectedJsonCopyInFlightRef.current = false;
      historySelectedMarkdownCopyRunIdRef.current += 1;
      historySelectedMarkdownCopyInFlightRef.current = false;
      historySelectedMarkdownDownloadBusyRef.current = false;
      historySelectedHtmlDownloadBusyRef.current = false;
      historySelectedHtmlCopyRunIdRef.current += 1;
      historySelectedHtmlCopyInFlightRef.current = false;
      historyJsonlDownloadBusyRef.current = false;
      historyJsonlCopyRunIdRef.current += 1;
      historyJsonlCopyInFlightRef.current = false;
      historyJsonCopyRunIdRef.current += 1;
      historyJsonCopyInFlightRef.current = false;
      historyHtmlCopyRunIdRef.current += 1;
      historyHtmlCopyInFlightRef.current = false;
      if (roomsCopyTimerRef.current != null) {
        window.clearTimeout(roomsCopyTimerRef.current);
      }
      if (roomsDownloadTimerRef.current != null) {
        window.clearTimeout(roomsDownloadTimerRef.current);
      }
      copyReportRunIdRef.current += 1;
      copyReportInFlightRef.current = false;
      if (copyReportFeedbackTimerRef.current != null) {
        window.clearTimeout(copyReportFeedbackTimerRef.current);
      }
      copyReportJsonRunIdRef.current += 1;
      copyReportJsonInFlightRef.current = false;
      if (copyReportJsonFeedbackTimerRef.current != null) {
        window.clearTimeout(copyReportJsonFeedbackTimerRef.current);
      }
      copyReportCsvRunIdRef.current += 1;
      copyReportCsvInFlightRef.current = false;
      if (copyReportCsvFeedbackTimerRef.current != null) {
        window.clearTimeout(copyReportCsvFeedbackTimerRef.current);
      }
      invalidateAgentReportCopy(
        {
          runId: copyReportHtmlRunIdRef,
          inFlight: copyReportHtmlInFlightRef,
          feedbackTimer: copyReportHtmlFeedbackTimerRef,
        },
        window.clearTimeout,
      );
      taskShareInFlightRef.current = false;
      if (taskShareFeedbackTimerRef.current != null) {
        window.clearTimeout(taskShareFeedbackTimerRef.current);
      }
      exportReportRunIdRef.current += 1;
      exportMdInFlightRef.current = false;
      exportCsvRunIdRef.current += 1;
      exportCsvInFlightRef.current = false;
      copyOrchestrationHistoryRunIdRef.current += 1;
      copyOrchestrationHistoryInFlightRef.current = false;
      if (copyOrchestrationHistoryTimerRef.current != null) {
        window.clearTimeout(copyOrchestrationHistoryTimerRef.current);
        copyOrchestrationHistoryTimerRef.current = null;
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

  const toHistoryExportItem = (item: HistoryTask) => ({
    title: item.title,
    question: item.task_text,
    score: item.final_score,
    confidence: item.final_confidence,
    createdAt: item.created_at,
    topics: item.topics,
    isLive: item.is_live,
    taskId: item.task_id,
    userFeedback: item.user_feedback,
    orchestrationId: item.orchestration_id,
    watchlistItemId: item.watchlist_item_id,
  });

  const buildHistoryFilterNote = () => {
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
    if (historySourceFilter !== AGENT_HISTORY_SOURCE_ALL) {
      filterBits.push(
        `source: ${agentHistorySourceLabel(historySourceFilter, historySourceOptions)}`,
      );
    }
    if (historyPinFilter !== AGENT_HISTORY_PIN_FILTER_ALL) {
      filterBits.push(`pins: ${agentHistoryPinFilterLabel(historyPinFilter)}`);
    }
    if (q) filterBits.push(`search: “${q}”`);
    if (historySort !== 'newest') filterBits.push(`sort: ${agentHistorySortLabel(historySort)}`);
    return filterBits.length ? filterBits.join(' · ') : undefined;
  };

  const buildFilteredHistoryMarkdown = () => {
    return formatAgentHistoryExport({
      items: filteredTaskHistory.map(toHistoryExportItem),
      totalCount: taskHistory.length,
      filterNote: buildHistoryFilterNote(),
    });
  };

  const copyHistoryViewLink = async () => {
    const link = buildAgentHistoryViewUrl(
      window.location.href,
      {
        sort: historySort,
        status: historyStatusFilter,
        score: historyScoreFilter,
        confidence: historyConfidenceFilter,
        recency: historyRecencyFilter,
        feedback: historyFeedbackFilter,
        topic: historyTopicFilter,
        source: historySourceFilter,
        pin: historyPinFilter,
      },
      historySearchQuery,
    );
    const ok = await copyToClipboard(link);
    setToastMessage(
      ok
        ? 'History view link copied. Pins stay on this device.'
        : 'Could not copy history view link — try again.',
    );
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

  const downloadFilteredHistoryHtml = () => {
    const html = formatAgentHistoryHtml({
      items: filteredTaskHistory.map(toHistoryExportItem),
      totalCount: taskHistory.length,
      filterNote: buildHistoryFilterNote(),
    });
    const ok = downloadHtmlFile(html, 'agent-research-history');
    if (historyHtmlDownloadTimerRef.current != null) {
      window.clearTimeout(historyHtmlDownloadTimerRef.current);
    }
    setHistoryHtmlDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download history HTML — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historyHtmlDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryHtmlDownloadStatus('idle');
      historyHtmlDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copyFilteredHistoryHtml = async () => {
    // Keep a synchronous ref guard as well as the visual busy state: two
    // pointer or keyboard activations can arrive before React commits the
    // first update.
    if (historyHtmlCopyInFlightRef.current) return;
    const runId = ++historyHtmlCopyRunIdRef.current;
    historyHtmlCopyInFlightRef.current = true;
    if (historyHtmlCopyTimerRef.current != null) {
      window.clearTimeout(historyHtmlCopyTimerRef.current);
      historyHtmlCopyTimerRef.current = null;
    }
    setHistoryHtmlCopyStatus('copying');

    try {
      let ok = false;
      try {
        ok = await copyAgentHistoryHtml({
          items: filteredTaskHistory.map(toHistoryExportItem),
          totalCount: taskHistory.length,
          filterNote: buildHistoryFilterNote(),
        });
      } catch {
        // Keep the page safe if a future clipboard adapter regresses its
        // boolean refusal contract.
        ok = false;
      }
      if (historyHtmlCopyRunIdRef.current !== runId) return;

      setHistoryHtmlCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy history HTML — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historyHtmlCopyTimerRef.current = window.setTimeout(() => {
        if (historyHtmlCopyRunIdRef.current !== runId) return;
        setHistoryHtmlCopyStatus('idle');
        historyHtmlCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historyHtmlCopyRunIdRef.current === runId) {
        historyHtmlCopyInFlightRef.current = false;
      }
    }
  };

  const downloadFilteredHistoryCsv = () => {
    const csv = formatAgentHistoryCsv({
      items: filteredTaskHistory.map(toHistoryExportItem),
    });
    const ok = downloadTextFile(csv, {
      filename: `${withDownloadDate('agent-research-history')}.csv`,
      mimeType: 'text/csv;charset=utf-8',
    });
    if (historyCsvDownloadTimerRef.current != null) {
      window.clearTimeout(historyCsvDownloadTimerRef.current);
    }
    setHistoryCsvDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download history CSV — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historyCsvDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryCsvDownloadStatus('idle');
      historyCsvDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copyFilteredHistoryCsv = async () => {
    // Keep a synchronous ref guard as well as the visual busy state: two
    // keyboard or pointer activations can arrive before React commits the
    // first update.
    if (historyCsvCopyInFlightRef.current) return;
    const runId = ++historyCsvCopyRunIdRef.current;
    historyCsvCopyInFlightRef.current = true;
    if (historyCsvCopyTimerRef.current != null) {
      window.clearTimeout(historyCsvCopyTimerRef.current);
      historyCsvCopyTimerRef.current = null;
    }
    setHistoryCsvCopyStatus('copying');

    try {
      const ok = await copyAgentHistoryCsv({
        items: filteredTaskHistory.map(toHistoryExportItem),
      });
      if (historyCsvCopyRunIdRef.current !== runId) return;

      setHistoryCsvCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy history CSV — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historyCsvCopyTimerRef.current = window.setTimeout(() => {
        if (historyCsvCopyRunIdRef.current !== runId) return;
        setHistoryCsvCopyStatus('idle');
        historyCsvCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historyCsvCopyRunIdRef.current === runId) {
        historyCsvCopyInFlightRef.current = false;
      }
    }
  };

  const downloadFilteredHistoryJson = () => {
    const json = formatAgentHistoryJson({
      items: filteredTaskHistory.map(toHistoryExportItem),
      totalCount: taskHistory.length,
      filterNote: buildHistoryFilterNote(),
    });
    const ok = downloadTextFile(json, {
      filename: `${withDownloadDate('agent-research-history')}.json`,
      mimeType: 'application/json;charset=utf-8',
    });
    if (historyJsonDownloadTimerRef.current != null) {
      window.clearTimeout(historyJsonDownloadTimerRef.current);
    }
    setHistoryJsonDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download history JSON — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historyJsonDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryJsonDownloadStatus('idle');
      historyJsonDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copyFilteredHistoryJson = async () => {
    // Keep a synchronous ref guard as well as the visual busy state: two
    // keyboard activations can arrive before React commits the first update.
    if (historyJsonCopyInFlightRef.current) return;
    const runId = ++historyJsonCopyRunIdRef.current;
    historyJsonCopyInFlightRef.current = true;
    if (historyJsonCopyTimerRef.current != null) {
      window.clearTimeout(historyJsonCopyTimerRef.current);
      historyJsonCopyTimerRef.current = null;
    }
    setHistoryJsonCopyStatus('copying');

    try {
      let ok = false;
      try {
        ok = await copyAgentHistoryJson({
          items: filteredTaskHistory.map(toHistoryExportItem),
          totalCount: taskHistory.length,
          filterNote: buildHistoryFilterNote(),
        });
      } catch {
        // Keep the page safe if a future clipboard adapter regresses its
        // boolean refusal contract.
        ok = false;
      }
      if (historyJsonCopyRunIdRef.current !== runId) return;

      setHistoryJsonCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy history JSON — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historyJsonCopyTimerRef.current = window.setTimeout(() => {
        if (historyJsonCopyRunIdRef.current !== runId) return;
        setHistoryJsonCopyStatus('idle');
        historyJsonCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historyJsonCopyRunIdRef.current === runId) {
        historyJsonCopyInFlightRef.current = false;
      }
    }
  };

  const downloadFullHistoryJsonl = async () => {
    if (historyJsonlDownloadBusyRef.current || taskHistory.length === 0) return;
    if (historyJsonlDownloadTimerRef.current != null) {
      window.clearTimeout(historyJsonlDownloadTimerRef.current);
      historyJsonlDownloadTimerRef.current = null;
    }
    historyJsonlDownloadBusyRef.current = true;
    setHistoryJsonlDownloadStatus('busy');
    let outcome: 'done' | 'failed' = 'failed';
    try {
      const blob = await exportAgentTasksJsonl();
      const ok = downloadBlobFile(blob, `${withDownloadDate('agent-research-history')}.jsonl`);
      outcome = ok ? 'done' : 'failed';
      setHistoryJsonlDownloadStatus(outcome);
      if (!ok) {
        setToastMessage('Could not download full history JSONL — try again.');
      }
    } catch (err) {
      setHistoryJsonlDownloadStatus(outcome);
      setToastMessage(
        err instanceof ApiError
          ? err.message
          : 'Could not download full history JSONL — try again.',
      );
    } finally {
      historyJsonlDownloadBusyRef.current = false;
    }
    const hold = motionDuration(outcome === 'failed' ? 2800 : 2000);
    historyJsonlDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryJsonlDownloadStatus('idle');
      historyJsonlDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const downloadFilteredHistoryJsonl = () => {
    if (filteredTaskHistory.length === 0) {
      setToastMessage('No tasks in the current history view to export.');
      return;
    }
    const jsonl = formatAgentHistoryJsonl({
      items: filteredTaskHistory.map(toHistoryExportItem),
    });
    const ok = downloadTextFile(jsonl, {
      filename: `${withDownloadDate('agent-research-history-filtered')}.jsonl`,
      mimeType: 'application/x-ndjson;charset=utf-8',
    });
    if (historyFilteredJsonlDownloadTimerRef.current != null) {
      window.clearTimeout(historyFilteredJsonlDownloadTimerRef.current);
    }
    setHistoryFilteredJsonlDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download filtered history JSONL — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historyFilteredJsonlDownloadTimerRef.current = window.setTimeout(() => {
      setHistoryFilteredJsonlDownloadStatus('idle');
      historyFilteredJsonlDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const downloadSelectedHistoryJsonl = () => {
    // The disabled prop follows React's render cycle; the ref closes the
    // smaller window where two activations can arrive before that render.
    if (historySelectedJsonlDownloadBusyRef.current) return;
    if (selectedHistoryTaskIdList.length === 0) {
      setToastMessage('No selected history tasks to export.');
      return;
    }
    historySelectedJsonlDownloadBusyRef.current = true;
    if (historySelectedJsonlDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonlDownloadTimerRef.current);
      historySelectedJsonlDownloadTimerRef.current = null;
    }
    setHistorySelectedJsonlDownloadStatus('busy');
    let ok = false;
    let emptySelection = false;
    try {
      const jsonl = formatSelectedAgentHistoryJsonl(
        taskHistory,
        selectedHistoryTaskIdList,
        toHistoryExportItem,
      );
      if (!jsonl) {
        emptySelection = true;
      } else {
        ok = downloadTextFile(jsonl, {
          filename: `${withDownloadDate('agent-research-selected')}.jsonl`,
          mimeType: 'application/x-ndjson;charset=utf-8',
        });
      }
    } catch {
      // Keep one malformed runtime row from leaving the control locked.
      ok = false;
    }
    if (emptySelection) {
      historySelectedJsonlDownloadBusyRef.current = false;
      setHistorySelectedJsonlDownloadStatus('idle');
      setToastMessage('No selected history tasks to export.');
      return;
    }
    setHistorySelectedJsonlDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download selected history JSONL — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historySelectedJsonlDownloadTimerRef.current = window.setTimeout(() => {
      historySelectedJsonlDownloadBusyRef.current = false;
      setHistorySelectedJsonlDownloadStatus('idle');
      historySelectedJsonlDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copySelectedHistoryJsonl = async () => {
    if (historySelectionLocked || historySelectedJsonlCopyInFlightRef.current) return;
    const selected = selectedHistoryTaskIdList;
    if (selected.length === 0) {
      setToastMessage('No selected history tasks to copy.');
      return;
    }

    const runId = ++historySelectedJsonlCopyRunIdRef.current;
    historySelectedJsonlCopyInFlightRef.current = true;
    if (historySelectedJsonlCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonlCopyTimerRef.current);
      historySelectedJsonlCopyTimerRef.current = null;
    }
    setHistorySelectedJsonlCopyStatus('copying');

    try {
      let ok = false;
      try {
        ok = await copySelectedAgentHistoryJsonl(taskHistory, selected, toHistoryExportItem);
      } catch {
        // Keep the page safe if a future clipboard adapter regresses its
        // boolean refusal contract.
        ok = false;
      }
      if (historySelectedJsonlCopyRunIdRef.current !== runId) return;

      setHistorySelectedJsonlCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy selected history JSONL — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historySelectedJsonlCopyTimerRef.current = window.setTimeout(() => {
        if (historySelectedJsonlCopyRunIdRef.current !== runId) return;
        setHistorySelectedJsonlCopyStatus('idle');
        historySelectedJsonlCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historySelectedJsonlCopyRunIdRef.current === runId) {
        historySelectedJsonlCopyInFlightRef.current = false;
      }
    }
  };

  const downloadSelectedHistoryCsv = () => {
    // The disabled prop follows React's render cycle; the ref closes the
    // smaller window where two activations can arrive before that render.
    if (historySelectedCsvDownloadBusyRef.current) return;
    historySelectedCsvDownloadBusyRef.current = true;
    if (historySelectedCsvDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedCsvDownloadTimerRef.current);
      historySelectedCsvDownloadTimerRef.current = null;
    }
    setHistorySelectedCsvDownloadStatus('busy');
    let ok = false;
    let emptySelection = false;
    try {
      // Keep formatting inside the guarded section too: it traverses
      // API-shaped rows and must not escape before the busy ref can be
      // released if a malformed runtime row reaches the page.
      const csv = formatSelectedAgentHistoryCsv(
        taskHistory,
        selectedHistoryTaskIdList,
        toHistoryExportItem,
      );
      if (!csv) {
        emptySelection = true;
      } else {
        ok = downloadTextFile(csv, {
          filename: `${withDownloadDate('agent-research-selected')}.csv`,
          mimeType: 'text/csv;charset=utf-8',
        });
      }
    } catch {
      // Keep one malformed runtime row from leaving the control locked.
      ok = false;
    }
    if (emptySelection) {
      historySelectedCsvDownloadBusyRef.current = false;
      setHistorySelectedCsvDownloadStatus('idle');
      setToastMessage('No selected history tasks to export.');
      return;
    }
    setHistorySelectedCsvDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download selected history CSV — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historySelectedCsvDownloadTimerRef.current = window.setTimeout(() => {
      historySelectedCsvDownloadBusyRef.current = false;
      setHistorySelectedCsvDownloadStatus('idle');
      historySelectedCsvDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copySelectedHistoryCsv = async () => {
    if (historySelectionLocked || historySelectedCsvCopyInFlightRef.current) return;
    const selected = selectedHistoryTaskIdList;
    if (selected.length === 0) {
      setToastMessage('No selected history tasks to copy.');
      return;
    }

    const runId = ++historySelectedCsvCopyRunIdRef.current;
    historySelectedCsvCopyInFlightRef.current = true;
    if (historySelectedCsvCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedCsvCopyTimerRef.current);
      historySelectedCsvCopyTimerRef.current = null;
    }
    setHistorySelectedCsvCopyStatus('copying');

    try {
      let ok = false;
      try {
        ok = await copySelectedAgentHistoryCsv(taskHistory, selected, toHistoryExportItem);
      } catch {
        // Keep the page safe if a future clipboard adapter regresses its
        // boolean refusal contract.
        ok = false;
      }
      if (historySelectedCsvCopyRunIdRef.current !== runId) return;

      setHistorySelectedCsvCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy selected history CSV — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historySelectedCsvCopyTimerRef.current = window.setTimeout(() => {
        if (historySelectedCsvCopyRunIdRef.current !== runId) return;
        setHistorySelectedCsvCopyStatus('idle');
        historySelectedCsvCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historySelectedCsvCopyRunIdRef.current === runId) {
        historySelectedCsvCopyInFlightRef.current = false;
      }
    }
  };

  const downloadSelectedHistoryMarkdown = () => {
    // The disabled prop follows React's render cycle; the ref closes the
    // smaller window where two activations can arrive before that render.
    if (historySelectedMarkdownDownloadBusyRef.current) return;
    historySelectedMarkdownDownloadBusyRef.current = true;
    if (historySelectedMarkdownDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedMarkdownDownloadTimerRef.current);
      historySelectedMarkdownDownloadTimerRef.current = null;
    }
    setHistorySelectedMarkdownDownloadStatus('busy');
    let ok = false;
    let emptySelection = false;
    try {
      // Keep formatting inside the guarded section too: malformed runtime
      // rows must not leave the export action locked.
      const markdown = formatSelectedAgentHistoryMarkdown(
        taskHistory,
        selectedHistoryTaskIdList,
        toHistoryExportItem,
      );
      if (!markdown) {
        emptySelection = true;
      } else {
        ok = downloadMarkdownFile(markdown, 'agent-research-selected');
      }
    } catch {
      ok = false;
    }
    if (emptySelection) {
      historySelectedMarkdownDownloadBusyRef.current = false;
      setHistorySelectedMarkdownDownloadStatus('idle');
      setToastMessage('No selected history tasks to export.');
      return;
    }
    setHistorySelectedMarkdownDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download selected history Markdown — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historySelectedMarkdownDownloadTimerRef.current = window.setTimeout(() => {
      historySelectedMarkdownDownloadBusyRef.current = false;
      setHistorySelectedMarkdownDownloadStatus('idle');
      historySelectedMarkdownDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const downloadSelectedHistoryHtml = () => {
    // The disabled prop follows React's render cycle; the ref closes the
    // smaller window where two activations can arrive before that render.
    if (historySelectedHtmlDownloadBusyRef.current) return;
    historySelectedHtmlDownloadBusyRef.current = true;
    if (historySelectedHtmlDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedHtmlDownloadTimerRef.current);
      historySelectedHtmlDownloadTimerRef.current = null;
    }
    setHistorySelectedHtmlDownloadStatus('busy');
    let ok = false;
    let emptySelection = false;
    try {
      // Keep selection resolution and HTML normalization inside the guarded
      // section so malformed remote rows cannot leave this action locked.
      const html = formatSelectedAgentHistoryHtml(
        taskHistory,
        selectedHistoryTaskIdList,
        toHistoryExportItem,
      );
      if (!html) {
        emptySelection = true;
      } else {
        ok = downloadHtmlFile(html, 'agent-research-selected');
      }
    } catch {
      ok = false;
    }
    if (emptySelection) {
      historySelectedHtmlDownloadBusyRef.current = false;
      setHistorySelectedHtmlDownloadStatus('idle');
      setToastMessage('No selected history tasks to export.');
      return;
    }
    setHistorySelectedHtmlDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download selected history HTML — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historySelectedHtmlDownloadTimerRef.current = window.setTimeout(() => {
      historySelectedHtmlDownloadBusyRef.current = false;
      setHistorySelectedHtmlDownloadStatus('idle');
      historySelectedHtmlDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copySelectedHistoryHtml = async () => {
    if (historySelectionLocked || historySelectedHtmlCopyInFlightRef.current) return;
    const selected = selectedHistoryTaskIdList;
    if (selected.length === 0) {
      setToastMessage('No selected history tasks to copy.');
      return;
    }

    const runId = ++historySelectedHtmlCopyRunIdRef.current;
    historySelectedHtmlCopyInFlightRef.current = true;
    if (historySelectedHtmlCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedHtmlCopyTimerRef.current);
      historySelectedHtmlCopyTimerRef.current = null;
    }
    setHistorySelectedHtmlCopyStatus('copying');

    try {
      let ok = false;
      try {
        ok = await copySelectedAgentHistoryHtml(taskHistory, selected, toHistoryExportItem);
      } catch {
        // Keep the page safe if a future clipboard adapter regresses its
        // boolean refusal contract.
        ok = false;
      }
      if (historySelectedHtmlCopyRunIdRef.current !== runId) return;

      setHistorySelectedHtmlCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy selected history HTML — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historySelectedHtmlCopyTimerRef.current = window.setTimeout(() => {
        if (historySelectedHtmlCopyRunIdRef.current !== runId) return;
        setHistorySelectedHtmlCopyStatus('idle');
        historySelectedHtmlCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historySelectedHtmlCopyRunIdRef.current === runId) {
        historySelectedHtmlCopyInFlightRef.current = false;
      }
    }
  };

  const downloadSelectedHistoryJson = () => {
    // The disabled prop follows React's render cycle; the ref closes the
    // smaller window where two activations can arrive before that render.
    if (historySelectedJsonDownloadBusyRef.current) return;
    historySelectedJsonDownloadBusyRef.current = true;
    if (historySelectedJsonDownloadTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonDownloadTimerRef.current);
      historySelectedJsonDownloadTimerRef.current = null;
    }
    setHistorySelectedJsonDownloadStatus('busy');
    let ok = false;
    let emptySelection = false;
    try {
      // Keep formatting inside the guarded section too: malformed runtime
      // rows must not leave the export action locked.
      const json = formatSelectedAgentHistoryJson(
        taskHistory,
        selectedHistoryTaskIdList,
        toHistoryExportItem,
      );
      if (!json) {
        emptySelection = true;
      } else {
        ok = downloadTextFile(json, {
          filename: `${withDownloadDate('agent-research-selected')}.json`,
          mimeType: 'application/json;charset=utf-8',
        });
      }
    } catch {
      ok = false;
    }
    if (emptySelection) {
      historySelectedJsonDownloadBusyRef.current = false;
      setHistorySelectedJsonDownloadStatus('idle');
      setToastMessage('No selected history tasks to export.');
      return;
    }
    setHistorySelectedJsonDownloadStatus(ok ? 'done' : 'failed');
    if (!ok) {
      setToastMessage('Could not download selected history JSON — try again.');
    }
    const hold = motionDuration(ok ? 2000 : 2800);
    historySelectedJsonDownloadTimerRef.current = window.setTimeout(() => {
      historySelectedJsonDownloadBusyRef.current = false;
      setHistorySelectedJsonDownloadStatus('idle');
      historySelectedJsonDownloadTimerRef.current = null;
    }, hold > 0 ? hold : 0);
  };

  const copySelectedHistoryJson = async () => {
    if (historySelectionLocked || historySelectedJsonCopyInFlightRef.current) return;
    const selected = selectedHistoryTaskIdList;
    if (selected.length === 0) {
      setToastMessage('No selected history tasks to copy.');
      return;
    }

    const runId = ++historySelectedJsonCopyRunIdRef.current;
    historySelectedJsonCopyInFlightRef.current = true;
    if (historySelectedJsonCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedJsonCopyTimerRef.current);
      historySelectedJsonCopyTimerRef.current = null;
    }
    setHistorySelectedJsonCopyStatus('copying');

    try {
      let ok = false;
      try {
        ok = await copySelectedAgentHistoryJson(taskHistory, selected, toHistoryExportItem);
      } catch {
        // Keep the page safe if a future clipboard adapter regresses its
        // boolean refusal contract.
        ok = false;
      }
      if (historySelectedJsonCopyRunIdRef.current !== runId) return;

      setHistorySelectedJsonCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy selected history JSON — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historySelectedJsonCopyTimerRef.current = window.setTimeout(() => {
        if (historySelectedJsonCopyRunIdRef.current !== runId) return;
        setHistorySelectedJsonCopyStatus('idle');
        historySelectedJsonCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historySelectedJsonCopyRunIdRef.current === runId) {
        historySelectedJsonCopyInFlightRef.current = false;
      }
    }
  };

  const copySelectedHistoryMarkdown = async () => {
    if (historySelectionLocked || historySelectedMarkdownCopyInFlightRef.current) return;
    const selected = selectedHistoryTaskIdList;
    if (selected.length === 0) {
      setToastMessage('No selected history tasks to copy.');
      return;
    }

    const runId = ++historySelectedMarkdownCopyRunIdRef.current;
    historySelectedMarkdownCopyInFlightRef.current = true;
    if (historySelectedMarkdownCopyTimerRef.current != null) {
      window.clearTimeout(historySelectedMarkdownCopyTimerRef.current);
      historySelectedMarkdownCopyTimerRef.current = null;
    }
    setHistorySelectedMarkdownCopyStatus('copying');

    try {
      let ok = false;
      try {
        ok = await copySelectedAgentHistoryMarkdown(taskHistory, selected, toHistoryExportItem);
      } catch {
        // Keep the page safe if a future clipboard adapter regresses its
        // boolean refusal contract.
        ok = false;
      }
      if (historySelectedMarkdownCopyRunIdRef.current !== runId) return;

      setHistorySelectedMarkdownCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy selected history Markdown — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historySelectedMarkdownCopyTimerRef.current = window.setTimeout(() => {
        if (historySelectedMarkdownCopyRunIdRef.current !== runId) return;
        setHistorySelectedMarkdownCopyStatus('idle');
        historySelectedMarkdownCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historySelectedMarkdownCopyRunIdRef.current === runId) {
        historySelectedMarkdownCopyInFlightRef.current = false;
      }
    }
  };

  const copyFilteredHistoryJsonl = async () => {
    if (filteredTaskHistory.length === 0) {
      setToastMessage('No tasks in the current history view to copy.');
      return;
    }
    // Guard synchronously because a second keyboard or pointer activation can
    // arrive before React commits the first "copying" state update.
    if (historyJsonlCopyInFlightRef.current) return;
    const runId = ++historyJsonlCopyRunIdRef.current;
    historyJsonlCopyInFlightRef.current = true;
    if (historyJsonlCopyTimerRef.current != null) {
      window.clearTimeout(historyJsonlCopyTimerRef.current);
      historyJsonlCopyTimerRef.current = null;
    }
    setHistoryJsonlCopyStatus('copying');

    try {
      let ok = false;
      try {
        ok = await copyAgentHistoryJsonl({
          items: filteredTaskHistory.map(toHistoryExportItem),
        });
      } catch {
        // Keep the page safe if a future clipboard adapter regresses its
        // boolean refusal contract.
        ok = false;
      }
      if (historyJsonlCopyRunIdRef.current !== runId) return;

      setHistoryJsonlCopyStatus(ok ? 'copied' : 'failed');
      if (!ok) {
        setToastMessage('Could not copy filtered history JSONL — try again.');
      }
      const hold = motionDuration(ok ? 2000 : 2800);
      historyJsonlCopyTimerRef.current = window.setTimeout(() => {
        if (historyJsonlCopyRunIdRef.current !== runId) return;
        setHistoryJsonlCopyStatus('idle');
        historyJsonlCopyTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } finally {
      if (historyJsonlCopyRunIdRef.current === runId) {
        historyJsonlCopyInFlightRef.current = false;
      }
    }
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

  // Clipboard writes can outlive a history selection. Invalidate the old
  // request when the displayed report changes so late feedback cannot be
  // presented as confirmation for the newly selected task.
  useEffect(() => {
    invalidateAgentReportCopy(
      {
        runId: copyReportHtmlRunIdRef,
        inFlight: copyReportHtmlInFlightRef,
        feedbackTimer: copyReportHtmlFeedbackTimerRef,
      },
      window.clearTimeout,
    );
    setCopyingReportHtml(false);
    setCopyReportHtmlFeedback('idle');
  }, [result?.task_id, result?.refinement_count]);

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

  const toggleHistoryPin = (taskId: string) => {
    if (historySelectionLocked) return;
    setPinnedTaskIds(toggleAgentHistoryPin(taskId));
  };

  const toggleHistorySelection = (taskId: string) => {
    if (historySelectionLocked) return;
    setSelectedHistoryTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
  };

  const toggleVisibleHistorySelection = () => {
    if (historySelectionLocked || visibleHistoryTaskIds.length === 0) return;
    setSelectedHistoryTaskIds((previous) => {
      const next = new Set(previous);
      if (allVisibleHistorySelected) {
        visibleHistoryTaskIds.forEach((taskId) => next.delete(taskId));
      } else {
        visibleHistoryTaskIds.forEach((taskId) => next.add(taskId));
      }
      return next;
    });
  };

  const applyHistoryPinSelection = (action: 'pin' | 'unpin') => {
    if (historySelectionLocked) return;
    const selected = selectedHistoryTaskIdList;
    if (selected.length === 0) {
      setSelectedHistoryTaskIds(new Set());
      return;
    }

    const previousPins = pinnedTaskIds;
    const nextPins = action === 'pin'
      ? pinAgentHistoryTasks(selected)
      : unpinAgentHistoryTasks(selected);
    const changedCount = countChangedAgentHistoryPins(
      selected,
      previousPins,
      nextPins,
      action,
    );
    setPinnedTaskIds(nextPins);
    setSelectedHistoryTaskIds(new Set());

    if (changedCount < selected.length) {
      setToastMessage(
        action === 'pin'
          ? `${changedCount} of ${selected.length} selected tasks pinned; your browser keeps up to ${AGENT_HISTORY_PINS_MAX} pins.`
          : `${changedCount} of ${selected.length} selected tasks unpinned.`,
      );
    } else {
      setToastMessage(
        `${changedCount} task${changedCount === 1 ? '' : 's'} ${action === 'pin' ? 'pinned' : 'unpinned'}.`,
      );
    }
  };

  const requestHistoryBulkDelete = () => {
    if (historySelectionLocked || selectedHistoryTaskIdList.length === 0) return;
    if (selectedHistoryTaskIdList.length > AGENT_HISTORY_BULK_DELETE_MAX) {
      setToastMessage(
        `Select at most ${AGENT_HISTORY_BULK_DELETE_MAX} tasks to delete at once.`,
      );
      return;
    }
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    setHistoryBulkDeleteConfirm(true);
  };

  const deleteSelectedHistoryTasks = useCallback(async () => {
    if (historyBulkDeleteBusy) return;
    const selected = selectedHistoryTaskIdList;
    if (selected.length === 0) {
      setHistoryBulkDeleteConfirm(false);
      return;
    }

    const selectedSet = new Set(selected);
    setHistoryBulkDeleteBusy(true);
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    try {
      const response = await deleteAgentTasks(selected);
      const deletedIds = response.deleted_ids.filter((taskId) => selectedSet.has(taskId));
      const reconciledIds = reconcileAgentHistoryBulkDeleteIds(
        selected,
        response.deleted_ids,
        response.skipped_ids,
      );
      const reconciledSet = new Set(reconciledIds);
      setTaskHistory((previous) =>
        previous.filter((item) => !reconciledSet.has(item.task_id)),
      );
      setPinnedTaskIds(removeAgentHistoryPins(reconciledIds));
      setSelectedHistoryTaskIds(new Set());

      if (result?.task_id && reconciledSet.has(result.task_id)) {
        resetRun();
      }

      if (deletedIds.length === selected.length) {
        setToastMessage(
          `${deletedIds.length} task${deletedIds.length === 1 ? '' : 's'} deleted.`,
        );
      } else if (deletedIds.length > 0) {
        setToastMessage(
          `${deletedIds.length} of ${selected.length} selected tasks deleted; the rest were already gone.`,
        );
      } else {
        setToastMessage('No selected tasks were deleted; they may already be gone.');
      }
    } catch (error) {
      setToastMessage(
        error instanceof Error ? error.message : 'Could not delete selected tasks.',
      );
    } finally {
      setHistoryBulkDeleteConfirm(false);
      setHistoryBulkDeleteBusy(false);
    }
  }, [
    historyBulkDeleteBusy,
    resetRun,
    result?.task_id,
    selectedHistoryTaskIdList,
  ]);

  const deleteHistoryItem = (taskId: string) => {
    if (historySelectionLocked) return;
    const removed = taskHistory.find((t) => t.task_id === taskId) ?? null;
    const wasPinned = pinnedTaskIds.includes(taskId);
    const wasActive = result?.task_id === taskId;
    if (wasActive) {
      resetRun();
    }
    setPinnedTaskIds(removeAgentHistoryPins([taskId]));
    setOpenMenuTaskId(null);
    setConfirmDeleteTaskId(null);
    setTaskHistory((prev) => prev.filter((t) => t.task_id !== taskId));
    void deleteAgentTask(taskId).catch(() => {
      if (wasPinned) setPinnedTaskIds(toggleAgentHistoryPin(taskId));
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
    activeTaskIdRef.current = null;
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
    const pinned = pinnedTaskIds.includes(item.task_id);
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
          borderLeft: active ? '2px solid #F0B84E' : '2px solid transparent',
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
          <label
            onClick={(event) => event.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'flex-start',
              paddingTop: 3,
              paddingRight: 2,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={selectedHistoryTaskIds.has(item.task_id)}
              disabled={historySelectionLocked}
              onChange={() => toggleHistorySelection(item.task_id)}
              aria-label={
                selectedHistoryTaskIds.has(item.task_id)
                  ? `Deselect ${displayTitle} from history selection`
                  : `Select ${displayTitle} for history actions`
              }
              style={{
                accentColor: '#B07840',
                cursor: historySelectionLocked ? 'not-allowed' : 'pointer',
              }}
            />
          </label>
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
                  {pinned ? (
                    <span
                      title="Pinned to top"
                      aria-label="Pinned to top"
                      style={{ display: 'inline-flex', flexShrink: 0, color: '#B07840' }}
                    >
                      <Pin width={12} height={12} fill="currentColor" strokeWidth={1.8} aria-hidden />
                    </span>
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
                  <AgentHistorySourceBadge item={item} />
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
                    style={{ fontSize: 11, color: '#A0A39A' }}
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
                disabled={historySelectionLocked}
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
                  color: '#A0A39A',
                  transition: 'all 150ms ease',
                  opacity: historySelectionLocked ? 0.5 : 1,
                  cursor: historySelectionLocked ? 'not-allowed' : 'pointer',
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
                  icon={<Pin className="w-[14px] h-[14px]" fill={pinned ? 'currentColor' : 'none'} />}
                  label={pinned ? 'Unpin' : 'Pin to top'}
                  color="#B07840"
                  hoverBackground="#FBF3E3"
                  onClick={() => {
                    setOpenMenuTaskId(null);
                    toggleHistoryPin(item.task_id);
                  }}
                />
                <AgentSidebarMenuItem
                  icon={<Copy className="w-[14px] h-[14px]" />}
                  label="Copy question"
                  color="#1A1714"
                  hoverBackground="#F0EBE3"
                  onClick={() => void copyHistoryQuestion(item)}
                />
                <AgentSidebarMenuItem
                  icon={<Copy className="w-[14px] h-[14px]" />}
                  label="Copy research"
                  color="#1A1714"
                  hoverBackground="#F0EBE3"
                  onClick={() => void copyHistoryResearch(item)}
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
                      color: '#A0A39A',
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
        background: '#0B0C0A',
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
          color: #F3F0E7;
          font-family: Georgia, 'Times New Roman', serif;
          margin-bottom: 8px;
        }
        .answer-text span {
          color: #F3F0E7;
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0A39A' }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
          ) : null}
          <div style={{ height: '0.5px', background: '#E8E2DA', margin: '0 16px 12px' }} />
          <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1714' }}>Agent</span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F0B84E', animation: 'breathe 2.4s infinite' }} />
          </div>
          <button
            type="button"
            onClick={startFreshAgentTask}
            title="Start a fresh task (Shift+N)"
            aria-keyshortcuts="Shift+N"
            style={{
              margin: '12px 16px',
              width: 'calc(100% - 32px)',
              padding: '9px 16px',
              background: '#1A1714',
              color: '#F3F0E7',
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
                fontFamily: 'var(--vp-font-sans)',
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
                      background: '#F0B84E',
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
                <div
                  role="tablist"
                  aria-label="Rooms views"
                  style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                >
                  {['mine' as const, 'discover' as const].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={roomsTab === tab}
                      onClick={() => handleRoomsTabChange(tab)}
                      style={{
                        background: roomsTab === tab ? '#2C3B33' : 'transparent',
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 6,
                        padding: '2px 7px',
                        fontSize: 10,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: roomsTab === tab ? '#F3F0E7' : '#A0A39A',
                        cursor: 'pointer',
                        fontFamily: 'var(--vp-font-sans)',
                        lineHeight: 1.4,
                      }}
                    >
                      {tab === 'mine' ? 'Mine' : 'Discover'}
                    </button>
                  ))}
                </div>
                {roomsTab === 'mine' && roomsBodyMode === 'list' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: '#A0A39A' }}>
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
                              : '#A0A39A',
                        cursor: 'pointer',
                        fontFamily: 'var(--vp-font-sans)',
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
                              : '#A0A39A',
                        cursor: 'pointer',
                        fontFamily: 'var(--vp-font-sans)',
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
              {roomsTab === 'mine' ? (
                <>
              {roomsBodyMode === 'loading' ? (
                <div style={{ fontSize: 11, color: '#C4B8AE', padding: '4px 0' }}>Loading…</div>
              ) : roomsBodyMode === 'load_error' ? (
                <EmptyState
                  variant="compact"
                  alert
                  title="Could not load rooms."
                  description="Your rooms are safe — try again."
                  actions={
                    <button
                      type="button"
                      className="arena-btn arena-btn--ghost arena-btn--sm"
                      onClick={() => void loadMyRooms()}
                    >
                      Retry
                    </button>
                  }
                />
              ) : roomsBodyMode === 'empty' ? (
                <EmptyState
                  variant="compact"
                  title="No rooms yet"
                  description="Create one to research with others."
                />
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
                              border: selected ? 'none' : '0.5px solid #35382F',
                              background: selected ? '#F0B84E' : 'transparent',
                              color: selected ? '#FAF7F2' : '#8C7355',
                              fontSize: 10,
                              fontFamily: 'var(--vp-font-sans)',
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
                                ? '0.5px solid #F0B84E'
                                : '0.5px solid #35382F',
                              background: selected ? '#F0E6DA' : 'transparent',
                              color: selected ? '#4A3728' : '#8C7355',
                              fontSize: 10,
                              fontFamily: 'var(--vp-font-sans)',
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
                                ? '0.5px solid #F0B84E'
                                : '0.5px solid #35382F',
                              background: selected ? '#F0E6DA' : 'transparent',
                              color: selected ? '#4A3728' : '#8C7355',
                              fontSize: 10,
                              fontFamily: 'var(--vp-font-sans)',
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
                          fontFamily: 'var(--vp-font-sans)',
                          color: '#4A3728',
                          background: '#0B0C0A',
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
                          fontFamily: 'var(--vp-font-sans)',
                          color: '#F3F0E7',
                          background: '#0B0C0A',
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
                            color: '#A0A39A',
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
                    <EmptyState
                      variant="compact"
                      title={
                        roomsSearchQuery.trim()
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
                                  : 'No rooms in this view.'
                      }
                      actions={
                        <button
                          type="button"
                          className="arena-btn arena-btn--ghost arena-btn--sm"
                          onClick={() => {
                            setRoomsSearchQuery('');
                            setRoomsActivityFilter('all');
                            setRoomsOccupancyFilter('all');
                            setRoomsMembershipFilter('all');
                            roomsSearchRef.current?.focus();
                          }}
                        >
                          {(roomsActivityFilter !== 'all' ||
                            roomsOccupancyFilter !== 'all' ||
                            roomsMembershipFilter !== 'all') &&
                          !roomsSearchQuery.trim()
                            ? 'Show all rooms'
                            : 'Clear filters'}
                        </button>
                      }
                    />
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
                            className="agent-hover-surface agent-hover-surface--row"
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 4,
                              borderRadius: 6,
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
                                    color: '#F3F0E7',
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
                                  style={{ fontSize: 10, color: '#A0A39A', marginTop: 1 }}
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
                                    background: '#F0B84E',
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
                                      : '#F0B84E',
                                fontFamily: 'var(--vp-font-sans)',
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
                </>
              ) : (
                <RoomsDiscoverPanel
                  rooms={discoverRooms}
                  total={discoverTotal}
                  loading={discoverLoading}
                  loadingMore={discoverLoadingMore}
                  loadMoreFailed={discoverLoadMoreFailed}
                  failed={discoverLoadFailed}
                  searchQuery={discoverSearchQuery}
                  onSearchChange={setDiscoverSearchQuery}
                  onSubmitSearch={() => void loadDiscoverRooms()}
                  onClearSearch={() => {
                    setDiscoverSearchQuery('');
                    void loadDiscoverRooms('');
                  }}
                  onRetry={() => void loadDiscoverRooms()}
                  onLoadMore={() =>
                    void loadDiscoverRooms(discoverSearchQuery, discoverPage + 1)
                  }
                  onOpen={(slug) => {
                    navigate(`/room/${encodeURIComponent(slug)}`);
                    if (isMobile) setSidebarOpen(false);
                  }}
                />
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
                  color: '#F0B84E',
                  cursor: 'pointer',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  transition: 'background 0.15s',
                  marginTop: '4px',
                  background: 'none',
                  border: 'none',
                  width: '100%',
                  fontFamily: 'var(--vp-font-sans)',
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
                  {filteredTaskHistory.length > 0 ? (
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        color: '#8C7355',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title={
                        allVisibleHistorySelected
                          ? 'Clear selection for the visible history tasks'
                          : 'Select all history tasks currently visible'
                      }
                    >
                      <input
                        ref={historySelectVisibleRef}
                        type="checkbox"
                        checked={allVisibleHistorySelected}
                        disabled={historySelectionLocked}
                        onChange={toggleVisibleHistorySelection}
                        aria-label={
                          allVisibleHistorySelected
                            ? `Deselect all ${visibleHistoryTaskIds.length} visible history tasks`
                            : `Select all ${visibleHistoryTaskIds.length} visible history tasks`
                        }
                        style={{
                          accentColor: '#B07840',
                          cursor: historySelectionLocked ? 'not-allowed' : 'pointer',
                        }}
                      />
                      <span>{allVisibleHistorySelected ? 'Clear visible' : 'Select visible'}</span>
                    </label>
                  ) : null}
                  {selectedHistoryTaskIdList.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => applyHistoryPinSelection('pin')}
                        disabled={
                          historySelectionLocked ||
                          selectedHistoryPinnedCount === selectedHistoryTaskIdList.length
                        }
                        title="Pin every selected history task"
                        aria-label={`Pin ${selectedHistoryTaskIdList.length} selected history tasks`}
                        style={{
                          background: 'none',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 6,
                          padding: '2px 7px',
                          fontSize: 10,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: '#B07840',
                          cursor:
                            historySelectionLocked ||
                            selectedHistoryPinnedCount === selectedHistoryTaskIdList.length
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            selectedHistoryPinnedCount === selectedHistoryTaskIdList.length
                              ? 0.5
                              : 1,
                        }}
                      >
                        Pin ({selectedHistoryTaskIdList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => applyHistoryPinSelection('unpin')}
                        disabled={historySelectionLocked || selectedHistoryPinnedCount === 0}
                        title="Unpin every selected history task"
                        aria-label={`Unpin ${selectedHistoryTaskIdList.length} selected history tasks`}
                        style={{
                          background: 'none',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 6,
                          padding: '2px 7px',
                          fontSize: 10,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: '#8C7355',
                          cursor:
                            historySelectionLocked || selectedHistoryPinnedCount === 0
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked || selectedHistoryPinnedCount === 0 ? 0.5 : 1,
                        }}
                      >
                        Unpin ({selectedHistoryTaskIdList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!historySelectionLocked) setSelectedHistoryTaskIds(new Set());
                        }}
                        disabled={historySelectionLocked}
                        title="Clear selected history tasks"
                        aria-label={`Clear ${selectedHistoryTaskIdList.length} selected history tasks`}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px 0',
                          fontSize: 10,
                          color: '#A0A39A',
                          cursor: historySelectionLocked ? 'not-allowed' : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity: historySelectionLocked ? 0.5 : 1,
                        }}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={downloadSelectedHistoryJsonl}
                        disabled={
                          historySelectionLocked ||
                          historySelectedJsonlDownloadStatus === 'busy'
                        }
                        title="Download the selected history tasks as JSONL"
                        aria-label={
                          historySelectedJsonlDownloadStatus === 'busy'
                            ? 'Exporting selected history as JSONL'
                            : historySelectedJsonlDownloadStatus === 'done'
                            ? 'Selected history JSONL downloaded'
                            : historySelectedJsonlDownloadStatus === 'failed'
                              ? 'Selected history JSONL download failed'
                              : `Download ${selectedHistoryTaskIdList.length} selected history tasks as JSONL`
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
                            historySelectedJsonlDownloadStatus === 'busy'
                              ? '#B07840'
                              : historySelectedJsonlDownloadStatus === 'failed'
                              ? '#D85A30'
                              : historySelectedJsonlDownloadStatus === 'done'
                                ? '#5A8C6A'
                                : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedJsonlDownloadStatus === 'busy'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedJsonlDownloadStatus === 'busy'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedJsonlDownloadStatus === 'busy'}
                      >
                        {historySelectedJsonlDownloadStatus === 'busy'
                          ? 'Exporting…'
                          : historySelectedJsonlDownloadStatus === 'done'
                          ? 'Downloaded'
                          : historySelectedJsonlDownloadStatus === 'failed'
                            ? 'Failed'
                            : 'Selected JSONL'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copySelectedHistoryJsonl()}
                        disabled={
                          historySelectionLocked ||
                          historySelectedJsonlCopyStatus === 'copying'
                        }
                        title="Copy the selected history tasks as JSONL"
                        aria-label={
                          historySelectedJsonlCopyStatus === 'copying'
                            ? 'Copying selected history as JSONL'
                            : historySelectedJsonlCopyStatus === 'copied'
                            ? 'Selected history JSONL copied'
                            : historySelectedJsonlCopyStatus === 'failed'
                              ? 'Selected history JSONL copy failed'
                              : `Copy ${selectedHistoryTaskIdList.length} selected history tasks as JSONL`
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
                            historySelectedJsonlCopyStatus === 'copying'
                              ? '#B07840'
                              : historySelectedJsonlCopyStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedJsonlCopyStatus === 'copied'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedJsonlCopyStatus === 'copying'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedJsonlCopyStatus === 'copying'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedJsonlCopyStatus === 'copying'}
                      >
                        {historySelectedJsonlCopyStatus === 'copying'
                          ? 'Copying…'
                          : historySelectedJsonlCopyStatus === 'copied'
                            ? 'Copied'
                            : historySelectedJsonlCopyStatus === 'failed'
                              ? 'Failed'
                              : 'Copy selected JSONL'}
                      </button>
                      <button
                        type="button"
                        onClick={downloadSelectedHistoryCsv}
                        disabled={
                          historySelectionLocked ||
                          historySelectedCsvDownloadStatus === 'busy'
                        }
                        title="Download the selected history tasks as CSV"
                        aria-label={
                          historySelectedCsvDownloadStatus === 'busy'
                            ? 'Exporting selected history as CSV'
                            : historySelectedCsvDownloadStatus === 'done'
                              ? 'Selected history CSV downloaded'
                              : historySelectedCsvDownloadStatus === 'failed'
                                ? 'Selected history CSV download failed'
                                : `Download ${selectedHistoryTaskIdList.length} selected history tasks as CSV`
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
                            historySelectedCsvDownloadStatus === 'busy'
                              ? '#B07840'
                              : historySelectedCsvDownloadStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedCsvDownloadStatus === 'done'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedCsvDownloadStatus === 'busy'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedCsvDownloadStatus === 'busy'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedCsvDownloadStatus === 'busy'}
                      >
                        {historySelectedCsvDownloadStatus === 'busy'
                          ? 'Exporting…'
                          : historySelectedCsvDownloadStatus === 'done'
                            ? 'Downloaded'
                            : historySelectedCsvDownloadStatus === 'failed'
                              ? 'Failed'
                              : 'Selected CSV'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copySelectedHistoryCsv()}
                        disabled={
                          historySelectionLocked ||
                          historySelectedCsvCopyStatus === 'copying'
                        }
                        title="Copy the selected history tasks as CSV"
                        aria-label={
                          historySelectedCsvCopyStatus === 'copying'
                            ? 'Copying selected history as CSV'
                            : historySelectedCsvCopyStatus === 'copied'
                              ? 'Selected history CSV copied'
                              : historySelectedCsvCopyStatus === 'failed'
                                ? 'Selected history CSV copy failed'
                                : `Copy ${selectedHistoryTaskIdList.length} selected history tasks as CSV`
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
                            historySelectedCsvCopyStatus === 'copying'
                              ? '#B07840'
                              : historySelectedCsvCopyStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedCsvCopyStatus === 'copied'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedCsvCopyStatus === 'copying'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedCsvCopyStatus === 'copying'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedCsvCopyStatus === 'copying'}
                      >
                        {historySelectedCsvCopyStatus === 'copying'
                          ? 'Copying…'
                          : historySelectedCsvCopyStatus === 'copied'
                            ? 'Copied'
                            : historySelectedCsvCopyStatus === 'failed'
                              ? 'Failed'
                              : 'Copy selected CSV'}
                      </button>
                      <button
                        type="button"
                        onClick={downloadSelectedHistoryJson}
                        disabled={
                          historySelectionLocked ||
                          historySelectedJsonDownloadStatus === 'busy'
                        }
                        title="Download the selected history tasks as JSON"
                        aria-label={
                          historySelectedJsonDownloadStatus === 'busy'
                            ? 'Exporting selected history as JSON'
                            : historySelectedJsonDownloadStatus === 'done'
                              ? 'Selected history JSON downloaded'
                              : historySelectedJsonDownloadStatus === 'failed'
                                ? 'Selected history JSON download failed'
                                : `Download ${selectedHistoryTaskIdList.length} selected history tasks as JSON`
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
                            historySelectedJsonDownloadStatus === 'busy'
                              ? '#B07840'
                              : historySelectedJsonDownloadStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedJsonDownloadStatus === 'done'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedJsonDownloadStatus === 'busy'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedJsonDownloadStatus === 'busy'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedJsonDownloadStatus === 'busy'}
                      >
                        {historySelectedJsonDownloadStatus === 'busy'
                          ? 'Exporting…'
                          : historySelectedJsonDownloadStatus === 'done'
                            ? 'Downloaded'
                            : historySelectedJsonDownloadStatus === 'failed'
                              ? 'Failed'
                              : 'Selected JSON'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copySelectedHistoryJson()}
                        disabled={
                          historySelectionLocked ||
                          historySelectedJsonCopyStatus === 'copying'
                        }
                        title="Copy the selected history tasks as JSON"
                        aria-label={
                          historySelectedJsonCopyStatus === 'copying'
                            ? 'Copying selected history as JSON'
                            : historySelectedJsonCopyStatus === 'copied'
                              ? 'Selected history JSON copied'
                              : historySelectedJsonCopyStatus === 'failed'
                                ? 'Selected history JSON copy failed'
                                : `Copy ${selectedHistoryTaskIdList.length} selected history tasks as JSON`
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
                            historySelectedJsonCopyStatus === 'copying'
                              ? '#B07840'
                              : historySelectedJsonCopyStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedJsonCopyStatus === 'copied'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedJsonCopyStatus === 'copying'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedJsonCopyStatus === 'copying'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedJsonCopyStatus === 'copying'}
                      >
                        {historySelectedJsonCopyStatus === 'copying'
                          ? 'Copying…'
                          : historySelectedJsonCopyStatus === 'copied'
                            ? 'Copied'
                            : historySelectedJsonCopyStatus === 'failed'
                              ? 'Failed'
                              : 'Copy selected JSON'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copySelectedHistoryMarkdown()}
                        disabled={
                          historySelectionLocked ||
                          historySelectedMarkdownCopyStatus === 'copying'
                        }
                        title="Copy the selected history tasks as Markdown"
                        aria-label={
                          historySelectedMarkdownCopyStatus === 'copying'
                            ? 'Copying selected history as Markdown'
                            : historySelectedMarkdownCopyStatus === 'copied'
                              ? 'Selected history Markdown copied'
                              : historySelectedMarkdownCopyStatus === 'failed'
                                ? 'Selected history Markdown copy failed'
                                : `Copy ${selectedHistoryTaskIdList.length} selected history tasks as Markdown`
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
                            historySelectedMarkdownCopyStatus === 'copying'
                              ? '#B07840'
                              : historySelectedMarkdownCopyStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedMarkdownCopyStatus === 'copied'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedMarkdownCopyStatus === 'copying'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedMarkdownCopyStatus === 'copying'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedMarkdownCopyStatus === 'copying'}
                      >
                        {historySelectedMarkdownCopyStatus === 'copying'
                          ? 'Copying…'
                          : historySelectedMarkdownCopyStatus === 'copied'
                            ? 'Copied'
                            : historySelectedMarkdownCopyStatus === 'failed'
                              ? 'Failed'
                              : 'Copy selected MD'}
                      </button>
                      <button
                        type="button"
                        onClick={downloadSelectedHistoryMarkdown}
                        disabled={
                          historySelectionLocked ||
                          historySelectedMarkdownDownloadStatus === 'busy'
                        }
                        title="Download the selected history tasks as Markdown"
                        aria-label={
                          historySelectedMarkdownDownloadStatus === 'busy'
                            ? 'Exporting selected history as Markdown'
                            : historySelectedMarkdownDownloadStatus === 'done'
                              ? 'Selected history Markdown downloaded'
                              : historySelectedMarkdownDownloadStatus === 'failed'
                                ? 'Selected history Markdown download failed'
                                : `Download ${selectedHistoryTaskIdList.length} selected history tasks as Markdown`
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
                            historySelectedMarkdownDownloadStatus === 'busy'
                              ? '#B07840'
                              : historySelectedMarkdownDownloadStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedMarkdownDownloadStatus === 'done'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedMarkdownDownloadStatus === 'busy'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedMarkdownDownloadStatus === 'busy'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedMarkdownDownloadStatus === 'busy'}
                      >
                        {historySelectedMarkdownDownloadStatus === 'busy'
                          ? 'Exporting…'
                          : historySelectedMarkdownDownloadStatus === 'done'
                            ? 'Downloaded'
                            : historySelectedMarkdownDownloadStatus === 'failed'
                              ? 'Failed'
                              : 'Selected MD'}
                      </button>
                      <button
                        type="button"
                        onClick={downloadSelectedHistoryHtml}
                        disabled={
                          historySelectionLocked ||
                          historySelectedHtmlDownloadStatus === 'busy'
                        }
                        title="Download the selected history tasks as a standalone HTML archive"
                        aria-label={
                          historySelectedHtmlDownloadStatus === 'busy'
                            ? 'Exporting selected history as HTML'
                            : historySelectedHtmlDownloadStatus === 'done'
                              ? 'Selected history HTML downloaded'
                              : historySelectedHtmlDownloadStatus === 'failed'
                                ? 'Selected history HTML download failed'
                                : `Download ${selectedHistoryTaskIdList.length} selected history tasks as HTML`
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
                            historySelectedHtmlDownloadStatus === 'busy'
                              ? '#B07840'
                              : historySelectedHtmlDownloadStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedHtmlDownloadStatus === 'done'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedHtmlDownloadStatus === 'busy'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedHtmlDownloadStatus === 'busy'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedHtmlDownloadStatus === 'busy'}
                      >
                        {historySelectedHtmlDownloadStatus === 'busy'
                          ? 'Exporting…'
                          : historySelectedHtmlDownloadStatus === 'done'
                            ? 'Downloaded'
                            : historySelectedHtmlDownloadStatus === 'failed'
                              ? 'Failed'
                              : 'Selected HTML'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copySelectedHistoryHtml()}
                        disabled={
                          historySelectionLocked ||
                          historySelectedHtmlCopyStatus === 'copying'
                        }
                        title="Copy the selected history tasks as rich HTML"
                        aria-label={
                          historySelectedHtmlCopyStatus === 'copying'
                            ? 'Copying selected history as HTML'
                            : historySelectedHtmlCopyStatus === 'copied'
                              ? 'Selected history HTML copied'
                              : historySelectedHtmlCopyStatus === 'failed'
                                ? 'Selected history HTML copy failed'
                                : `Copy ${selectedHistoryTaskIdList.length} selected history tasks as HTML`
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
                            historySelectedHtmlCopyStatus === 'copying'
                              ? '#B07840'
                              : historySelectedHtmlCopyStatus === 'failed'
                                ? '#D85A30'
                                : historySelectedHtmlCopyStatus === 'copied'
                                  ? '#5A8C6A'
                                  : '#A0A39A',
                          cursor:
                            historySelectionLocked ||
                            historySelectedHtmlCopyStatus === 'copying'
                              ? 'not-allowed'
                              : 'pointer',
                          fontFamily: 'var(--vp-font-sans)',
                          lineHeight: 1.4,
                          opacity:
                            historySelectionLocked ||
                            historySelectedHtmlCopyStatus === 'copying'
                              ? 0.5
                              : 1,
                        }}
                        aria-busy={historySelectedHtmlCopyStatus === 'copying'}
                      >
                        {historySelectedHtmlCopyStatus === 'copying'
                          ? 'Copying…'
                          : historySelectedHtmlCopyStatus === 'copied'
                            ? 'Copied'
                            : historySelectedHtmlCopyStatus === 'failed'
                              ? 'Failed'
                              : 'Copy selected HTML'}
                      </button>
                      {historyBulkDeleteConfirm ? (
                        <>
                          <span
                            role="status"
                            aria-live="polite"
                            style={{ fontSize: 10, color: '#C0392B', whiteSpace: 'nowrap' }}
                          >
                            Delete {selectedHistoryTaskIdList.length} selected?
                          </span>
                          <button
                            type="button"
                            onClick={() => setHistoryBulkDeleteConfirm(false)}
                            disabled={historyBulkDeleteBusy}
                            aria-label="Cancel deleting selected history tasks"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '2px 0',
                              fontSize: 10,
                              color: '#A0A39A',
                              cursor: historyBulkDeleteBusy ? 'not-allowed' : 'pointer',
                              fontFamily: 'var(--vp-font-sans)',
                              lineHeight: 1.4,
                              opacity: historyBulkDeleteBusy ? 0.5 : 1,
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteSelectedHistoryTasks()}
                            disabled={historyBulkDeleteBusy}
                            aria-busy={historyBulkDeleteBusy}
                            aria-label={`Confirm deleting ${selectedHistoryTaskIdList.length} selected history tasks`}
                            style={{
                              background: 'none',
                              border: '0.5px solid #D85A30',
                              borderRadius: 6,
                              padding: '2px 7px',
                              fontSize: 10,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: '#C0392B',
                              cursor: historyBulkDeleteBusy ? 'wait' : 'pointer',
                              fontFamily: 'var(--vp-font-sans)',
                              lineHeight: 1.4,
                              opacity: historyBulkDeleteBusy ? 0.65 : 1,
                            }}
                          >
                            {historyBulkDeleteBusy ? 'Deleting…' : 'Delete'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={requestHistoryBulkDelete}
                          disabled={historySelectionLocked}
                          title={`Delete selected history tasks (up to ${AGENT_HISTORY_BULK_DELETE_MAX} at a time)`}
                          aria-label={`Delete ${selectedHistoryTaskIdList.length} selected history tasks`}
                          style={{
                            background: 'none',
                            border: '0.5px solid #E0D5C5',
                            borderRadius: 6,
                            padding: '2px 7px',
                            fontSize: 10,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: '#C0392B',
                            cursor: historySelectionLocked ? 'not-allowed' : 'pointer',
                            fontFamily: 'var(--vp-font-sans)',
                            lineHeight: 1.4,
                            opacity: historySelectionLocked ? 0.5 : 1,
                          }}
                        >
                          Delete ({selectedHistoryTaskIdList.length})
                        </button>
                      )}
                    </>
                  ) : null}
                  <span style={{ fontSize: 10, color: '#A0A39A' }}>
                    {filteredTaskHistory.length}
                    {historySearchQuery.trim() ||
                    historyStatusFilter !== 'all' ||
                    historyScoreFilter !== 'all' ||
                    historyConfidenceFilter !== 'all' ||
                    historyRecencyFilter !== 'all' ||
                    historyFeedbackFilter !== 'all' ||
                    historyTopicFilter !== AGENT_HISTORY_TOPIC_ALL ||
                    historySourceFilter !== AGENT_HISTORY_SOURCE_ALL ||
                    historyPinFilter !== AGENT_HISTORY_PIN_FILTER_ALL
                      ? ` / ${taskHistory.length}`
                      : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyHistoryViewLink()}
                    title="Copy a link to these history filters; pins stay on this device"
                    aria-label="Copy link to current history view"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'none',
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 6,
                      padding: '2px 7px',
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: '#A0A39A',
                      cursor: 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                    }}
                  >
                    <Link2 size={11} aria-hidden />
                    Link
                  </button>
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
                            : '#A0A39A',
                      cursor: 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
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
                            : '#A0A39A',
                      cursor: 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                    }}
                  >
                    {historyDownloadStatus === 'done'
                      ? 'Downloaded'
                      : historyDownloadStatus === 'failed'
                        ? 'Failed'
                        : 'Download'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFilteredHistoryHtml()}
                    title="Download current history view as a standalone HTML archive"
                    aria-label={
                      historyHtmlDownloadStatus === 'done'
                        ? 'History HTML downloaded'
                        : historyHtmlDownloadStatus === 'failed'
                          ? 'History HTML download failed'
                          : 'Download research history as HTML'
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
                        historyHtmlDownloadStatus === 'failed'
                          ? '#D85A30'
                          : historyHtmlDownloadStatus === 'done'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor: 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                    }}
                  >
                    {historyHtmlDownloadStatus === 'done'
                      ? 'HTML'
                      : historyHtmlDownloadStatus === 'failed'
                        ? 'Failed'
                        : 'HTML'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyFilteredHistoryHtml()}
                    title="Copy the current history view as rich HTML"
                    disabled={historyHtmlCopyStatus === 'copying'}
                    aria-busy={historyHtmlCopyStatus === 'copying'}
                    aria-label={
                      historyHtmlCopyStatus === 'copying'
                        ? 'Copying research history as HTML'
                        : historyHtmlCopyStatus === 'copied'
                          ? 'History HTML copied'
                          : historyHtmlCopyStatus === 'failed'
                            ? 'History HTML copy failed'
                            : 'Copy research history as HTML'
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
                        historyHtmlCopyStatus === 'failed'
                          ? '#D85A30'
                          : historyHtmlCopyStatus === 'copied'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor: historyHtmlCopyStatus === 'copying' ? 'wait' : 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                      opacity: historyHtmlCopyStatus === 'copying' ? 0.65 : 1,
                    }}
                  >
                    {historyHtmlCopyStatus === 'copying'
                      ? 'Copying…'
                      : historyHtmlCopyStatus === 'copied'
                        ? 'Copied'
                        : historyHtmlCopyStatus === 'failed'
                          ? 'Failed'
                          : 'Copy HTML'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFilteredHistoryCsv()}
                    title="Download current history view as CSV"
                    aria-label={
                      historyCsvDownloadStatus === 'done'
                        ? 'History CSV downloaded'
                        : historyCsvDownloadStatus === 'failed'
                          ? 'History CSV download failed'
                          : 'Download research history as CSV'
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
                        historyCsvDownloadStatus === 'failed'
                          ? '#D85A30'
                          : historyCsvDownloadStatus === 'done'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor: 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                    }}
                  >
                    {historyCsvDownloadStatus === 'done'
                      ? 'Downloaded'
                      : historyCsvDownloadStatus === 'failed'
                        ? 'Failed'
                        : 'CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyFilteredHistoryCsv()}
                    title="Copy the current history view as CSV"
                    disabled={historyCsvCopyStatus === 'copying'}
                    aria-busy={historyCsvCopyStatus === 'copying'}
                    aria-label={
                      historyCsvCopyStatus === 'copying'
                        ? 'Copying research history as CSV'
                        : historyCsvCopyStatus === 'copied'
                          ? 'History CSV copied'
                          : historyCsvCopyStatus === 'failed'
                            ? 'History CSV copy failed'
                            : 'Copy research history as CSV'
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
                        historyCsvCopyStatus === 'failed'
                          ? '#D85A30'
                          : historyCsvCopyStatus === 'copied'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor: historyCsvCopyStatus === 'copying' ? 'wait' : 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                      opacity: historyCsvCopyStatus === 'copying' ? 0.65 : 1,
                    }}
                  >
                    {historyCsvCopyStatus === 'copying'
                      ? 'Copying…'
                      : historyCsvCopyStatus === 'copied'
                        ? 'Copied'
                        : historyCsvCopyStatus === 'failed'
                          ? 'Failed'
                          : 'Copy CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFilteredHistoryJson()}
                    title="Download current history view as JSON"
                    aria-label={
                      historyJsonDownloadStatus === 'done'
                        ? 'History JSON downloaded'
                        : historyJsonDownloadStatus === 'failed'
                          ? 'History JSON download failed'
                          : 'Download research history as JSON'
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
                        historyJsonDownloadStatus === 'failed'
                          ? '#D85A30'
                          : historyJsonDownloadStatus === 'done'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor: 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                    }}
                  >
                    {historyJsonDownloadStatus === 'done'
                      ? 'Downloaded'
                      : historyJsonDownloadStatus === 'failed'
                        ? 'Failed'
                        : 'JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyFilteredHistoryJson()}
                    title="Copy the current history view as JSON"
                    disabled={historyJsonCopyStatus === 'copying'}
                    aria-busy={historyJsonCopyStatus === 'copying'}
                    aria-label={
                      historyJsonCopyStatus === 'copying'
                        ? 'Copying research history as JSON'
                        : historyJsonCopyStatus === 'copied'
                          ? 'History JSON copied'
                          : historyJsonCopyStatus === 'failed'
                            ? 'History JSON copy failed'
                            : 'Copy research history as JSON'
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
                        historyJsonCopyStatus === 'failed'
                          ? '#D85A30'
                          : historyJsonCopyStatus === 'copied'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor: historyJsonCopyStatus === 'copying' ? 'wait' : 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                      opacity: historyJsonCopyStatus === 'copying' ? 0.65 : 1,
                    }}
                  >
                    {historyJsonCopyStatus === 'copying'
                      ? 'Copying…'
                      : historyJsonCopyStatus === 'copied'
                        ? 'Copied'
                        : historyJsonCopyStatus === 'failed'
                          ? 'Failed'
                          : 'Copy JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFilteredHistoryJsonl()}
                    disabled={filteredTaskHistory.length === 0}
                    title={
                      filteredTaskHistory.length === 0
                        ? 'No tasks in the current history view'
                        : 'Download the current history view as newline-delimited JSON'
                    }
                    aria-label={
                      filteredTaskHistory.length === 0
                        ? 'No history tasks in current view'
                        : historyFilteredJsonlDownloadStatus === 'done'
                          ? 'Filtered history JSONL downloaded'
                          : historyFilteredJsonlDownloadStatus === 'failed'
                            ? 'Filtered history JSONL download failed'
                            : 'Download filtered history as JSONL'
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
                        historyFilteredJsonlDownloadStatus === 'failed'
                          ? '#D85A30'
                          : historyFilteredJsonlDownloadStatus === 'done'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor: filteredTaskHistory.length === 0 ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                      opacity: filteredTaskHistory.length === 0 ? 0.5 : 1,
                    }}
                  >
                    {historyFilteredJsonlDownloadStatus === 'done'
                      ? 'Downloaded'
                      : historyFilteredJsonlDownloadStatus === 'failed'
                        ? 'Failed'
                        : 'Filtered JSONL'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyFilteredHistoryJsonl()}
                    disabled={filteredTaskHistory.length === 0 || historyJsonlCopyStatus === 'copying'}
                    title={
                      filteredTaskHistory.length === 0
                        ? 'No tasks in the current history view'
                        : 'Copy the current history view as newline-delimited JSON'
                    }
                    aria-busy={historyJsonlCopyStatus === 'copying'}
                    aria-label={
                      filteredTaskHistory.length === 0
                        ? 'No history tasks in current view'
                        : historyJsonlCopyStatus === 'copying'
                          ? 'Copying filtered history as JSONL'
                          : historyJsonlCopyStatus === 'copied'
                            ? 'Filtered history JSONL copied'
                            : historyJsonlCopyStatus === 'failed'
                              ? 'Filtered history JSONL copy failed'
                              : 'Copy filtered history as JSONL'
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
                        historyJsonlCopyStatus === 'failed'
                          ? '#D85A30'
                          : historyJsonlCopyStatus === 'copied'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor:
                        filteredTaskHistory.length === 0 || historyJsonlCopyStatus === 'copying'
                          ? 'not-allowed'
                          : 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                      opacity:
                        filteredTaskHistory.length === 0 || historyJsonlCopyStatus === 'copying'
                          ? 0.5
                          : 1,
                    }}
                  >
                    {historyJsonlCopyStatus === 'copying'
                      ? 'Copying…'
                      : historyJsonlCopyStatus === 'copied'
                        ? 'Copied'
                        : historyJsonlCopyStatus === 'failed'
                          ? 'Failed'
                          : 'Copy JSONL'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadFullHistoryJsonl()}
                    disabled={historyJsonlDownloadStatus === 'busy'}
                    title="Download all retained Agent tasks as newline-delimited JSON"
                    aria-label={
                      historyJsonlDownloadStatus === 'busy'
                        ? 'Exporting full history as JSONL'
                        : historyJsonlDownloadStatus === 'done'
                          ? 'Full history JSONL downloaded'
                          : historyJsonlDownloadStatus === 'failed'
                            ? 'Full history JSONL download failed'
                            : 'Download full history as JSONL'
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
                        historyJsonlDownloadStatus === 'failed'
                          ? '#D85A30'
                          : historyJsonlDownloadStatus === 'done'
                            ? '#5A8C6A'
                            : '#A0A39A',
                      cursor: historyJsonlDownloadStatus === 'busy' ? 'wait' : 'pointer',
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.4,
                      opacity: historyJsonlDownloadStatus === 'busy' ? 0.65 : 1,
                    }}
                  >
                    {historyJsonlDownloadStatus === 'busy'
                      ? 'Exporting…'
                      : historyJsonlDownloadStatus === 'done'
                        ? 'Downloaded'
                        : historyJsonlDownloadStatus === 'failed'
                          ? 'Failed'
                          : 'All JSONL'}
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
                        onClick={() => {
                          markHistoryViewEdited();
                          setHistoryStatusFilter(opt.value);
                        }}
                        aria-pressed={selected}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 999,
                          border: selected ? 'none' : '0.5px solid #35382F',
                          background: selected ? '#F0B84E' : 'transparent',
                          color: selected ? '#FAF7F2' : '#8C7355',
                          fontSize: 11,
                          fontFamily: 'var(--vp-font-sans)',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {historyPinFilterUseful ? (
                  <div
                    role="group"
                    aria-label="Filter history by pinned status"
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {AGENT_HISTORY_PIN_FILTER_OPTIONS.map((opt) => {
                      const selected = historyPinFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            markHistoryViewEdited();
                            setHistoryPinFilter(opt.value);
                          }}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'var(--vp-font-sans)',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {historySourceFilterUseful ? (
                  <div
                    role="group"
                    aria-label="Filter history by source"
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    {historySourceOptions.map((opt) => {
                      const selected = historySourceFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            markHistoryViewEdited();
                            setHistorySourceFilter(opt.value);
                          }}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'var(--vp-font-sans)',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
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
                          onClick={() => {
                            markHistoryViewEdited();
                            setHistoryScoreFilter(opt.value);
                          }}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'var(--vp-font-sans)',
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
                          onClick={() => {
                            markHistoryViewEdited();
                            setHistoryConfidenceFilter(opt.value);
                          }}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'var(--vp-font-sans)',
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
                          onClick={() => {
                            markHistoryViewEdited();
                            setHistoryRecencyFilter(opt.value);
                          }}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'var(--vp-font-sans)',
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
                          onClick={() => {
                            markHistoryViewEdited();
                            setHistoryFeedbackFilter(opt.value);
                          }}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'var(--vp-font-sans)',
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
                          onClick={() => {
                            markHistoryViewEdited();
                            setHistoryTopicFilter(opt.value);
                          }}
                          aria-pressed={selected}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            border: selected ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
                            background: selected ? '#F0E6DA' : 'transparent',
                            color: selected ? '#4A3728' : '#8C7355',
                            fontSize: 11,
                            fontFamily: 'var(--vp-font-sans)',
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
                    onChange={(e) => {
                      markHistoryViewEdited();
                      setHistorySort(e.target.value as AgentHistorySort);
                    }}
                    aria-label="Sort research history"
                    title="Sort research history"
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--vp-font-sans)',
                      color: '#4A3728',
                      background: '#0B0C0A',
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
                      fontFamily: 'var(--vp-font-sans)',
                      color: '#F3F0E7',
                      background: '#0B0C0A',
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
                        color: '#A0A39A',
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
              <EmptyState
                variant="compact"
                alert
                title="Could not load research history."
                description="Your past tasks are safe — try again."
                actions={
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--sm"
                    onClick={() => void loadTaskHistory()}
                  >
                    Retry
                  </button>
                }
              />
            ) : historyBodyMode === 'empty' ? (
              <EmptyState
                variant="compact"
                title="No research yet."
                description="Ask something hard below — it will show up here."
              />
            ) : filteredTaskHistory.length === 0 ? (
              <EmptyState
                variant="compact"
                title={
                  historySearchQuery.trim()
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
                      }${
                        historySourceFilter !== AGENT_HISTORY_SOURCE_ALL
                          ? ` · ${agentHistorySourceLabel(historySourceFilter, historySourceOptions)}`
                          : ''
                      }${
                        historyPinFilter !== AGENT_HISTORY_PIN_FILTER_ALL
                          ? ` · ${agentHistoryPinFilterLabel(historyPinFilter)}`
                          : ''
                      }`
                    : historyRecencyFilter !== 'all' &&
                        historyStatusFilter === 'all' &&
                        historyScoreFilter === 'all' &&
                        historyConfidenceFilter === 'all' &&
                        historyFeedbackFilter === 'all' &&
                        historyTopicFilter === AGENT_HISTORY_TOPIC_ALL &&
                        historySourceFilter === AGENT_HISTORY_SOURCE_ALL &&
                        historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL
                      ? `No tasks from ${agentHistoryRecencyLabel(historyRecencyFilter).toLowerCase()}.`
                      : historyFeedbackFilter !== 'all' &&
                          historyStatusFilter === 'all' &&
                          historyScoreFilter === 'all' &&
                          historyConfidenceFilter === 'all' &&
                          historyRecencyFilter === 'all' &&
                          historyTopicFilter === AGENT_HISTORY_TOPIC_ALL &&
                          historySourceFilter === AGENT_HISTORY_SOURCE_ALL &&
                          historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL
                        ? `No tasks marked ${agentHistoryFeedbackLabel(historyFeedbackFilter).toLowerCase()}.`
                        : historyTopicFilter !== AGENT_HISTORY_TOPIC_ALL &&
                            historyStatusFilter === 'all' &&
                            historyScoreFilter === 'all' &&
                            historyConfidenceFilter === 'all' &&
                            historyRecencyFilter === 'all' &&
                            historyFeedbackFilter === 'all' &&
                            historySourceFilter === AGENT_HISTORY_SOURCE_ALL &&
                            historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL
                          ? `No tasks tagged ${agentHistoryTopicLabel(historyTopicFilter, historyTopicOptions)}.`
                          : historySourceFilter !== AGENT_HISTORY_SOURCE_ALL &&
                              historyStatusFilter === 'all' &&
                              historyScoreFilter === 'all' &&
                              historyConfidenceFilter === 'all' &&
                              historyRecencyFilter === 'all' &&
                              historyFeedbackFilter === 'all' &&
                              historyTopicFilter === AGENT_HISTORY_TOPIC_ALL &&
                              historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL
                            ? `No ${agentHistorySourceLabel(historySourceFilter, historySourceOptions).toLowerCase()} tasks.`
                          : historyConfidenceFilter !== 'all' &&
                              historyStatusFilter === 'all' &&
                              historyScoreFilter === 'all' &&
                              historyTopicFilter === AGENT_HISTORY_TOPIC_ALL &&
                              historyRecencyFilter === 'all' &&
                              historyFeedbackFilter === 'all' &&
                              historySourceFilter === AGENT_HISTORY_SOURCE_ALL &&
                              historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL
                            ? `No tasks with confidence ${agentHistoryConfidenceLabel(historyConfidenceFilter)}.`
                            : historyScoreFilter !== 'all' &&
                                historyStatusFilter === 'all' &&
                                historySourceFilter === AGENT_HISTORY_SOURCE_ALL &&
                                historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL
                              ? `No tasks with score ${agentHistoryScoreLabel(historyScoreFilter)}.`
                              : historyStatusFilter === 'live' &&
                                  historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL
                                ? 'No live weekly-update tasks yet.'
                                : historyStatusFilter === 'completed' &&
                                    historyPinFilter === AGENT_HISTORY_PIN_FILTER_ALL
                                  ? 'No one-off research tasks in this view.'
                                  : 'No matching history.'
                }
                actions={
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--sm"
                    onClick={() => {
                      markHistoryViewEdited();
                      setHistorySearchQuery('');
                      setHistoryStatusFilter('all');
                      setHistoryScoreFilter('all');
                      setHistoryConfidenceFilter('all');
                      setHistoryRecencyFilter('all');
                      setHistoryFeedbackFilter('all');
                      setHistoryTopicFilter(AGENT_HISTORY_TOPIC_ALL);
                      setHistorySourceFilter(AGENT_HISTORY_SOURCE_ALL);
                      setHistoryPinFilter(AGENT_HISTORY_PIN_FILTER_ALL);
                      historySearchRef.current?.focus();
                    }}
                  >
                    {(historyStatusFilter !== 'all' ||
                      historyScoreFilter !== 'all' ||
                      historyConfidenceFilter !== 'all' ||
                      historyRecencyFilter !== 'all' ||
                      historyFeedbackFilter !== 'all' ||
                      historyTopicFilter !== AGENT_HISTORY_TOPIC_ALL ||
                      historySourceFilter !== AGENT_HISTORY_SOURCE_ALL ||
                      historyPinFilter !== AGENT_HISTORY_PIN_FILTER_ALL) &&
                    !historySearchQuery.trim()
                      ? 'Show all history'
                      : 'Clear filters'}
                  </button>
                }
              />
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
                color: navToggleHovered ? '#F3F0E7' : '#8C7355',
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
                style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#F0B84E' }}
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
                  background: '#F0B84E',
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
                <span style={{ fontSize: 12, color: '#F0B84E' }}>
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
                    fontFamily: 'var(--vp-font-sans)',
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
                color: '#F3F0E7',
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
                    background: '#F0B84E',
                    marginTop: 5,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1714' }}>
                    Verifying Arena winner in Agent
                  </div>
                  {bridgeMeta.originalQuestion ? (
                    <div style={{ fontSize: 12, color: '#A0A39A', marginTop: 4 }}>
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
                          <Lock style={{ width: 32, height: 32, color: '#F0B84E' }} />
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
                            color: '#A0A39A',
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
                                color: '#A0A39A',
                                marginBottom: 8,
                              }}
                            >
                              Add to Plus
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 28, color: '#F3F0E7', fontWeight: 500 }}>₹599</span>
                              <span style={{ fontSize: 14, color: '#A0A39A' }}>/month</span>
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
                                background: '#F3F0E7',
                                color: '#F0B84E',
                                borderRadius: 20,
                                padding: '9px 18px',
                                fontSize: 13,
                                fontFamily: 'var(--vp-font-sans)',
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
                                color: '#A0A39A',
                                marginBottom: 8,
                              }}
                            >
                              Upgrade to Pro
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 28, color: '#F3F0E7', fontWeight: 500 }}>₹2,499</span>
                              <span style={{ fontSize: 14, color: '#A0A39A' }}>/month</span>
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
                                color: '#F0B84E',
                                borderRadius: 20,
                                padding: '9px 18px',
                                fontSize: 13,
                                fontFamily: 'var(--vp-font-sans)',
                                border: '0.5px solid #F0B84E',
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
                          <Lock style={{ width: 32, height: 32, color: '#F0B84E' }} />
                        </div>
                        <h1 style={{ fontSize: 28, fontWeight: 400, color: '#1A1714', marginBottom: '0.5rem' }}>Agent</h1>
                        <p style={{ fontSize: 14, color: '#A0A39A', lineHeight: 1.7, marginBottom: '2rem' }}>
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
                                color: '#A0A39A',
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
                            color: '#F3F0E7',
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
                      fontFamily: 'var(--vp-font-sans)',
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
                      <div style={{ width: 32, height: '0.5px', background: '#35382F' }} />
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
                      <div style={{ width: 32, height: '0.5px', background: '#35382F' }} />
                    </div>
                    <h1
                      style={{
                        fontSize: isMobile ? 28 : 42,
                        fontWeight: 500,
                        color: '#F3F0E7',
                        textAlign: 'center',
                        lineHeight: 1.1,
                        margin: '0 0 6px',
                        maxWidth: 640,
                      }}
                    >
                      What do you need to{' '}
                      <span style={{ color: '#F0B84E', fontStyle: 'italic' }}>truly</span> know?
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
                              background: '#35382F',
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
                          color: '#A0A39A',
                          fontStyle: 'italic',
                          fontFamily: 'var(--vp-font-sans)',
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
                                color: '#A0A39A',
                                background: 'transparent',
                                border: 'none',
                                padding: '6px 4px 6px 12px',
                                cursor: 'pointer',
                                fontFamily: 'var(--vp-font-sans)',
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
                                color: '#A0A39A',
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
                            color: '#A0A39A',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            fontFamily: 'var(--vp-font-sans)',
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
                                  borderColor: '#F0B84E',
                                  color: '#F0B84E',
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
                                  border: '0.5px solid #35382F',
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
                                  border: '0.5px solid #35382F',
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
                                      fontFamily: 'var(--vp-font-sans)',
                                      color: '#F3F0E7',
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
                                              : '#A0A39A',
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
                            <p style={{ fontSize: 11, color: '#A0A39A', margin: 0 }}>
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
                                    ? '#F0B84E'
                                    : '#35382F',
                                color: '#FDFAF6',
                                fontSize: 13,
                                fontFamily: 'var(--vp-font-sans)',
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
                                background: '#F3F0E7',
                                color: '#F0B84E',
                                borderRadius: 20,
                                padding: '4px 12px',
                                fontSize: 11,
                                fontFamily: 'var(--vp-font-sans)',
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
                                color: '#A0A39A',
                                fontFamily: 'var(--vp-font-sans)',
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
                              fontFamily: 'var(--vp-font-sans)',
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
                                  color: '#A0A39A',
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
                                  border: '0.5px solid #35382F',
                                  borderRadius: 6,
                                  padding: '7px 12px',
                                  fontSize: 13,
                                  fontFamily: 'var(--vp-font-sans)',
                                  outline: 'none',
                                  background: '#fff',
                                }}
                                onFocus={(e) => {
                                  e.currentTarget.style.borderColor = '#F0B84E';
                                }}
                                onBlur={(e) => {
                                  e.currentTarget.style.borderColor = '#35382F';
                                }}
                              />
                            </div>
                          ))}
                          {!allTemplateSlotsFilled ? (
                            <p style={{ fontSize: 11, color: '#A0A39A', margin: 0 }}>Fill all fields</p>
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
                                    ? '#F0B84E'
                                    : '#35382F';
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
                                    ? '#F0B84E'
                                    : '#35382F',
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
                                    color: '#A0A39A',
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
                                      border: '0.5px solid #35382F',
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
                                          stroke="#F0B84E"
                                          strokeWidth={1.2}
                                        />
                                        <path d="M14 2v6h6" stroke="#F0B84E" strokeWidth={1.2} />
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
                                        color: '#A0A39A',
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
                                    svc === 'github' ? '#F3F0E7' : svc === 'google_drive' ? '#185FA5' : '#F3F0E7';
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
                                          color: '#A0A39A',
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
                            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                              <PromptPipelineStatus />
                            </div>
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
                                  background: attachMenuOpen ? '#30332D' : '#F0E8DC',
                                  border: attachMenuOpen ? '0.5px solid #F0B84E' : '0.5px solid #35382F',
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
                                    stroke={attachMenuOpen ? '#F0B84E' : '#8C7355'}
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
                                  color: '#F3F0E7',
                                  fontFamily: 'var(--vp-font-sans)',
                                }}
                              />
                              <span
                                aria-live="polite"
                                title="Character budget (server max 2000)"
                                style={{
                                  fontSize: 10,
                                  fontFamily: 'var(--vp-font-sans)',
                                  color:
                                    charBudgetTone(task.length) === 'danger'
                                      ? '#993C1D'
                                      : charBudgetTone(task.length) === 'warn'
                                        ? '#F0B84E'
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
                                      ? '#F0B84E'
                                      : '#35382F';
                                }}
                                style={{
                                  width: isMobile ? 32 : 34,
                                  height: isMobile ? 32 : 34,
                                  borderRadius: '50%',
                                  border: 'none',
                                  cursor:
                                    task.trim().length >= 10 && !isRunning && hasAgentAccess ? 'pointer' : 'default',
                                  background:
                                    task.trim().length >= 10 && !isRunning && hasAgentAccess ? '#F0B84E' : '#35382F',
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
                                  color: '#A0A39A',
                                  fontFamily: 'var(--vp-font-sans)',
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
                                    <span style={{ display: 'block', fontSize: 13, color: '#F3F0E7' }}>
                                      Add files or photos
                                    </span>
                                    <span style={{ fontSize: 10, color: '#A0A39A' }}>Images, PDFs, docs…</span>
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
                                      <span style={{ display: 'block', fontSize: 13, color: '#F3F0E7' }}>MCP</span>
                                      <span style={{ fontSize: 10, color: '#A0A39A' }}>
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
                                                    ? '#F3F0E7'
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
                                            <span style={{ fontSize: 12, color: '#F3F0E7', flex: 1 }}>
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
                                          color: '#F0B84E',
                                          fontFamily: 'var(--vp-font-sans)',
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
                                    <span style={{ display: 'block', fontSize: 13, color: '#F3F0E7' }}>Add files or photos</span>
                                    <span style={{ fontSize: 10, color: '#A0A39A' }}>Images, PDFs, docs…</span>
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
                                    color: '#F0B84E',
                                    fontFamily: 'var(--vp-font-sans)',
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

            {rateLimit ? (
              <RateLimitNotice
                detail={rateLimit}
                onDismiss={() => setRateLimit(null)}
                onRefresh={async () => {
                  await refreshTier();
                  setRateLimit(null);
                }}
              />
            ) : null}

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
                      color: '#A0A39A',
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
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--sm"
                    onClick={() => {
                      setError(null);
                      void handleRunTask();
                    }}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    className="arena-btn arena-btn--ghost arena-btn--sm"
                    onClick={() => {
                      void copyToClipboard(error);
                      setErrorCopied(true);
                      window.setTimeout(() => setErrorCopied(false), 1500);
                    }}
                  >
                    {errorCopied ? 'Copied' : 'Copy error'}
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
                                  background: i <= curIdx && c.status !== 'failed' ? '#F0B84E' : '#E0D5C5',
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
                    background: '#F3F0E7',
                    color: '#F0B84E',
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
                      fontFamily: 'var(--vp-font-sans)',
                      lineHeight: 1.8,
                      color: '#F3F0E7',
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
                          color: '#A0A39A',
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
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
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
                      disabled={exportingOrchestrationMarkdown}
                      onClick={() => void handleExportOrchestrationMarkdown()}
                      aria-busy={exportingOrchestrationMarkdown}
                      aria-label={
                        exportingOrchestrationMarkdown
                          ? 'Exporting this orchestration as Markdown'
                          : 'Download this orchestration as Markdown'
                      }
                      style={{
                        padding: '9px 18px',
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: exportingOrchestrationMarkdown ? 'default' : 'pointer',
                        opacity: exportingOrchestrationMarkdown ? 0.7 : 1,
                      }}
                    >
                      {exportingOrchestrationMarkdown
                        ? 'Exporting…'
                        : 'Export this run as Markdown'}
                    </button>
                    <button
                      type="button"
                      disabled={exportingOrchestrationJson || copyingOrchestrationJson}
                      onClick={() => void handleExportOrchestrationJson()}
                      aria-busy={exportingOrchestrationJson}
                      aria-label={
                        exportingOrchestrationJson
                          ? 'Exporting this orchestration as JSON'
                          : 'Download this orchestration as JSON'
                      }
                      style={{
                        padding: '9px 18px',
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: exportingOrchestrationJson ? 'default' : 'pointer',
                        opacity: exportingOrchestrationJson || copyingOrchestrationJson ? 0.7 : 1,
                      }}
                    >
                      {exportingOrchestrationJson ? 'Exporting…' : 'Export this run as JSON'}
                    </button>
                    <button
                      type="button"
                      disabled={exportingOrchestrationJson || copyingOrchestrationJson}
                      onClick={() => void handleCopyOrchestrationJson()}
                      aria-busy={copyingOrchestrationJson}
                      aria-label={
                        copyingOrchestrationJson
                          ? 'Copying this orchestration as JSON'
                          : 'Copy this orchestration as JSON'
                      }
                      title="Copy this orchestration as JSON"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '9px 18px',
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: exportingOrchestrationJson || copyingOrchestrationJson ? 'default' : 'pointer',
                        opacity: exportingOrchestrationJson || copyingOrchestrationJson ? 0.7 : 1,
                      }}
                    >
                      <Copy size={14} aria-hidden="true" />
                      {copyingOrchestrationJson ? 'Copying…' : 'Copy this run as JSON'}
                    </button>
                    <button
                      type="button"
                      disabled={orchestrationHistoryBusy}
                      onClick={() => void handleExportOrchestrationHistoryCsv()}
                      aria-busy={exportingOrchestrationHistory}
                      aria-label={
                        exportingOrchestrationHistory
                          ? 'Exporting orchestration history as CSV'
                          : 'Download orchestration history as CSV'
                      }
                      style={{
                        padding: '9px 18px',
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: orchestrationHistoryBusy ? 'default' : 'pointer',
                        opacity: orchestrationHistoryBusy ? 0.7 : 1,
                      }}
                    >
                      {exportingOrchestrationHistory
                        ? 'Exporting…'
                        : 'Export history as CSV'}
                    </button>
                    <button
                      type="button"
                      disabled={orchestrationHistoryBusy}
                      onClick={() => void handleExportOrchestrationHistoryJson()}
                      aria-busy={exportingOrchestrationHistory}
                      aria-label={
                        exportingOrchestrationHistory
                          ? 'Exporting orchestration history as JSON'
                          : 'Download orchestration history as JSON'
                      }
                      style={{
                        padding: '9px 18px',
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: orchestrationHistoryBusy ? 'default' : 'pointer',
                        opacity: orchestrationHistoryBusy ? 0.7 : 1,
                      }}
                    >
                      {exportingOrchestrationHistory
                        ? 'Exporting…'
                        : 'Export history as JSON'}
                    </button>
                    <button
                      type="button"
                      disabled={orchestrationHistoryBusy}
                      onClick={() => void handleExportOrchestrationHistoryMarkdown()}
                      aria-busy={exportingOrchestrationHistory}
                      aria-label={
                        exportingOrchestrationHistory
                          ? 'Exporting orchestration history as Markdown'
                          : 'Download orchestration history as Markdown'
                      }
                      style={{
                        padding: '9px 18px',
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: orchestrationHistoryBusy ? 'default' : 'pointer',
                        opacity: orchestrationHistoryBusy ? 0.7 : 1,
                      }}
                    >
                      {exportingOrchestrationHistory
                        ? 'Exporting…'
                        : 'Export history as Markdown'}
                    </button>
                    <button
                      type="button"
                      disabled={orchestrationHistoryBusy}
                      onClick={() => void handleCopyOrchestrationHistoryMarkdown()}
                      aria-busy={copyOrchestrationHistoryStatus === 'copying'}
                      aria-label={
                        copyOrchestrationHistoryStatus === 'copying'
                          ? 'Copying orchestration history as Markdown'
                          : copyOrchestrationHistoryStatus === 'copied'
                            ? 'Orchestration history Markdown copied'
                            : copyOrchestrationHistoryStatus === 'failed'
                              ? 'Orchestration history Markdown copy failed'
                              : 'Copy orchestration history as Markdown'
                      }
                      title="Copy orchestration history as Markdown"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '9px 18px',
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: orchestrationHistoryBusy ? 'default' : 'pointer',
                        opacity: orchestrationHistoryBusy ? 0.7 : 1,
                      }}
                    >
                      <Copy size={14} aria-hidden="true" />
                      {copyOrchestrationHistoryStatus === 'copying'
                        ? 'Copying…'
                        : copyOrchestrationHistoryStatus === 'copied'
                          ? 'Copied Markdown'
                          : copyOrchestrationHistoryStatus === 'failed'
                            ? 'Copy failed'
                            : 'Copy history as Markdown'}
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
                        border: '0.5px solid #35382F',
                        borderRadius: 6,
                        background: 'transparent',
                        color: '#6B5040',
                        fontSize: 13,
                        fontFamily: 'var(--vp-font-sans)',
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
                            fontFamily: 'var(--vp-font-sans)',
                            color: '#F3F0E7',
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
                                background: '#F0B84E',
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
                                    color: '#F0B84E',
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
                        color: '#A0A39A',
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
                        <span style={{ fontSize: 13, color: '#F3F0E7', display: 'block' }}>
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
                          fontFamily: 'var(--vp-font-sans)',
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
                          <div style={{ fontSize: 11, color: '#A0A39A', marginBottom: 6 }}>
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
                                fontFamily: 'var(--vp-font-sans)',
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
                          fontFamily: 'var(--vp-font-sans)',
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
                                  color: '#F3F0E7',
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
                                        color: '#F0B84E',
                                        fontSize: 12,
                                        textDecoration: 'underline',
                                        fontFamily: 'var(--vp-font-sans)',
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
                                    color: '#A0A39A',
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
                        <span style={{ color: '#F0B84E', fontSize: 16, lineHeight: 1.2 }}>↺</span>
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
                          <div style={{ fontSize: 12, color: '#A0A39A', marginTop: 2 }}>
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
                              <span style={{ fontSize: 10, color: '#A0A39A' }}>Verified</span>
                              <span style={{ fontSize: 10, color: '#A0A39A' }}>Supported</span>
                              <span style={{ fontSize: 10, color: '#A0A39A' }}>Uncertain</span>
                            </div>
                            {user?.feedback_calibration?.reliable &&
                            user.feedback_calibration.adjustment !== 0 ? (
                              <p
                                style={{
                                  fontSize: 11,
                                  fontStyle: 'italic',
                                  color: '#A0A39A',
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
                                  fontFamily: 'var(--vp-font-sans)',
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
                                      border: '0.5px solid #35382F',
                                      borderRadius: 12,
                                      padding: '4px 10px',
                                      display: 'flex',
                                      gap: 5,
                                      alignItems: 'center',
                                      transition: 'border-color 0.15s ease',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 9,
                                        color: '#A0A39A',
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
                                  color: '#F0B84E',
                                  cursor: 'pointer',
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  fontFamily: 'var(--vp-font-sans)',
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
                            border: '0.5px solid #35382F',
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
                          color: '#F3F0E7',
                          lineHeight: 1.65,
                          marginBottom: 12,
                          paddingLeft: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 32,
                            color: '#35382F',
                            lineHeight: 0,
                            verticalAlign: '-8px',
                            marginRight: 4,
                            fontFamily: 'var(--vp-font-sans)',
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
                          fontFamily: 'var(--vp-font-sans)',
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
                                  color: '#A0A39A',
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
                                      background: '#F0B84E',
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
                                  color: '#A0A39A',
                                  marginBottom: 7,
                                }}
                              >
                                Strongest evidence
                              </div>
                              <div
                                style={{
                                  background: '#F5EFE6',
                                  padding: '8px 12px',
                                  borderLeft: '2px solid #F0B84E',
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
                                  color: '#A0A39A',
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
                          borderTop: '1px solid #30332D',
                          borderBottom: '1px solid #30332D',
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
                            borderBottom: '1px solid #30332D',
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
                        className="agent-hover-surface agent-hover-surface--pad"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '11px 16px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          font: 'inherit',
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
                              border: '0.5px solid #35382F',
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
                        className="agent-hover-surface agent-hover-surface--pad"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '11px 16px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          font: 'inherit',
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
                              border: '0.5px solid #35382F',
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
                        className="agent-hover-surface agent-hover-surface--pad"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '11px 16px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          font: 'inherit',
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
                              border: '0.5px solid #35382F',
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
                      onClick={() => handleCopyAnswer()}
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
                      onClick={() => handleDownloadAnswer()}
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
                        icon={sharingTask ? undefined : <Link2 size={14} aria-hidden />}
                        loading={sharingTask}
                        disabled={sharingTask || revokingTaskShare}
                        title="Publish this report as a public link and copy it"
                        onClick={() => void handleShareTask()}
                      >
                        {sharingTask
                          ? 'Sharing…'
                          : taskShareFeedback === 'copied'
                            ? 'Link copied'
                            : taskShareFeedback === 'failed'
                              ? 'Share failed'
                              : taskShareActive
                                ? 'Copy link'
                                : 'Share report'}
                      </Button>
                    ) : null}
                    {result.task_id && taskShareActive ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={revokingTaskShare ? undefined : <X size={14} aria-hidden />}
                        loading={revokingTaskShare}
                        disabled={revokingTaskShare || sharingTask}
                        title="Stop sharing this public link"
                        onClick={() => void handleRevokeTaskShare()}
                      >
                        {revokingTaskShare ? 'Revoking…' : 'Stop sharing'}
                      </Button>
                    ) : null}
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
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={exportingHtml ? undefined : Icons.download(14)}
                        loading={exportingHtml}
                        disabled={exportingHtml || result.status !== 'complete'}
                        title="Download the full research report as standalone HTML (Shift+H)"
                        aria-keyshortcuts="Shift+H"
                        onClick={handleExportTaskHtml}
                      >
                        {exportingHtml ? 'Exporting…' : 'Report .html'}
                      </Button>
                    ) : null}
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={copyingReportHtml ? undefined : Icons.copy(14)}
                        loading={copyingReportHtml}
                        disabled={copyingReportHtml || result.status !== 'complete'}
                        title="Copy the full research report as rich HTML (Shift+E)"
                        aria-keyshortcuts="Shift+E"
                        onClick={() => void handleCopyTaskHtml()}
                      >
                        {copyingReportHtml
                          ? 'Copying…'
                          : copyReportHtmlFeedback === 'copied'
                            ? 'HTML copied'
                            : copyReportHtmlFeedback === 'failed'
                              ? 'Copy failed'
                              : 'Copy .html'}
                      </Button>
                    ) : null}
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={exportingCsv ? undefined : Icons.download(14)}
                        loading={exportingCsv}
                        disabled={exportingCsv}
                        title="Download the full research report as CSV (Shift+K)"
                        aria-keyshortcuts="Shift+K"
                        onClick={() => void handleExportTaskCsv()}
                      >
                        {exportingCsv ? 'Exporting…' : 'Report .csv'}
                      </Button>
                    ) : null}
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={exportingMd ? undefined : Icons.download(14)}
                        loading={exportingMd}
                        disabled={exportingMd}
                        title="Download the full research report as Markdown (Shift+L)"
                        aria-keyshortcuts="Shift+L"
                        onClick={() => void handleExportTaskMarkdown()}
                      >
                        {exportingMd ? 'Exporting…' : 'Report .md'}
                      </Button>
                    ) : null}
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={copyingReport ? undefined : Icons.copy(14)}
                        loading={copyingReport}
                        disabled={copyingReport}
                        title="Copy the full research report as markdown (Shift+P)"
                        aria-keyshortcuts="Shift+P"
                        onClick={() => void handleCopyTaskMarkdown()}
                      >
                        {copyingReport
                          ? 'Copying…'
                          : copyReportFeedback === 'copied'
                            ? 'Copied!'
                            : copyReportFeedback === 'failed'
                              ? 'Copy failed'
                              : 'Copy report'}
                      </Button>
                    ) : null}
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={copyingReportJson ? undefined : Icons.copy(14)}
                        loading={copyingReportJson}
                        disabled={copyingReportJson}
                        title="Copy the full research report as machine-readable JSON (Shift+O)"
                        aria-keyshortcuts="Shift+O"
                        onClick={() => void handleCopyTaskJson()}
                      >
                        {copyingReportJson
                          ? 'Copying…'
                          : copyReportJsonFeedback === 'copied'
                            ? 'Copied!'
                            : copyReportJsonFeedback === 'failed'
                              ? 'Copy failed'
                              : 'Copy .json'}
                      </Button>
                    ) : null}
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={copyingReportCsv ? undefined : Icons.copy(14)}
                        loading={copyingReportCsv}
                        disabled={copyingReportCsv}
                        title="Copy the full research report as CSV (Shift+I)"
                        aria-keyshortcuts="Shift+I"
                        onClick={() => void handleCopyTaskCsv()}
                      >
                        {copyingReportCsv
                          ? 'Copying…'
                          : copyReportCsvFeedback === 'copied'
                            ? 'Copied!'
                            : copyReportCsvFeedback === 'failed'
                              ? 'Copy failed'
                              : 'Copy .csv'}
                      </Button>
                    ) : null}
                    {result.task_id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={exportingJson ? undefined : Icons.download(14)}
                        loading={exportingJson}
                        disabled={exportingJson}
                        title="Download the full research report as machine-readable JSON"
                        onClick={() => void handleExportTaskJson()}
                      >
                        {exportingJson ? 'Exporting…' : 'Report .json'}
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
                          border: result.is_live ? '0.5px solid #5A8C6A' : '0.5px solid #35382F',
                          borderRadius: 6,
                          background: result.is_live ? '#EAF3DE' : 'transparent',
                          color: result.is_live ? '#3B6D11' : '#6B5040',
                          fontSize: 13,
                          fontFamily: 'var(--vp-font-sans)',
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
                                fontFamily: 'var(--vp-font-sans)',
                                background: selected ? '#F0B84E' : '#F0E8DC',
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
                            border: '0.5px solid #35382F',
                            background: 'transparent',
                            color: '#8C7355',
                            fontSize: 12,
                            fontFamily: 'var(--vp-font-sans)',
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
                      <span style={{ fontSize: 11, color: '#A0A39A' }}>
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
                                      ? '0.5px solid #F0B84E'
                                      : '0.5px solid #35382F',
                                  background: userRating === n ? '#F0B84E' : 'transparent',
                                  color: userRating === n ? '#FAF7F2' : '#8C7355',
                                  fontSize: 12,
                                  cursor: ratingSubmitBusy ? 'default' : 'pointer',
                                  fontFamily: 'var(--vp-font-sans)',
                                }}
                                onMouseEnter={(e) => {
                                  if (userRating === n || ratingSubmitBusy) return;
                                  e.currentTarget.style.borderColor = '#F0B84E';
                                }}
                                onMouseLeave={(e) => {
                                  if (userRating === n) return;
                                  e.currentTarget.style.borderColor = '#35382F';
                                }}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : null}
                      <AgentAccuracyVerdict taskId={result.task_id} />
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
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#F3F0E7', marginBottom: 8 }}>
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
                                <strong style={{ color: '#F3F0E7' }}>
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
                                    background: '#F0B84E',
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
                              color: '#F0B84E',
                              fontFamily: 'var(--vp-font-sans)',
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
                              background: '#F3F0E7',
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
                                color: '#F0B84E',
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
                                color: '#A0A39A',
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
                                      border: '0.5px solid #35382F',
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
                                  color: '#A0A39A',
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
                                  color: '#A0A39A',
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
                          border: '0.5px solid #35382F',
                          background: 'transparent',
                          color: '#6B5040',
                          fontSize: 13,
                          fontFamily: 'var(--vp-font-sans)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
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
                              border: '0.5px solid #35382F',
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
                                fontFamily: 'var(--vp-font-sans)',
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
                                background: followUp.trim() ? AR.GOLD : '#30332D',
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
                                      : '#A0A39A',
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
                          border: '0.5px solid #35382F',
                          borderRadius: 20,
                          background: 'transparent',
                          color: '#6B5040',
                          fontSize: 13,
                          fontFamily: 'var(--vp-font-sans)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
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
                              fontFamily: 'var(--vp-font-sans)',
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
                      style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#A0A39A' }}
                    >
                      <span className="agent-chal-dot" style={{ background: '#5ED8FF', animationDelay: '0ms' }} />
                      <span className="agent-chal-dot" style={{ background: '#A98CF8', animationDelay: '0.15s' }} />
                      <span className="agent-chal-dot" style={{ background: '#FF6652', animationDelay: '0.3s' }} />
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
                            accent: '#F0B84E',
                            dot: '#F0B84E',
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
                                    color: '#A0A39A',
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
                                  color: '#F0B84E',
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
                                    color: '#A0A39A',
                                  }}
                                >
                                  <span className="agent-chal-dot" style={{ background: '#F0B84E' }} />
                                  <span className="agent-chal-dot" style={{ background: '#F0B84E', animationDelay: '0.15s' }} />
                                  <span className="agent-chal-dot" style={{ background: '#F0B84E', animationDelay: '0.3s' }} />
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
                                        background: '#F0B84E',
                                        flexShrink: 0,
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontSize: 11,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                        color: '#F0B84E',
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
                              fontFamily: 'var(--vp-font-sans)',
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
                        <p style={{ fontSize: 11, color: '#A0A39A', marginTop: 8, marginBottom: 0 }}>
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
                            color: '#F0B84E',
                            cursor: 'pointer',
                            fontFamily: 'var(--vp-font-sans)',
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
                                  fontFamily: 'var(--vp-font-sans)',
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
                                  fontFamily: 'var(--vp-font-sans)',
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
                                  fontFamily: 'var(--vp-font-sans)',
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
                                fontFamily: 'var(--vp-font-sans)',
                                border: '0.5px solid #35382F',
                                borderRadius: 6,
                                padding: '8px 12px',
                                width: '100%',
                                boxSizing: 'border-box',
                                marginTop: 8,
                                outline: 'none',
                                background: '#fff',
                              }}
                              onFocus={(e) => {
                                e.currentTarget.style.borderColor = '#F0B84E';
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.borderColor = '#35382F';
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
                                background: '#F0B84E',
                                color: '#FDFAF6',
                                fontSize: 12,
                                fontFamily: 'var(--vp-font-sans)',
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
                                fontFamily: 'var(--vp-font-sans)',
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
                    color: '#F3F0E7',
                    fontFamily: 'var(--vp-font-sans)',
                  }}
                >
                  Create a research room
                </h2>
                <p style={{ fontSize: 12, color: '#A0A39A', fontStyle: 'italic', margin: '8px 0 0', lineHeight: 1.5 }}>
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
                    color: '#A0A39A',
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
                    border: roomNameError ? '0.5px solid #D85A30' : '0.5px solid #35382F',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#F3F0E7',
                    fontFamily: 'var(--vp-font-sans)',
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
                      background: '#F3F0E7',
                      color: '#F0B84E',
                      borderRadius: 20,
                      padding: '9px 20px',
                      fontSize: 13,
                      fontFamily: 'var(--vp-font-sans)',
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
                      border: '0.5px solid #35382F',
                      color: '#8C7355',
                      borderRadius: 20,
                      padding: '9px 20px',
                      fontSize: 13,
                      fontFamily: 'var(--vp-font-sans)',
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
                    border: '0.5px solid #35382F',
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
                                : '#F0B84E',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontFamily: 'var(--vp-font-sans)',
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
                        color: copyRoomLinkFeedback === 'failed' ? '#D85A30' : '#F0B84E',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontFamily: 'var(--vp-font-sans)',
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
                      background: '#F3F0E7',
                      color: '#F0B84E',
                      border: 'none',
                      borderRadius: 20,
                      padding: '9px 18px',
                      fontSize: 13,
                      fontFamily: 'var(--vp-font-sans)',
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
                      fontFamily: 'var(--vp-font-sans)',
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
