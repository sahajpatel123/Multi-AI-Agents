import { useEffect, useMemo, useState } from 'react';
import type { RateLimitDetail } from '../api';
import { formatRateLimitCountdown } from '../lib/rateLimit';

type RateLimitNoticeProps = {
  detail: RateLimitDetail;
  onDismiss?: () => void;
  onRefresh?: () => void | Promise<void>;
  onUpgrade?: () => void;
};

function parseResetAt(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  if (value.trim().toLowerCase() === 'midnight utc') {
    const next = new Date(nowMs);
    next.setUTCHours(24, 0, 0, 0);
    return next.getTime();
  }
  const normalized = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function RateLimitNotice({
  detail,
  onDismiss,
  onRefresh,
  onUpgrade,
}: RateLimitNoticeProps) {
  const [startedAtMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(startedAtMs);
  const [refreshing, setRefreshing] = useState(false);
  const resetAtMs = useMemo(
    () => parseResetAt(detail.resets_at, startedAtMs),
    [detail.resets_at, startedAtMs],
  );
  const targetMs = useMemo(() => {
    if (resetAtMs !== null) return resetAtMs;
    if (detail.retry_after_seconds !== null) {
      return startedAtMs + detail.retry_after_seconds * 1000;
    }
    return null;
  }, [detail.retry_after_seconds, resetAtMs, startedAtMs]);

  useEffect(() => {
    if (targetMs === null) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [targetMs]);

  const remainingSeconds = targetMs === null
    ? null
    : Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
  const title = detail.scope === 'tokens'
    ? 'Daily token budget reached'
    : detail.error === 'daily_limit_reached' || resetAtMs !== null
      ? 'Daily limit reached'
      : 'Rate limit reached';

  const refresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section
      role="alert"
      aria-labelledby="rate-limit-notice-title"
      style={{
        margin: '0 auto 1rem',
        padding: '1rem',
        maxWidth: '600px',
        background: '#FFF9ED',
        border: '1px solid rgba(196,149,106,0.45)',
        borderRadius: '12px',
        color: '#5A4635',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1.2 }}>◷</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            id="rate-limit-notice-title"
            style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#8D5C19' }}
          >
            {title}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            {detail.message}
          </p>
          {remainingSeconds !== null ? (
            <p aria-live="polite" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
              {remainingSeconds === 0
                ? 'The limit should be available now. Refresh your limits to continue.'
                : <>Available again in <strong>{formatRateLimitCountdown(remainingSeconds)}</strong>{resetAtMs !== null ? ' (UTC)' : ''}.</>}
            </p>
          ) : (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#846F5C' }}>
              Reset timing is unavailable. Refresh your limits before trying again.
            </p>
          )}
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss daily limit notice"
            style={{
              border: 0,
              background: 'transparent',
              color: '#846F5C',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {(onRefresh || onUpgrade) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingLeft: 30 }}>
          {onRefresh ? (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              style={{
                border: '1px solid rgba(141,92,25,0.4)',
                borderRadius: 999,
                background: '#FFFDF8',
                color: '#8D5C19',
                cursor: refreshing ? 'wait' : 'pointer',
                fontSize: 12,
                padding: '6px 12px',
              }}
            >
              {refreshing ? 'Refreshing…' : 'Refresh limits'}
            </button>
          ) : null}
          {onUpgrade ? (
            <button
              type="button"
              onClick={onUpgrade}
              style={{
                border: 0,
                borderRadius: 999,
                background: '#F0B84E',
                color: '#3A2615',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 12px',
              }}
            >
              See upgrade options
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
