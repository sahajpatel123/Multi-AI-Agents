import { useCallback, useEffect, useRef, useState } from 'react';
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
  exportAnalyticsPersonaStatsOverviewCsv,
  exportAnalyticsPersonaWinRateCsv,
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
  getAgentFeedbackSummary,
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
  type AgentFeedbackSummary,
  type AgentFeedbackExportDateRange,
  type AgentFeedbackVerdict,
  type AnswerFeedbackStats,
  type CalibrationHistoryResponse,
  type CalibrationHistorySort,
  type RecentFeedbackItem,
  type SubscriptionStatusResponse,
  type UserUsageResponse,
} from '../api';
import { downloadBlobFile } from '../lib/downloadTextFile';
import { copyToClipboard } from '../lib/clipboard';
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

function formatSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

const CALIBRATION_HISTORY_SORT_LABELS: Record<CalibrationHistorySort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  delta_desc: 'Underestimates first',
  delta_asc: 'Overestimates first',
};

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
  const [winRate, setWinRate] = useState<AnalyticsPersonaWinRateResponse | null>(null);
  const [winRateLoading, setWinRateLoading] = useState(false);
  const [winRateErr, setWinRateErr] = useState<string | null>(null);
  const [winRateReload, setWinRateReload] = useState(0);
  const [winRateWindowDays, setWinRateWindowDays] = useState(30);
  const [winRateMinAppearances, setWinRateMinAppearances] = useState(1);
  const [winRateIncludeFallback, setWinRateIncludeFallback] = useState(false);
  const [winRateSort, setWinRateSort] = useState<PersonaWinRateSort>('win_rate');
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
  const clearExportFeedback = useCallback(() => {
    setExportError(null);
    setExportNotice(null);
  }, []);
  const [calLoading, setCalLoading] = useState(false);
  const [calErr, setCalErr] = useState<string | null>(null);
  const [calHistory, setCalHistory] = useState<CalibrationHistoryResponse | null>(null);
  const [calHistoryLoading, setCalHistoryLoading] = useState(false);
  const [calHistoryErr, setCalHistoryErr] = useState<string | null>(null);
  const [calHistoryOpen, setCalHistoryOpen] = useState(false);
  const [calHistoryPage, setCalHistoryPage] = useState(1);
  const [calHistorySort, setCalHistorySort] = useState<CalibrationHistorySort>('newest');
  const [calHistoryReload, setCalHistoryReload] = useState(0);
  const [fbAcc, setFbAcc] = useState<AnswerFeedbackStats | null>(null);
  const [fbAccLoading, setFbAccLoading] = useState(false);
  const [fbAccErr, setFbAccErr] = useState<string | null>(null);
  const [recentFb, setRecentFb] = useState<RecentFeedbackItem[]>([]);
  const [recentFbLoading, setRecentFbLoading] = useState(false);
  const [recentFbErr, setRecentFbErr] = useState<string | null>(null);
  const [recentFbVerdict, setRecentFbVerdict] = useState<AgentFeedbackVerdict | ''>('');
  const [feedbackSummary, setFeedbackSummary] = useState<AgentFeedbackSummary | null>(null);
  const [feedbackSummaryLoading, setFeedbackSummaryLoading] = useState(false);
  const [feedbackSummaryErr, setFeedbackSummaryErr] = useState<string | null>(null);
  const [feedbackSummaryWindowDays, setFeedbackSummaryWindowDays] = useState(30);
  const [feedbackSummaryReload, setFeedbackSummaryReload] = useState(0);
  const [feedbackExportVerdict, setFeedbackExportVerdict] = useState<AgentFeedbackVerdict | ''>('');
  const [feedbackExportFromDate, setFeedbackExportFromDate] = useState('');
  const [feedbackExportToDate, setFeedbackExportToDate] = useState('');

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
  }, [isOpen, activeTab]);

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
                          </tr>
                        </thead>
                        <tbody>
                          {sortPersonaWinRateRows(winRate.personas, winRateSort).map((row) => (
                            <tr key={row.persona_id} style={{ opacity: row.low_confidence ? 0.65 : 1 }}>
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
                            </tr>
                          ))}
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
                      }}
                    >
                      {USAGE_EXPORT_WINDOWS.map((days) => (
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
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '0.5px solid #E0D5C5',
                      background: activeExport === 'summary-json' ? '#EDE4D8' : '#F0E8DC',
                      color: '#F3F0E7',
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
                      try {
                        const blob = await exportAnalyticsActivityCsv(activityWindowDays);
                        downloadBlobFile(blob, `arena-activity-${activityWindowDays}d.csv`);
                      } catch {
                        // ignore error
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
                      try {
                        const { blob, filename } = await exportAnalyticsActivityJson(activityWindowDays);
                        downloadBlobFile(blob, filename);
                      } catch {
                        // ignore error
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
                      try {
                        const { blob, filename } = await exportAnalyticsActivityMarkdown(activityWindowDays);
                        downloadBlobFile(blob, filename);
                      } catch {
                        // ignore error
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
                      try {
                        const blob = await exportAnalyticsPersonaStatsOverviewCsv(30);
                        downloadBlobFile(blob, 'arena-persona-overview-30d.csv');
                      } catch {
                        // ignore error
                      } finally {
                        setActiveExport(null);
                      }
                    }}
                  >
                    {activeExport === 'overview' ? '⏳ Downloading…' : '🤖 Persona Stats Export'}
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
                                <div style={{ display: 'grid', gap: 6 }}>
                                  {calHistory.ratings.map((rating) => {
                                    const delta = Number(rating.delta ?? 0);
                                    return (
                                      <div
                                        key={rating.id}
                                        title={`Task ${rating.task_id}`}
                                        aria-label={`${formatCalibrationDate(rating.created_at)}: rated ${rating.user_rating} out of 5, delta ${formatSignedDelta(delta)}, ${rating.verdict}`}
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: '72px 42px 48px minmax(0, 1fr)',
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
