import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MicroLoader from '../components/MicroLoader';
import {
  ApiError,
  deleteAgentWatchlist,
  getAgentWatchlist,
  patchAgentWatchlist,
  type AgentWatchlistItem,
} from '../api';
import { useTier } from '../context/TierContext';

function formatRelativePast(iso: string | null | undefined): string {
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

function formatRelativeFuture(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  let sec = Math.round((t - Date.now()) / 1000);
  if (sec < 0) return 'due now';
  if (sec < 60) return 'in <1m';
  const min = Math.floor(sec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `in ${hr}h`;
  const day = Math.floor(hr / 24);
  return `in ${day}d`;
}

function intervalBadge(hours: number): { num: string; unit: string } {
  if (hours === 168) return { num: '7', unit: 'DAYS' };
  if (hours === 72) return { num: '3', unit: 'DAYS' };
  return { num: String(hours), unit: 'HRS' };
}

export function WatchlistPage() {
  const navigate = useNavigate();
  const { canUseFeature } = useTier();
  const canWatchlist = canUseFeature('agent_watchlist');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AgentWatchlistItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [activeCap, setActiveCap] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canWatchlist) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await getAgentWatchlist();
      setItems(data.items);
      setActiveCount(data.active_count);
      setActiveCap(data.active_cap);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load watchlist');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canWatchlist]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (item: AgentWatchlistItem) => {
    try {
      const updated = await patchAgentWatchlist(item.id, { is_active: !item.is_active });
      setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
      const data = await getAgentWatchlist();
      setActiveCount(data.active_count);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteAgentWatchlist(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      const data = await getAgentWatchlist();
      setActiveCount(data.active_count);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  };

  if (!canWatchlist) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#F5F0E8',
          padding: '48px 20px',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#4A3728' }}>Watchlist is available on Arena Plus and Pro.</p>
          <button
            type="button"
            onClick={() => navigate('/agent')}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              borderRadius: 20,
              border: 'none',
              background: '#2C1810',
              color: '#C4956A',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'Georgia, serif',
            }}
          >
            Back to Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F0E8', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          height: '52px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          background: 'rgba(245, 240, 232, 0.72)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/agent')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            color: '#8C7355',
            fontFamily: 'Georgia, serif',
          }}
        >
          ← Agent
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1A1714' }}>Watchlist</span>
            <span style={{ fontSize: 11, color: '#A89070' }}>
              {activeCount}/{activeCap} active
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#8C7355' }}>Tasks that research themselves.</span>
        </div>
      </header>

      <main style={{ flex: 1, padding: '24px 16px 48px', overflowY: 'auto' }}>
        {error ? (
          <p style={{ color: '#D85A30', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>{error}</p>
        ) : null}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <MicroLoader />
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem 20px',
              textAlign: 'center',
            }}
          >
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: '#D4C4B0' }}>
              <path
                d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p style={{ fontSize: 14, color: '#A89070', fontStyle: 'italic', marginTop: 16 }}>
              No watched tasks yet
            </p>
            <p style={{ fontSize: 11, color: '#C4A882', marginTop: 8, maxWidth: 320 }}>
              Add tasks to watchlist from any result page
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxWidth: 680,
              margin: '0 auto',
            }}
          >
            {items.map((item) => {
              const badge = intervalBadge(item.interval_hours);
              return (
                <div
                  key={item.id}
                  style={{
                    background: '#FAF7F2',
                    border: '0.5px solid #E0D5C5',
                    borderRadius: 10,
                    padding: '16px 18px',
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 10,
                      background: '#F0E8DC',
                      border: '0.5px solid #D4C4B0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 500, color: '#C4956A' }}>{badge.num}</span>
                    <span style={{ fontSize: 9, color: '#A89070', textTransform: 'uppercase' }}>{badge.unit}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: '#2C1810',
                        lineHeight: 1.4,
                        marginBottom: 5,
                      }}
                    >
                      {item.question}
                    </div>
                    <div style={{ fontSize: 11, color: '#A89070', lineHeight: 1.5 }}>
                      Run {item.run_count} times · Last ran {formatRelativePast(item.last_run_at)} · Next:{' '}
                      {item.is_active ? formatRelativeFuture(item.next_run_at) : 'paused'}
                    </div>
                    {item.latest_task_id && item.latest_task ? (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/agent?task_id=${encodeURIComponent(item.latest_task!.task_id)}`)
                        }
                        style={{
                          marginTop: 8,
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 11,
                          color: '#C4956A',
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
                        }}
                      >
                        Latest result →
                      </button>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.is_active}
                      onClick={() => void onToggle(item)}
                      style={{
                        width: 32,
                        height: 18,
                        borderRadius: 9,
                        border: 'none',
                        padding: 2,
                        cursor: 'pointer',
                        background: item.is_active ? '#C4956A' : '#D4C4B0',
                        position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: '#FAF7F2',
                          marginLeft: item.is_active ? 14 : 0,
                          transition: 'margin 0.15s ease',
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(item.id)}
                      aria-label="Remove from watchlist"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: '#C4A882',
                        padding: 0,
                        lineHeight: 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#D85A30';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#C4A882';
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
