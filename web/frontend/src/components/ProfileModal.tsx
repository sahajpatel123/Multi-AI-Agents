import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import '../styles/profile-modal.css';
import {
  ApiError,
  cancelAgentAddon,
  cancelSubscription,
  deleteMcpIntegration,
  exportAgentFeedbackCsv,
  exportAgentFeedbackJson,
  exportAgentFeedbackMarkdown,
  exportAgentFeedbackSummaryCsv,
  exportAgentFeedbackSummaryJson,
  exportAgentFeedbackSummaryMarkdown,
  exportCalibrationHistoryCsv,
  exportCalibrationHistoryJson,
  exportCalibrationHistoryMarkdown,
  exportAnalyticsActivityJson,
  exportAnalyticsActivityCsv,
  exportAnalyticsActivityMarkdown,
  exportAnalyticsCategoryStatsCsv,
  exportAnalyticsCategoryStatsJson,
  exportAnalyticsCategoryStatsMarkdown,
  exportAnalyticsPersonaStatsByCategoryCsv,
  exportAnalyticsPersonaStatsByCategoryMarkdown,
  exportAnalyticsPersonaStatsOverviewCsv,
  exportAnalyticsPersonaStatsOverviewJson,
  exportAnalyticsPersonaStatsOverviewMarkdown,
  exportAnalyticsPersonaStatsTimelineCsv,
  exportAnalyticsPersonaStatsTimelineJson,
  exportAnalyticsPersonaStatsTimelineMarkdown,
  exportAnalyticsPersonaWinRateCsv,
  exportAnalyticsPersonaWinRateTrendCsv,
  exportAnalyticsPersonaWinRateTrendJson,
  exportAnalyticsPersonaWinRateTrendMarkdown,
  exportAnalyticsPersonaWinRateJson,
  exportAnalyticsPersonaWinRateMarkdown,
  exportAnalyticsSummaryCsv,
  exportAnalyticsSummaryJson,
  exportAnalyticsSummaryMarkdown,
  exportUserUsageCsv,
  exportUserUsageJson,
  exportUserUsageMarkdown,
  getAnalyticsActivity,
  getAnalyticsCategoryStats,
  getAnalyticsPersonaWinRate,
  getAnalyticsPersonaStatsTimeline,
  getAgentFeedbackSummary,
  getCapabilityUsage,
  getAgentCapabilities,
  getCapabilityDoc,
  getCapabilityExamples,
  getCapabilityStats,
  getAccountSecurity,
  getAgentTaskDetail,
  searchMcpIntegration,
  deleteCalibrationRating,
  getCalibrationHistory,
  getCalibrationStats,
  getMcpIntegrations,
  getRecentAgentFeedback,
  getSubscriptionStatus,
  getUserAnswerFeedbackStats,
  getUserUsage,
  patchUserProfile,
  postMcpManualConnect,
  reactivateAgentAddon,
  type AnalyticsActivityResponse,
  type AnalyticsCategoryStatsResponse,
  type AnalyticsPersonaWinRateResponse,
  type AnalyticsPersonaWinRateTrendPoint,
  type AnalyticsPersonaStatsTimelineResponse,
  type AgentFeedbackSummary,
  type AgentFeedbackExportDateRange,
  type AgentFeedbackVerdict,
  type AnswerFeedbackStats,
  type AgentCapability,
  type CapabilityDoc,
  type CapabilityUsageSummary,
  type CapabilityStat,
  type McpSearchResult,
  type AccountSecurity,
  type AgentTaskDetailPayload,
  type CalibrationHistoryRating,
  type CalibrationHistoryResponse,
  type CalibrationHistorySort,
  type RecentFeedbackItem,
  type SubscriptionStatusResponse,
  type UserUsageResponse,
} from '../api';
import { downloadBlobFile } from '../lib/downloadTextFile';
import {
  copyCsvToClipboard,
  copyJsonToClipboard,
  copyMarkdownToClipboard,
  copyToClipboard,
} from '../lib/clipboard';
import { useTier } from '../context/TierContext';
import { useProfileModal } from '../context/ProfileModalContext';
import { safeLocalStorage } from '../lib/safeStorage';
import { useAuth } from '../hooks/useAuth';
import { Button } from './Button';
import { getBrandIcon, PlugIcon } from './BrandIcons';
import { Icons } from './Icons';
import { SERVICES } from './integrationServices';
import MicroLoader from './MicroLoader';
import { RazorpayCheckout } from './RazorpayCheckout';
import { ExpertiseSelector } from './ExpertiseSelector';
import { formatRelativePast } from '../lib/relativeTime';
import {
  domainForExpertiseLevel,
  normalizeExpertiseLevel,
} from '../lib/expertiseSelector';
import {
  PROFILE_NAME_MAX,
  profileSaveCaughtErrorMessage,
  profileSaveIssueMessage,
  validateProfileName,
} from '../lib/profileSave';
import { motionDuration } from '../lib/motion';

function profileInitials(name: string | undefined, email: string): string {
  const n = (name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  const local = email.split('@')[0] || 'A';
  return local.slice(0, 2).toUpperCase();
}

function formatInrPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

function formatRelativeConnected(iso: string | null): string {
  return formatRelativePast(iso, { fallback: 'recently', localeAfterDays: 14 });
}

function formatCalibrationDate(iso: string | null): string {
  if (!iso) return 'Unknown date';
  return iso.slice(0, 10);
}

// Heartbeats are authored in seconds but read in human units — the
// stats endpoint's own docstring imagines the UI showing "10m".
function formatHeartbeat(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return `${seconds}s`;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

// Security facts read as prose ("Member since …"), so they get the same
// human date form as the billing rows; unparseable input falls back to
// whatever the server said rather than "Invalid Date".
function formatSecurityDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

const CALIBRATION_HISTORY_SORT_LABELS: Record<CalibrationHistorySort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  delta_desc: 'Underestimates first',
  delta_asc: 'Overestimates first',
};

// Capability docs arrive as markdown. Rather than show literal
// asterisks in a <pre>, these two render the subset the registry
// actually uses — headings, bullets, bold, italics, code spans —
// with no external dependency.
const CAP_DOC_INLINE_PATTERN = /\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*/g;

function renderCapabilityDocInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CAP_DOC_INLINE_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    if (token.startsWith('**')) {
      out.push(
        <strong key={start} style={{ color: '#F3F0E7' }}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      out.push(
        <code
          key={start}
          style={{
            background: '#EDE4D8',
            borderRadius: 3,
            padding: '0 4px',
            fontFamily: 'var(--vp-font-mono, monospace)',
            fontSize: 10,
            color: '#F3F0E7',
          }}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(<em key={start}>{token.slice(1, -1)}</em>);
    }
    last = start + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function CapabilityDocBody({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let listCount = 0;
  const flushList = () => {
    if (!listBuffer.length) return;
    const items = listBuffer;
    listBuffer = [];
    listCount += 1;
    blocks.push(
      <ul key={`list-${listCount}`} style={{ margin: '4px 0 6px', paddingLeft: 18 }}>
        {items.map((item, index) => (
          <li
            key={index}
            style={{ fontSize: 11, lineHeight: 1.55, color: '#C4A882', marginBottom: 2 }}
          >
            {renderCapabilityDocInline(item)}
          </li>
        ))}
      </ul>,
    );
  };
  markdown.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2));
      return;
    }
    flushList();
    if (line.trim() === '') return;
    if (line.startsWith('#')) {
      blocks.push(
        <div
          key={index}
          style={{
            fontSize: 12,
            color: '#F3F0E7',
            fontWeight: 600,
            margin: '8px 0 3px',
          }}
        >
          {renderCapabilityDocInline(line.replace(/^#+\s*/, ''))}
        </div>,
      );
      return;
    }
    blocks.push(
      <p key={index} style={{ margin: '0 0 6px', fontSize: 11, lineHeight: 1.55, color: '#C4A882' }}>
        {renderCapabilityDocInline(line)}
      </p>,
    );
  });
  flushList();
  return <>{blocks}</>;
}

function CalibrationHistoryPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const safeTotalPages = Math.max(1, totalPages);
  const isFirstPage = page <= 1;
  const isLastPage = page >= safeTotalPages;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: 10,
      }}
    >
      <span style={{ fontSize: 10, color: '#A0A39A' }}>
        Page {page} of {safeTotalPages}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          aria-label="Previous calibration history page"
          disabled={isFirstPage}
          onClick={onPrevious}
          style={{
            padding: '4px 8px',
            border: '0.5px solid #E0D5C5',
            borderRadius: 5,
            background: '#F0E8DC',
            color: '#4A3728',
            cursor: isFirstPage ? 'not-allowed' : 'pointer',
            opacity: isFirstPage ? 0.5 : 1,
          }}
        >
          Previous
        </button>
        <button
          type="button"
          aria-label="Next calibration history page"
          disabled={isLastPage}
          onClick={onNext}
          style={{
            padding: '4px 8px',
            border: '0.5px solid #E0D5C5',
            borderRadius: 5,
            background: '#F0E8DC',
            color: '#4A3728',
            cursor: isLastPage ? 'not-allowed' : 'pointer',
            opacity: isLastPage ? 0.5 : 1,
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function TabIconAccount({ active }: { active: boolean }) {
  const c = active ? '#F0B84E' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12a5 5 0 100-10 5 5 0 000 10zM3 20a9 9 0 0118 0v1H3v-1z"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabIconPlan({ active }: { active: boolean }) {
  const c = active ? '#F0B84E' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 11l2 2 4-4m-9 9h12a2 2 0 002-2V7a2 2 0 00-2-2H9l-4 4v8a2 2 0 002 2z"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabIconUsage({ active }: { active: boolean }) {
  const c = active ? '#F0B84E' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 16l4-4 4 4 8-8M4 20h16"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabIconIntegrations({ active }: { active: boolean }) {
  const c = active ? '#F0B84E' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22v-5M9 8a3 3 0 116 0c0 2-3 3-3 3M12 17h.01"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 12H5a2 2 0 01-2-2V5a2 2 0 012-2h3m8 9h3a2 2 0 002-2V5a2 2 0 00-2-2h-3"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabIconHelp({ active }: { active: boolean }) {
  const c = active ? '#F0B84E' : 'currentColor';
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 18h.01M12 14a4 4 0 10-4-4 2 2 0 014 2c0 2-4 2-4 4"
        stroke={c}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PLACEHOLDER_HISTORY = [8, 14, 11, 19, 15, 22, 17, 12, 25, 18, 14, 21, 10, 28];
const SUMMARY_EXPORT_WINDOWS = [7, 30, 90, 365] as const;
const USAGE_EXPORT_WINDOWS = [7, 14, 30, 90, 365] as const;
const PERSONA_STATS_OVERVIEW_WINDOWS = [7, 30, 90, 365] as const;
const PERSONA_WIN_RATE_WINDOWS = [7, 30, 90] as const;
const PERSONA_WIN_RATE_MIN_APPEARANCES = [1, 3, 5, 10] as const;
type PersonaWinRateSort = 'win_rate' | 'appearances' | 'wins' | 'name';
const PERSONA_WIN_RATE_SORT_LABELS: Record<PersonaWinRateSort, string> = {
  win_rate: 'Win rate',
  appearances: 'Appearances',
  wins: 'Wins',
  name: 'Name',
};
const ACTIVITY_HIGHLIGHT_WINDOWS = [7, 30, 90] as const;
const FEEDBACK_ACTIVITY_WINDOWS = [7, 30, 90] as const;
type PersonaTimelineExportFormat = 'csv' | 'json' | 'markdown';
type PersonaTimelineAction = PersonaTimelineExportFormat | 'copy' | 'copy-csv' | 'copy-json';

function sortPersonaWinRateRows(
  rows: AnalyticsPersonaWinRateResponse['personas'],
  sort: PersonaWinRateSort,
): AnalyticsPersonaWinRateResponse['personas'] {
  return [...rows].sort((a, b) => {
    if (sort === 'name') {
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
        a.persona_id.localeCompare(b.persona_id);
    }

    const primary = sort === 'win_rate'
      ? b.win_rate - a.win_rate
      : sort === 'appearances'
        ? b.appearances - a.appearances
        : b.wins - a.wins;
    return primary || b.win_rate - a.win_rate || b.appearances - a.appearances ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.persona_id.localeCompare(b.persona_id);
  });
}

function formatCategoryPersona(personaId: string): string {
  return personaId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function UsageChart({
  data,
  isPlaceholder,
}: {
  data: number[];
  isPlaceholder: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 300);
    const h = 90;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const values = data.length >= 14 ? data.slice(-14) : [...data];
    while (values.length < 14) values.unshift(0);
    const slice = values.slice(-14);
    const max = Math.max(...slice, 1);
    const gap = 4;
    const barW = (w - 2 - gap * 13) / 14;
    let x = 1;
    slice.forEach((v, i) => {
      const bh = Math.max(2, (v / max) * (h - 8));
      const y = h - 4 - bh;
      ctx.fillStyle = isPlaceholder ? '#30332D' : i === 13 ? '#F0B84E' : '#30332D';
      const r = 2;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, r);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barW, bh);
      }
      x += barW + gap;
    });
  }, [data, isPlaceholder]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: 90, display: 'block' }} />;
}

function WinRateTrendSparkline({
  trend,
  personaName,
  color,
  omittedAppearances = 0,
}: {
  trend: AnalyticsPersonaWinRateTrendPoint[];
  personaName: string;
  color: string;
  omittedAppearances?: number;
}) {
  const width = 72;
  const height = 20;
  const padding = 2;
  const omittedLabel =
    omittedAppearances > 0
      ? `, ${omittedAppearances} older appearance${omittedAppearances === 1 ? '' : 's'} not plotted`
      : '';
  const omittedBadge =
    omittedAppearances > 0 ? (
      <span
        style={{ color: '#A0A39A', fontSize: 10, whiteSpace: 'nowrap' }}
        title={`${omittedAppearances} older appearance${omittedAppearances === 1 ? '' : 's'} not plotted`}
      >
        +{omittedAppearances} older
      </span>
    ) : null;

  const points = trend.map((point, index) => ({
    index,
    x:
      trend.length > 1
        ? (index / (trend.length - 1)) * (width - padding * 2) + padding
        : width / 2,
    y:
      point.win_rate === null
        ? null
        : height - padding - point.win_rate * (height - padding * 2),
  }));

  if (!points.some((p) => p.y !== null)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#A0A39A', fontSize: 10, fontFamily: 'var(--vp-font-sans)' }}>
          no data
        </span>
        {omittedBadge}
      </span>
    );
  }

  // Gaps are real: split the polyline into consecutive non-null runs so an
  // absent week renders as a break, not as a drawn 0% dip.
  const runs: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  const plotted: { index: number; x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    } else {
      current.push({ x: p.x, y: p.y });
      plotted.push({ index: p.index, x: p.x, y: p.y });
    }
  }
  if (current.length > 0) runs.push(current);

  // Only accept hex colors from the API; anything else falls back to the
  // accent so a bad metadata value can never distort the chart.
  const stroke = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#F0B84E';
  const label = trend
    .map((p) => (p.win_rate === null ? 'no data' : `${Math.round(p.win_rate * 100)}%`))
    .join(', ');

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${personaName} win rate trend over the last ${trend.length} weeks: ${label}${omittedLabel}`}
      >
        <title>{`${personaName} — weekly win rate: ${label}${omittedLabel}`}</title>
        {runs.map((run, i) => (
          <polyline
            key={i}
            points={run.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {plotted.map((p) => (
          <circle key={p.index} cx={p.x} cy={p.y} r={1.5} fill={stroke} />
        ))}
      </svg>
      {omittedBadge}
    </span>
  );
}

function PersonaActivityTimeline({
  timeline,
  color,
  activeAction,
  onExport,
  onCopyMarkdown,
  onCopyCsv,
  onCopyJson,
}: {
  timeline: AnalyticsPersonaStatsTimelineResponse;
  color: string;
  activeAction: PersonaTimelineAction | null;
  onExport: (format: PersonaTimelineExportFormat) => void;
  onCopyMarkdown: () => void;
  onCopyCsv: () => void;
  onCopyJson: () => void;
}) {
  const isBusy = activeAction !== null;
  const maxAppearances = Math.max(
    ...timeline.timeline.map((point) => point.appearances),
    1,
  );
  const barColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#F0B84E';

  return (
    <div
      role="region"
      aria-label={`${timeline.name} daily activity timeline`}
      style={{
        padding: '10px 0 4px',
        color: '#A0A39A',
        fontFamily: 'var(--vp-font-sans)',
      }}
    >
      <div
        role="list"
        aria-label={`${timeline.name} activity by day`}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 2,
          height: 48,
        }}
      >
        {timeline.timeline.map((point) => {
          const appearanceHeight = point.appearances > 0
            ? Math.max(8, (point.appearances / maxAppearances) * 100)
            : 2;
          const winHeight = point.wins > 0
            ? Math.max(5, (point.wins / maxAppearances) * 100)
            : 0;
          const label = `${point.date}: ${point.wins} win${point.wins === 1 ? '' : 's'}, ${point.appearances} appearance${point.appearances === 1 ? '' : 's'} (${Math.round(point.win_rate * 100)}%)`;
          return (
            <span
              key={point.date}
              role="listitem"
              aria-label={label}
              title={label}
              style={{
                position: 'relative',
                flex: 1,
                minWidth: 2,
                borderRadius: 2,
                background: '#EDE4D8',
                overflow: 'hidden',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  left: 0,
                  height: `${appearanceHeight}%`,
                  background: '#A0A39A',
                  opacity: 0.45,
                }}
              />
              {winHeight > 0 ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    left: 0,
                    height: `${winHeight}%`,
                    background: barColor,
                  }}
                />
              ) : null}
            </span>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 7,
          fontSize: 11,
        }}
      >
        <span>
          {timeline.total_wins} win{timeline.total_wins === 1 ? '' : 's'} / {timeline.total_appearances} appearance{timeline.total_appearances === 1 ? '' : 's'} in {timeline.days} days
        </span>
        <span>
          {timeline.best_day
            ? `Peak ${timeline.best_day}: ${timeline.best_day_wins}/${timeline.best_day_appearances}`
            : 'No winning day yet'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10 }}>
        <span>{timeline.window_start}</span>
        <span>today · {timeline.window_end}</span>
      </div>
      <span
        role="note"
        style={{
          display: 'block',
          marginTop: 8,
          color: '#8C7355',
          fontSize: 10,
          lineHeight: 1.35,
        }}
      >
        Wins exclude fallback scorings; appearances include every panel appearance.
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
        <button
          type="button"
          aria-label={`Download ${timeline.name} daily timeline CSV`}
          aria-busy={activeAction === 'csv'}
          disabled={isBusy}
          onClick={() => onExport('csv')}
          style={{
            padding: '4px 8px',
            border: '0.5px solid #E0D5C5',
            borderRadius: 5,
            background: isBusy ? '#EDE4D8' : '#F0E8DC',
            color: '#4A3728',
            fontSize: 10,
            cursor: isBusy ? 'wait' : 'pointer',
            fontFamily: 'var(--vp-font-sans)',
          }}
        >
          {activeAction === 'csv' ? '⏳ Downloading…' : 'Download CSV'}
        </button>
        <button
          type="button"
          aria-label={`Download ${timeline.name} daily timeline JSON`}
          aria-busy={activeAction === 'json'}
          disabled={isBusy}
          onClick={() => onExport('json')}
          style={{
            padding: '4px 8px',
            border: '0.5px solid #E0D5C5',
            borderRadius: 5,
            background: isBusy ? '#EDE4D8' : '#F0E8DC',
            color: '#4A3728',
            fontSize: 10,
            cursor: isBusy ? 'wait' : 'pointer',
            fontFamily: 'var(--vp-font-sans)',
          }}
        >
          {activeAction === 'json' ? '⏳ Downloading…' : 'Download JSON'}
        </button>
        <button
          type="button"
          aria-label={`Download ${timeline.name} daily timeline Markdown`}
          aria-busy={activeAction === 'markdown'}
          disabled={isBusy}
          onClick={() => onExport('markdown')}
          style={{
            padding: '4px 8px',
            border: '0.5px solid #E0D5C5',
            borderRadius: 5,
            background: isBusy ? '#EDE4D8' : '#F0E8DC',
            color: '#4A3728',
            fontSize: 10,
            cursor: isBusy ? 'wait' : 'pointer',
            fontFamily: 'var(--vp-font-sans)',
          }}
        >
          {activeAction === 'markdown' ? '⏳ Downloading…' : 'Download Markdown'}
        </button>
        <button
          type="button"
          aria-label={`Copy ${timeline.name} daily timeline Markdown`}
          aria-busy={activeAction === 'copy'}
          disabled={isBusy}
          onClick={onCopyMarkdown}
          style={{
            padding: '4px 8px',
            border: '0.5px solid #E0D5C5',
            borderRadius: 5,
            background: isBusy ? '#EDE4D8' : '#F0E8DC',
            color: '#4A3728',
            fontSize: 10,
            cursor: isBusy ? 'wait' : 'pointer',
            fontFamily: 'var(--vp-font-sans)',
          }}
        >
          {activeAction === 'copy' ? '⏳ Copying…' : 'Copy Markdown'}
        </button>
        <button
          type="button"
          aria-label={`Copy ${timeline.name} daily timeline CSV`}
          aria-busy={activeAction === 'copy-csv'}
          disabled={isBusy}
          onClick={onCopyCsv}
          style={{
            padding: '4px 8px',
            border: '0.5px solid #E0D5C5',
            borderRadius: 5,
            background: isBusy ? '#EDE4D8' : '#F0E8DC',
            color: '#4A3728',
            fontSize: 10,
            cursor: isBusy ? 'wait' : 'pointer',
            fontFamily: 'var(--vp-font-sans)',
          }}
        >
          {activeAction === 'copy-csv' ? '⏳ Copying…' : 'Copy CSV'}
        </button>
        <button
          type="button"
          aria-label={`Copy ${timeline.name} daily timeline JSON`}
          aria-busy={activeAction === 'copy-json'}
          disabled={isBusy}
          onClick={onCopyJson}
          style={{
            padding: '4px 8px',
            border: '0.5px solid #E0D5C5',
            borderRadius: 5,
            background: isBusy ? '#EDE4D8' : '#F0E8DC',
            color: '#4A3728',
            fontSize: 10,
            cursor: isBusy ? 'wait' : 'pointer',
            fontFamily: 'var(--vp-font-sans)',
          }}
        >
          {activeAction === 'copy-json' ? '⏳ Copying…' : 'Copy JSON'}
        </button>
        <span style={{ fontSize: 10, color: '#A0A39A' }}>
          Save daily rows in notes, docs, or analysis tools — copy JSON for scripts, CSV into a spreadsheet, or the report into a Markdown editor.
        </span>
      </div>
    </div>
  );
}

function FeedbackActivityTrend({
  summary,
}: {
  summary: AgentFeedbackSummary;
}) {
  const width = 240;
  const height = 56;
  const trend = summary.daily_trend;
  const maxCount = Math.max(...trend.map((point) => point.count), 1);
  const activeDays = trend.filter((point) => point.count > 0).length;
  const windowTotal = trend.reduce((total, point) => total + point.count, 0);
  const peakCount = Math.max(...trend.map((point) => point.count), 0);
  const windowVerdicts = trend.reduce(
    (totals, point) => ({
      correct: totals.correct + point.verdicts.correct,
      partial: totals.partial + point.verdicts.partial,
      wrong: totals.wrong + point.verdicts.wrong,
    }),
    { correct: 0, partial: 0, wrong: 0 },
  );
  const knownVerdictTotal =
    windowVerdicts.correct + windowVerdicts.partial + windowVerdicts.wrong;
  const otherTotal = Math.max(windowTotal - knownVerdictTotal, 0);
  const otherLabel = otherTotal > 0 ? `, ${otherTotal} other` : '';
  const slotWidth = width / Math.max(trend.length, 1);
  const barWidth = Math.max(1, slotWidth - (trend.length >= 30 ? 0.8 : 2));
  const ariaLabel =
    `Feedback activity over the last ${summary.window_days} days: ` +
    `${windowTotal} rating${windowTotal === 1 ? '' : 's'} across ${activeDays} active day${activeDays === 1 ? '' : 's'}; ` +
    `peak ${peakCount} in one day; ${windowVerdicts.correct} correct, ` +
    `${windowVerdicts.partial} partial, ${windowVerdicts.wrong} wrong${otherLabel}.`;

  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <title>{ariaLabel}</title>
        <line x1="0" y1={height - 3} x2={width} y2={height - 3} stroke="#E0D5C5" strokeWidth="1" />
        {trend.map((point, index) => {
          const barHeight = point.count > 0
            ? Math.max(3, (point.count / maxCount) * (height - 10))
            : 1;
          const pointVerdictTotal =
            point.verdicts.correct + point.verdicts.partial + point.verdicts.wrong;
          const pointOther = Math.max(point.count - pointVerdictTotal, 0);
          const segments = [
            { key: 'correct', count: point.verdicts.correct, color: '#639922' },
            { key: 'partial', count: point.verdicts.partial, color: '#BA7517' },
            { key: 'wrong', count: point.verdicts.wrong, color: '#C0392B' },
            { key: 'other', count: pointOther, color: '#A0A39A' },
          ].filter((segment) => segment.count > 0);
          let renderedHeight = 0;
          return (
            <g key={point.date}>
              <title>
                {`${point.date}: ${point.count} rating${point.count === 1 ? '' : 's'}; ` +
                  `${point.verdicts.correct} correct, ${point.verdicts.partial} partial, ` +
                  `${point.verdicts.wrong} wrong${pointOther > 0 ? `, ${pointOther} other` : ''}.`}
              </title>
              <rect
                x={index * slotWidth + (slotWidth - barWidth) / 2}
                y={height - 3 - barHeight}
                width={barWidth}
                height={barHeight}
                rx={Math.min(1.5, barWidth / 2)}
                fill="#8C7355"
                opacity={point.count > 0 ? 0.12 : 0.28}
              />
              {segments.map((segment) => {
                const segmentHeight = (segment.count / point.count) * barHeight;
                const segmentY = height - 3 - renderedHeight - segmentHeight;
                renderedHeight += segmentHeight;
                return (
                  <rect
                    key={`${point.date}-${segment.key}`}
                    x={index * slotWidth + (slotWidth - barWidth) / 2}
                    y={segmentY}
                    width={barWidth}
                    height={segmentHeight}
                    rx={Math.min(1.5, barWidth / 2)}
                    fill={segment.color}
                    opacity={index === trend.length - 1 ? 1 : 0.9}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div
        role="list"
        aria-label="Feedback activity verdict breakdown"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '5px 10px',
          marginTop: 7,
          color: '#A0A39A',
          fontSize: 10,
        }}
      >
        {[
          { label: 'Correct', count: windowVerdicts.correct, color: '#639922' },
          { label: 'Partial', count: windowVerdicts.partial, color: '#BA7517' },
          { label: 'Wrong', count: windowVerdicts.wrong, color: '#C0392B' },
          ...(otherTotal > 0 ? [{ label: 'Other', count: otherTotal, color: '#A0A39A' }] : []),
        ].map((item) => (
          <span
            key={item.label}
            role="listitem"
            aria-label={`${item.label}: ${item.count}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <span
              aria-hidden="true"
              style={{ width: 6, height: 6, borderRadius: 2, background: item.color }}
            />
            {item.label} {item.count}
          </span>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 6,
          color: '#A0A39A',
          fontSize: 11,
        }}
      >
        <span>{windowTotal} in window</span>
        <span>{activeDays} active day{activeDays === 1 ? '' : 's'}</span>
        <span>Peak {peakCount}/day</span>
      </div>
    </div>
  );
}

function planFeatures(tier: string): string[] {
  const t = tier.toUpperCase();
  if (t === 'PRO') {
    return [
      '16 personas',
      '300K credits / day',
      'Agent Mode + pipeline',
      'Priority routing',
      'Full pipeline access',
      'Revision trace',
    ];
  }
  if (t === 'PLUS') {
    return ['16 personas', '100K credits / day', 'Arena + Debate Mode', 'Task memory'];
  }
  return ['6 personas', '25K credits / day', 'Arena Mode only', 'No memory'];
}

export function ProfileModal() {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const { refreshTier } = useTier();
  const { isOpen, closing, origin, activeTab, setActiveTab, closeModal } = useProfileModal();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  const [fullName, setFullName] = useState('');
  const [expertiseLevel, setExpertiseLevel] = useState('curious');
  const [expertiseDomain, setExpertiseDomain] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorRef = useRef<HTMLParagraphElement | null>(null);
  const saveOkTimerRef = useRef<number | null>(null);

  const [usage, setUsage] = useState<UserUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageErr, setUsageErr] = useState<string | null>(null);
  const [activity, setActivity] = useState<AnalyticsActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityErr, setActivityErr] = useState<string | null>(null);
  const [activityReload, setActivityReload] = useState(0);
  const [activityWindowDays, setActivityWindowDays] = useState(30);
  const [categoryStats, setCategoryStats] = useState<AnalyticsCategoryStatsResponse | null>(null);
  const [categoryStatsLoading, setCategoryStatsLoading] = useState(false);
  const [categoryStatsErr, setCategoryStatsErr] = useState<string | null>(null);
  const [categoryStatsReload, setCategoryStatsReload] = useState(0);
  const [summaryExportWindowDays, setSummaryExportWindowDays] = useState(30);
  const [usageExportWindowDays, setUsageExportWindowDays] = useState(14);
  const [overviewWindowDays, setOverviewWindowDays] = useState(30);
  const [winRate, setWinRate] = useState<AnalyticsPersonaWinRateResponse | null>(null);
  const [winRateLoading, setWinRateLoading] = useState(false);
  const [winRateErr, setWinRateErr] = useState<string | null>(null);
  const [winRateReload, setWinRateReload] = useState(0);
  const [winRateWindowDays, setWinRateWindowDays] = useState(30);
  const [winRateMinAppearances, setWinRateMinAppearances] = useState(1);
  const [winRateIncludeFallback, setWinRateIncludeFallback] = useState(false);
  const [winRateSort, setWinRateSort] = useState<PersonaWinRateSort>('win_rate');
  const [personaTimelinePersonaId, setPersonaTimelinePersonaId] = useState<string | null>(null);
  const [personaTimeline, setPersonaTimeline] = useState<AnalyticsPersonaStatsTimelineResponse | null>(null);
  const [personaTimelineLoading, setPersonaTimelineLoading] = useState(false);
  const [personaTimelineErr, setPersonaTimelineErr] = useState<string | null>(null);
  const [personaTimelineReload, setPersonaTimelineReload] = useState(0);
  const [calStats, setCalStats] = useState<{
    total_ratings?: number;
    avg_delta?: number;
    trend?: string;
    calibration_score?: number;
    recent_ratings?: Array<{ delta?: number; created_at?: string }>;
  } | null>(null);
  const [activeExport, setActiveExport] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const personaTimelineCopyCsvRunRef = useRef(0);
  const personaTimelineCopyJsonRunRef = useRef(0);
  const personaTimelineCopyJsonInFlightRef = useRef(false);
  const clearExportFeedback = useCallback(() => {
    setExportError(null);
    setExportNotice(null);
  }, []);
  const invalidatePersonaTimelineCopyRuns = useCallback(() => {
    personaTimelineCopyCsvRunRef.current += 1;
    personaTimelineCopyJsonRunRef.current += 1;
    personaTimelineCopyJsonInFlightRef.current = false;
    setActiveExport((current) => (
      current?.startsWith('persona-timeline-') &&
      (current.endsWith('-copy-csv') || current.endsWith('-copy-json'))
        ? null
        : current
    ));
  }, []);
  const togglePersonaTimeline = useCallback((personaId: string) => {
    invalidatePersonaTimelineCopyRuns();
    const closing = personaTimelinePersonaId === personaId;
    setPersonaTimelinePersonaId(closing ? null : personaId);
    setPersonaTimeline(null);
    setPersonaTimelineErr(null);
    setPersonaTimelineLoading(!closing);
  }, [invalidatePersonaTimelineCopyRuns, personaTimelinePersonaId]);
  const handlePersonaTimelineExport = useCallback(async (
    timeline: AnalyticsPersonaStatsTimelineResponse,
    format: PersonaTimelineExportFormat,
  ) => {
    const exportKey = `persona-timeline-${timeline.persona_id}-${format}`;
    const formatLabel = format === 'markdown' ? 'MARKDOWN' : format.toUpperCase();
    setActiveExport(exportKey);
    clearExportFeedback();
    try {
      const exportData = format === 'json'
        ? await exportAnalyticsPersonaStatsTimelineJson(timeline.persona_id, timeline.days)
        : format === 'markdown'
          ? await exportAnalyticsPersonaStatsTimelineMarkdown(timeline.persona_id, timeline.days)
          : await exportAnalyticsPersonaStatsTimelineCsv(timeline.persona_id, timeline.days);
      if (!downloadBlobFile(exportData.blob, exportData.filename)) {
        setExportError(`Could not download persona timeline ${formatLabel} — try again.`);
      }
    } catch (error) {
      setExportError(
        error instanceof ApiError
          ? error.message
          : `Could not download persona timeline ${formatLabel} — try again.`,
      );
    } finally {
      setActiveExport(null);
    }
  }, [clearExportFeedback]);
  const handlePersonaCategoryExport = useCallback(async (
    personaId: string,
    personaLabel: string,
    format: 'csv' | 'markdown' = 'csv',
  ) => {
    const exportKey = `persona-category-${personaId}-${format}`;
    const fetchExport = format === 'markdown'
      ? exportAnalyticsPersonaStatsByCategoryMarkdown
      : exportAnalyticsPersonaStatsByCategoryCsv;
    setActiveExport(exportKey);
    clearExportFeedback();
    try {
      const { blob, filename } = await fetchExport(personaId, overviewWindowDays);
      if (!downloadBlobFile(blob, filename)) {
        setExportError(`Could not download ${personaLabel} category breakdown — try again.`);
      }
    } catch (error) {
      setExportError(
        error instanceof ApiError
          ? error.message
          : `Could not download ${personaLabel} category breakdown — try again.`,
      );
    } finally {
      setActiveExport(null);
    }
  }, [clearExportFeedback, overviewWindowDays]);
  const handlePersonaCategoryCopyMarkdown = useCallback(async (
    personaId: string,
    personaLabel: string,
  ) => {
    const exportKey = `persona-category-${personaId}-copy-markdown`;
    setActiveExport(exportKey);
    clearExportFeedback();
    try {
      const { blob } = await exportAnalyticsPersonaStatsByCategoryMarkdown(
        personaId,
        overviewWindowDays,
      );
      const copied = await copyMarkdownToClipboard(await blob.text());
      if (copied) {
        setExportNotice(`Copied ${personaLabel} category breakdown Markdown to the clipboard.`);
      } else {
        setExportError(`Could not copy ${personaLabel} category breakdown Markdown — try again.`);
      }
    } catch (error) {
      setExportError(
        error instanceof ApiError
          ? error.message
          : `Could not copy ${personaLabel} category breakdown Markdown — try again.`,
      );
    } finally {
      setActiveExport(null);
    }
  }, [clearExportFeedback, overviewWindowDays]);
  const handlePersonaTimelineCopy = useCallback(async (
    timeline: AnalyticsPersonaStatsTimelineResponse,
  ) => {
    const exportKey = `persona-timeline-${timeline.persona_id}-copy`;
    setActiveExport(exportKey);
    clearExportFeedback();
    try {
      const { blob } = await exportAnalyticsPersonaStatsTimelineMarkdown(
        timeline.persona_id,
        timeline.days,
      );
      const copied = await copyMarkdownToClipboard(await blob.text());
      if (copied) {
        setExportNotice(`Copied ${timeline.name} daily timeline Markdown to the clipboard.`);
      } else {
        setExportError(`Could not copy ${timeline.name} daily timeline Markdown — try again.`);
      }
    } catch (error) {
      setExportError(
        error instanceof ApiError
          ? error.message
          : `Could not copy ${timeline.name} daily timeline Markdown — try again.`,
      );
    } finally {
      setActiveExport(null);
    }
  }, [clearExportFeedback]);
  const handlePersonaTimelineCopyJson = useCallback(async (
    timeline: AnalyticsPersonaStatsTimelineResponse,
  ) => {
    if (personaTimelineCopyJsonInFlightRef.current) return;
    personaTimelineCopyJsonInFlightRef.current = true;
    const exportKey = `persona-timeline-${timeline.persona_id}-copy-json`;
    const runId = ++personaTimelineCopyJsonRunRef.current;
    setActiveExport(exportKey);
    clearExportFeedback();
    try {
      const { blob } = await exportAnalyticsPersonaStatsTimelineJson(
        timeline.persona_id,
        timeline.days,
      );
      if (personaTimelineCopyJsonRunRef.current !== runId) return;
      const json = await blob.text();
      if (personaTimelineCopyJsonRunRef.current !== runId) return;
      const copied = await copyJsonToClipboard(json);
      if (personaTimelineCopyJsonRunRef.current !== runId) return;
      if (copied) {
        setExportNotice(`Copied ${timeline.name} daily timeline JSON to the clipboard.`);
      } else {
        setExportError(`Could not copy ${timeline.name} daily timeline JSON — try again.`);
      }
    } catch (error) {
      if (personaTimelineCopyJsonRunRef.current !== runId) return;
      setExportError(
        error instanceof ApiError
          ? error.message
          : `Could not copy ${timeline.name} daily timeline JSON — try again.`,
      );
    } finally {
      if (personaTimelineCopyJsonRunRef.current === runId) {
        personaTimelineCopyJsonInFlightRef.current = false;
        setActiveExport(null);
      }
    }
  }, [clearExportFeedback]);
  const handlePersonaTimelineCopyCsv = useCallback(async (
    timeline: AnalyticsPersonaStatsTimelineResponse,
  ) => {
    const exportKey = `persona-timeline-${timeline.persona_id}-copy-csv`;
    const runId = ++personaTimelineCopyCsvRunRef.current;
    setActiveExport(exportKey);
    clearExportFeedback();
    try {
      const { blob } = await exportAnalyticsPersonaStatsTimelineCsv(
        timeline.persona_id,
        timeline.days,
      );
      if (personaTimelineCopyCsvRunRef.current !== runId) return;
      const csv = await blob.text();
      if (personaTimelineCopyCsvRunRef.current !== runId) return;
      const copied = await copyCsvToClipboard(csv);
      if (personaTimelineCopyCsvRunRef.current !== runId) return;
      if (copied) {
        setExportNotice(`Copied ${timeline.name} daily timeline CSV to the clipboard.`);
      } else {
        setExportError(`Could not copy ${timeline.name} daily timeline CSV — try again.`);
      }
    } catch (error) {
      if (personaTimelineCopyCsvRunRef.current !== runId) return;
      setExportError(
        error instanceof ApiError
          ? error.message
          : `Could not copy ${timeline.name} daily timeline CSV — try again.`,
      );
    } finally {
      if (personaTimelineCopyCsvRunRef.current === runId) {
        setActiveExport(null);
      }
    }
  }, [clearExportFeedback]);
  const [calLoading, setCalLoading] = useState(false);
  const [calErr, setCalErr] = useState<string | null>(null);
  const [calHistory, setCalHistory] = useState<CalibrationHistoryResponse | null>(null);
  const [calHistoryLoading, setCalHistoryLoading] = useState(false);
  const [calHistoryErr, setCalHistoryErr] = useState<string | null>(null);
  const [calHistoryOpen, setCalHistoryOpen] = useState(false);
  const [calHistoryPage, setCalHistoryPage] = useState(1);
  const [calHistorySort, setCalHistorySort] = useState<CalibrationHistorySort>('newest');
  const [calHistoryReload, setCalHistoryReload] = useState(0);
  // Deleting a rating: the first click only arms the inline confirm.
  const [calConfirmingDeleteId, setCalConfirmingDeleteId] = useState<number | null>(null);
  const [calDeleteBusyId, setCalDeleteBusyId] = useState<number | null>(null);
  const [calDeleteError, setCalDeleteError] = useState<string | null>(null);
  // Bumped after a delete so the stats panel recalibrates itself.
  const [calStatsTick, setCalStatsTick] = useState(0);
  const [fbAcc, setFbAcc] = useState<AnswerFeedbackStats | null>(null);
  const [fbAccLoading, setFbAccLoading] = useState(false);
  const [fbAccErr, setFbAccErr] = useState<string | null>(null);
  const [recentFb, setRecentFb] = useState<RecentFeedbackItem[]>([]);
  const [recentFbLoading, setRecentFbLoading] = useState(false);
  const [recentFbErr, setRecentFbErr] = useState<string | null>(null);
  const [recentFbVerdict, setRecentFbVerdict] = useState<AgentFeedbackVerdict | ''>('');
  // Per-rating contradiction reports: fetched lazily on first expand,
  // cached for the modal's life; closing and reopening retries a refusal.
  const [fbDetailOpenId, setFbDetailOpenId] = useState<string | null>(null);
  const [fbDetailCache, setFbDetailCache] = useState<Record<string, AgentTaskDetailPayload>>({});
  const [fbDetailBusyId, setFbDetailBusyId] = useState<string | null>(null);
  const [fbDetailErrs, setFbDetailErrs] = useState<Record<string, string>>({});
  const [feedbackSummary, setFeedbackSummary] = useState<AgentFeedbackSummary | null>(null);
  const [feedbackSummaryLoading, setFeedbackSummaryLoading] = useState(false);
  const [feedbackSummaryErr, setFeedbackSummaryErr] = useState<string | null>(null);
  const [feedbackSummaryWindowDays, setFeedbackSummaryWindowDays] = useState(30);
  const [feedbackSummaryReload, setFeedbackSummaryReload] = useState(0);
  const [feedbackExportVerdict, setFeedbackExportVerdict] = useState<AgentFeedbackVerdict | ''>('');
  const [feedbackExportFromDate, setFeedbackExportFromDate] = useState('');
  const [feedbackExportToDate, setFeedbackExportToDate] = useState('');

  // Which Agent capabilities this account actually exercises. The
  // server had the GROUP BY all along; nothing ever asked for it.
  const [capabilityUsage, setCapabilityUsage] = useState<CapabilityUsageSummary | null>(null);
  const [capabilityUsageLoading, setCapabilityUsageLoading] = useState(false);
  const [capabilityUsageErr, setCapabilityUsageErr] = useState<string | null>(null);
  const [capabilityWindowDays, setCapabilityWindowDays] = useState(30);
  const [capabilityUsageReload, setCapabilityUsageReload] = useState(0);

  // The capability reference: the taxonomy list loads when the section
  // is opened; each long-form doc is fetched once on first expand and
  // cached — collapsing never discards a doc already in hand.
  const [capReferenceOpen, setCapReferenceOpen] = useState(false);
  const [capList, setCapList] = useState<AgentCapability[] | null>(null);
  const [capListLoading, setCapListLoading] = useState(false);
  const [capListErr, setCapListErr] = useState<string | null>(null);
  const [capReferenceReload, setCapReferenceReload] = useState(0);
  const [capOpenDocId, setCapOpenDocId] = useState<string | null>(null);
  const [capDocs, setCapDocs] = useState<Record<string, CapabilityDoc>>({});
  const [capDocBusyId, setCapDocBusyId] = useState<string | null>(null);
  const [capDocErrId, setCapDocErrId] = useState<string | null>(null);
  const [capDocErrText, setCapDocErrText] = useState<string | null>(null);
  // "Try it" prompts per capability, loaded once with the taxonomy.
  // A failed examples read never blocks docs — it just admits itself.
  const [capExamples, setCapExamples] = useState<Record<string, string[]>>({});
  // Execution facts (condura method, stream heartbeat) keyed by capability
  // id — enrichment only, so a failed fetch leaves the plain rows intact.
  const [capStats, setCapStats] = useState<Record<string, CapabilityStat>>({});
  const [capExamplesErr, setCapExamplesErr] = useState(false);
  const [copiedExampleKey, setCopiedExampleKey] = useState<string | null>(null);
  const copiedExampleTimerRef = useRef<number | null>(null);

  const feedbackExportDateRange: AgentFeedbackExportDateRange | undefined =
    feedbackExportFromDate || feedbackExportToDate
      ? {
          fromDate: feedbackExportFromDate || undefined,
          toDate: feedbackExportToDate || undefined,
        }
      : undefined;
  const feedbackExportDateRangeInvalid =
    !!feedbackExportFromDate &&
    !!feedbackExportToDate &&
    feedbackExportFromDate > feedbackExportToDate;

  const [sub, setSub] = useState<SubscriptionStatusResponse | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [addonCheckout, setAddonCheckout] = useState(false);
  const [addonCancelConfirm, setAddonCancelConfirm] = useState(false);
  const [addonBusy, setAddonBusy] = useState(false);

  const [mcpList, setMcpList] = useState<any[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpErr, setMcpErr] = useState<string | null>(null);
  const [mcpExpandedId, setMcpExpandedId] = useState<string | null>(null);
  const [mcpTokenInputs, setMcpTokenInputs] = useState<Record<string, string>>({});
  const [mcpConnectBusy, setMcpConnectBusy] = useState<string | null>(null);
  const [mcpToast, setMcpToast] = useState<string | null>(null);
  const [mcpDisconnectTarget, setMcpDisconnectTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  // Per-integration live search ("does this token actually work?").
  // One row open at a time; results and refusals reset on every toggle.
  const [mcpTestOpenId, setMcpTestOpenId] = useState<number | null>(null);
  const [mcpTestQuery, setMcpTestQuery] = useState('');
  const [mcpTestBusy, setMcpTestBusy] = useState(false);
  const [mcpTestResults, setMcpTestResults] = useState<McpSearchResult[] | null>(null);
  const [mcpTestError, setMcpTestError] = useState<string | null>(null);
  // Account security details — fetched once when the expander opens, then cached
  // for the life of the modal; a refusal keeps the panel closed and says why.
  const [securityOpen, setSecurityOpen] = useState(false);
  const [securityDetails, setSecurityDetails] = useState<AccountSecurity | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const securityErrorRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !user) return;
    setFullName(user.name || '');
    setExpertiseLevel(normalizeExpertiseLevel(user.expertise_level));
    setExpertiseDomain(user.expertise_domain || '');
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setUsageLoading(true);
    setUsageErr(null);
    void getUserUsage()
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch(() => {
        if (!cancelled) setUsageErr('Could not load usage');
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setFeedbackSummaryLoading(true);
    setFeedbackSummaryErr(null);
    void getAgentFeedbackSummary(feedbackSummaryWindowDays)
      .then((summary) => {
        if (!cancelled) setFeedbackSummary(summary);
      })
      .catch(() => {
        if (!cancelled) {
          setFeedbackSummaryErr('Could not load feedback activity');
          setFeedbackSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setFeedbackSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, feedbackSummaryWindowDays, feedbackSummaryReload]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setCapabilityUsageLoading(true);
    setCapabilityUsageErr(null);
    void getCapabilityUsage(capabilityWindowDays)
      .then((summary) => {
        if (!cancelled) setCapabilityUsage(summary);
      })
      .catch((error) => {
        if (!cancelled) {
          setCapabilityUsageErr(
            error instanceof Error && error.message
              ? error.message
              : 'Could not load capability usage',
          );
          setCapabilityUsage(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCapabilityUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, capabilityWindowDays, capabilityUsageReload]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage' || !capReferenceOpen) return;
    let cancelled = false;
    setCapListLoading(true);
    setCapListErr(null);
    void getAgentCapabilities()
      .then((capabilities) => {
        if (!cancelled) setCapList(capabilities);
      })
      .catch((error) => {
        if (!cancelled) {
          setCapListErr(
            error instanceof Error && error.message
              ? error.message
              : 'Could not load capability reference',
          );
          setCapList(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCapListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, capReferenceOpen, capReferenceReload]);

  // Stats ride along with the reference list: same open/reload triggers.
  // Deliberately quiet on failure — rows keep their execution badge and
  // simply don't gain heartbeat/condura lines, which beats scaring the
  // user over metadata the reference never promised.
  useEffect(() => {
    if (!isOpen || activeTab !== 'usage' || !capReferenceOpen) return;
    let cancelled = false;
    void getCapabilityStats()
      .then((stats) => {
        if (!cancelled) {
          const byId: Record<string, CapabilityStat> = {};
          for (const stat of stats) byId[stat.id] = stat;
          setCapStats(byId);
        }
      })
      .catch(() => {
        if (!cancelled) setCapStats({});
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, capReferenceOpen, capReferenceReload]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage' || !capReferenceOpen) return;
    let cancelled = false;
    setCapExamplesErr(false);
    void getCapabilityExamples()
      .then((sets) => {
        if (!cancelled) {
          const byId: Record<string, string[]> = {};
          for (const set of sets) {
            if (set.examples.length > 0) byId[set.id] = set.examples;
          }
          setCapExamples(byId);
        }
      })
      .catch(() => {
        // Examples are garnish on the reference; a refusal only
        // admits itself at the bottom of the section.
        if (!cancelled) {
          setCapExamples({});
          setCapExamplesErr(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, capReferenceOpen, capReferenceReload]);

  // Expand one capability row: fetch its markdown once, keep it cached
  // across collapses. A refused load surfaces verbatim inside the row.
  const toggleCapabilityDoc = useCallback(
    (cap: AgentCapability) => {
      setCapDocErrId(null);
      setCapDocErrText(null);
      if (capOpenDocId === cap.id) {
        setCapOpenDocId(null);
        return;
      }
      setCapOpenDocId(cap.id);
      if (capDocs[cap.id]) return;
      setCapDocBusyId(cap.id);
      void getCapabilityDoc(cap.id)
        .then((doc) => {
          setCapDocs((current) => ({ ...current, [cap.id]: doc }));
        })
        .catch((error) => {
          setCapDocErrId(cap.id);
          setCapDocErrText(
            error instanceof Error && error.message
              ? error.message
              : 'Could not load that capability doc.',
          );
        })
        .finally(() => {
          setCapDocBusyId(null);
        });
    },
    [capOpenDocId, capDocs],
  );

  // One "Copied" flash at a time; the timer ref keeps a late flip
  // from clobbering a newer confirmation.
  const copyCapabilityExample = useCallback(async (example: string, key: string) => {
    try {
      const copied = await copyToClipboard(example);
      if (!copied) return;
      setCopiedExampleKey(key);
      if (copiedExampleTimerRef.current !== null) {
        window.clearTimeout(copiedExampleTimerRef.current);
      }
      copiedExampleTimerRef.current = window.setTimeout(() => {
        copiedExampleTimerRef.current = null;
        setCopiedExampleKey(null);
      }, 1500);
    } catch {
      // Clipboard refused; the button simply stays "Copy".
    }
  }, []);

  useEffect(
    () => () => {
      if (copiedExampleTimerRef.current !== null) {
        window.clearTimeout(copiedExampleTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage' || !calHistoryOpen) return;
    let cancelled = false;
    setCalHistoryLoading(true);
    setCalHistoryErr(null);
    void getCalibrationHistory({ page: calHistoryPage, perPage: 5, sort: calHistorySort })
      .then((history) => {
        if (!cancelled) setCalHistory(history);
      })
      .catch(() => {
        if (!cancelled) {
          setCalHistoryErr('Could not load calibration history');
          setCalHistory(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCalHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, calHistoryOpen, calHistoryPage, calHistorySort, calHistoryReload]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setActivityLoading(true);
    setActivityErr(null);
    void getAnalyticsActivity(activityWindowDays)
      .then((a) => {
        if (!cancelled) setActivity(a);
      })
      .catch(() => {
        if (!cancelled) {
          setActivityErr('Could not load activity highlights');
          setActivity(null);
        }
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, activityReload, activityWindowDays]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setCategoryStatsLoading(true);
    setCategoryStatsErr(null);
    void getAnalyticsCategoryStats(activityWindowDays)
      .then((stats) => {
        if (!cancelled) setCategoryStats(stats);
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryStatsErr('Could not load category performance');
          setCategoryStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCategoryStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, activityWindowDays, categoryStatsReload]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setWinRateLoading(true);
    setWinRateErr(null);
    const request = winRateIncludeFallback
      ? getAnalyticsPersonaWinRate(winRateWindowDays, winRateMinAppearances, true)
      : getAnalyticsPersonaWinRate(winRateWindowDays, winRateMinAppearances);
    void request
      .then((w) => {
        if (!cancelled) setWinRate(w);
      })
      .catch(() => {
        if (!cancelled) {
          setWinRateErr('Could not load persona win rates');
          setWinRate(null);
        }
      })
      .finally(() => {
        if (!cancelled) setWinRateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    activeTab,
    winRateReload,
    winRateWindowDays,
    winRateMinAppearances,
    winRateIncludeFallback,
  ]);

  useEffect(() => {
    setPersonaTimelinePersonaId(null);
    setPersonaTimeline(null);
    setPersonaTimelineErr(null);
    setPersonaTimelineLoading(false);
  }, [isOpen, activeTab, winRateReload, winRateWindowDays, winRateMinAppearances, winRateIncludeFallback]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage' || !personaTimelinePersonaId) return;
    let cancelled = false;
    setPersonaTimelineLoading(true);
    setPersonaTimelineErr(null);
    void getAnalyticsPersonaStatsTimeline(personaTimelinePersonaId, winRateWindowDays)
      .then((data) => {
        if (!cancelled) setPersonaTimeline(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setPersonaTimeline(null);
          setPersonaTimelineErr(
            error instanceof ApiError ? error.message : 'Could not load persona activity timeline',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setPersonaTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, personaTimelinePersonaId, personaTimelineReload, winRateWindowDays]);

  useEffect(() => () => {
    // A timeline can be hidden, refreshed, or abandoned with the modal. Do
    // not let a late clipboard export response repaint feedback for a different view.
    invalidatePersonaTimelineCopyRuns();
  }, [
    isOpen,
    activeTab,
    personaTimelinePersonaId,
    personaTimelineReload,
    winRateWindowDays,
    invalidatePersonaTimelineCopyRuns,
  ]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setCalLoading(true);
    setCalErr(null);
    void getCalibrationStats()
      .then((raw) => {
        if (!cancelled) setCalStats(raw as typeof calStats);
      })
      .catch(() => {
        if (!cancelled) {
          setCalErr('Could not load calibration');
          setCalStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, calStatsTick]);

  // A deleted rating leaves the history list immediately, and the stats
  // panel recalibrates via calStatsTick — the server recomputes them.
  const handleCalDeleteRequest = useCallback((ratingId: number) => {
    setCalDeleteError(null);
    setCalConfirmingDeleteId(ratingId);
  }, []);

  const handleCalDeleteCancel = useCallback(() => {
    setCalConfirmingDeleteId(null);
  }, []);

  const handleCalDeleteConfirm = useCallback(
    async (rating: CalibrationHistoryRating) => {
      setCalConfirmingDeleteId(null);
      setCalDeleteBusyId(rating.id);
      setCalDeleteError(null);
      try {
        await deleteCalibrationRating(rating.task_id);
        // The row leaves only after the server accepts the deletion.
        setCalHistory((current) =>
          current
            ? {
                ...current,
                ratings: current.ratings.filter((item) => item.id !== rating.id),
                total: Math.max(0, current.total - 1),
              }
            : current,
        );
        // Deleting shifts server-side pagination: the tail page can go
        // empty outright. Fall back into range — the page change itself
        // refetches — or re-read the current page so its rows and
        // totals stay true rather than trusting a locally edited copy.
        const remaining = Math.max(0, (calHistory?.total ?? 1) - 1);
        const lastPage = Math.max(1, Math.ceil(remaining / 5));
        if (calHistoryPage > lastPage) {
          setCalHistoryPage(lastPage);
        } else {
          setCalHistoryReload((tick) => tick + 1);
        }
        setCalStatsTick((tick) => tick + 1);
      } catch (error) {
        setCalDeleteError(
          error instanceof Error && error.message
            ? error.message
            : 'Could not delete that rating.',
        );
      } finally {
        setCalDeleteBusyId(null);
      }
    },
    [calHistory, calHistoryPage],
  );

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setFbAccLoading(true);
    setFbAccErr(null);
    void getUserAnswerFeedbackStats()
      .then((s) => {
        if (!cancelled) setFbAcc(s);
      })
      .catch(() => {
        if (!cancelled) {
          setFbAccErr('Could not load feedback accuracy');
          setFbAcc(null);
        }
      })
      .finally(() => {
        if (!cancelled) setFbAccLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'usage') return;
    let cancelled = false;
    setRecentFbLoading(true);
    setRecentFbErr(null);
    void getRecentAgentFeedback(10, recentFbVerdict || undefined)
      .then((items) => {
        if (!cancelled) setRecentFb(items);
      })
      .catch(() => {
        if (!cancelled) {
          setRecentFbErr('Could not load recent feedback');
          setRecentFb([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRecentFbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, recentFbVerdict]);

  const refreshMcp = useCallback(async () => {
    setMcpLoading(true);
    setMcpErr(null);
    try {
      const rows = await getMcpIntegrations();
      setMcpList(rows);
    } catch {
      setMcpErr('Could not load integrations');
      setMcpList([]);
    } finally {
      setMcpLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== 'integrations') return;
    void refreshMcp();
  }, [isOpen, activeTab, refreshMcp]);

  useEffect(() => {
    if (!mcpToast) return;
    const t = window.setTimeout(() => setMcpToast(null), 2000);
    return () => clearTimeout(t);
  }, [mcpToast]);

  const toggleMcpTestSearch = useCallback((id: number) => {
    setMcpTestOpenId((current) => (current === id ? null : id));
    setMcpTestQuery('');
    setMcpTestResults(null);
    setMcpTestError(null);
  }, []);

  // A refused search surfaces verbatim; an empty result list is shown
  // as-is rather than dressed up as success or failure.
  const runMcpTestSearch = useCallback(async () => {
    if (mcpTestOpenId === null || mcpTestBusy) return;
    const trimmed = mcpTestQuery.trim();
    if (!trimmed) return;
    setMcpTestBusy(true);
    setMcpTestError(null);
    try {
      const results = await searchMcpIntegration(mcpTestOpenId, trimmed);
      setMcpTestResults(results);
    } catch (error) {
      setMcpTestResults(null);
      setMcpTestError(
        error instanceof Error && error.message
          ? error.message
          : 'Could not search that integration.',
      );
    } finally {
      setMcpTestBusy(false);
    }
  }, [mcpTestOpenId, mcpTestQuery, mcpTestBusy]);

  // Security details fetch once and stay cached while the modal is open —
  // reopening the expander replays the loaded facts rather than re-asking.
  // A refusal keeps whatever was there (nothing, on first open) and says why.
  const toggleSecurityDetails = useCallback(() => {
    const next = !securityOpen;
    setSecurityOpen(next);
    if (!next || securityDetails || securityLoading) return;
    setSecurityLoading(true);
    setSecurityError(null);
    void getAccountSecurity()
      .then((details) => {
        setSecurityDetails(details);
      })
      .catch((error: unknown) => {
        setSecurityDetails(null);
        setSecurityError(
          error instanceof Error && error.message
            ? error.message
            : 'Could not load your security details.',
        );
      })
      .finally(() => {
        setSecurityLoading(false);
      });
  }, [securityOpen, securityDetails, securityLoading]);

  // Expand one rating's contradiction report. A refused load keeps its
  // row intact and says why; toggling again retries from the server.
  const toggleFeedbackRunDetail = useCallback((taskId: string) => {
    const next = fbDetailOpenId === taskId ? null : taskId;
    setFbDetailOpenId(next);
    if (!next || fbDetailCache[taskId] || fbDetailBusyId === taskId) return;
    setFbDetailBusyId(taskId);
    void getAgentTaskDetail(taskId)
      .then((detail) => {
        setFbDetailCache((prev) => ({ ...prev, [taskId]: detail }));
        setFbDetailErrs((prev) => {
          if (!(taskId in prev)) return prev;
          const next2 = { ...prev };
          delete next2[taskId];
          return next2;
        });
      })
      .catch((error: unknown) => {
        setFbDetailErrs((prev) => ({
          ...prev,
          [taskId]:
            error instanceof Error && error.message
              ? error.message
              : 'Could not load the contradiction report.',
        }));
      })
      .finally(() => {
        setFbDetailBusyId(null);
      });
  }, [fbDetailOpenId, fbDetailCache, fbDetailBusyId]);

  useEffect(() => {
    if (!exportNotice) return;
    const t = window.setTimeout(() => setExportNotice(null), 2000);
    return () => clearTimeout(t);
  }, [exportNotice]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSubLoading(true);
    void getSubscriptionStatus()
      .then((s) => {
        if (!cancelled) setSub(s);
      })
      .catch(() => {
        if (!cancelled) setSub({ has_subscription: false, tier: 'FREE' });
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeModal]);

  const handleOverlayPointerDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) closeModal();
    },
    [closeModal],
  );

  useEffect(() => {
    if (!saveError) return;
    saveErrorRef.current?.focus();
  }, [saveError]);

  // Same contract as the profile-save refusal: keyboard and screen-reader
  // users land on the reason, not back on the button that failed.
  useEffect(() => {
    if (!securityError) return;
    securityErrorRef.current?.focus();
  }, [securityError]);

  useEffect(() => {
    return () => {
      if (saveOkTimerRef.current != null) {
        window.clearTimeout(saveOkTimerRef.current);
      }
    };
  }, []);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaveOk(false);
    setSaveError(null);
    const issue = validateProfileName(fullName);
    if (issue) {
      setSaveError(profileSaveIssueMessage(issue));
      return;
    }
    setSaveBusy(true);
    try {
      const level = normalizeExpertiseLevel(expertiseLevel);
      const domain = domainForExpertiseLevel(level, expertiseDomain);
      await patchUserProfile({
        name: fullName.trim(),
        expertise_level: level,
        expertise_domain: domain,
      });
      // Cache the level/domain locally so the next session render
      // skips a network round-trip. safeLocalStorage swallows throws
      // (private mode / quota / enterprise storage-disable) — the
      // server already has the truth; cache is purely a perf hint.
      safeLocalStorage.setItem('arena_expertise_level', level);
      safeLocalStorage.setItem('arena_expertise_domain', domain);
      await refreshUser();
      setSaveOk(true);
      if (saveOkTimerRef.current != null) window.clearTimeout(saveOkTimerRef.current);
      const hold = motionDuration(2000);
      saveOkTimerRef.current = window.setTimeout(() => {
        setSaveOk(false);
        saveOkTimerRef.current = null;
      }, hold > 0 ? hold : 0);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : profileSaveCaughtErrorMessage(err);
      setSaveError(msg);
    } finally {
      setSaveBusy(false);
    }
  };

  const handleSignOut = async () => {
    closeModal();
    await logout();
    navigate('/');
  };

  const handleManagePlan = () => {
    const tierUpper = (user?.tier || 'FREE').toUpperCase();
    const paid =
      sub?.has_subscription &&
      (tierUpper === 'PLUS' || tierUpper === 'PRO') &&
      sub?.status &&
      ['created', 'authenticated', 'active', 'halted'].includes(sub.status);

    closeModal(() => {
      if (!paid) {
        navigate('/pricing');
        return;
      }
      navigate('/pricing');
    });
  };

  const handleCancelSub = async () => {
    if (!sub?.razorpay_subscription_id) return;
    setCancelBusy(true);
    try {
      await cancelSubscription();
      const s = await getSubscriptionStatus();
      setSub(s);
      await refreshUser();
    } catch {
      // ignore
    } finally {
      setCancelBusy(false);
    }
  };

  if (!isOpen && !closing) return null;
  if (!user) return null;

  const tierUpper = (user.tier || 'FREE').toUpperCase();
  const planLabel =
    tierUpper === 'PRO' ? 'Arena Pro' : tierUpper === 'PLUS' ? 'Arena Plus' : 'Arena Free';
  const billingLine =
    sub?.has_subscription && sub.billing_period
      ? `${sub.billing_period === 'annual' ? 'ANNUAL' : 'MONTHLY'} SUBSCRIPTION · ${(sub.status || 'ACTIVE').toUpperCase()}`
      : 'FREE PLAN · NO BILLING';

  const billingPeriod = (user.subscription_billing_period || sub?.billing_period || '').toLowerCase();
  const consecutive = user.consecutive_payments ?? 0;
  const showLoyaltyProgress =
    tierUpper === 'PRO' &&
    billingPeriod === 'monthly' &&
    consecutive > 0 &&
    !user.loyalty_reward_active;
  const showLoyaltyActive = user.loyalty_reward_active === true;

  const mobile = isMobile;
  const panelAnim = closing
    ? origin === 'bottom-left'
      ? 'profileModalPanelCloseBL 0.22s ease-in forwards'
      : 'profileModalPanelCloseTR 0.22s ease-in forwards'
    : origin === 'bottom-left'
      ? 'profileModalPanelOpenBL 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      : 'profileModalPanelOpenTR 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards';

  const overlayAnim = closing ? 'profileModalOverlayOut 0.22s ease forwards' : 'profileModalOverlayIn 0.2s ease forwards';

  const tabs = (
    <>
      {(
        [
          { id: 'account' as const, label: 'Account', Icon: TabIconAccount },
          { id: 'plan' as const, label: 'Plan', Icon: TabIconPlan },
          { id: 'usage' as const, label: 'Usage', Icon: TabIconUsage },
          { id: 'integrations' as const, label: 'Integrations', Icon: TabIconIntegrations },
          { id: 'help' as const, label: 'Get help', Icon: TabIconHelp },
        ] as const
      ).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`profile-modal__tab${activeTab === id ? ' profile-modal__tab--active' : ''}${
            mobile ? ' profile-modal__tab--mobile' : ''
          }`}
          onClick={() => setActiveTab(id)}
        >
          <Icon active={activeTab === id} />
          {label}
        </button>
      ))}
    </>
  );

  const displayName = (user.name || '').trim() || user.email.split('@')[0];

  const content = (
    <div
      role="presentation"
      className={`profile-modal-overlay${mobile ? ' profile-modal-overlay--mobile' : ''}`}
      onMouseDown={handleOverlayPointerDown}
      style={{ animation: overlayAnim }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        className={`profile-modal-panel${mobile ? ' profile-modal-panel--mobile' : ''}${
          origin === 'bottom-left' ? ' profile-modal-panel--origin-bl' : ' profile-modal-panel--origin-tr'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ animation: panelAnim }}
      >
        {mobile ? <div className="profile-modal__grabber" aria-hidden /> : null}
        <aside className={`profile-modal__aside${mobile ? ' profile-modal__aside--mobile' : ''}`}>
          <div className="profile-modal__identity">
            <div className="profile-modal__avatar" aria-hidden>
              {profileInitials(user.name, user.email)}
            </div>
            <div className="profile-modal__name">{displayName}</div>
            <div className="profile-modal__tier">
              {tierUpper === 'PRO' ? 'Pro' : tierUpper === 'PLUS' ? 'Plus' : 'Free'}
              {sub?.billing_period ? ` · ${sub.billing_period === 'annual' ? 'Annual' : 'Monthly'}` : ''}
            </div>
          </div>
          <nav
            className={`profile-modal__nav horizontal-scroll${mobile ? ' profile-modal__nav--mobile' : ''}`}
          >
            {tabs}
          </nav>
          <div className="profile-modal__signout">
            <Button type="button" variant="ghost" size="sm" icon={Icons.logout(14)} onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </div>
        </aside>

        <div className={`profile-modal__body${mobile ? ' profile-modal__body--mobile' : ''}`}>
          <div style={{ display: activeTab === 'account' ? 'block' : 'none' }}>
            <h2 id="profile-modal-title" className="profile-modal__heading">
              Account
            </h2>
            <p className="profile-modal__subhead">Manage your profile and expertise calibration</p>

            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="profile-full-name"
                className="profile-modal__field-label"
              >
                Full name
              </label>
              <input
                id="profile-full-name"
                value={fullName}
                maxLength={PROFILE_NAME_MAX}
                autoComplete="name"
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (saveError) setSaveError(null);
                }}
                className="profile-modal__input"
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <div className="profile-modal__field-label">Email address</div>
              <input
                value={user.email}
                disabled
                readOnly
                className="profile-modal__input profile-modal__input--readonly"
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <div className="profile-modal__field-label">Password</div>
              <input
                type="password"
                value="••••••••••"
                readOnly
                placeholder="Change password"
                className="profile-modal__input"
              />
            </div>

            {/* The security endpoint was built for exactly this panel and never
                had a caller — this expander surfaces what it honestly knows. */}
            <div style={{ marginBottom: 18 }}>
              <button
                type="button"
                onClick={toggleSecurityDetails}
                aria-expanded={securityOpen}
                aria-controls="account-security-region"
                aria-label={securityOpen ? 'Hide security details' : 'Show security details'}
                className="profile-modal__section-sub"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: '#F0B84E',
                  font: 'inherit',
                }}
              >
                {securityOpen ? '▾' : '▸'} Security details
              </button>
              <div
                id="account-security-region"
                role="region"
                aria-label="Account security details"
                aria-busy={securityLoading}
                hidden={!securityOpen}
                style={{ marginTop: 10 }}
              >
                {securityLoading ? (
                  <p style={{ fontSize: 11, color: '#8C7355', margin: 0 }}>Loading security details…</p>
                ) : null}
                {securityError ? (
                  <p
                    ref={securityErrorRef}
                    role="alert"
                    tabIndex={-1}
                    style={{ fontSize: 11, color: '#993C1D', margin: 0 }}
                  >
                    {securityError}
                  </p>
                ) : null}
                {securityDetails ? (
                  <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
                    {[
                      {
                        label: 'Member since',
                        value: securityDetails.memberSince
                          ? formatSecurityDate(securityDetails.memberSince)
                          : 'Unknown date',
                      },
                      {
                        label: 'Last active',
                        value: securityDetails.lastActiveAt
                          ? formatSecurityDate(securityDetails.lastActiveAt)
                          : 'No activity recorded yet',
                      },
                      {
                        label: 'Email verified',
                        value: securityDetails.isVerified ? 'Verified' : 'Not verified',
                      },
                      {
                        label: 'Password',
                        value: !securityDetails.hasPassword
                          ? 'Not set — you sign in through a linked provider'
                          : securityDetails.passwordLastChangedAt
                            ? `Changed ${formatSecurityDate(securityDetails.passwordLastChangedAt)}`
                            : 'Original — set at signup and never changed',
                      },
                    ].map((row) => (
                      <div key={row.label} style={{ display: 'flex', gap: 8 }}>
                        <dt
                          style={{
                            fontSize: 11,
                            color: '#8C7355',
                            width: 96,
                            flexShrink: 0,
                            margin: 0,
                          }}
                        >
                          {row.label}
                        </dt>
                        <dd
                          style={{
                            fontSize: 11,
                            color: '#F3F0E7',
                            margin: 0,
                            minWidth: 0,
                            wordBreak: 'break-word',
                          }}
                        >
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </div>

            <div style={{ borderTop: '0.5px solid #EDE4D8', margin: '20px 0' }} />

            <div className="profile-modal__field-label">
              Your expertise background
            </div>
            <p className="profile-modal__section-sub" style={{ margin: '4px 0 10px' }}>
              Arena calibrates response depth and terminology to match your background across all tasks.
            </p>
            <div style={{ marginBottom: 18 }}>
              <ExpertiseSelector
                level={expertiseLevel}
                domain={expertiseDomain}
                disabled={saveBusy}
                onChange={(level, domain) => {
                  setExpertiseLevel(level);
                  setExpertiseDomain(domain);
                }}
              />
            </div>

            {saveError ? (
              <p
                ref={saveErrorRef}
                role="alert"
                tabIndex={-1}
                style={{
                  fontSize: 13,
                  color: '#993C1D',
                  margin: '0 0 12px',
                  lineHeight: 1.5,
                  outline: 'none',
                }}
              >
                {saveError}
              </p>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => void handleSaveProfile()}
                className={['profile-save-btn', saveBusy ? 'profile-save-btn--busy' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {saveBusy ? 'Saving…' : 'Save changes'}
              </button>
              {saveOk ? (
                <span role="status" style={{ fontSize: 12, color: '#5A8C6A' }}>
                  Saved
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: activeTab === 'plan' ? 'block' : 'none' }}>
            <h2 className="profile-modal__section-heading">Your plan</h2>
            <p style={{ fontSize: 14, color: '#A0A39A', marginBottom: 16 }}>Current subscription and billing details</p>
            {subLoading ? (
              <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
                <MicroLoader />
              </div>
            ) : (
              <>
                <div
                  style={{
                    background: '#F3F0E7',
                    borderRadius: 10,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div className="profile-modal__plan-heading">{planLabel}</div>
                  <div className="profile-modal__plan-billing">{billingLine}</div>
                  <div style={{ borderTop: '0.5px solid #3D2820', margin: '14px 0' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    {planFeatures(user.tier).map((f) => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#A0A39A' }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#F0B84E', flexShrink: 0 }} />
                        {f}
                      </div>
                    ))}
                  </div>
                  {sub?.has_subscription && tierUpper !== 'FREE' && tierUpper !== 'GUEST' ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#6B5040' }}>Next billing date</div>
                        <div style={{ fontSize: 13, color: '#F0B84E', fontWeight: 500 }}>
                          {sub.amount != null ? `${formatInrPaise(sub.amount)} · ` : ''}
                          {sub.current_end ? new Date(sub.current_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#6B5040' }}>Per month</div>
                        <div style={{ fontSize: 28, color: '#F0B84E', fontWeight: 500, fontFamily: 'var(--vp-font-sans)' }}>
                          {sub.amount != null && sub.billing_period === 'annual'
                            ? formatInrPaise(Math.round(sub.amount / 12))
                            : sub.amount != null
                              ? formatInrPaise(sub.amount)
                              : '—'}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                {showLoyaltyActive ? (
                  <div
                    style={{
                      background: '#EAF3DE',
                      border: '0.5px solid #97C459',
                      borderRadius: 8,
                      padding: '12px 16px',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 13, color: '#3B6D11', fontWeight: 500 }}>🎁 Your loyalty reward is active</div>
                    <div style={{ fontSize: 11, color: '#5A8C6A', marginTop: 6, lineHeight: 1.5 }}>
                      Months 11 &amp; 12 are free — billing resumes automatically after.
                      {user.loyalty_resume_at
                        ? ` (${new Date(user.loyalty_resume_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`
                        : ''}
                    </div>
                  </div>
                ) : showLoyaltyProgress ? (
                  <div
                    style={{
                      background: '#FAF7F2',
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 8,
                      padding: '12px 16px',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A0A39A' }}>
                        Loyalty reward
                      </span>
                      <span
                        style={{
                          background: '#F0E8DC',
                          color: '#8C7355',
                          fontSize: 10,
                          borderRadius: 8,
                          padding: '4px 10px',
                        }}
                      >
                        Months 11 &amp; 12 free
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#EDE4D8', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min((consecutive / 10) * 100, 100)}%`,
                          background: '#F0B84E',
                          borderRadius: 3,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: '#A0A39A', marginTop: 5 }}>
                      Month {consecutive} of 10 — {Math.max(10 - consecutive, 0)} months to go
                    </div>
                    {consecutive >= 8 ? (
                      <div style={{ fontSize: 11, color: '#F0B84E', fontStyle: 'italic', marginTop: 8, lineHeight: 1.45 }}>
                        Almost there — stay through month 10 and get months 11 &amp; 12 completely free
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ marginBottom: 8 }}>
                  <Button type="button" variant="secondary" size="sm" fullWidth onClick={handleManagePlan}>
                    {tierUpper === 'FREE' || tierUpper === 'GUEST' ? 'Upgrade plan' : 'Manage plan'}
                  </Button>
                </div>
                {sub?.has_subscription && sub.razorpay_subscription_id && ['created', 'authenticated', 'active', 'halted'].includes(sub.status || '') ? (
                  <button
                    type="button"
                    disabled={cancelBusy}
                    onClick={() => void handleCancelSub()}
                    style={{
                      width: '100%',
                      padding: 8,
                      border: '0.5px solid #E0D5C5',
                      borderRadius: 6,
                      background: 'transparent',
                      color: '#8C7355',
                      fontSize: 11,
                      fontFamily: 'var(--vp-font-sans)',
                      cursor: cancelBusy ? 'default' : 'pointer',
                    }}
                  >
                    {cancelBusy ? 'Cancelling…' : 'Cancel subscription'}
                  </button>
                ) : null}
                {tierUpper === 'PLUS' ? (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: '#A0A39A',
                        marginTop: 16,
                        marginBottom: 10,
                      }}
                    >
                      Agent Mode add-on
                    </div>
                    {!user.agent_addon_active && !user.agent_addon_cancelling ? (
                      <div
                        style={{
                          background: '#FAF7F2',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 8,
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                          <span style={{ fontSize: 14, color: '#F3F0E7', fontWeight: 500 }}>Agent Mode</span>
                          <span style={{ fontSize: 14, color: '#F0B84E' }}>₹599/month</span>
                        </div>
                        <p style={{ fontSize: 11, color: '#A0A39A', fontStyle: 'italic', margin: '0 0 12px', lineHeight: 1.5 }}>
                          7-stage research pipeline · Full Agent access · Plus limits apply
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#4A3728', marginBottom: 0 }}>
                          <span>✓ Planner → Researcher → Solver pipeline</span>
                          <span>✓ Confidence calibration + source integrity</span>
                          <span>✓ Cancel anytime from your profile</span>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Button type="button" variant="primary" size="md" fullWidth onClick={() => setAddonCheckout(true)}>
                            Add Agent Mode — ₹599/mo
                          </Button>
                        </div>
                      </div>
                    ) : user.agent_addon_active && !user.agent_addon_cancelling ? (
                      <div
                        style={{
                          background: '#EAF3DE',
                          border: '0.5px solid #97C459',
                          borderRadius: 8,
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: 14, color: '#F3F0E7', fontWeight: 500 }}>Agent Mode</span>
                          <span
                            style={{
                              background: '#639922',
                              color: '#FAF7F2',
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              padding: '2px 8px',
                              borderRadius: 8,
                            }}
                          >
                            Active
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: '#5A8C6A', margin: 0, lineHeight: 1.5 }}>₹599/month · Renews automatically</p>
                        {!addonCancelConfirm ? (
                          <button
                            type="button"
                            onClick={() => setAddonCancelConfirm(true)}
                            style={{
                              marginTop: 10,
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: 12,
                              color: '#A0A39A',
                              textDecoration: 'underline dotted',
                              cursor: 'pointer',
                              fontFamily: 'var(--vp-font-sans)',
                            }}
                          >
                            Cancel add-on →
                          </button>
                        ) : (
                          <div
                            style={{
                              marginTop: 10,
                              background: '#FAF7F2',
                              border: '0.5px solid #E0D5C5',
                              borderRadius: 8,
                              padding: '12px 14px',
                            }}
                          >
                            <div style={{ fontSize: 12, color: '#F3F0E7', marginBottom: 8 }}>Cancel Agent add-on?</div>
                            <div style={{ fontSize: 11, color: '#A0A39A', marginBottom: 10, lineHeight: 1.45 }}>
                              You keep access until end of current billing period.
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                disabled={addonBusy}
                                onClick={() => setAddonCancelConfirm(false)}
                                style={{
                                  border: '0.5px solid #35382F',
                                  color: '#8C7355',
                                  borderRadius: 20,
                                  padding: '6px 14px',
                                  fontSize: 12,
                                  background: 'transparent',
                                  cursor: addonBusy ? 'default' : 'pointer',
                                  fontFamily: 'var(--vp-font-sans)',
                                }}
                              >
                                Keep add-on
                              </button>
                              <button
                                type="button"
                                disabled={addonBusy}
                                onClick={async () => {
                                  setAddonBusy(true);
                                  try {
                                    await cancelAgentAddon();
                                    setAddonCancelConfirm(false);
                                    await refreshUser();
                                    await refreshTier();
                                  } catch {
                                    // ignore; could surface toast
                                  } finally {
                                    setAddonBusy(false);
                                  }
                                }}
                                style={{
                                  border: '0.5px solid #F0997B',
                                  color: '#993C1D',
                                  borderRadius: 20,
                                  padding: '6px 14px',
                                  fontSize: 12,
                                  background: 'transparent',
                                  cursor: addonBusy ? 'default' : 'pointer',
                                  fontFamily: 'var(--vp-font-sans)',
                                }}
                              >
                                {addonBusy ? '…' : 'Yes, cancel'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : user.agent_addon_cancelling ? (
                      <div
                        style={{
                          background: '#FDF6EC',
                          border: '0.5px solid #E8C87A',
                          borderRadius: 8,
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: 14, color: '#F3F0E7', fontWeight: 500 }}>Agent Mode</span>
                          <span
                            style={{
                              background: '#BA7517',
                              color: '#FAF7F2',
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              padding: '2px 8px',
                              borderRadius: 8,
                            }}
                          >
                            Cancelling
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: '#854F0B', margin: '0 0 10px', lineHeight: 1.5 }}>Access continues until billing period ends</p>
                        <button
                          type="button"
                          disabled={addonBusy}
                          onClick={async () => {
                            setAddonBusy(true);
                            try {
                              await reactivateAgentAddon();
                              await refreshUser();
                              await refreshTier();
                            } catch {
                              // ignore
                            } finally {
                              setAddonBusy(false);
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontSize: 12,
                            color: '#F0B84E',
                            textDecoration: 'underline dotted',
                            cursor: addonBusy ? 'default' : 'pointer',
                            fontFamily: 'var(--vp-font-sans)',
                          }}
                        >
                          Changed your mind? Reactivate →
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {addonCheckout && user.email ? (
                  <RazorpayCheckout
                    planKey="agent_addon"
                    agentAddon
                    prefillEmail={user.email}
                    onSuccess={async () => {
                      setAddonCheckout(false);
                      const s = await getSubscriptionStatus();
                      setSub(s);
                      await refreshUser();
                      await refreshTier();
                    }}
                    onError={() => setAddonCheckout(false)}
                    onClose={() => setAddonCheckout(false)}
                  />
                ) : null}
              </>
            )}
          </div>

          <div style={{ display: activeTab === 'usage' ? 'block' : 'none' }}>
            <h2 className="profile-modal__section-heading">Usage</h2>
            <p className="profile-modal__section-sub">Your activity across Arena and Agent Mode</p>
            {usageLoading ? (
              <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                <MicroLoader />
              </div>
            ) : usageErr || !usage ? (
              <p style={{ fontSize: 13, color: '#8C7355' }}>{usageErr || 'No data'}</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { n: usage.credits_remaining_today, l: 'Today remaining' },
                    { n: usage.credits_remaining_week, l: 'Week remaining' },
                    { n: usage.total_tasks_month, l: 'Tasks this month' },
                  ].map((t) => (
                    <div key={t.l} style={{ background: '#F0E8DC', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 20, color: '#F3F0E7', fontWeight: 500, fontFamily: 'var(--vp-font-sans)' }}>{t.n.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: '#A0A39A', marginTop: 3, letterSpacing: '0.04em' }}>{t.l}</div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const dailyPct = usage.daily_limit > 0 ? (usage.credits_used_today / usage.daily_limit) * 100 : 0;
                  const weeklyPct = usage.weekly_limit > 0 ? (usage.credits_used_week / usage.weekly_limit) * 100 : 0;
                  const dailyFill = dailyPct > 85 ? '#C0392B' : '#F0B84E';
                  const weekFill = weeklyPct > 85 ? '#C0392B' : '#F0B84E';
                  return (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8C7355' }}>Daily limit</span>
                          <span style={{ color: '#A0A39A' }}>
                            {usage.credits_used_today.toLocaleString()} / {usage.daily_limit.toLocaleString()} used
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#EDE4D8', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${Math.min(dailyPct, 100)}%`, background: dailyFill, borderRadius: 3 }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span style={{ color: '#8C7355' }}>Weekly limit</span>
                          <span style={{ color: '#A0A39A' }}>
                            {usage.credits_used_week.toLocaleString()} / {usage.weekly_limit.toLocaleString()} used
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#EDE4D8', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${Math.min(weeklyPct, 100)}%`, background: weekFill, borderRadius: 3 }} />
                        </div>
                      </div>
                    </>
                  );
                })()}
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#A0A39A', letterSpacing: '0.10em', margin: '16px 0 8px' }}>14-day activity</div>
                <UsageChart
                  data={usage.usage_history && usage.usage_history.length === 14 ? usage.usage_history : PLACEHOLDER_HISTORY}
                  isPlaceholder={!usage.usage_history || usage.usage_history.length !== 14}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'var(--vp-font-sans)', marginTop: 6 }}>
                  <span style={{ color: '#C4A882' }}>14 days ago</span>
                  <span style={{ color: '#C4A882' }}>Today</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    margin: '22px 0 10px',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: '#A0A39A',
                      letterSpacing: '0.10em',
                    }}
                  >
                    Activity highlights · {activityWindowDays} days
                  </span>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#A0A39A',
                      fontSize: 11,
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    <span>Window</span>
                    <select
                      aria-label="Activity highlights window"
                      disabled={activeExport !== null}
                      value={activityWindowDays}
                      onChange={(event) => {
                        clearExportFeedback();
                        setActivityWindowDays(Number(event.target.value));
                      }}
                      style={{
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 5,
                        background: '#F0E8DC',
                        color: '#F3F0E7',
                        padding: '4px 6px',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        opacity: activeExport !== null ? 0.65 : 1,
                      }}
                    >
                      {ACTIVITY_HIGHLIGHT_WINDOWS.map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {activityLoading ? (
                  <div style={{ padding: '18px 0', display: 'flex', justifyContent: 'center' }} role="status">
                    <MicroLoader label="Loading activity highlights" />
                  </div>
                ) : activityErr ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 13, color: '#8C7355', margin: 0 }} aria-live="polite">
                      {activityErr}
                    </p>
                    <button
                      type="button"
                      aria-label="Retry loading activity highlights"
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: '#F0E8DC',
                        color: '#F3F0E7',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                      onClick={() => setActivityReload((n) => n + 1)}
                    >
                      Retry
                    </button>
                  </div>
                ) : activity ? (
                  <div role="group" aria-label="Activity highlights">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                      {[
                        {
                          n: `${activity.current_streak} day${activity.current_streak === 1 ? '' : 's'}`,
                          l: 'Current streak',
                        },
                        {
                          n: `${activity.longest_streak} day${activity.longest_streak === 1 ? '' : 's'}`,
                          l: 'Longest streak',
                        },
                        { n: activity.active_days, l: 'Active days' },
                      ].map((t) => (
                        <div key={t.l} style={{ background: '#F0E8DC', borderRadius: 8, padding: '12px 14px' }}>
                          <div style={{ fontSize: 18, color: '#F3F0E7', fontWeight: 500, fontFamily: 'var(--vp-font-sans)' }}>{t.n}</div>
                          <div style={{ fontSize: 10, color: '#A0A39A', marginTop: 3, letterSpacing: '0.04em' }}>{t.l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                      {[
                        { n: activity.totals.prompts, l: 'Prompts' },
                        { n: activity.totals.debates, l: 'Debates' },
                        { n: activity.totals.discusses, l: 'Discusses' },
                        { n: activity.totals.agent_runs, l: 'Agent runs' },
                      ].map((t) => (
                        <div key={t.l} style={{ background: '#EDE4D8', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 16, color: '#F3F0E7', fontWeight: 500, fontFamily: 'var(--vp-font-sans)' }}>{t.n.toLocaleString()}</div>
                          <div style={{ fontSize: 9, color: '#A0A39A', marginTop: 2, letterSpacing: '0.04em' }}>{t.l}</div>
                        </div>
                      ))}
                    </div>
                    {activity.busiest_day ? (
                      <p style={{ fontSize: 12, color: '#8C7355', margin: '0 0 16px' }}>
                        Busiest day:{' '}
                        <strong style={{ color: '#F0B84E' }}>{activity.busiest_day}</strong> (
                        {activity.busiest_day_count} actions)
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    margin: '22px 0 10px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: '#A0A39A',
                      letterSpacing: '0.10em',
                    }}
                  >
                    Category performance · {activityWindowDays} days
                  </div>
                </div>
                {categoryStatsLoading ? (
                  <div style={{ padding: '18px 0', display: 'flex', justifyContent: 'center' }} role="status">
                    <MicroLoader label="Loading category performance" />
                  </div>
                ) : categoryStatsErr ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 13, color: '#8C7355', margin: 0 }} aria-live="polite">
                      {categoryStatsErr}
                    </p>
                    <button
                      type="button"
                      aria-label="Retry loading category performance"
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: '#F0E8DC',
                        color: '#F3F0E7',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                      onClick={() => setCategoryStatsReload((n) => n + 1)}
                    >
                      Retry
                    </button>
                  </div>
                ) : categoryStats ? (
                  <div role="group" aria-label="Category performance">
                    {categoryStats.categories.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#8C7355', margin: 0 }}>
                        No prompt categories recorded in the last {activityWindowDays} days yet.
                      </p>
                    ) : (
                      <>
                        <p style={{ fontSize: 12, color: '#8C7355', margin: '0 0 10px' }}>
                          Most active:{' '}
                          <strong style={{ color: '#F0B84E' }}>
                            {categoryStats.most_active_category || '—'}
                          </strong>{' '}
                          · {categoryStats.total_appearances} scored rounds
                        </p>
                        <div style={{ overflowX: 'auto' }}>
                          <table
                            style={{
                              width: '100%',
                              minWidth: 440,
                              borderCollapse: 'collapse',
                              fontFamily: 'var(--vp-font-sans)',
                              fontSize: 12,
                            }}
                          >
                            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                              Category performance for the selected activity window
                            </caption>
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', color: '#A0A39A', fontWeight: 500, padding: '4px 8px 8px 0' }}>
                                  Category
                                </th>
                                <th style={{ textAlign: 'right', color: '#A0A39A', fontWeight: 500, padding: '4px 0 8px 8px' }}>
                                  Rounds
                                </th>
                                <th style={{ textAlign: 'right', color: '#A0A39A', fontWeight: 500, padding: '4px 0 8px 8px' }}>
                                  Wins
                                </th>
                                <th style={{ textAlign: 'right', color: '#A0A39A', fontWeight: 500, padding: '4px 0 8px 8px' }}>
                                  Rate
                                </th>
                                <th style={{ textAlign: 'right', color: '#A0A39A', fontWeight: 500, padding: '4px 0 8px 8px' }}>
                                  Best mind
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {categoryStats.categories.map((row) => (
                                <tr key={row.category}>
                                  <td style={{ padding: '5px 8px 5px 0', borderTop: '0.5px solid #E0D5C5', color: '#F3F0E7' }}>
                                    {row.category}
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '5px 0 5px 8px', borderTop: '0.5px solid #E0D5C5', color: '#A0A39A' }}>
                                    {row.appearances}
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '5px 0 5px 8px', borderTop: '0.5px solid #E0D5C5', color: '#A0A39A' }}>
                                    {row.wins}
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '5px 0 5px 8px', borderTop: '0.5px solid #E0D5C5', color: '#F0B84E' }}>
                                    {Math.round(row.win_rate * 100)}%
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '5px 0 5px 8px', borderTop: '0.5px solid #E0D5C5', color: '#A0A39A' }}>
                                    {row.best_persona_id ? formatCategoryPersona(row.best_persona_id) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    margin: '22px 0 10px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: '#A0A39A',
                      letterSpacing: '0.10em',
                    }}
                  >
                    Capability usage · {capabilityWindowDays} days
                  </div>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#A0A39A',
                      fontSize: 11,
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    <span>Window</span>
                    <select
                      aria-label="Capability usage window"
                      value={capabilityWindowDays}
                      onChange={(event) => {
                        setCapabilityWindowDays(Number(event.target.value));
                      }}
                      style={{
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 5,
                        background: '#F0E8DC',
                        color: '#F3F0E7',
                        padding: '4px 6px',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                    >
                      {[7, 30, 90].map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {capabilityUsageLoading ? (
                  <div style={{ padding: '18px 0', display: 'flex', justifyContent: 'center' }} role="status">
                    <MicroLoader label="Loading capability usage" />
                  </div>
                ) : capabilityUsageErr ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 13, color: '#8C7355', margin: 0 }} aria-live="polite">
                      {capabilityUsageErr}
                    </p>
                    <button
                      type="button"
                      aria-label="Retry loading capability usage"
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: '#F0E8DC',
                        color: '#F3F0E7',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                      onClick={() => setCapabilityUsageReload((n) => n + 1)}
                    >
                      Retry
                    </button>
                  </div>
                ) : capabilityUsage ? (
                  <div role="group" aria-label="Capability usage">
                    {(() => {
                      // totals.all skips 'other'-mode calls; the mode
                      // split is the complete count, so headline from it.
                      const modeEntries = Object.entries(capabilityUsage.byMode).filter(
                        ([, count]) => count > 0,
                      );
                      const grandTotal =
                        modeEntries.reduce((sum, [, count]) => sum + count, 0) ||
                        capabilityUsage.totals.all;
                      return (
                        <>
                          <p style={{ fontSize: 12, color: '#8C7355', margin: '0 0 6px' }}>
                            {grandTotal.toLocaleString()}{' '}
                            {grandTotal === 1 ? 'call' : 'calls'} in window
                          </p>
                          {modeEntries.length > 0 ? (
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 6,
                                margin: '0 0 10px',
                              }}
                            >
                              {modeEntries.map(([mode, count]) => (
                                <span
                                  key={mode}
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 7px',
                                    borderRadius: 9,
                                    border: '0.5px solid #E0D5C5',
                                    background: '#F0E8DC',
                                    color: mode === 'agent' ? '#F0B84E' : '#A0A39A',
                                  }}
                                >
                                  {count.toLocaleString()} {mode}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                    {capabilityUsage.byCategory.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#8C7355', margin: 0 }}>
                        No Agent calls recorded in the last {capabilityWindowDays} days yet.
                      </p>
                    ) : (
                      (() => {
                        const maxCount = Math.max(
                          ...capabilityUsage.byCategory.map((row) => row.count),
                        );
                        return (
                          <div style={{ display: 'grid', gap: 7 }}>
                            {capabilityUsage.byCategory.map((row) => (
                              <div key={row.category}>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: 11,
                                    marginBottom: 3,
                                  }}
                                >
                                  <span style={{ color: '#F3F0E7' }}>{row.category}</span>
                                  <span style={{ color: '#A0A39A' }}>
                                    {row.count.toLocaleString()}
                                    {row.count === 1 ? ' call' : ' calls'}
                                  </span>
                                </div>
                                <div
                                  role="img"
                                  aria-label={`${row.category}: ${row.count} ${
                                    row.count === 1 ? 'call' : 'calls'
                                  }`}
                                  style={{ height: 5, background: '#EDE4D8', borderRadius: 3 }}
                                >
                                  <div
                                    style={{
                                      height: '100%',
                                      width: `${
                                        maxCount > 0 ? (row.count / maxCount) * 100 : 0
                                      }%`,
                                      background: '#F0B84E',
                                      borderRadius: 3,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    )}
                  </div>
                ) : null}
                <button
                  type="button"
                  aria-expanded={capReferenceOpen}
                  onClick={() => {
                    setCapReferenceOpen((open) => !open);
                  }}
                  style={{
                    marginTop: 14,
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    color: '#F0B84E',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'var(--vp-font-sans)',
                    textDecoration: 'underline',
                  }}
                >
                  {capReferenceOpen
                    ? 'Hide capability reference'
                    : `View capability reference${capList ? ` (${capList.length})` : ''}`}
                </button>
                {capReferenceOpen ? (
                  <div
                    role="region"
                    aria-label="Capability reference"
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      background: '#F0E8DC',
                      borderRadius: 8,
                    }}
                  >
                    {capListLoading ? (
                      <div
                        style={{ padding: '18px 0', display: 'flex', justifyContent: 'center' }}
                        role="status"
                      >
                        <MicroLoader label="Loading capability reference" />
                      </div>
                    ) : capListErr ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <p style={{ fontSize: 13, color: '#8C7355', margin: 0 }} aria-live="polite">
                          {capListErr}
                        </p>
                        <button
                          type="button"
                          aria-label="Retry loading capability reference"
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            border: '0.5px solid #E0D5C5',
                            background: '#F0E8DC',
                            color: '#F3F0E7',
                            fontSize: 11,
                            cursor: 'pointer',
                            fontFamily: 'var(--vp-font-sans)',
                          }}
                          onClick={() => setCapReferenceReload((n) => n + 1)}
                        >
                          Retry
                        </button>
                      </div>
                    ) : capList && capList.length > 0 ? (
                      <div style={{ display: 'grid', gap: 4 }}>
                        {capList.map((cap) => {
                          const docOpen = capOpenDocId === cap.id;
                          const cachedDoc = capDocs[cap.id];
                          // Facts only the stats endpoint knows — shown
                          // without expanding, when they exist at all.
                          const stat = capStats[cap.id];
                          const statBits: string[] = [];
                          if (stat?.conduraMethod) {
                            statBits.push(`condura ${stat.conduraMethod}`);
                          }
                          if (typeof stat?.streamHeartbeatSeconds === 'number') {
                            statBits.push(`stream heartbeat ${formatHeartbeat(stat.streamHeartbeatSeconds)}`);
                          }
                          return (
                            <div key={cap.id}>
                              <button
                                type="button"
                                aria-expanded={docOpen}
                                aria-label={
                                  docOpen
                                    ? `Collapse capability ${cap.id}`
                                    : `Expand capability ${cap.id}`
                                }
                                onClick={() => toggleCapabilityDoc(cap)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  border: 'none',
                                  background: 'none',
                                  cursor: 'pointer',
                                  borderRadius: 6,
                                  fontFamily: 'var(--vp-font-sans)',
                                }}
                              >
                                <span
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                  }}
                                >
                                  <span style={{ fontSize: 12, color: '#F3F0E7', fontWeight: 600 }}>
                                    {cap.id}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 9,
                                      padding: '1px 6px',
                                      borderRadius: 8,
                                      border: '0.5px solid #E0D5C5',
                                      background: '#EDE4D8',
                                      color: '#A0A39A',
                                      letterSpacing: '0.04em',
                                    }}
                                  >
                                    {cap.execution || 'server'}
                                  </span>
                                </span>
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: 11,
                                    color: '#8C7355',
                                    marginTop: 2,
                                  }}
                                >
                                  {cap.description}
                                </span>
                              </button>
                              {/* Outside the toggle on purpose — its aria-label
                                  would otherwise mask these facts from screen
                                  readers entirely. */}
                              {statBits.length > 0 ? (
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: 9,
                                    color: '#A0A39A',
                                    margin: '2px 8px 4px',
                                    letterSpacing: '0.03em',
                                  }}
                                >
                                  {statBits.join(' · ')}
                                </span>
                              ) : null}
                              {docOpen ? (
                                <div style={{ padding: '2px 8px 6px' }}>
                                  {capDocBusyId === cap.id ? (
                                    <p style={{ fontSize: 11, color: '#A0A39A', margin: 0 }}>
                                      Loading doc…
                                    </p>
                                  ) : capDocErrId === cap.id && capDocErrText ? (
                                    <p
                                      role="alert"
                                      style={{ fontSize: 11, color: '#993C1D', margin: 0 }}
                                    >
                                      {capDocErrText}
                                    </p>
                                  ) : cachedDoc ? (
                                    <>
                                      <div style={{ maxWidth: '100%' }}>
                                        <CapabilityDocBody markdown={cachedDoc.markdown} />
                                      </div>
                                      {(capExamples[cap.id] ?? []).length > 0 ? (
                                        <div style={{ marginTop: 6 }}>
                                          <div
                                            style={{
                                              fontSize: 10,
                                              textTransform: 'uppercase',
                                              color: '#A0A39A',
                                              letterSpacing: '0.10em',
                                              marginBottom: 4,
                                            }}
                                          >
                                            Try it
                                          </div>
                                          <div style={{ display: 'grid', gap: 3 }}>
                                            {(capExamples[cap.id] ?? []).map((example, index) => {
                                              const exampleKey = `${cap.id}:${index}`;
                                              const copied = copiedExampleKey === exampleKey;
                                              return (
                                                <div
                                                  key={exampleKey}
                                                  style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 8,
                                                  }}
                                                >
                                                  <span
                                                    style={{
                                                      fontSize: 11,
                                                      lineHeight: 1.5,
                                                      color: '#C4A882',
                                                      // Prompts wrap rather than
                                                      // truncate: read what you
                                                      // copy.
                                                      minWidth: 0,
                                                    }}
                                                  >
                                                    “{example}”
                                                  </span>
                                                  <button
                                                    type="button"
                                                    aria-live="polite"
                                                    aria-label={`Copy example prompt ${
                                                      index + 1
                                                    } for capability ${cap.id}`}
                                                    onClick={() =>
                                                      void copyCapabilityExample(example, exampleKey)
                                                    }
                                                    style={{
                                                      background: 'none',
                                                      border: '0.5px solid #E0D5C5',
                                                      borderRadius: 4,
                                                      padding: '1px 6px',
                                                      fontSize: 10,
                                                      color: copied ? '#F0B84E' : '#A0A39A',
                                                      cursor: 'pointer',
                                                      fontFamily: 'var(--vp-font-sans)',
                                                      flexShrink: 0,
                                                    }}
                                                  >
                                                    {copied ? 'Copied' : 'Copy'}
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: '#8C7355', margin: 0 }}>
                        No capabilities registered yet.
                      </p>
                    )}
                    {capExamplesErr ? (
                      <p style={{ fontSize: 11, color: '#A0A39A', margin: '8px 0 0' }}>
                        Example prompts are unavailable right now.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    margin: '22px 0 10px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: '#A0A39A',
                      letterSpacing: '0.10em',
                    }}
                  >
                    Persona win rates · {winRateWindowDays} days
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: '#A0A39A',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                    >
                      <span>Window</span>
                      <select
                        aria-label="Persona win-rate window"
                        disabled={activeExport !== null}
                        value={winRateWindowDays}
                        onChange={(event) => {
                          clearExportFeedback();
                          setWinRateWindowDays(Number(event.target.value));
                        }}
                        style={{
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 5,
                          background: '#F0E8DC',
                          color: '#F3F0E7',
                          padding: '4px 6px',
                          fontSize: 11,
                          fontFamily: 'var(--vp-font-sans)',
                        }}
                      >
                        {PERSONA_WIN_RATE_WINDOWS.map((days) => (
                          <option key={days} value={days}>
                            {days} days
                          </option>
                        ))}
                      </select>
                    </label>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: '#A0A39A',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                    >
                      <span>Minimum sample</span>
                      <select
                        aria-label="Persona win-rate minimum appearances"
                        disabled={activeExport !== null}
                        value={winRateMinAppearances}
                        onChange={(event) => {
                          clearExportFeedback();
                          setWinRateMinAppearances(Number(event.target.value));
                        }}
                        style={{
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 5,
                          background: '#F0E8DC',
                          color: '#F3F0E7',
                          padding: '4px 6px',
                          fontSize: 11,
                          fontFamily: 'var(--vp-font-sans)',
                        }}
                      >
                        {PERSONA_WIN_RATE_MIN_APPEARANCES.map((appearances) => (
                          <option key={appearances} value={appearances}>
                            {appearances === 1 ? 'Any sample' : `${appearances}+ appearances`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        color: '#A0A39A',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                    >
                      <span>Sort</span>
                      <select
                        aria-label="Persona win-rate sort"
                        value={winRateSort}
                        onChange={(event) => setWinRateSort(event.target.value as PersonaWinRateSort)}
                        style={{
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 5,
                          background: '#F0E8DC',
                          color: '#F3F0E7',
                          padding: '4px 6px',
                          fontSize: 11,
                          fontFamily: 'var(--vp-font-sans)',
                        }}
                      >
                        {Object.entries(PERSONA_WIN_RATE_SORT_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label
                      title="Fallback scorings have an arbitrary winner because the scorer could not judge the panel."
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        color: '#A0A39A',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label="Include fallback scorings"
                        disabled={activeExport !== null}
                        checked={winRateIncludeFallback}
                        onChange={(event) => {
                          clearExportFeedback();
                          setWinRateIncludeFallback(event.target.checked);
                        }}
                      />
                      <span>Include fallback</span>
                    </label>
                  </div>
                </div>
                {winRateLoading ? (
                  <div style={{ padding: '18px 0', display: 'flex', justifyContent: 'center' }} role="status">
                    <MicroLoader label="Loading persona win rates" />
                  </div>
                ) : winRateErr ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 13, color: '#8C7355', margin: 0 }} aria-live="polite">
                      {winRateErr}
                    </p>
                    <button
                      type="button"
                      aria-label="Retry loading persona win rates"
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: '0.5px solid var(--vp-rule-dark, #E0D5C5)',
                        background: 'var(--vp-carbon-3, #F0E8DC)',
                        color: 'var(--vp-ivory, #F3F0E7)',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'var(--vp-font-sans)',
                      }}
                      onClick={() => setWinRateReload((n) => n + 1)}
                    >
                      Retry
                    </button>
                  </div>
                ) : winRate ? (
                  <>
                    {winRate.include_fallback ? (
                      <p
                        role="note"
                        style={{
                          fontSize: 11,
                          color: '#8C5A2C',
                          margin: '0 0 10px',
                          lineHeight: 1.4,
                        }}
                      >
                        Includes {winRate.fallback_exchanges} fallback scoring
                        {winRate.fallback_exchanges === 1 ? '' : 's'}; those winners are provisional because the panel was not judged.
                      </p>
                    ) : null}
                    {winRate.personas.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#8C7355', margin: 0 }}>
                        {winRate.scored_exchanges === 0 && winRate.fallback_exchanges > 0
                          ? `No judged panels in the last ${winRateWindowDays} days yet — fallback scorings are excluded.`
                            : winRate.scored_exchanges === 0 && winRate.unattributed_exchanges > 0
                              ? `No panels with recorded appearances in the last ${winRateWindowDays} days yet.`
                              : winRate.min_appearances > 1
                                ? `No persona reached the ${winRate.min_appearances}-appearance minimum in the last ${winRateWindowDays} days.`
                                : `No scored panels in the last ${winRateWindowDays} days yet.`}
                      </p>
                    ) : (
                      <div role="group" aria-label="Persona win rates">
                      {(() => {
                        const bestRow = winRate.best_persona_id
                          ? winRate.personas.find((row) => row.persona_id === winRate.best_persona_id)
                          : undefined;
                        return bestRow ? (
                          <p style={{ fontSize: 12, color: '#8C7355', margin: '0 0 10px' }}>
                            Best:{' '}
                            <strong style={{ color: '#F0B84E' }}>{bestRow.name}</strong>{' '}
                            ({Math.round(bestRow.win_rate * 100)}% across {bestRow.appearances} panels)
                          </p>
                        ) : null;
                      })()}
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontFamily: 'var(--vp-font-sans)',
                          fontSize: 12,
                        }}
                      >
                        <thead>
                          <tr>
                            <th
                              aria-sort={winRateSort === 'name' ? 'ascending' : undefined}
                              style={{ textAlign: 'left', color: '#A0A39A', fontWeight: 500, padding: '4px 8px 8px 0' }}
                            >
                              Persona
                            </th>
                            <th style={{ textAlign: 'left', color: '#A0A39A', fontWeight: 500, padding: '4px 8px 8px 0' }}>Trend</th>
                            <th
                              aria-sort={winRateSort === 'appearances' ? 'descending' : undefined}
                              style={{ textAlign: 'right', color: '#A0A39A', fontWeight: 500, padding: '4px 0 8px 8px' }}
                            >
                              Appearances
                            </th>
                            <th
                              aria-sort={winRateSort === 'wins' ? 'descending' : undefined}
                              style={{ textAlign: 'right', color: '#A0A39A', fontWeight: 500, padding: '4px 0 8px 8px' }}
                            >
                              Wins
                            </th>
                            <th
                              aria-sort={winRateSort === 'win_rate' ? 'descending' : undefined}
                              style={{ textAlign: 'right', color: '#A0A39A', fontWeight: 500, padding: '4px 0 8px 8px' }}
                            >
                              Rate
                            </th>
                            <th style={{ textAlign: 'right', color: '#A0A39A', fontWeight: 500, padding: '4px 0 8px 8px' }}>
                              Daily
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortPersonaWinRateRows(winRate.personas, winRateSort).map((row) => {
                            const isTimelineOpen = personaTimelinePersonaId === row.persona_id;
                            const timelinePanelId = `persona-timeline-${row.persona_id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                            return (
                              <Fragment key={row.persona_id}>
                                <tr style={{ opacity: row.low_confidence ? 0.65 : 1 }}>
                                  <td style={{ padding: '5px 8px 5px 0', borderTop: '0.5px solid #E0D5C5', color: '#F3F0E7' }}>
                                    {row.color ? (
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          width: 8,
                                          height: 8,
                                          borderRadius: '50%',
                                          background: row.color,
                                          marginRight: 6,
                                        }}
                                      />
                                    ) : null}
                                    {row.name}
                                    {row.low_confidence ? (
                                      <span
                                        title={`Fewer than ${winRate.low_confidence_threshold} scored appearances — treat as provisional`}
                                        style={{ color: '#A0A39A', fontSize: 10, marginLeft: 6 }}
                                      >
                                        low sample
                                      </span>
                                    ) : null}
                                  </td>
                                  <td style={{ padding: '5px 8px 5px 0', borderTop: '0.5px solid #E0D5C5', verticalAlign: 'middle' }}>
                                    <WinRateTrendSparkline
                                      trend={row.trend}
                                      personaName={row.name}
                                      color={row.color}
                                      omittedAppearances={row.trend_omitted_appearances}
                                    />
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '5px 0 5px 8px', borderTop: '0.5px solid #E0D5C5', color: '#A0A39A' }}>
                                    {row.appearances}
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '5px 0 5px 8px', borderTop: '0.5px solid #E0D5C5', color: '#A0A39A' }}>
                                    {row.wins}
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '5px 0 5px 8px', borderTop: '0.5px solid #E0D5C5', color: '#F0B84E' }}>
                                    {Math.round(row.win_rate * 100)}%
                                  </td>
                                  <td style={{ textAlign: 'right', padding: '5px 0 5px 8px', borderTop: '0.5px solid #E0D5C5' }}>
                                    <button
                                      type="button"
                                      aria-expanded={isTimelineOpen}
                                      aria-controls={timelinePanelId}
                                      aria-label={`${isTimelineOpen ? 'Hide' : 'Show'} ${row.name} daily timeline`}
                                      onClick={() => togglePersonaTimeline(row.persona_id)}
                                      style={{
                                        padding: '3px 7px',
                                        border: '0.5px solid #E0D5C5',
                                        borderRadius: 5,
                                        background: isTimelineOpen ? '#EDE4D8' : '#F0E8DC',
                                        color: '#4A3728',
                                        fontSize: 10,
                                        cursor: 'pointer',
                                        fontFamily: 'var(--vp-font-sans)',
                                      }}
                                    >
                                      {isTimelineOpen ? 'Hide' : 'Details'}
                                    </button>
                                  </td>
                                </tr>
                                {isTimelineOpen ? (
                                  <tr>
                                    <td
                                      id={timelinePanelId}
                                      colSpan={6}
                                      style={{
                                        padding: '0 8px 8px 0',
                                        borderTop: '0.5px solid #E0D5C5',
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'flex-end',
                                          gap: 6,
                                          flexWrap: 'wrap',
                                          padding: '6px 0',
                                        }}
                                      >
                                        <button
                                          type="button"
                                          disabled={activeExport !== null}
                                          aria-busy={
                                            activeExport === `persona-category-${row.persona_id}-csv`
                                          }
                                          onClick={() => {
                                            void handlePersonaCategoryExport(row.persona_id, row.name);
                                          }}
                                          style={{
                                            padding: '3px 7px',
                                            border: '0.5px solid #E0D5C5',
                                            borderRadius: 5,
                                            background:
                                              activeExport === `persona-category-${row.persona_id}-csv`
                                                ? '#EDE4D8'
                                                : '#F0E8DC',
                                            color: '#4A3728',
                                            fontSize: 10,
                                            cursor: activeExport !== null ? 'wait' : 'pointer',
                                            fontFamily: 'var(--vp-font-sans)',
                                            opacity:
                                              activeExport !== null &&
                                              activeExport !== `persona-category-${row.persona_id}-csv`
                                                ? 0.6
                                                : 1,
                                          }}
                                        >
                                          {activeExport === `persona-category-${row.persona_id}-csv`
                                            ? '⏳ Exporting…'
                                            : 'Category Breakdown CSV'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={activeExport !== null}
                                          aria-busy={
                                            activeExport === `persona-category-${row.persona_id}-markdown`
                                          }
                                          onClick={() => {
                                            void handlePersonaCategoryExport(row.persona_id, row.name, 'markdown');
                                          }}
                                          style={{
                                            padding: '3px 7px',
                                            border: '0.5px solid #E0D5C5',
                                            borderRadius: 5,
                                            background:
                                              activeExport === `persona-category-${row.persona_id}-markdown`
                                                ? '#EDE4D8'
                                                : '#F0E8DC',
                                            color: '#4A3728',
                                            fontSize: 10,
                                            cursor: activeExport !== null ? 'wait' : 'pointer',
                                            fontFamily: 'var(--vp-font-sans)',
                                            opacity:
                                              activeExport !== null &&
                                              activeExport !== `persona-category-${row.persona_id}-markdown`
                                                ? 0.6
                                                : 1,
                                          }}
                                        >
                                          {activeExport === `persona-category-${row.persona_id}-markdown`
                                            ? '⏳ Exporting…'
                                            : 'Category Breakdown Markdown'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={activeExport !== null}
                                          aria-busy={
                                            activeExport === `persona-category-${row.persona_id}-copy-markdown`
                                          }
                                          onClick={() => {
                                            void handlePersonaCategoryCopyMarkdown(row.persona_id, row.name);
                                          }}
                                          style={{
                                            padding: '3px 7px',
                                            border: '0.5px solid #E0D5C5',
                                            borderRadius: 5,
                                            background:
                                              activeExport === `persona-category-${row.persona_id}-copy-markdown`
                                                ? '#EDE4D8'
                                                : '#F0E8DC',
                                            color: '#4A3728',
                                            fontSize: 10,
                                            cursor: activeExport !== null ? 'wait' : 'pointer',
                                            fontFamily: 'var(--vp-font-sans)',
                                            opacity:
                                              activeExport !== null &&
                                              activeExport !== `persona-category-${row.persona_id}-copy-markdown`
                                                ? 0.6
                                                : 1,
                                          }}
                                        >
                                          {activeExport === `persona-category-${row.persona_id}-copy-markdown`
                                            ? '⏳ Copying…'
                                            : 'Copy Category Breakdown Markdown'}
                                        </button>
                                      </div>
                                      {personaTimelineLoading ? (
                                        <span role="status" style={{ display: 'block', padding: '10px 0', color: '#A0A39A', fontSize: 11 }}>
                                          Loading daily timeline…
                                        </span>
                                      ) : personaTimelineErr ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                                          <span role="alert" style={{ color: '#8C7355', fontSize: 11 }}>
                                            {personaTimelineErr}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setPersonaTimelineReload((value) => value + 1)}
                                            style={{
                                              padding: '3px 7px',
                                              border: '0.5px solid #E0D5C5',
                                              borderRadius: 5,
                                              background: '#F0E8DC',
                                              color: '#4A3728',
                                              fontSize: 10,
                                              cursor: 'pointer',
                                            }}
                                          >
                                            Retry
                                          </button>
                                        </div>
                                      ) : personaTimeline ? (
                                        <PersonaActivityTimeline
                                          timeline={personaTimeline}
                                          color={row.color}
                                          activeAction={
                                            (['csv', 'json', 'markdown', 'copy', 'copy-csv', 'copy-json'] as const).find(
                                              (action) => activeExport === `persona-timeline-${personaTimeline.persona_id}-${action}`,
                                            ) ?? null
                                          }
                                          onExport={(format) => {
                                            void handlePersonaTimelineExport(personaTimeline, format);
                                          }}
                                          onCopyMarkdown={() => {
                                            void handlePersonaTimelineCopy(personaTimeline);
                                          }}
                                          onCopyCsv={() => {
                                            void handlePersonaTimelineCopyCsv(personaTimeline);
                                          }}
                                          onCopyJson={() => {
                                            void handlePersonaTimelineCopyJson(personaTimeline);
                                          }}
                                        />
                                      ) : null}
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    )}
                  </>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    margin: '22px 0 10px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      color: '#A0A39A',
                      letterSpacing: '0.10em',
                    }}
                  >
                    Data exports
                  </div>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#A0A39A',
                      fontSize: 11,
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    <span>Summary window</span>
                    <select
                      aria-label="Analytics summary export window"
                      disabled={activeExport !== null}
                      value={summaryExportWindowDays}
                      onChange={(event) => {
                        clearExportFeedback();
                        setSummaryExportWindowDays(Number(event.target.value));
                      }}
                      style={{
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 5,
                        background: '#F0E8DC',
                        color: '#F3F0E7',
                        padding: '4px 6px',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        opacity: activeExport !== null ? 0.65 : 1,
                      }}
                    >
                      {SUMMARY_EXPORT_WINDOWS.map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#A0A39A',
                      fontSize: 11,
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    <span>Usage window</span>
                    <select
                      aria-label="Usage export window"
                      disabled={activeExport !== null}
                      value={usageExportWindowDays}
                      onChange={(event) => {
                        clearExportFeedback();
                        setUsageExportWindowDays(Number(event.target.value));
                      }}
                      style={{
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 5,
                        background: '#F0E8DC',
                        color: '#F3F0E7',
                        padding: '4px 6px',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        opacity: activeExport !== null ? 0.65 : 1,
                      }}
                    >
                      {USAGE_EXPORT_WINDOWS.map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#A0A39A',
                      fontSize: 11,
                      fontFamily: 'var(--vp-font-sans)',
                    }}
                  >
                    <span>Persona stats window</span>
                    <select
                      aria-label="Persona stats overview window"
                      disabled={activeExport !== null}
                      value={overviewWindowDays}
                      onChange={(event) => {
                        clearExportFeedback();
                        setOverviewWindowDays(Number(event.target.value));
                      }}
                      style={{
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 5,
                        background: '#F0E8DC',
                        color: '#F3F0E7',
                        padding: '4px 6px',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        opacity: activeExport !== null ? 0.65 : 1,
                      }}
                    >
                      {PERSONA_STATS_OVERVIEW_WINDOWS.map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {exportError ? (
                  <p
                    role="alert"
                    aria-live="polite"
                    style={{ fontSize: 12, color: '#993C1D', margin: '0 0 10px' }}
                  >
                    {exportError}
                  </p>
                ) : null}
                {exportNotice ? (
                  <p
                    role="status"
                    aria-live="polite"
                    style={{ fontSize: 12, color: '#3F6B4A', margin: '0 0 10px' }}
                  >
                    {exportNotice}
                  </p>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'summary' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'summary' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('summary');
                      clearExportFeedback();
                      try {
                        const blob = await exportAnalyticsSummaryCsv(summaryExportWindowDays);
                        if (!downloadBlobFile(blob, `arena-analytics-summary-${summaryExportWindowDays}d.csv`)) {
                          setExportError('Could not download analytics summary CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download analytics summary CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'summary' ? '⏳ Downloading…' : '📊 Summary Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'summary-copy-csv'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'summary-copy-csv' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'summary-copy-csv' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('summary-copy-csv');
                      clearExportFeedback();
                      try {
                        const blob = await exportAnalyticsSummaryCsv(summaryExportWindowDays);
                        const copied = await copyCsvToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied analytics summary CSV to the clipboard.');
                        } else {
                          setExportError('Could not copy analytics summary CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy analytics summary CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'summary-copy-csv' ? '⏳ Copying…' : '📊 Copy Summary CSV'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'summary-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'summary-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('summary-json');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsSummaryJson(summaryExportWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download analytics summary JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download analytics summary JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'summary-json' ? '⏳ Downloading…' : '📊 Summary JSON Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'summary-copy-json'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'summary-copy-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'summary-copy-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('summary-copy-json');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsSummaryJson(summaryExportWindowDays);
                        const copied = await copyToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied analytics summary JSON to the clipboard.');
                        } else {
                          setExportError('Could not copy analytics summary JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy analytics summary JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'summary-copy-json' ? '⏳ Copying…' : '📊 Copy Summary JSON'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'summary-markdown' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'summary-markdown' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('summary-markdown');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsSummaryMarkdown(summaryExportWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download analytics summary Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download analytics summary Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'summary-markdown' ? '⏳ Downloading…' : '📊 Summary Markdown Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'summary-copy'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'summary-copy' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'summary-copy' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('summary-copy');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsSummaryMarkdown(summaryExportWindowDays);
                        const copied = await copyToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied analytics summary Markdown to the clipboard.');
                        } else {
                          setExportError('Could not copy analytics summary Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy analytics summary Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'summary-copy' ? '⏳ Copying…' : '📊 Copy Summary Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaWinRateCsv(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona win-rate CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona win-rate CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate' ? '⏳ Downloading…' : '🏆 Win Rates Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'win-rate-trend'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-trend' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-trend' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-trend');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaWinRateTrendCsv(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona win-rate trend CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona win-rate trend CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-trend' ? '⏳ Downloading…' : '🏆 Win Rates Trend CSV'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'win-rate-trend-json'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-trend-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-trend-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-trend-json');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaWinRateTrendJson(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona win-rate trend JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona win-rate trend JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-trend-json' ? '⏳ Downloading…' : '🏆 Win Rates Trend JSON'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-label="Copy persona win-rate trend JSON"
                    aria-busy={activeExport === 'win-rate-trend-copy-json'}
                    title="Copy the filtered persona win-rate trend as JSON"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-trend-copy-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-trend-copy-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-trend-copy-json');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaWinRateTrendJson(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        const copied = await copyJsonToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona win-rate trend JSON to the clipboard.');
                        } else {
                          setExportError('Could not copy persona win-rate trend JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona win-rate trend JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-trend-copy-json' ? '⏳ Copying…' : '🏆 Copy Win Rates Trend JSON'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-label="Copy persona win-rate trend CSV"
                    aria-busy={activeExport === 'win-rate-trend-copy'}
                    title="Copy the filtered persona win-rate trend as CSV"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-trend-copy' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-trend-copy' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-trend-copy');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaWinRateTrendCsv(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        const copied = await copyCsvToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona win-rate trend CSV to the clipboard.');
                        } else {
                          setExportError('Could not copy persona win-rate trend CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona win-rate trend CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-trend-copy' ? '⏳ Copying…' : '🏆 Copy Win Rates Trend CSV'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'win-rate-trend-md'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-trend-md' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-trend-md' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-trend-md');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaWinRateTrendMarkdown(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona win-rate trend Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona win-rate trend Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-trend-md' ? '⏳ Downloading…' : '🏆 Win Rates Trend Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-label="Copy persona win-rate trend Markdown"
                    aria-busy={activeExport === 'win-rate-trend-copy-md'}
                    title="Copy the filtered persona win-rate trend as Markdown"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-trend-copy-md' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-trend-copy-md' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-trend-copy-md');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaWinRateTrendMarkdown(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        const copied = await copyMarkdownToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona win-rate trend Markdown to the clipboard.');
                        } else {
                          setExportError('Could not copy persona win-rate trend Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona win-rate trend Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-trend-copy-md' ? '⏳ Copying…' : '🏆 Copy Win Rates Trend Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'win-rate-copy-csv'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-copy-csv' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-copy-csv' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-copy-csv');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaWinRateCsv(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        const copied = await copyCsvToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona win-rate CSV to the clipboard.');
                        } else {
                          setExportError('Could not copy persona win-rate CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona win-rate CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-copy-csv' ? '⏳ Copying…' : '🏆 Copy Win Rates CSV'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-md' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-md' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-md');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaWinRateMarkdown(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona win-rate Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona win-rate Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-md' ? '⏳ Downloading…' : '🏆 Win Rates Markdown Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-copy' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-copy' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-copy');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaWinRateMarkdown(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        const copied = await copyToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona win rates Markdown to the clipboard.');
                        } else {
                          setExportError('Could not copy persona win-rate Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona win-rate Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-copy' ? '⏳ Copying…' : '🏆 Copy Win Rates Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-json');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaWinRateJson(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona win-rate JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona win-rate JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-json' ? '⏳ Downloading…' : '🏆 Win Rates JSON Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'win-rate-copy-json'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'win-rate-copy-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'win-rate-copy-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('win-rate-copy-json');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaWinRateJson(
                          winRateWindowDays,
                          winRateMinAppearances,
                          winRateIncludeFallback,
                        );
                        const copied = await copyToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona win-rate JSON to the clipboard.');
                        } else {
                          setExportError('Could not copy persona win-rate JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona win-rate JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'win-rate-copy-json' ? '⏳ Copying…' : '🏆 Copy Win Rates JSON'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'category' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'category' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('category');
                      clearExportFeedback();
                      try {
                        const blob = await exportAnalyticsCategoryStatsCsv(activityWindowDays);
                        if (!downloadBlobFile(blob, `arena-category-stats-${activityWindowDays}d.csv`)) {
                          setExportError('Could not download category stats CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download category stats CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'category'
                      ? '⏳ Downloading…'
                      : `📂 Categories Export · ${activityWindowDays}d`}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'category-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'category-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('category-json');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsCategoryStatsJson(activityWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download category stats JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download category stats JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'category-json' ? '⏳ Downloading…' : '📂 Categories JSON Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'category-markdown' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'category-markdown' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('category-markdown');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsCategoryStatsMarkdown(activityWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download category stats Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download category stats Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'category-markdown'
                      ? '⏳ Downloading…'
                      : '📂 Categories Markdown Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'category-copy' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'category-copy' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('category-copy');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsCategoryStatsMarkdown(activityWindowDays);
                        const copied = await copyToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied category stats Markdown to the clipboard.');
                        } else {
                          setExportError('Could not copy category stats Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy category stats Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'category-copy'
                      ? '⏳ Copying…'
                      : '📂 Copy Categories Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'activity' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'activity' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('activity');
                      clearExportFeedback();
                      try {
                        const blob = await exportAnalyticsActivityCsv(activityWindowDays);
                        if (!downloadBlobFile(blob, `arena-activity-${activityWindowDays}d.csv`)) {
                          setExportError('Could not download activity CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download activity CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'activity'
                      ? '⏳ Downloading…'
                      : `🗓️ Activity Export · ${activityWindowDays}d`}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'activity-copy-csv'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'activity-copy-csv' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'activity-copy-csv' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('activity-copy-csv');
                      clearExportFeedback();
                      try {
                        const blob = await exportAnalyticsActivityCsv(activityWindowDays);
                        const copied = await copyCsvToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied activity CSV to the clipboard.');
                        } else {
                          setExportError('Could not copy activity CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy activity CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'activity-copy-csv' ? '⏳ Copying…' : '🗓️ Copy Activity CSV'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'activity-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'activity-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('activity-json');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsActivityJson(activityWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download activity JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download activity JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'activity-json' ? '⏳ Downloading…' : '🗓️ Activity JSON Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'activity-copy-json'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'activity-copy-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'activity-copy-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('activity-copy-json');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsActivityJson(activityWindowDays);
                        const copied = await copyToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied activity JSON to the clipboard.');
                        } else {
                          setExportError('Could not copy activity JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy activity JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'activity-copy-json' ? '⏳ Copying…' : '🗓️ Copy Activity JSON'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'activity-markdown' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'activity-markdown' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('activity-markdown');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsActivityMarkdown(activityWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download activity Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download activity Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'activity-markdown' ? '⏳ Downloading…' : '🗓️ Activity Markdown Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'activity-copy'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'activity-copy' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'activity-copy' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('activity-copy');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsActivityMarkdown(activityWindowDays);
                        const copied = await copyToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied activity Markdown to the clipboard.');
                        } else {
                          setExportError('Could not copy activity Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy activity Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'activity-copy' ? '⏳ Copying…' : '🗓️ Copy Activity Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'usage-history' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'usage-history' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('usage-history');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportUserUsageCsv(usageExportWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download usage CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download usage CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'usage-history' ? '⏳ Downloading…' : '📈 Usage History Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'usage-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'usage-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('usage-json');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportUserUsageJson(usageExportWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download usage JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download usage JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'usage-json' ? '⏳ Downloading…' : '🧾 Usage JSON Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'usage-markdown' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'usage-markdown' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('usage-markdown');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportUserUsageMarkdown(usageExportWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download usage Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download usage Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'usage-markdown' ? '⏳ Downloading…' : '📝 Usage Markdown Export'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'usage-copy'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'usage-copy' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'usage-copy' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('usage-copy');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportUserUsageMarkdown(usageExportWindowDays);
                        const copied = await copyMarkdownToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied usage Markdown to the clipboard.');
                        } else {
                          setExportError('Could not copy usage Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy usage Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'usage-copy' ? '⏳ Copying…' : '📝 Copy Usage Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'overview'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'overview' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'overview' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('overview');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaStatsOverviewCsv(overviewWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona stats CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona stats CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'overview' ? '⏳ Downloading…' : '🤖 Persona Stats CSV'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'overview-json'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'overview-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'overview-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('overview-json');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaStatsOverviewJson(overviewWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona stats JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona stats JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'overview-json' ? '⏳ Downloading…' : '🤖 Persona Stats JSON'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'overview-markdown'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'overview-markdown' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'overview-markdown' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('overview-markdown');
                      clearExportFeedback();
                      try {
                        const { blob, filename } = await exportAnalyticsPersonaStatsOverviewMarkdown(overviewWindowDays);
                        if (!downloadBlobFile(blob, filename)) {
                          setExportError('Could not download persona stats Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not download persona stats Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'overview-markdown' ? '⏳ Downloading…' : '🤖 Persona Stats Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'overview-copy-csv'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'overview-copy-csv' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'overview-copy-csv' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('overview-copy-csv');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaStatsOverviewCsv(overviewWindowDays);
                        const copied = await copyCsvToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona stats CSV to the clipboard.');
                        } else {
                          setExportError('Could not copy persona stats CSV — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona stats CSV — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'overview-copy-csv' ? '⏳ Copying…' : '🤖 Copy Persona Stats CSV'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'overview-copy-markdown'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'overview-copy-markdown' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'overview-copy-markdown' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('overview-copy-markdown');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaStatsOverviewMarkdown(overviewWindowDays);
                        const copied = await copyMarkdownToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona stats Markdown to the clipboard.');
                        } else {
                          setExportError('Could not copy persona stats Markdown — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona stats Markdown — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'overview-copy-markdown' ? '⏳ Copying…' : '🤖 Copy Persona Stats Markdown'}
                  </button>
                  <button
                    type="button"
                    disabled={activeExport !== null}
                    aria-busy={activeExport === 'overview-copy-json'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'overview-copy-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#4A3728',
                      fontSize: 12,
                      cursor: activeExport !== null ? 'wait' : 'pointer',
                      textAlign: 'left',
                      fontFamily: 'var(--vp-font-sans)',
                      opacity: activeExport !== null && activeExport !== 'overview-copy-json' ? 0.6 : 1,
                    }}
                    onClick={async () => {
                      setActiveExport('overview-copy-json');
                      clearExportFeedback();
                      try {
                        const { blob } = await exportAnalyticsPersonaStatsOverviewJson(overviewWindowDays);
                        const copied = await copyJsonToClipboard(await blob.text());
                        if (copied) {
                          setExportNotice('Copied persona stats JSON to the clipboard.');
                        } else {
                          setExportError('Could not copy persona stats JSON — try again.');
                        }
                      } catch (error) {
                        setExportError(
                          error instanceof ApiError
                            ? error.message
                            : 'Could not copy persona stats JSON — try again.',
                        );
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'overview-copy-json' ? '⏳ Copying…' : '🤖 Copy Persona Stats JSON'}
                  </button>
                </div>

                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: '#A0A39A',
                    letterSpacing: '0.10em',
                    margin: '22px 0 10px',
                  }}
                >
                  Answer confidence calibration
                </div>
                {calLoading ? (
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
                    <MicroLoader />
                  </div>
                ) : calErr ? (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>{calErr}</p>
                ) : calStats && (calStats.total_ratings ?? 0) > 0 ? (
                  <div
                    style={{
                      background: '#F0E8DC',
                      borderRadius: 10,
                      padding: '16px 18px',
                      border: '0.5px solid #E0D5C5',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#A0A39A', marginBottom: 4 }}>Calibration score</div>
                        <div style={{ fontSize: 28, color: '#F3F0E7', fontFamily: 'var(--vp-font-sans)', fontWeight: 500 }}>
                          {calStats.calibration_score ?? 0}
                          <span style={{ fontSize: 14, color: '#8C7355' }}>/100</span>
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 10, color: '#A0A39A', marginBottom: 4 }}>Avg. gap vs system</div>
                        <div style={{ fontSize: 15, color: '#4A3728', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(calStats.avg_delta ?? 0) > 0 ? (
                            <span style={{ color: '#639922' }}>↑</span>
                          ) : (calStats.avg_delta ?? 0) < 0 ? (
                            <span style={{ color: '#C0392B' }}>↓</span>
                          ) : (
                            <span style={{ color: '#8C7355' }}>→</span>
                          )}
                          {(calStats.avg_delta ?? 0).toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: 8,
                            textTransform: 'capitalize',
                            background:
                              calStats.trend === 'improving'
                                ? '#EAF3DE'
                                : calStats.trend === 'diverging'
                                  ? '#FCF0EE'
                                  : '#FDF6EC',
                            color:
                              calStats.trend === 'improving'
                                ? '#3B6D11'
                                : calStats.trend === 'diverging'
                                  ? '#993C1D'
                                  : '#854F0B',
                            border: '0.5px solid',
                            borderColor:
                              calStats.trend === 'improving'
                                ? '#97C459'
                                : calStats.trend === 'diverging'
                                  ? '#F0997B'
                                  : '#E8C87A',
                          }}
                        >
                          {calStats.trend === 'improving'
                            ? 'Improving'
                            : calStats.trend === 'diverging'
                              ? 'Diverging'
                              : 'Stable'}
                        </span>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#A0A39A', marginRight: 4 }}>Last 5</span>
                      {(calStats.recent_ratings ?? []).map((r, i) => {
                        const d = Number(r.delta ?? 0);
                        const a = Math.abs(d);
                        const bg = a <= 10 ? '#639922' : a <= 25 ? '#BA7517' : '#C0392B';
                        return (
                          <span
                            key={`${r.created_at ?? i}`}
                            title={`Δ ${d}`}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: bg,
                              opacity: 0.85,
                            }}
                          />
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      aria-expanded={calHistoryOpen}
                      onClick={() => {
                        setCalHistoryOpen((open) => {
                          if (!open) {
                            setCalHistoryPage(1);
                            setCalHistorySort('newest');
                            setCalHistoryErr(null);
                          }
                          return !open;
                        });
                      }}
                      style={{
                        marginTop: 14,
                        padding: 0,
                        border: 'none',
                        background: 'none',
                        color: '#F0B84E',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontFamily: 'var(--vp-font-sans)',
                        textDecoration: 'underline',
                      }}
                    >
                      {calHistoryOpen
                        ? 'Hide calibration history'
                        : `View calibration history (${calStats.total_ratings ?? 0})`}
                    </button>
                    {calHistoryOpen ? (
                      <div
                        role="region"
                        aria-label="Calibration history"
                        style={{
                          marginTop: 12,
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: '#F8F2EA',
                          border: '0.5px solid #E0D5C5',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            marginBottom: 10,
                          }}
                        >
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              color: '#A0A39A',
                              fontSize: 11,
                              fontFamily: 'var(--vp-font-sans)',
                            }}
                          >
                            <span>Sort</span>
                            <select
                              aria-label="Calibration history sort"
                              value={calHistorySort}
                              onChange={(event) => {
                                setCalHistorySort(event.target.value as CalibrationHistorySort);
                                setCalHistoryPage(1);
                                setCalHistoryErr(null);
                              }}
                              style={{
                                border: '0.5px solid #E0D5C5',
                                borderRadius: 5,
                                background: '#F0E8DC',
                                color: '#4A3728',
                                padding: '4px 6px',
                                fontSize: 11,
                                fontFamily: 'var(--vp-font-sans)',
                              }}
                            >
                              {Object.entries(CALIBRATION_HISTORY_SORT_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {calHistoryLoading ? (
                          <div style={{ padding: 8, display: 'flex', justifyContent: 'center' }}>
                            <MicroLoader />
                          </div>
                        ) : calHistoryErr ? (
                          <div style={{ fontSize: 12, color: '#8C7355' }}>
                            <span>{calHistoryErr}</span>{' '}
                            <button
                              type="button"
                              onClick={() => setCalHistoryReload((reload) => reload + 1)}
                              style={{
                                padding: 0,
                                border: 'none',
                                background: 'none',
                                color: '#F0B84E',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              Retry
                            </button>
                          </div>
                        ) : calHistory && (calHistory.ratings.length > 0 || calHistory.total_pages > 1) ? (
                          <>
                            {calHistory.ratings.length ? (
                              <>
                                <div style={{ fontSize: 10, color: '#A0A39A', marginBottom: 6 }}>
                                  {CALIBRATION_HISTORY_SORT_LABELS[calHistorySort]} · {calHistory.total} total rating
                                  {calHistory.total === 1 ? '' : 's'}
                                </div>
                                {calDeleteError ? (
                                  <p role="alert" style={{ margin: '0 0 6px', fontSize: 12, color: '#993C1D' }}>
                                    {calDeleteError}
                                  </p>
                                ) : null}
                                <div style={{ display: 'grid', gap: 6 }}>
                                  {calHistory.ratings.map((rating) => {
                                    const delta = Number(rating.delta ?? 0);
                                    const busy = calDeleteBusyId === rating.id;
                                    return (
                                      <div
                                        key={rating.id}
                                        title={`Task ${rating.task_id}`}
                                        aria-label={`${formatCalibrationDate(rating.created_at)}: rated ${rating.user_rating} out of 5, delta ${formatSignedDelta(delta)}, ${rating.verdict}`}
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: '72px 42px 48px minmax(0, 1fr) auto',
                                          alignItems: 'center',
                                          gap: 6,
                                          fontSize: 11,
                                          color: '#4A3728',
                                        }}
                                      >
                                        <span>{formatCalibrationDate(rating.created_at)}</span>
                                        <span>{rating.user_rating}/5</span>
                                        <span
                                          style={{
                                            color: Math.abs(delta) <= 10 ? '#639922' : delta > 0 ? '#BA7517' : '#C0392B',
                                            fontWeight: 600,
                                          }}
                                        >
                                          Δ {formatSignedDelta(delta)}
                                        </span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {rating.verdict}
                                        </span>
                                        <span style={{ justifySelf: 'end' }}>
                                          {calConfirmingDeleteId === rating.id ? (
                                            <>
                                              <span style={{ fontSize: 10, color: '#993C1D', marginRight: 4 }}>
                                                Delete forever?
                                              </span>
                                              <button
                                                type="button"
                                                disabled={calDeleteBusyId !== null}
                                                aria-label={`Confirm deleting rating for task ${rating.task_id}`}
                                                onClick={() => void handleCalDeleteConfirm(rating)}
                                                style={{
                                                  background: 'none',
                                                  border: '0.5px solid #D85A30',
                                                  borderRadius: 4,
                                                  padding: '1px 5px',
                                                  fontSize: 10,
                                                  color: busy ? '#A0A39A' : '#993C1D',
                                                  cursor: calDeleteBusyId !== null ? 'wait' : 'pointer',
                                                  fontFamily: 'var(--vp-font-sans)',
                                                }}
                                              >
                                                {busy ? 'Deleting…' : 'Confirm'}
                                              </button>
                                              <button
                                                type="button"
                                                disabled={calDeleteBusyId !== null}
                                                aria-label={`Keep rating for task ${rating.task_id}`}
                                                onClick={handleCalDeleteCancel}
                                                style={{
                                                  background: 'none',
                                                  border: '0.5px solid #E0D8D0',
                                                  borderRadius: 4,
                                                  padding: '1px 5px',
                                                  fontSize: 10,
                                                  marginLeft: 3,
                                                  color: '#4A3728',
                                                  cursor: calDeleteBusyId !== null ? 'wait' : 'pointer',
                                                  fontFamily: 'var(--vp-font-sans)',
                                                }}
                                              >
                                                Keep
                                              </button>
                                            </>
                                          ) : (
                                            <button
                                              type="button"
                                              disabled={calDeleteBusyId !== null}
                                              aria-label={`Delete calibration rating for task ${rating.task_id}`}
                                              onClick={() => handleCalDeleteRequest(rating.id)}
                                              style={{
                                                background: 'none',
                                                border: '0.5px solid #E0D8D0',
                                                borderRadius: 4,
                                                padding: '1px 5px',
                                                fontSize: 10,
                                                color: '#D85A30',
                                                cursor: calDeleteBusyId !== null ? 'wait' : 'pointer',
                                                fontFamily: 'var(--vp-font-sans)',
                                              }}
                                            >
                                              Delete
                                            </button>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <p style={{ fontSize: 12, color: '#8C7355', margin: 0 }}>
                                No calibration ratings on this page.
                              </p>
                            )}
                            <CalibrationHistoryPagination
                              page={calHistoryPage}
                              totalPages={calHistory.total_pages}
                              onPrevious={() => setCalHistoryPage((page) => Math.max(1, page - 1))}
                              onNext={() =>
                                setCalHistoryPage((page) =>
                                  Math.min(Math.max(1, calHistory.total_pages), page + 1),
                                )
                              }
                            />
                          </>
                        ) : (
                          <p style={{ fontSize: 12, color: '#8C7355', margin: 0 }}>
                            No calibration ratings found.
                          </p>
                        )}
                      </div>
                    ) : null}
                    <div
                      style={{
                        marginTop: 14,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        disabled={activeExport !== null}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '0.5px solid #E0D5C5',
                          background:
                            activeExport === 'calibration-csv' ? '#EDE4D8' : '#F0E8DC',
                          color: '#4A3728',
                          fontSize: 12,
                          cursor: activeExport !== null ? 'wait' : 'pointer',
                          textAlign: 'left',
                          fontFamily: 'var(--vp-font-sans)',
                          opacity:
                            activeExport !== null && activeExport !== 'calibration-csv'
                              ? 0.6
                              : 1,
                        }}
                        onClick={async () => {
                          setActiveExport('calibration-csv');
                          clearExportFeedback();
                          try {
                            const { blob, filename } = await exportCalibrationHistoryCsv();
                            if (!downloadBlobFile(blob, filename)) {
                              setExportError('Could not download calibration CSV — try again.');
                            }
                          } catch (error) {
                            setExportError(
                              error instanceof ApiError
                                ? error.message
                                : 'Could not download calibration CSV — try again.',
                            );
                          } finally {
                            setActiveExport(null);
                          }
                        }}
                      >
                        {activeExport === 'calibration-csv'
                          ? '⏳ Downloading…'
                          : '🎯 Calibration CSV Export'}
                      </button>
                      <button
                        type="button"
                        disabled={activeExport !== null}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '0.5px solid #E0D5C5',
                          background:
                            activeExport === 'calibration-json' ? '#EDE4D8' : '#F0E8DC',
                          color: '#4A3728',
                          fontSize: 12,
                          cursor: activeExport !== null ? 'wait' : 'pointer',
                          textAlign: 'left',
                          fontFamily: 'var(--vp-font-sans)',
                          opacity:
                            activeExport !== null && activeExport !== 'calibration-json'
                              ? 0.6
                              : 1,
                        }}
                        onClick={async () => {
                          setActiveExport('calibration-json');
                          clearExportFeedback();
                          try {
                            const { blob, filename } = await exportCalibrationHistoryJson();
                            if (!downloadBlobFile(blob, filename)) {
                              setExportError('Could not download calibration JSON — try again.');
                            }
                          } catch (error) {
                            setExportError(
                              error instanceof ApiError
                                ? error.message
                                : 'Could not download calibration JSON — try again.',
                            );
                          } finally {
                            setActiveExport(null);
                          }
                        }}
                      >
                        {activeExport === 'calibration-json'
                          ? '⏳ Downloading…'
                          : '🎯 Calibration JSON Export'}
                      </button>
                      <button
                        type="button"
                        disabled={activeExport !== null}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '0.5px solid #E0D5C5',
                          background:
                            activeExport === 'calibration-markdown' ? '#EDE4D8' : '#F0E8DC',
                          color: '#4A3728',
                          fontSize: 12,
                          cursor: activeExport !== null ? 'wait' : 'pointer',
                          textAlign: 'left',
                          fontFamily: 'var(--vp-font-sans)',
                          opacity:
                            activeExport !== null && activeExport !== 'calibration-markdown'
                              ? 0.6
                              : 1,
                        }}
                        onClick={async () => {
                          setActiveExport('calibration-markdown');
                          clearExportFeedback();
                          try {
                            const { blob, filename } = await exportCalibrationHistoryMarkdown();
                            if (!downloadBlobFile(blob, filename)) {
                              setExportError('Could not download calibration Markdown — try again.');
                            }
                          } catch (error) {
                            setExportError(
                              error instanceof ApiError
                                ? error.message
                                : 'Could not download calibration Markdown — try again.',
                            );
                          } finally {
                            setActiveExport(null);
                          }
                        }}
                      >
                        {activeExport === 'calibration-markdown'
                          ? '⏳ Downloading…'
                          : '🎯 Calibration Markdown Export'}
                      </button>
                      <button
                        type="button"
                        disabled={activeExport !== null}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '0.5px solid #E0D5C5',
                          background:
                            activeExport === 'calibration-copy' ? '#EDE4D8' : '#F0E8DC',
                          color: '#4A3728',
                          fontSize: 12,
                          cursor: activeExport !== null ? 'wait' : 'pointer',
                          textAlign: 'left',
                          fontFamily: 'var(--vp-font-sans)',
                          opacity:
                            activeExport !== null && activeExport !== 'calibration-copy'
                              ? 0.6
                              : 1,
                        }}
                        onClick={async () => {
                          setActiveExport('calibration-copy');
                          clearExportFeedback();
                          try {
                            const { blob } = await exportCalibrationHistoryMarkdown();
                            const copied = await copyToClipboard(await blob.text());
                            if (copied) {
                              setExportNotice('Copied calibration Markdown to the clipboard.');
                            } else {
                              setExportError('Could not copy calibration Markdown — try again.');
                            }
                          } catch (error) {
                            setExportError(
                              error instanceof ApiError
                                ? error.message
                                : 'Could not copy calibration Markdown — try again.',
                            );
                          } finally {
                            setActiveExport(null);
                          }
                        }}
                      >
                        {activeExport === 'calibration-copy'
                          ? '⏳ Copying…'
                          : '🎯 Copy Calibration Markdown'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>
                    Rate your confidence on completed Agent answers to build your calibration profile.
                  </p>
                )}
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: '#A0A39A',
                    letterSpacing: '0.10em',
                    margin: '22px 0 10px',
                  }}
                >
                  Feedback accuracy
                </div>
                {fbAccLoading ? (
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
                    <MicroLoader />
                  </div>
                ) : fbAccErr ? (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>{fbAccErr}</p>
                ) : fbAcc && fbAcc.total > 0 ? (
                  <div
                    style={{
                      background: '#F0E8DC',
                      borderRadius: 10,
                      padding: '16px 18px',
                      border: '0.5px solid #E0D5C5',
                    }}
                  >
                    <div
                      style={{
                        height: 10,
                        borderRadius: 5,
                        overflow: 'hidden',
                        display: 'flex',
                        background: '#EDE4D8',
                      }}
                    >
                      {fbAcc.correct_pct > 0 ? (
                        <div style={{ width: `${fbAcc.correct_pct}%`, background: '#639922' }} />
                      ) : null}
                      {fbAcc.partial_pct > 0 ? (
                        <div style={{ width: `${fbAcc.partial_pct}%`, background: '#BA7517' }} />
                      ) : null}
                      {fbAcc.wrong_pct > 0 ? (
                        <div style={{ width: `${fbAcc.wrong_pct}%`, background: '#C0392B' }} />
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11 }}>
                      <span style={{ color: '#639922' }}>Correct {fbAcc.correct_pct}%</span>
                      <span style={{ color: '#BA7517' }}>Partial {fbAcc.partial_pct}%</span>
                      <span style={{ color: '#C0392B' }}>Wrong {fbAcc.wrong_pct}%</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#A0A39A', marginTop: 10, marginBottom: 0 }}>
                      Based on {fbAcc.total} rated answer{fbAcc.total === 1 ? '' : 's'}
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>
                    Rate completed Agent answers as correct, partial, or wrong to see your accuracy mix here.
                  </p>
                )}
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: '#A0A39A',
                    letterSpacing: '0.10em',
                    margin: '22px 0 10px',
                  }}
                >
                  Feedback activity
                </div>
                {feedbackSummaryLoading ? (
                  <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
                    <MicroLoader label="Loading feedback activity" />
                  </div>
                ) : feedbackSummaryErr ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 12, color: '#8C7355', margin: 0 }} role="alert">
                      {feedbackSummaryErr}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFeedbackSummaryReload((reload) => reload + 1)}
                      style={{
                        padding: 0,
                        border: 'none',
                        background: 'none',
                        color: '#F0B84E',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontFamily: 'var(--vp-font-sans)',
                        textDecoration: 'underline',
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : feedbackSummary ? (
                  <div
                    style={{
                      background: '#F0E8DC',
                      borderRadius: 10,
                      padding: '14px 16px',
                      border: '0.5px solid #E0D5C5',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        marginBottom: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, color: '#F3F0E7', fontWeight: 500 }}>
                          Ratings over time
                        </div>
                        <div style={{ fontSize: 11, color: '#A0A39A', marginTop: 3 }}>
                          Daily activity, bucketed in UTC
                        </div>
                      </div>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          color: '#A0A39A',
                          fontSize: 11,
                          fontFamily: 'var(--vp-font-sans)',
                        }}
                      >
                        <span>Window</span>
                        <select
                          aria-label="Feedback activity window"
                          value={feedbackSummaryWindowDays}
                          onChange={(event) => {
                            clearExportFeedback();
                            setFeedbackSummaryWindowDays(Number(event.target.value));
                          }}
                          style={{
                            border: '0.5px solid #E0D5C5',
                            borderRadius: 5,
                            background: '#EDE4D8',
                            color: '#4A3728',
                            padding: '4px 6px',
                            fontSize: 11,
                            fontFamily: 'var(--vp-font-sans)',
                          }}
                        >
                          {FEEDBACK_ACTIVITY_WINDOWS.map((days) => (
                            <option key={days} value={days}>
                              {days} days
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <FeedbackActivityTrend summary={feedbackSummary} />
                    {feedbackSummary.total > 0 &&
                    feedbackSummary.daily_trend.every((point) => point.count === 0) ? (
                      <p style={{ fontSize: 11, color: '#A0A39A', margin: '8px 0 0' }}>
                        No ratings in this window. Lifetime total: {feedbackSummary.total}.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={activeExport !== null}
                      style={{
                        width: '100%',
                        marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: activeExport === 'feedback-summary-csv' ? '#EDE4D8' : '#F0E8DC',
                        color: '#4A3728',
                        fontSize: 12,
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--vp-font-sans)',
                        opacity: activeExport !== null && activeExport !== 'feedback-summary-csv' ? 0.6 : 1,
                      }}
                      onClick={async () => {
                        setActiveExport('feedback-summary-csv');
                        clearExportFeedback();
                        try {
                          const { blob, filename } = await exportAgentFeedbackSummaryCsv(
                            feedbackSummaryWindowDays,
                          );
                          if (!downloadBlobFile(blob, filename)) {
                            setExportError('Could not download feedback activity CSV — try again.');
                          }
                        } catch (error) {
                          setExportError(
                            error instanceof ApiError
                              ? error.message
                              : 'Could not download feedback activity CSV — try again.',
                          );
                        } finally {
                          setActiveExport(null);
                        }
                      }}
                    >
                      {activeExport === 'feedback-summary-csv'
                        ? '⏳ Downloading…'
                        : '🧭 Feedback Activity CSV Export'}
                    </button>
                    <button
                      type="button"
                      disabled={activeExport !== null}
                      style={{
                        width: '100%',
                        marginTop: 8,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: activeExport === 'feedback-summary-json' ? '#EDE4D8' : '#F0E8DC',
                        color: '#4A3728',
                        fontSize: 12,
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--vp-font-sans)',
                        opacity: activeExport !== null && activeExport !== 'feedback-summary-json' ? 0.6 : 1,
                      }}
                      onClick={async () => {
                        setActiveExport('feedback-summary-json');
                        clearExportFeedback();
                        try {
                          const { blob, filename } = await exportAgentFeedbackSummaryJson(
                            feedbackSummaryWindowDays,
                          );
                          if (!downloadBlobFile(blob, filename)) {
                            setExportError('Could not download feedback activity JSON — try again.');
                          }
                        } catch (error) {
                          setExportError(
                            error instanceof ApiError
                              ? error.message
                              : 'Could not download feedback activity JSON — try again.',
                          );
                        } finally {
                          setActiveExport(null);
                        }
                      }}
                    >
                      {activeExport === 'feedback-summary-json'
                        ? '⏳ Downloading…'
                        : '🧭 Feedback Activity JSON Export'}
                    </button>
                    <button
                      type="button"
                      disabled={activeExport !== null}
                      style={{
                        width: '100%',
                        marginTop: 8,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: activeExport === 'feedback-summary-markdown' ? '#EDE4D8' : '#F0E8DC',
                        color: '#4A3728',
                        fontSize: 12,
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--vp-font-sans)',
                        opacity: activeExport !== null && activeExport !== 'feedback-summary-markdown' ? 0.6 : 1,
                      }}
                      onClick={async () => {
                        setActiveExport('feedback-summary-markdown');
                        clearExportFeedback();
                        try {
                          const { blob, filename } = await exportAgentFeedbackSummaryMarkdown(
                            feedbackSummaryWindowDays,
                          );
                          if (!downloadBlobFile(blob, filename)) {
                            setExportError('Could not download feedback activity Markdown — try again.');
                          }
                        } catch (error) {
                          setExportError(
                            error instanceof ApiError
                              ? error.message
                              : 'Could not download feedback activity Markdown — try again.',
                          );
                        } finally {
                          setActiveExport(null);
                        }
                      }}
                    >
                      {activeExport === 'feedback-summary-markdown'
                        ? '⏳ Downloading…'
                        : '🧭 Feedback Activity Markdown Export'}
                    </button>
                    <button
                      type="button"
                      disabled={activeExport !== null}
                      style={{
                        width: '100%',
                        marginTop: 8,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: activeExport === 'feedback-summary-copy' ? '#EDE4D8' : '#F0E8DC',
                        color: '#4A3728',
                        fontSize: 12,
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--vp-font-sans)',
                        opacity: activeExport !== null && activeExport !== 'feedback-summary-copy' ? 0.6 : 1,
                      }}
                      onClick={async () => {
                        setActiveExport('feedback-summary-copy');
                        clearExportFeedback();
                        try {
                          const { blob } = await exportAgentFeedbackSummaryMarkdown(
                            feedbackSummaryWindowDays,
                          );
                          const copied = await copyToClipboard(await blob.text());
                          if (copied) {
                            setExportNotice('Copied feedback activity Markdown to the clipboard.');
                          } else {
                            setExportError('Could not copy feedback activity Markdown — try again.');
                          }
                        } catch (error) {
                          setExportError(
                            error instanceof ApiError
                              ? error.message
                              : 'Could not copy feedback activity Markdown — try again.',
                          );
                        } finally {
                          setActiveExport(null);
                        }
                      }}
                    >
                      {activeExport === 'feedback-summary-copy'
                        ? '⏳ Copying…'
                        : '🧭 Copy Feedback Activity Markdown'}
                    </button>
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    color: '#A0A39A',
                    letterSpacing: '0.10em',
                    margin: '22px 0 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <span>Recent ratings</span>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#A0A39A',
                      fontSize: 11,
                      letterSpacing: 'normal',
                      textTransform: 'none',
                      fontFamily: 'var(--vp-font-sans)',
                      fontWeight: 400,
                    }}
                  >
                    <span>Show</span>
                    <select
                      aria-label="Recent ratings filter"
                      value={recentFbVerdict}
                      onChange={(event) =>
                        setRecentFbVerdict(event.target.value as AgentFeedbackVerdict | '')
                      }
                      style={{
                        border: '0.5px solid #E0D5C5',
                        borderRadius: 5,
                        background: '#F0E8DC',
                        color: '#4A3728',
                        padding: '4px 6px',
                        fontSize: 11,
                        fontFamily: 'var(--vp-font-sans)',
                        textTransform: 'none',
                      }}
                    >
                      <option value="">All</option>
                      <option value="correct">Correct</option>
                      <option value="partial">Partial</option>
                      <option value="wrong">Wrong</option>
                    </select>
                  </label>
                </div>
                {recentFbLoading ? (
                  <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
                    <MicroLoader />
                  </div>
                ) : recentFbErr ? (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>{recentFbErr}</p>
                ) : recentFb.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#8C7355', marginBottom: 0 }}>
                    {recentFbVerdict
                      ? `No ${recentFbVerdict} ratings in the latest ten.`
                      : 'Your latest ratings will show here as you rate Agent answers.'}
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {recentFb.map((item) => {
                      const verdict = (item.verdict || '').toLowerCase();
                      const tone =
                        verdict === 'correct'
                          ? { bg: 'rgba(138,168,153,0.18)', fg: '#3F6B4A' }
                          : verdict === 'partial'
                            ? { bg: 'rgba(196,149,106,0.18)', fg: '#8C5A2C' }
                            : { bg: 'rgba(217,83,79,0.15)', fg: '#9C2F2A' };
                      return (
                        <li
                          key={item.task_id}
                          style={{
                            background: '#F0E8DC',
                            border: '0.5px solid #E0D5C5',
                            borderRadius: 10,
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              borderRadius: 999,
                              padding: '2px 8px',
                              background: tone.bg,
                              color: tone.fg,
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            {verdict || 'unknown'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/agent?task_id=${encodeURIComponent(item.task_id)}`,
                                )
                              }
                              title="Open this research in Agent Mode"
                              style={{
                                fontSize: 13,
                                color: '#F3F0E7',
                                lineHeight: 1.4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                textAlign: 'left',
                                cursor: 'pointer',
                                font: 'inherit',
                                width: '100%',
                                textDecoration: 'underline',
                                textDecorationColor: 'rgba(196,149,106,0.45)',
                                textUnderlineOffset: 2,
                              }}
                            >
                              {item.title || item.task_text || item.task_id}
                            </button>
                            {item.note ? (
                              <p
                                style={{
                                  fontSize: 11,
                                  color: '#A0A39A',
                                  marginTop: 4,
                                  marginBottom: 0,
                                  fontStyle: 'italic',
                                  lineHeight: 1.4,
                                }}
                              >
                                “{item.note}”
                              </p>
                            ) : null}
                            <div
                              style={{
                                fontSize: 11,
                                color: '#A0A39A',
                                marginTop: 4,
                              }}
                              title={item.created_at ? new Date(item.created_at).toLocaleString() : undefined}
                            >
                              Rated {formatRelativeConnected(item.created_at)}
                            </div>
                            <button
                              type="button"
                              aria-expanded={fbDetailOpenId === item.task_id}
                              aria-label={
                                fbDetailOpenId === item.task_id
                                  ? `Hide run detail for ${item.task_id}`
                                  : `View run detail for ${item.task_id}`
                              }
                              onClick={() => toggleFeedbackRunDetail(item.task_id)}
                              style={{
                                marginTop: 6,
                                padding: 0,
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: 11,
                                color: '#F0B84E',
                                textDecoration: 'underline',
                                font: 'inherit',
                                textAlign: 'left',
                              }}
                            >
                              {fbDetailOpenId === item.task_id
                                ? 'Hide run detail'
                                : 'View run detail'}
                            </button>
                            {fbDetailOpenId === item.task_id ? (
                              <div
                                role="region"
                                aria-label={`Contradiction report for ${item.task_id}`}
                                aria-busy={fbDetailBusyId === item.task_id}
                                style={{ marginTop: 8, borderTop: '0.5px solid #E0D5C5', paddingTop: 8 }}
                              >
                                {fbDetailBusyId === item.task_id ? (
                                  <p style={{ fontSize: 11, color: '#A0A39A', margin: 0 }}>
                                    Checking contradictions…
                                  </p>
                                ) : fbDetailErrs[item.task_id] ? (
                                  <p role="alert" style={{ fontSize: 11, color: '#993C1D', margin: 0 }}>
                                    {fbDetailErrs[item.task_id]}
                                  </p>
                                ) : fbDetailCache[item.task_id] ? (
                                  fbDetailCache[item.task_id].contradictions.length === 0 ? (
                                    <p style={{ fontSize: 11, color: '#8C7355', margin: 0 }}>
                                      No contradictions recorded.
                                    </p>
                                  ) : (
                                    <ul
                                      style={{
                                        listStyle: 'none',
                                        padding: 0,
                                        margin: 0,
                                        display: 'grid',
                                        gap: 6,
                                      }}
                                    >
                                      {fbDetailCache[item.task_id].contradictions.map((contradiction) => (
                                        <li
                                          key={contradiction.id}
                                          style={{ fontSize: 11, display: 'block', minWidth: 0 }}
                                        >
                                          <span
                                            style={{
                                              fontSize: 9,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em',
                                              borderRadius: 999,
                                              padding: '1px 7px',
                                              marginRight: 6,
                                              border: '0.5px solid #E0D5C5',
                                              background: '#EDE4D8',
                                              color: '#A0A39A',
                                            }}
                                          >
                                            {contradiction.severity || 'unknown severity'}
                                          </span>
                                          <span
                                            style={{
                                              fontSize: 9,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em',
                                              color:
                                                contradiction.resolved ? '#3F6B4A' : '#9C2F2A',
                                              marginRight: 6,
                                            }}
                                          >
                                            {contradiction.resolved ? 'resolved' : 'open'}
                                          </span>
                                          <span style={{ display: 'block', marginTop: 2, wordBreak: 'break-word' }}>
                                            {contradiction.direction === 'new'
                                              ? 'This run shifted your earlier stance: '
                                              : contradiction.direction === 'old'
                                                ? 'An earlier run took a different stance: '
                                                : ''}
                                            {contradiction.summary}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {fbAcc && fbAcc.total > 0 ? (
                  <>
                    <label
                      htmlFor="profile-feedback-export-filter"
                      style={{
                        display: 'block',
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: '#A0A39A',
                        marginTop: 12,
                        marginBottom: 6,
                      }}
                    >
                      Export ratings
                    </label>
                    <select
                      id="profile-feedback-export-filter"
                      aria-label="Answer feedback export filter"
                      value={feedbackExportVerdict}
                      disabled={activeExport !== null}
                      onChange={(event) =>
                        setFeedbackExportVerdict(event.target.value as AgentFeedbackVerdict | '')
                      }
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: '#F0E8DC',
                        color: '#4A3728',
                        fontSize: 12,
                        fontFamily: 'var(--vp-font-sans)',
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        opacity: activeExport !== null ? 0.7 : 1,
                      }}
                    >
                      <option value="">All ratings</option>
                      <option value="correct">Correct only</option>
                      <option value="partial">Partial only</option>
                      <option value="wrong">Wrong only</option>
                    </select>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      <label
                        htmlFor="profile-feedback-export-from-date"
                        style={{
                          display: 'block',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: '#A0A39A',
                        }}
                      >
                        From (UTC)
                        <input
                          id="profile-feedback-export-from-date"
                          aria-label="Answer feedback export start date"
                          type="date"
                          value={feedbackExportFromDate}
                          max={feedbackExportToDate || undefined}
                          disabled={activeExport !== null}
                          onChange={(event) => setFeedbackExportFromDate(event.target.value)}
                          style={{
                            display: 'block',
                            width: '100%',
                            marginTop: 4,
                            padding: '7px 8px',
                            borderRadius: 6,
                            border: '0.5px solid #E0D5C5',
                            background: '#F0E8DC',
                            color: '#4A3728',
                            fontSize: 12,
                            fontFamily: 'var(--vp-font-sans)',
                            opacity: activeExport !== null ? 0.7 : 1,
                          }}
                        />
                      </label>
                      <label
                        htmlFor="profile-feedback-export-to-date"
                        style={{
                          display: 'block',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: '#A0A39A',
                        }}
                      >
                        To (UTC)
                        <input
                          id="profile-feedback-export-to-date"
                          aria-label="Answer feedback export end date"
                          type="date"
                          value={feedbackExportToDate}
                          min={feedbackExportFromDate || undefined}
                          disabled={activeExport !== null}
                          onChange={(event) => setFeedbackExportToDate(event.target.value)}
                          style={{
                            display: 'block',
                            width: '100%',
                            marginTop: 4,
                            padding: '7px 8px',
                            borderRadius: 6,
                            border: '0.5px solid #E0D5C5',
                            background: '#F0E8DC',
                            color: '#4A3728',
                            fontSize: 12,
                            fontFamily: 'var(--vp-font-sans)',
                            opacity: activeExport !== null ? 0.7 : 1,
                          }}
                        />
                      </label>
                    </div>
                    {feedbackExportDateRangeInvalid ? (
                      <p
                        role="alert"
                        style={{ fontSize: 11, color: '#9C2F2A', margin: '6px 0 0' }}
                      >
                        From date must be on or before the To date.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={activeExport !== null || feedbackExportDateRangeInvalid}
                      style={{
                        width: '100%',
                        marginTop: 12,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: activeExport === 'feedback-csv' ? '#EDE4D8' : '#F0E8DC',
                        color: '#4A3728',
                        fontSize: 12,
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--vp-font-sans)',
                        opacity: activeExport !== null && activeExport !== 'feedback-csv' ? 0.6 : 1,
                      }}
                      onClick={async () => {
                        setActiveExport('feedback-csv');
                        clearExportFeedback();
                        try {
                          const { blob, filename } = feedbackExportDateRange
                            ? await exportAgentFeedbackCsv(
                                feedbackExportVerdict || undefined,
                                feedbackExportDateRange,
                              )
                            : await exportAgentFeedbackCsv(feedbackExportVerdict || undefined);
                          if (!downloadBlobFile(blob, filename)) {
                            setExportError('Could not download answer feedback CSV — try again.');
                          }
                        } catch (error) {
                          setExportError(
                            error instanceof ApiError
                              ? error.message
                              : 'Could not download answer feedback CSV — try again.',
                          );
                        } finally {
                          setActiveExport(null);
                        }
                      }}
                    >
                      {activeExport === 'feedback-csv'
                        ? '⏳ Downloading…'
                        : '🧭 Answer Feedback CSV Export'}
                    </button>
                    <button
                      type="button"
                      disabled={activeExport !== null || feedbackExportDateRangeInvalid}
                      style={{
                        width: '100%',
                        marginTop: 8,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: activeExport === 'feedback-json' ? '#EDE4D8' : '#F0E8DC',
                        color: '#4A3728',
                        fontSize: 12,
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--vp-font-sans)',
                        opacity: activeExport !== null && activeExport !== 'feedback-json' ? 0.6 : 1,
                      }}
                      onClick={async () => {
                        setActiveExport('feedback-json');
                        clearExportFeedback();
                        try {
                          const { blob, filename } = feedbackExportDateRange
                            ? await exportAgentFeedbackJson(
                                feedbackExportVerdict || undefined,
                                feedbackExportDateRange,
                              )
                            : await exportAgentFeedbackJson(feedbackExportVerdict || undefined);
                          if (!downloadBlobFile(blob, filename)) {
                            setExportError('Could not download answer feedback JSON — try again.');
                          }
                        } catch (error) {
                          setExportError(
                            error instanceof ApiError
                              ? error.message
                              : 'Could not download answer feedback JSON — try again.',
                          );
                        } finally {
                          setActiveExport(null);
                        }
                      }}
                    >
                      {activeExport === 'feedback-json'
                        ? '⏳ Downloading…'
                        : '🧭 Answer Feedback JSON Export'}
                    </button>
                    <button
                      type="button"
                      disabled={activeExport !== null || feedbackExportDateRangeInvalid}
                      style={{
                        width: '100%',
                        marginTop: 8,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '0.5px solid #E0D5C5',
                        background: activeExport === 'feedback-markdown' ? '#EDE4D8' : '#F0E8DC',
                        color: '#4A3728',
                        fontSize: 12,
                        cursor: activeExport !== null ? 'wait' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--vp-font-sans)',
                        opacity: activeExport !== null && activeExport !== 'feedback-markdown' ? 0.6 : 1,
                      }}
                      onClick={async () => {
                        setActiveExport('feedback-markdown');
                        clearExportFeedback();
                        try {
                          const { blob, filename } = feedbackExportDateRange
                            ? await exportAgentFeedbackMarkdown(
                                feedbackExportVerdict || undefined,
                                feedbackExportDateRange,
                              )
                            : await exportAgentFeedbackMarkdown(feedbackExportVerdict || undefined);
                          if (!downloadBlobFile(blob, filename)) {
                            setExportError('Could not download answer feedback Markdown — try again.');
                          }
                        } catch (error) {
                          setExportError(
                            error instanceof ApiError
                              ? error.message
                              : 'Could not download answer feedback Markdown — try again.',
                          );
                        } finally {
                          setActiveExport(null);
                        }
                      }}
                    >
                      {activeExport === 'feedback-markdown'
                        ? '⏳ Downloading…'
                        : '🧭 Answer Feedback Markdown Export'}
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>

          <div style={{ display: activeTab === 'integrations' ? 'block' : 'none', maxHeight: mobile ? undefined : 'min(72vh, 640px)' }}>
            <h2 className="profile-modal__section-heading">Integrations</h2>
            <p style={{ fontSize: 12, color: '#A0A39A', marginBottom: 16 }}>
              Connect your tools to include personal context in Agent research.
            </p>
            {mcpLoading ? (
              <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
                <MicroLoader />
              </div>
            ) : mcpErr ? (
              <p style={{ fontSize: 13, color: '#8C7355' }}>{mcpErr}</p>
            ) : (
              <>
                {mcpToast ? (
                  <div
                    role="status"
                    style={{
                      marginBottom: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#EAF3DE',
                      border: '0.5px solid #97C459',
                      fontSize: 13,
                      color: '#3B6D11',
                    }}
                  >
                    {mcpToast}
                  </div>
                ) : null}
                {!mcpList.length ? (
                  <div
                    style={{
                      background: '#FAF7F2',
                      borderRadius: 10,
                      padding: 20,
                      textAlign: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                      <PlugIcon size={20} color="#35382F" />
                    </div>
                    <p style={{ fontSize: 14, color: '#A0A39A', fontStyle: 'italic', margin: 0 }}>
                      No tools connected yet
                    </p>
                    <p style={{ fontSize: 12, color: '#C4A882', marginTop: 4, marginBottom: 0 }}>
                      Connect a service below to include your documents in Agent research
                    </p>
                  </div>
                ) : null}
                {mcpList.length > 0 ? (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: '#A0A39A',
                        marginBottom: 8,
                      }}
                    >
                      Connected
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {mcpList
                        .filter((r: any) => r.is_active)
                        .map((row: any) => {
                          const meta = SERVICES.find((s) => s.id === row.service);
                          const label = meta?.name || row.display_name || row.service;
                          return (
                            <div
                              key={row.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                background: '#EAF3DE',
                                border: '0.5px solid #97C459',
                                borderRadius: 20,
                                padding: '5px 12px 5px 8px',
                              }}
                            >
                              <span style={{ display: 'flex', flexShrink: 0 }}>{getBrandIcon(row.service, 16)}</span>
                              <span style={{ fontSize: 12, color: '#F3F0E7' }}>{label}</span>
                              <button
                                type="button"
                                aria-label={`Remove ${label}`}
                                onClick={() => {
                                  if (
                                    typeof window !== 'undefined' &&
                                    window.confirm(`Remove ${label} from connected tools?`)
                                  ) {
                                    void (async () => {
                                      try {
                                        await deleteMcpIntegration(row.id);
                                        await refreshMcp();
                                        setMcpDisconnectTarget(null);
                                      } catch {
                                        /* ignore */
                                      }
                                    })();
                                  }
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: '0 0 0 4px',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  color: '#A0A39A',
                                  lineHeight: 1,
                                }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                    </div>
                    <div
                      style={{
                        height: 0,
                        borderTop: '0.5px solid #E0D5C5',
                        marginBottom: 16,
                      }}
                    />
                  </>
                ) : null}
                <div
                  className="profile-modal-integrations-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: mobile ? '1fr' : 'repeat(2, 1fr)',
                    gap: 10,
                    maxHeight: 420,
                    overflowY: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {SERVICES.map((service) => {
                    const row = mcpList.find((r: any) => r.service === service.id && r.is_active);
                    const connected = Boolean(row);
                    const expanded = mcpExpandedId === service.id && !connected;
                    const tokenVal = mcpTokenInputs[service.id] ?? '';
                    const showDisconnectConfirm = connected && mcpDisconnectTarget?.id === row.id;

                    return (
                      <div
                        key={service.id}
                        style={{
                          background: connected ? '#F0F7ED' : '#FAF7F2',
                          border: connected ? '0.5px solid #97C459' : '0.5px solid #E0D5C5',
                          borderRadius: 10,
                          padding: 14,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              background: service.bg_color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {getBrandIcon(service.id, 20)}
                          </div>
                          <div style={{ fontSize: 14, color: '#F3F0E7', fontWeight: 500, flex: 1 }}>{service.name}</div>
                          <span
                            style={{
                              fontSize: 10,
                              textTransform: connected ? 'uppercase' : 'none',
                              fontWeight: connected ? 600 : 400,
                              padding: '2px 8px',
                              borderRadius: 8,
                              background: connected ? '#EAF3DE' : '#F0E8DC',
                              color: connected ? '#3B6D11' : '#8C7355',
                              border: connected ? '0.5px solid #97C459' : 'none',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {connected ? '✓ Connected' : 'Not connected'}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: '#A0A39A', fontStyle: 'italic', margin: '0 0 10px' }}>
                          {service.description}
                        </p>
                        {!connected ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setMcpExpandedId((prev) => (prev === service.id ? null : service.id))
                              }
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 11,
                                color: '#F0B84E',
                                marginBottom: expanded ? 10 : 0,
                              }}
                            >
                              How to connect ›
                            </button>
                            {expanded ? (
                              <>
                                <div
                                  style={{
                                    fontSize: 10,
                                    textTransform: 'uppercase',
                                    color: '#A0A39A',
                                    marginBottom: 4,
                                  }}
                                >
                                  How to connect
                                </div>
                                <p style={{ fontSize: 11, color: '#6B5040', lineHeight: 1.6, margin: '0 0 10px' }}>
                                  {service.how_to}
                                </p>
                                <div
                                  style={{
                                    fontSize: 10,
                                    textTransform: 'uppercase',
                                    color: '#A0A39A',
                                    marginBottom: 4,
                                  }}
                                >
                                  Paste your API token
                                </div>
                                <input
                                  type="password"
                                  value={tokenVal}
                                  onChange={(e) =>
                                    setMcpTokenInputs((prev) => ({ ...prev, [service.id]: e.target.value }))
                                  }
                                  placeholder={service.placeholder}
                                  autoComplete="off"
                                  style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    border: '0.5px solid #35382F',
                                    borderRadius: 6,
                                    padding: '8px 10px',
                                    fontSize: 12,
                                    fontFamily: 'var(--vp-font-sans)',
                                    background: '#FDFAF6',
                                    outline: 'none',
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = '#F0B84E';
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = '#35382F';
                                  }}
                                />
                                <div style={{ marginTop: 8 }}>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    fullWidth
                                    icon={Icons.plug(14)}
                                    disabled={!tokenVal.trim() || mcpConnectBusy === service.id}
                                    loading={mcpConnectBusy === service.id}
                                    onClick={async () => {
                                      const tok = tokenVal.trim();
                                      if (tok.length < 8) return;
                                      setMcpConnectBusy(service.id);
                                      try {
                                        await postMcpManualConnect({
                                          service: service.id,
                                          access_token: tok,
                                          display_name: service.name,
                                        });
                                        setMcpTokenInputs((prev) => ({ ...prev, [service.id]: '' }));
                                        setMcpExpandedId(null);
                                        await refreshMcp();
                                        setMcpToast(`${service.name} connected`);
                                      } catch {
                                        /* silent */
                                      } finally {
                                        setMcpConnectBusy(null);
                                      }
                                    }}
                                  >
                                    {`Connect ${service.name}`}
                                  </Button>
                                </div>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <p style={{ fontSize: 11, color: '#5A8C6A', margin: '0 0 8px' }}>
                              Connected · {formatRelativeConnected(row.connected_at)}
                            </p>
                            {showDisconnectConfirm ? (
                              <div
                                style={{
                                  background: '#FDFAF6',
                                  border: '0.5px solid #E0D5C5',
                                  borderRadius: 8,
                                  padding: 10,
                                  marginBottom: 8,
                                }}
                              >
                                <p style={{ fontSize: 11, color: '#6B5040', lineHeight: 1.5, margin: '0 0 10px' }}>
                                  Remove {service.name}? Your tasks using this source will still work until you re-run
                                  them.
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    type="button"
                                    onClick={() => setMcpDisconnectTarget(null)}
                                    style={{
                                      flex: 1,
                                      padding: '6px 10px',
                                      borderRadius: 8,
                                      border: '0.5px solid #35382F',
                                      background: '#FAF7F2',
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      color: '#F3F0E7',
                                    }}
                                  >
                                    Keep
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await deleteMcpIntegration(row.id);
                                        await refreshMcp();
                                      } catch {
                                        /* ignore */
                                      } finally {
                                        setMcpDisconnectTarget(null);
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: '6px 10px',
                                      borderRadius: 8,
                                      border: 'none',
                                      background: '#C0392B',
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      color: '#fff',
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => setMcpDisconnectTarget({ id: row.id, name: service.name })}
                              >
                                Disconnect
                              </Button>
                            )}
                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                aria-expanded={mcpTestOpenId === row.id}
                                aria-label={`Test search ${service.name}`}
                                onClick={() => toggleMcpTestSearch(row.id)}
                                style={{
                                  padding: 0,
                                  border: 'none',
                                  background: 'none',
                                  color: '#F0B84E',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  fontFamily: 'var(--vp-font-sans)',
                                  textDecoration: 'underline',
                                }}
                              >
                                {mcpTestOpenId === row.id
                                  ? 'Hide test search'
                                  : 'Test search'}
                              </button>
                              {mcpTestOpenId === row.id ? (
                                <div
                                  role="region"
                                  aria-label={`Test search for ${service.name}`}
                                  aria-busy={mcpTestBusy}
                                  style={{
                                    marginTop: 8,
                                    padding: 10,
                                    background: '#FDFAF6',
                                    border: '0.5px solid #E0D5C5',
                                    borderRadius: 8,
                                  }}
                                >
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <input
                                      type="text"
                                      value={mcpTestQuery}
                                      disabled={mcpTestBusy}
                                      aria-label={`Search query for ${service.name}`}
                                      placeholder="Try a query…"
                                      onChange={(event) => setMcpTestQuery(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          void runMcpTestSearch();
                                        }
                                      }}
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        padding: '5px 8px',
                                        borderRadius: 6,
                                        border: '0.5px solid #E0D5C5',
                                        background: '#FAF7F2',
                                        color: '#F3F0E7',
                                        fontSize: 11,
                                        fontFamily: 'var(--vp-font-sans)',
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void runMcpTestSearch()}
                                      disabled={mcpTestBusy || !mcpTestQuery.trim()}
                                      style={{
                                        padding: '5px 10px',
                                        borderRadius: 6,
                                        border: '0.5px solid #E0D5C5',
                                        background: '#F0E8DC',
                                        color: '#F3F0E7',
                                        fontSize: 11,
                                        cursor: mcpTestBusy ? 'wait' : 'pointer',
                                        fontFamily: 'var(--vp-font-sans)',
                                        flexShrink: 0,
                                      }}
                                    >
                                      {mcpTestBusy ? 'Searching…' : 'Search'}
                                    </button>
                                  </div>
                                  {mcpTestError ? (
                                    <p
                                      role="alert"
                                      style={{ fontSize: 11, color: '#993C1D', margin: '8px 0 0' }}
                                    >
                                      {mcpTestError}
                                    </p>
                                  ) : null}
                                  {mcpTestResults && mcpTestResults.length > 0 ? (
                                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                      {mcpTestResults.map((result, index) => (
                                        <div key={`${result.url}-${index}`}>
                                          {/* Only real web URLs become links — vendor payloads
                                              never get to render as javascript:/data: hrefs. */}
                                          {result.url && /^https?:\/\//i.test(result.url) ? (
                                            <a
                                              href={result.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              style={{
                                                fontSize: 11,
                                                color: '#F0B84E',
                                                textDecoration: 'underline',
                                                wordBreak: 'break-word',
                                              }}
                                            >
                                              {result.title || result.url}
                                            </a>
                                          ) : (
                                            <span style={{ fontSize: 11, color: '#F3F0E7' }}>
                                              {result.title || result.url}
                                            </span>
                                          )}
                                          <span
                                            style={{
                                              fontSize: 9,
                                              marginLeft: 6,
                                              padding: '1px 6px',
                                              borderRadius: 8,
                                              border: '0.5px solid #E0D5C5',
                                              background: '#EDE4D8',
                                              color: '#A0A39A',
                                            }}
                                          >
                                            {result.source || service.name}
                                          </span>
                                          {/* Notion results echo their own URL as the excerpt —
                                              printing that under the identical link is noise. */}
                                          {result.excerpt && result.excerpt !== result.url ? (
                                            <p
                                              style={{
                                                fontSize: 10,
                                                color: '#8C7355',
                                                margin: '2px 0 0',
                                                wordBreak: 'break-word',
                                              }}
                                            >
                                              {result.excerpt}
                                            </p>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  ) : mcpTestResults && mcpTestResults.length === 0 ? (
                                    <p
                                      style={{ fontSize: 11, color: '#8C7355', margin: '8px 0 0' }}
                                    >
                                      No results returned.
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div style={{ display: activeTab === 'help' ? 'block' : 'none' }}>
            <h2 className="profile-modal__section-heading">Get help</h2>
            <p className="profile-modal__section-sub" style={{ marginBottom: 8 }}>Resources, legal, and support</p>
            {(
              [
                {
                  title: 'About Arena',
                  desc: 'Our story, mission and team',
                  onClick: () => closeModal(() => navigate('/about')),
                },
                {
                  title: 'Privacy policy',
                  desc: 'How we handle your data',
                  onClick: () => closeModal(() => navigate('/privacy')),
                },
                {
                  title: 'Terms of service',
                  desc: 'Usage terms and conditions',
                  onClick: () => closeModal(() => navigate('/terms')),
                },
                {
                  title: 'Contact support',
                  desc: 'Get in touch with our team',
                  onClick: () => {
                    window.location.href = 'mailto:support@arena.com';
                  },
                },
              ] as const
            ).map((row, idx, arr) => (
              <button
                key={row.title}
                type="button"
                onClick={row.onClick}
                className={[
                  'profile-help-row',
                  idx === arr.length - 1 ? 'profile-help-row--last' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div>
                  <div className="profile-help-title">{row.title}</div>
                  <div className="profile-help-desc">{row.desc}</div>
                </div>
                <span className="profile-help-arrow" aria-hidden>
                  →
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
