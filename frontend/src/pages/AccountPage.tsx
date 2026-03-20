import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { cancelSubscription, getSubscriptionStatus, getUserTier, type SubscriptionStatusResponse } from '../api';
import { useTier } from '../context/TierContext';

function formatInrPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

function tierBadgeLabel(tier: string): string {
  if (tier === 'PLUS') return 'Plus';
  if (tier === 'PRO') return 'Pro';
  if (tier === 'FREE' || tier === 'GUEST') return 'Free';
  return tier;
}

export function AccountPage() {
  const navigate = useNavigate();
  const { refreshTier } = useTier();
  const [sub, setSub] = useState<SubscriptionStatusResponse | null>(null);
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof getUserTier>>>(null);
  const [loading, setLoading] = useState(true);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u] = await Promise.all([getSubscriptionStatus(), getUserTier()]);
      setSub(s);
      setUsage(u);
    } catch {
      setSub({ has_subscription: false, tier: 'FREE' });
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasBillingProfile = Boolean(sub?.has_subscription && sub.plan_name);

  const showCancel =
    hasBillingProfile &&
    sub?.status &&
    ['created', 'authenticated', 'active', 'halted'].includes(sub.status) &&
    Boolean(sub.razorpay_subscription_id);

  const handleCancel = async () => {
    setCancelBusy(true);
    try {
      await cancelSubscription();
      await load();
      await refreshTier();
    } catch {
      // non-blocking; user can retry
    } finally {
      setCancelBusy(false);
      setCancelConfirm(false);
    }
  };

  const nextBilling =
    sub?.current_end != null && sub.current_end !== ''
      ? new Date(sub.current_end).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null;

  const periodLabel = sub?.billing_period === 'annual' ? 'year' : 'month';

  return (
    <div style={{ background: '#FAF7F4', minHeight: '100vh' }}>
      <Navbar />

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 500, color: '#1A1714', marginBottom: '0.5rem' }}>Account</h1>
        <p style={{ fontSize: '14px', color: '#6B6460', marginBottom: '2rem' }}>Subscription and usage</p>

        {loading ? (
          <p style={{ fontSize: '14px', color: '#6B6460' }}>Loading…</p>
        ) : (
          <>
            <section
              style={{
                background: '#FFFFFF',
                border: '0.5px solid #E0D8D0',
                borderRadius: '16px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <h2 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#6B6460', marginBottom: '1rem' }}>
                Current plan
              </h2>

              {hasBillingProfile && sub ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: '#F0EBE3',
                        color: '#1A1714',
                        borderRadius: '999px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {tierBadgeLabel(sub.tier)}
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 500, color: '#1A1714' }}>{sub.plan_name}</span>
                  </div>
                  {sub.status === 'cancelled' && nextBilling && (
                    <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '0.5rem' }}>
                      Access until <strong style={{ color: '#1A1714' }}>{nextBilling}</strong>
                    </p>
                  )}
                  {sub.status !== 'cancelled' && nextBilling && (
                    <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '0.5rem' }}>
                      Next billing: <strong style={{ color: '#1A1714' }}>{nextBilling}</strong>
                    </p>
                  )}
                  {typeof sub.amount === 'number' && (
                    <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1rem' }}>
                      Amount: {formatInrPaise(sub.amount)}/{periodLabel}
                    </p>
                  )}

                  {showCancel && !cancelConfirm && (
                    <button
                      type="button"
                      onClick={() => setCancelConfirm(true)}
                      style={{
                        background: 'transparent',
                        border: '0.5px solid #E0D8D0',
                        color: '#6B6460',
                        borderRadius: '999px',
                        padding: '8px 20px',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#E57373';
                        e.currentTarget.style.color = '#E57373';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#E0D8D0';
                        e.currentTarget.style.color = '#6B6460';
                      }}
                    >
                      Cancel subscription
                    </button>
                  )}

                  {showCancel && cancelConfirm && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '0.5px solid #E0D8D0',
                        background: '#FAF7F4',
                      }}
                    >
                      <p style={{ fontSize: '13px', color: '#1A1714', marginBottom: '12px' }}>
                        Cancel at end of billing period? You keep access until{' '}
                        {nextBilling || 'the end of your current period'}.
                      </p>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setCancelConfirm(false)}
                          style={{
                            padding: '8px 16px',
                            fontSize: '13px',
                            borderRadius: '999px',
                            border: '0.5px solid #E0D8D0',
                            background: '#FFFFFF',
                            cursor: 'pointer',
                            color: '#1A1714',
                          }}
                        >
                          Keep subscription
                        </button>
                        <button
                          type="button"
                          disabled={cancelBusy}
                          onClick={() => void handleCancel()}
                          style={{
                            padding: '8px 16px',
                            fontSize: '13px',
                            borderRadius: '999px',
                            border: 'none',
                            background: '#C0392B',
                            color: '#FAF7F4',
                            cursor: cancelBusy ? 'wait' : 'pointer',
                            opacity: cancelBusy ? 0.7 : 1,
                          }}
                        >
                          Yes, cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p style={{ fontSize: '15px', color: '#1A1714', marginBottom: '0.5rem' }}>You are on the Free plan</p>
                  <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1rem' }}>
                    Upgrade to unlock all features
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/pricing')}
                    style={{
                      background: '#1A1714',
                      color: '#FAF7F4',
                      borderRadius: '999px',
                      padding: '10px 22px',
                      fontSize: '14px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    View plans
                  </button>
                </>
              )}
            </section>

            <section
              style={{
                background: '#FFFFFF',
                border: '0.5px solid #E0D8D0',
                borderRadius: '16px',
                padding: '1.5rem',
              }}
            >
              <h2 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#6B6460', marginBottom: '1rem' }}>
                Usage this period
              </h2>
              {usage ? (
                <>
                  <p style={{ fontSize: '14px', color: '#1A1714', marginBottom: '0.35rem' }}>
                    Messages used today:{' '}
                    <strong>
                      {usage.messages_used_today} / {usage.daily_limit}
                    </strong>
                  </p>
                  <p style={{ fontSize: '13px', color: '#6B6460' }}>
                    {usage.messages_remaining} remaining today · Tier limits reset daily.
                  </p>
                </>
              ) : (
                <p style={{ fontSize: '13px', color: '#6B6460' }}>Sign in to see usage.</p>
              )}
            </section>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
