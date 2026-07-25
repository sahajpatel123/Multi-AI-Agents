import { useCallback, useEffect, useState } from 'react';
import { Clock, Copy, Share2, Trash2 } from 'lucide-react';
import {
  readRecentShares,
  clearRecentShares,
  recordRecentShare,
  type RecentShare,
  type ShareKind,
} from '../lib/recentShares';
import { copyToClipboard } from '../lib/clipboard';

const KIND_GLYPH: Record<ShareKind, string> = {
  compare: '⇄',
  streak: '✺',
  tool: '◆',
  other: '↗',
};

const KIND_LABEL: Record<ShareKind, string> = {
  compare: 'Compare',
  streak: 'Streak',
  tool: 'Tool',
  other: 'Share',
};

/**
 * Count the shares that landed in the last 7 days (rolling window).
 * Pure: takes the items + a now Date so tests can drive time.
 */
export function sharesThisWeek(
  items: readonly RecentShare[],
  now: Date = new Date(),
): number {
  // Strictly &gt; cutoff so a share at exactly 7 days ago is excluded.
  const cutoff = now.getTime() - 7 * 86_400_000;
  let count = 0;
  for (const item of items) {
    if (item.at > cutoff) count += 1;
  }
  return count;
}

export interface RecentSharesProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Max items to render. Defaults to 6. */
  limit?: number;
}

function formatRelative(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(at).toLocaleDateString();
}

/**
 * Widget that surfaces the user's most-recent share actions. Renders
 * nothing on cold start. Each row: kind glyph + label + relative
 * timestamp + a Copy button that re-copies the stored url (if any)
 * and re-records the share to bump it to the head.
 */
export function RecentShares({
  heading = 'Your recent shares',
  limit = 6,
}: RecentSharesProps) {
  const [items, setItems] = useState<readonly RecentShare[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setItems(readRecentShares(window.localStorage).slice(0, limit));
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:recent-shares:v1') {
        setItems(readRecentShares(window.localStorage).slice(0, limit));
      }
    };
    window.addEventListener('storage', onStorage);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(tick);
    };
  }, [limit]);

  const onCopy = useCallback(
    async (share: RecentShare) => {
      if (!share.url) return;
      const ok = await copyToClipboard(share.url);
      if (!ok) return;
      setCopied(share.url);
      // Bump to head by re-recording.
      if (typeof window !== 'undefined') {
        recordRecentShare(window.localStorage, {
          kind: share.kind,
          label: share.label,
          url: share.url,
        });
        setItems(readRecentShares(window.localStorage).slice(0, limit));
      }
      window.setTimeout(() => setCopied((cur) => (cur === share.url ? null : cur)), 1800);
    },
    [limit],
  );

  if (items.length === 0) return null;

  const thisWeek = sharesThisWeek(items, new Date(now));

  return (
    <section className="ppg-shares" aria-label={heading}>
      <header className="ppg-shares__head">
        <p className="ppg-shares__eyebrow">
          <Share2 aria-hidden="true" /> {heading}
        </p>
        <div className="ppg-shares__head-meta">
          <span className="ppg-shares__count" aria-label={`${thisWeek} shares this week`}>
            {thisWeek} this week
          </span>
          <button
            type="button"
            className="ppg-shares__clear"
            onClick={() => {
              if (typeof window === 'undefined') return;
              clearRecentShares(window.localStorage);
              setItems([]);
            }}
            aria-label="Clear recent shares"
          >
            <Trash2 aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </header>
      <ul className="ppg-shares__list">
        {items.map((item) => {
          const key = `${item.kind}|${item.url ?? item.label}|${item.at}`;
          const isCopied = copied === item.url && Boolean(item.url);
          return (
            <li key={key} className="ppg-shares__item">
              <div className="ppg-shares__meta">
                <span
                  className="ppg-shares__kind"
                  data-kind={item.kind}
                  aria-hidden="true"
                >
                  {KIND_GLYPH[item.kind]}
                </span>
                <span className="ppg-shares__body">
                  <span className="ppg-shares__kind-label">{KIND_LABEL[item.kind]}</span>
                  <span className="ppg-shares__label">{item.label}</span>
                </span>
                <span className="ppg-shares__time">
                  <Clock aria-hidden="true" />
                  {formatRelative(item.at, now)}
                </span>
                {item.url && (
                  <button
                    type="button"
                    className={`ppg-shares__copy${isCopied ? ' ppg-shares__copy--copied' : ''}`}
                    onClick={() => onCopy(item)}
                    aria-label={`Copy URL for ${item.label}`}
                  >
                    <Copy aria-hidden="true" />
                    <span>{isCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
