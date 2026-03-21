import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSubscriptionStatus } from '../api';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { RazorpayCheckout } from '../components/RazorpayCheckout';
import { useAuth } from '../hooks/useAuth';
import { useTier } from '../context/TierContext';

const comparisonRows = [
  ['Questions per day', '5', '15', '35'],
  ['Personas available', '6', '16', '16'],
  ['Debate mode', '✕', '✓', '✓'],
  ['Memory', '✕', '✓', '✓'],
  ['Focused chat', '✕', '✓', '✓'],
  ['Saved responses', '✕', '✓', '✓'],
  ['Agent mode', '✕', '✕', '✓ Soon'],
  ['Scoring audit', '✕', '✕', '✓'],
  ['Priority speed', '✕', '✕', '✓'],
];

const faqs = [
  {
    question: 'Which minds do I get for free?',
    answer: 'The Explorer plan includes 6 minds: The Analyst, Philosopher, Pragmatist, Contrarian, Futurist, and Empath. These cover analytical, philosophical, practical, contrarian, future-focused, and empathetic perspectives. Upgrade to Thinker to unlock all 16.',
  },
  {
    question: 'What is the difference between Thinker and Architect?',
    answer: 'Thinker gives you everything Arena currently offers — all 16 minds, debate mode, memory, and focused chat. Architect adds Agent mode (coming soon), unlimited debates, scoring audit visibility, and priority response speed. If you are unsure, start with Thinker.',
  },
  {
    question: 'Can I change plans anytime?',
    answer: 'Yes. Upgrade or downgrade at any time. Changes take effect immediately.',
  },
];

const explorerFeatures = [
  '5 questions per day',
  '6 minds to explore:',
  '· The Analyst',
  '· The Philosopher',
  '· The Pragmatist',
  '· The Contrarian',
  '· The Futurist',
  '· The Empath',
  'Copy and share responses',
  'Session history',
];

const thinkerFeatures = [
  '15 questions per day',
  'All 16 minds unlocked',
  'Build your own panel of 4',
  'Debate mode',
  'Challenge any mind, watch the others react',
  '1-on-1 focused chat',
  'Memory across sessions',
  'Minds remember your history',
  'Full session history',
  'Save your best responses',
];

const architectFeatures = [
  '35 questions per day',
  'Everything in Plus',
  'Agent mode access',
  '7-stage AI pipeline for complex tasks',
  'Unlimited debates per day',
  'Scoring audit',
  'See exactly why a mind won',
  'Priority response speed',
  'Early access to new minds',
];

const personaNames = [
  'Analyst',
  'Philosopher',
  'Pragmatist',
  'Contrarian',
  'Futurist',
  'Empath',
  'Scientist',
  'Historian',
  'Economist',
  'Ethicist',
  'Stoic',
  'Strategist',
  'Engineer',
  'Optimist',
  'First Principles',
  "Devil's Advocate",
];

const unlockedDotDurations = ['2.4s', '2.8s', '3.2s', '2.0s', '2.6s', '3.0s'];

function isSubFeature(item: string) {
  return (
    item.startsWith('· ') ||
    item === 'Challenge any mind, watch the others react' ||
    item === 'Minds remember your history' ||
    item === '7-stage AI pipeline for complex tasks' ||
    item === 'See exactly why a mind won'
  );
}

function FeatureList({
  items,
  dotColor,
  textColor,
  subColor,
  badgeDark = false,
}: {
  items: string[];
  dotColor: string;
  textColor: string;
  subColor: string;
  badgeDark?: boolean;
}) {
  return (
    <div>
      {items.map((item) => {
        const sub = isSubFeature(item);
        return (
          <div
            key={item}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              marginBottom: '10px',
              marginLeft: sub ? '15px' : 0,
              marginTop: sub ? '3px' : 0,
            }}
          >
            {!sub ? (
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: dotColor,
                  flexShrink: 0,
                  marginTop: '6px',
                }}
              />
            ) : (
              <span style={{ width: '5px', flexShrink: 0 }} />
            )}
            <span
              style={{
                fontSize: sub ? '12px' : '13px',
                color: sub ? subColor : textColor,
                lineHeight: 1.5,
                fontWeight: 400,
              }}
            >
              {item === 'Agent mode access' ? (
                <>
                  Agent mode access{' '}
                  <span
                    style={{
                      background: badgeDark ? 'rgba(250,247,244,0.1)' : '#F0EBE3',
                      color: badgeDark ? 'rgba(250,247,244,0.4)' : '#6B6460',
                      fontSize: '10px',
                      padding: '2px 7px',
                      borderRadius: '999px',
                    }}
                  >
                    Coming soon
                  </span>
                </>
              ) : (
                item
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PricingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, refreshUser, user } = useAuth();
  const { tier, isPlus, isPro, refreshTier } = useTier();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [upgradeSuccessLabel, setUpgradeSuccessLabel] = useState('');
  const [freeCtaHover, setFreeCtaHover] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [mindsHovered, setMindsHovered] = useState(false);
  const [hoveredMind, setHoveredMind] = useState<number | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      getSubscriptionStatus()
        .then((data) => {
          setSubscriptionStatus(data.status || null);
        })
        .catch(() => {});
      return;
    }

    setSubscriptionStatus(null);
  }, [isAuthenticated]);

  const getCurrentPlanKey = () => {
    if (isPro) return 'pro';
    if (isPlus) return 'plus';
    if (tier === 'FREE' || tier === 'GUEST') return 'free';
    return 'free';
  };

  const isCurrentPlan = (planName: string) => {
    const current = getCurrentPlanKey();
    return current === planName;
  };

  const hasActiveSubscription =
    isAuthenticated &&
    (isPlus || isPro) &&
    (subscriptionStatus == null || ['created', 'authenticated', 'active', 'halted'].includes(subscriptionStatus));

  const handleUpgrade = (planKey: string) => {
    if (!isAuthenticated) {
      navigate('/signin');
      return;
    }
    setCheckoutPlan(planKey);
    setCheckoutError(null);
  };

  const handleCheckoutSuccess = async (planKey: string) => {
    setUpgradeSuccessLabel(planKey.startsWith('pro') ? 'Pro' : 'Plus');
    setCheckoutPlan(null);
    setUpgradeSuccess(true);
    await refreshTier();
    await refreshUser();
    window.setTimeout(() => {
      navigate('/app');
    }, 2000);
  };

  const onCheckoutError = useCallback((error: string) => {
    setCheckoutPlan(null);
    setCheckoutError(error);
  }, []);

  const onCheckoutClose = useCallback(() => {
    setCheckoutPlan(null);
  }, []);

  const toggleBtnActive = {
    background: '#FFFFFF',
    borderRadius: '999px',
    padding: '8px 24px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#1A1714',
    boxShadow: '0 1px 3px rgba(26,23,20,0.06)',
    transition: 'all 150ms ease',
    border: 'none',
    cursor: 'pointer',
  } as const;

  const toggleBtnInactive = {
    background: 'transparent',
    borderRadius: '999px',
    padding: '8px 24px',
    fontSize: '13px',
    color: '#6B6460',
    cursor: 'pointer',
    border: 'none',
    transition: 'all 150ms ease',
  } as const;

  return (
    <div
      style={{
        background: '#FAF7F4',
        backgroundImage: 'radial-gradient(ellipse 800px 400px at 50% -100px, rgba(196,149,106,0.06) 0%, transparent 70%)',
        minHeight: '100vh',
      }}
    >
      <style>{`
        @keyframes dotBreathe {
          0%, 100% {
            box-shadow: 0 0 6px rgba(196,149,106,0.15);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 14px rgba(196,149,106,0.35);
            transform: scale(1.08);
          }
        }
      `}</style>
      <Navbar />

      <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '64px 24px' }}>
        {upgradeSuccess && (
          <div
            style={{
              background: '#EDF2EF',
              border: '0.5px solid #8AA899',
              borderRadius: '12px',
              padding: '14px 20px',
              fontSize: '14px',
              color: '#1A1714',
              textAlign: 'center',
              marginBottom: '1.5rem',
            }}
          >
            🎉 Welcome to {upgradeSuccessLabel}! Your account has been upgraded.
          </div>
        )}

        {checkoutError && (
          <div
            style={{
              background: '#FEF2F2',
              border: '0.5px solid #E57373',
              borderRadius: '12px',
              padding: '14px 20px',
              fontSize: '13px',
              color: '#C0392B',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <span style={{ flex: 1 }}>{checkoutError}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setCheckoutError(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#C0392B',
                fontSize: '18px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}

        {checkoutPlan && (
          <RazorpayCheckout
            key={checkoutPlan}
            planKey={checkoutPlan}
            prefillEmail={user?.email}
            onSuccess={() => {
              void handleCheckoutSuccess(checkoutPlan);
            }}
            onError={onCheckoutError}
            onClose={onCheckoutClose}
          />
        )}

        <section className="pricing-hero" style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.14em', color: '#B0A9A2', marginBottom: '1rem' }}>
            Simple, honest pricing
          </p>
          <h1 style={{ fontSize: '48px', fontWeight: 400, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.05, marginBottom: '1rem' }}>
            Start <span style={{ color: '#C4956A', fontStyle: 'italic', opacity: 0.9 }}>free.</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#8B8480', maxWidth: '420px', lineHeight: 1.8 }}>
            Upgrade when Arena becomes part of how you think.
          </p>
        </section>

        {hasActiveSubscription && (
          <div
            style={{
              maxWidth: '680px',
              margin: '0 auto 2rem',
              background: '#EDF2EF',
              border: '0.5px solid rgba(90,138,90,0.2)',
              borderRadius: '12px',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              color: '#5A8A5A',
            }}
          >
            <CheckCircle size={16} color="#5A8A5A" />
            <span>
              You are on the <strong>{isPro ? 'Architect (Pro)' : 'Thinker (Plus)'}</strong> plan.
            </span>
            <button
              type="button"
              onClick={() => navigate('/account')}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                padding: 0,
                fontSize: '12px',
                color: '#5A8A5A',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              Manage subscription →
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
          <div
            style={{
              background: '#EFEFED',
              borderRadius: '999px',
              padding: '4px',
              display: 'inline-flex',
              gap: '4px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              style={billing === 'monthly' ? toggleBtnActive : toggleBtnInactive}
            >
              Monthly
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
              <button
                type="button"
                onClick={() => setBilling('annual')}
                style={billing === 'annual' ? toggleBtnActive : toggleBtnInactive}
              >
                <span>Annual</span>
                <span style={{ color: '#C4B8AE', margin: '0 4px', fontSize: '11px' }}>·</span>
                <span style={{ fontSize: '11px', color: '#8AA899', fontWeight: 400 }}>Save 31%</span>
              </button>
            </div>
          </div>
        </div>

        <section
          className="pricing-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
            alignItems: 'stretch',
            marginBottom: '0',
          }}
        >
          <div
            style={{
              background: '#FDFCFB',
              border: '0.5px solid #E8E2DA',
              borderRadius: '20px',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'inline-flex', background: '#F0EBE3', color: '#6B6460', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', marginBottom: '1rem' }}>
              Free forever
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: '#6B6460', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Explorer
            </p>
            <div style={{ fontSize: '48px', fontWeight: 500, color: '#1A1714', lineHeight: 1, marginBottom: '.35rem' }}>$0</div>
            <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1.5rem' }}>forever</p>
            <div style={{ height: '0.5px', background: 'rgba(26,23,20,0.06)', marginBottom: '1.5rem' }} />
            <div style={{ flex: 1 }}>
              <FeatureList items={explorerFeatures} dotColor="#D4CCC4" textColor="#1A1714" subColor="#8B8480" />
            </div>
            <button
              type="button"
              onClick={isCurrentPlan('free') ? undefined : () => navigate('/app')}
              onMouseEnter={isCurrentPlan('free') ? undefined : () => setFreeCtaHover(true)}
              onMouseLeave={isCurrentPlan('free') ? undefined : () => setFreeCtaHover(false)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '999px',
                border: isCurrentPlan('free') ? '0.5px solid #E0D8D0' : '0.5px solid #DDD7D0',
                background: isCurrentPlan('free') ? '#F0EBE3' : freeCtaHover ? '#F5F2EF' : 'transparent',
                color: '#6B6460',
                fontSize: '14px',
                cursor: isCurrentPlan('free') ? 'default' : 'pointer',
                marginTop: '1.5rem',
                transition: 'background 150ms ease',
                textAlign: 'center',
              }}
            >
              {isCurrentPlan('free') ? 'Current plan' : 'Start exploring'}
            </button>
          </div>

          <div
            style={{
              border: '1px solid rgba(196,149,106,0.35)',
              borderRadius: '20px',
              padding: '2rem',
              position: 'relative',
              background: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 2px 24px rgba(196,149,106,0.06), 0 0 0 4px rgba(196,149,106,0.04)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-14px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#C4956A',
                color: '#FAF7F4',
                fontSize: '10px',
                fontWeight: 400,
                padding: '4px 14px',
                borderRadius: '999px',
                letterSpacing: '.04em',
                whiteSpace: 'nowrap',
              }}
            >
              Most popular
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: '#6B6460', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Thinker
            </p>

            {billing === 'monthly' ? (
              <>
                <div style={{ fontSize: '40px', fontWeight: 400, letterSpacing: '-.02em', color: '#1A1714', lineHeight: 1, marginBottom: '.35rem' }}>₹999/mo</div>
                <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1.5rem' }}>per month, billed monthly</p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '.35rem' }}>
                  <span style={{ fontSize: '40px', fontWeight: 400, letterSpacing: '-.02em', color: '#1A1714', lineHeight: 1 }}>₹693/mo</span>
                  <span
                    style={{
                      background: '#EFF4EF',
                      color: '#7A9B7A',
                      fontSize: '11px',
                      fontWeight: 400,
                      padding: '3px 9px',
                      borderRadius: '999px',
                      verticalAlign: 'middle',
                    }}
                  >
                    -31%
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '4px' }}>₹8,299 billed annually</p>
                <p style={{ fontSize: '12px', color: '#C4B8AE', textDecoration: 'line-through', marginBottom: '1.5rem' }}>vs ₹11,988 monthly</p>
              </>
            )}

            <div style={{ height: '0.5px', background: 'rgba(26,23,20,0.06)', marginBottom: '1.5rem' }} />
            <div style={{ flex: 1 }}>
              <FeatureList items={thinkerFeatures} dotColor="rgba(196,149,106,0.5)" textColor="#1A1714" subColor="#8B8480" />
            </div>
            {isCurrentPlan('plus') ? (
              <div
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '999px',
                  background: '#EDF2EF',
                  color: '#5A8A5A',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'default',
                  border: '0.5px solid rgba(90,138,90,0.2)',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginTop: '1.5rem',
                }}
              >
                <Check size={16} color="#5A8A5A" />
                <span>Current plan</span>
              </div>
            ) : isPro ? (
              <div
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '999px',
                  background: '#F0EBE3',
                  color: '#6B6460',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'default',
                  border: '0.5px solid rgba(90,138,90,0.2)',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginTop: '1.5rem',
                }}
              >
                Included in your plan
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade(billing === 'monthly' ? 'plus_monthly' : 'plus_annual')}
                style={{
                  width: '100%',
                  background: '#1A1714',
                  color: '#FAF7F4',
                  borderRadius: '999px',
                  padding: '13px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '1.5rem',
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.88';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Start with Plus
              </button>
            )}
          </div>

          <div style={{ background: '#1A1714', borderRadius: '20px', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: 'rgba(250,247,244,0.5)', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Architect
            </p>

            {billing === 'monthly' ? (
              <>
                <div style={{ fontSize: '42px', fontWeight: 500, color: 'rgba(250,247,244,0.88)', lineHeight: 1, marginBottom: '.35rem' }}>₹1,999/mo</div>
                <p style={{ fontSize: '13px', color: 'rgba(250,247,244,0.5)', marginBottom: '1.5rem' }}>per month, billed monthly</p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '.35rem' }}>
                  <span style={{ fontSize: '42px', fontWeight: 500, color: '#FAF7F4', lineHeight: 1 }}>₹1,383/mo</span>
                  <span
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'rgba(250,247,244,0.6)',
                      fontSize: '12px',
                      fontWeight: 400,
                      padding: '4px 10px',
                      borderRadius: '999px',
                    }}
                  >
                    -31%
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'rgba(250,247,244,0.6)', marginBottom: '4px' }}>₹16,599 billed annually</p>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'rgba(250,247,244,0.45)',
                    textDecoration: 'line-through',
                    marginBottom: '1.5rem',
                  }}
                >
                  vs ₹23,988 monthly
                </p>
              </>
            )}

            <div style={{ height: '0.5px', background: 'rgba(26,23,20,0.06)', marginBottom: '1.5rem' }} />
            <div style={{ flex: 1 }}>
              <FeatureList
                items={architectFeatures}
                dotColor="rgba(196,149,106,0.35)"
                textColor="rgba(250,247,244,0.7)"
                subColor="rgba(250,247,244,0.45)"
                badgeDark
              />
            </div>
            {isCurrentPlan('pro') ? (
              <div
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '999px',
                  background: 'rgba(196,149,106,0.2)',
                  color: '#C4956A',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'default',
                  border: '0.5px solid rgba(196,149,106,0.3)',
                  textAlign: 'center',
                  marginTop: '1.5rem',
                }}
              >
                ✓ Current plan
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleUpgrade(billing === 'monthly' ? 'pro_monthly' : 'pro_annual')}
                style={{
                  width: '100%',
                  background: '#C4956A',
                  color: '#FAF7F4',
                  borderRadius: '999px',
                  padding: '13px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '1.5rem',
                  opacity: 0.92,
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.92';
                }}
              >
                Upgrade to Pro
              </button>
            )}
          </div>
        </section>

        <section style={{ maxWidth: '680px', margin: '3rem auto 0', textAlign: 'center' }}>
          <p
            style={{
              fontSize: '11px',
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: '#B0A9A2',
              marginBottom: '1.5rem',
            }}
          >
            16 minds waiting
          </p>

          <div
            onMouseEnter={() => setMindsHovered(true)}
            onMouseLeave={() => {
              setMindsHovered(false);
              setHoveredMind(null);
            }}
            style={{
              maxWidth: '320px',
              margin: '0 auto',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '16px',
                maxWidth: '320px',
                margin: '0 auto',
                padding: '2rem',
                background: 'rgba(26,23,20,0.02)',
                borderRadius: '20px',
                border: '0.5px solid rgba(26,23,20,0.05)',
              }}
            >
              {personaNames.map((name, index) => {
                const unlocked = index < 6 || isPlus || isPro;
                const litLocked = !unlocked && mindsHovered;
                const lockedDelay = `${Math.max(index - 6, 0) * 60}ms`;

                return (
                  <div
                    key={name}
                    style={{ position: 'relative', width: '28px', height: '28px', justifySelf: 'center' }}
                    onMouseEnter={() => setHoveredMind(index)}
                    onMouseLeave={() => setHoveredMind((current) => (current === index ? null : current))}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        position: 'relative',
                        cursor: 'default',
                        transition: 'all 400ms ease',
                        transitionDelay: litLocked ? lockedDelay : '0ms',
                        background: unlocked ? 'rgba(196,149,106,0.15)' : litLocked ? 'rgba(196,149,106,0.1)' : 'rgba(26,23,20,0.04)',
                        border: unlocked
                          ? '1.5px solid rgba(196,149,106,0.4)'
                          : litLocked
                            ? '1.5px solid rgba(196,149,106,0.25)'
                            : '1.5px solid rgba(26,23,20,0.08)',
                        boxShadow: unlocked
                          ? '0 0 8px rgba(196,149,106,0.15)'
                          : litLocked
                            ? '0 0 10px rgba(196,149,106,0.1)'
                            : 'none',
                        transform: litLocked ? 'scale(1.05)' : 'scale(1)',
                        animation: unlocked ? `dotBreathe ${unlockedDotDurations[Math.min(index, 5)]} ease-in-out infinite` : 'none',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '36px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#1A1714',
                        color: '#FAF7F4',
                        fontSize: '10px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        opacity: hoveredMind === index ? 1 : 0,
                        transition: 'opacity 150ms ease',
                        zIndex: 10,
                      }}
                    >
                      {name}
                    </div>
                  </div>
                );
              })}
            </div>

            <p
              style={{
                opacity: mindsHovered ? 1 : 0,
                fontSize: '12px',
                color: isPlus || isPro ? '#5A8A5A' : '#C4956A',
                marginTop: '1rem',
                transition: 'opacity 300ms ease',
              }}
            >
              {isPlus || isPro ? 'All 16 minds unlocked' : 'Unlock all 16 minds with Plus'}
            </p>
          </div>

          <p style={{ marginTop: '1.2rem', fontSize: '12px', color: '#B0A9A2' }}>
            {isPlus || isPro ? 'All 16 minds available in your panel' : '6 minds available now · 10 more with Plus'}
          </p>
        </section>

        <section style={{ marginBottom: '3rem', marginTop: '3rem' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 500, color: '#1A1714', marginBottom: '1rem' }}>Compare plans</h2>
          <div className="comparison-table-wrapper" style={{ border: '0.5px solid #E0D8D0', borderRadius: '12px', overflow: 'hidden' }}>
            <div className="comparison-table" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', background: '#F0EBE3' }}>
              {['Feature', 'Explorer', 'Thinker', 'Architect'].map((label) => (
                <div key={label} style={{ padding: '14px 16px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#6B6460' }}>
                  {label}
                </div>
              ))}
            </div>
            {comparisonRows.map((row, index) => (
              <div
                key={row[0]}
                className="comparison-table"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                  background: index % 2 === 0 ? '#FFFFFF' : '#FAF7F4',
                  borderTop: '0.5px solid #E0D8D0',
                }}
              >
                {row.map((cell, cellIndex) => (
                  <div
                    key={`${row[0]}-${cellIndex}`}
                    style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: cell === '✓' || cell === '✓ Soon' ? '#8AA899' : cell === '✕' ? '#C4B8AE' : '#1A1714',
                      fontWeight: cell === '✓' || cell === '✓ Soon' ? 500 : 400,
                    }}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section style={{ maxWidth: '760px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 500, color: '#1A1714', marginBottom: '1rem' }}>Common questions</h2>
          {faqs.map((faq) => (
            <div key={faq.question} className="faq-item" style={{ borderBottom: '0.5px solid rgba(26,23,20,0.06)', padding: '1rem 0' }}>
              <p style={{ fontSize: '14px', fontWeight: 400, color: '#1A1714', marginBottom: '.45rem' }}>{faq.question}</p>
              <p style={{ fontSize: '13px', color: '#8B8480', lineHeight: 1.7 }}>{faq.answer}</p>
            </div>
          ))}
        </section>
      </div>

      <Footer />
    </div>
  );
}
