import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Check, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSubscriptionStatus } from '../api';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { RazorpayCheckout } from '../components/RazorpayCheckout';
import { useAuth } from '../hooks/useAuth';
import { useTier } from '../context/TierContext';
import { useProfileModal } from '../context/ProfileModalContext';
import { setRedirectIntent } from '../utils/redirectIntent';

const comparisonRows = [
  ['Credits per day', '25K', '100K', '300K'],
  ['Questions per day', '5', '15', '35'],
  ['Personas available', '6', '16', '16'],
  ['Debate mode', '✕', '✓', '✓'],
  ['Memory', '✕', '✓', '✓'],
  ['Focused chat', '✕', '✓', '✓'],
  ['Saved responses', '✕', '✓', '✓'],
  ['Agent mode', '✕', '✕', '✓'],
  ['Scoring audit', '✕', '✕', '✓'],
  ['Priority speed', '✕', '✕', '✓'],
];

const faqs = [
  {
    question: 'Which minds do I get for free?',
    answer: 'The Explorer plan includes 6 minds: The Analyst, Philosopher, Pragmatist, Contrarian, Futurist, and Empath. These cover analytical, philosophical, practical, contrarian, future-focused, and empathetic perspectives. Upgrade to Plus to unlock all 16.',
  },
  {
    question: 'What is the difference between Plus and Pro?',
    answer:
      'Plus unlocks all 16 minds, debate mode, memory, and focused chat. Pro adds full Agent Mode (7-stage pipeline), unlimited debates, scoring audit visibility, and priority response speed. Plus users can add Agent Mode as an optional in-app add-on.',
  },
  {
    question: 'Can I change plans anytime?',
    answer: 'Yes. Upgrade or downgrade at any time. Changes take effect immediately.',
  },
];

const explorerFeatures = [
  '25,000 credits per day',
  'Arena mode',
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

const MINDS = [
  { name: 'The Analyst', locked: false, color: '#8C9BAB' },
  { name: 'The Philosopher', locked: false, color: '#9B8FAA' },
  { name: 'The Pragmatist', locked: false, color: '#8AA899' },
  { name: 'The Contrarian', locked: false, color: '#B0977E' },
  { name: 'The Futurist', locked: false, color: '#9B8FAA' },
  { name: 'The Empath', locked: false, color: '#AA8F8F' },
  { name: 'The Scientist', locked: true, color: '#8C9BAB' },
  { name: 'The Historian', locked: true, color: '#A89B8C' },
  { name: 'The Economist', locked: true, color: '#8AA899' },
  { name: 'The Ethicist', locked: true, color: '#9B8FAA' },
  { name: 'The Stoic', locked: true, color: '#8C9BAB' },
  { name: 'The Strategist', locked: true, color: '#B0977E' },
  { name: 'The Engineer', locked: true, color: '#8C9BAB' },
  { name: 'The Optimist', locked: true, color: '#8AA899' },
  { name: 'First Principles', locked: true, color: '#9B8FAA' },
  { name: "Devil's Advocate", locked: true, color: '#B0977E' },
] as const;

const unlockedPillTimings = [
  '3.2s 0s',
  '2.8s 0.3s',
  '3.5s 0.6s',
  '2.6s 0.9s',
  '3.0s 0.2s',
  '2.4s 0.7s',
];

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
}: {
  items: string[];
  dotColor: string;
  textColor: string;
  subColor: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      {items.map((item) => {
        const sub = isSubFeature(item);
        return (
          <div
            key={item}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '7px',
              marginBottom: '7px',
              marginLeft: sub ? '15px' : 0,
              marginTop: sub ? '2px' : 0,
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
                fontSize: sub ? '11px' : '13px',
                color: sub ? subColor : textColor,
                lineHeight: 1.5,
                fontWeight: 400,
              }}
            >
              {item}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PricingPage() {
  const navigate = useNavigate();
  const { openModal } = useProfileModal();
  const { isAuthenticated, refreshUser, user } = useAuth();
  const { tier, isPlus, isPro, refreshTier } = useTier();
  const userTierLc = (user?.tier ?? '').toString().toLowerCase();
  const isPlusUser = isAuthenticated && (userTierLc === 'plus' || isPlus);
  const hasAgentAddon = user?.agent_addon_active === true;
  const addonCancelling = user?.agent_addon_cancelling === true;
  const showAddonUpsell = isPlusUser && !hasAgentAddon && !addonCancelling;
  const showAddonActiveBanner = isPlusUser && hasAgentAddon;
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [upgradeSuccessLabel, setUpgradeSuccessLabel] = useState('');
  const [freeCtaHover, setFreeCtaHover] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [sectionHovered, setSectionHovered] = useState(false);
  const [hoveredMind, setHoveredMind] = useState<number | null>(null);
  const [mindsInView, setMindsInView] = useState(false);
  const mindsSectionRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    const node = mindsSectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMindsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

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
      setRedirectIntent('/arena');
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
      <Navbar />

      <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '2rem 24px 1.5rem' }}>
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
            {upgradeSuccessLabel === 'Agent Mode'
              ? '🎉 Agent Mode add-on activated. Your Plus plan now includes the 7-stage pipeline.'
              : `🎉 Welcome to ${upgradeSuccessLabel}! Your account has been upgraded.`}
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
            planKey={checkoutPlan === 'agent_addon' ? 'agent_addon' : checkoutPlan}
            agentAddon={checkoutPlan === 'agent_addon'}
            prefillEmail={user?.email}
            onSuccess={() => {
              if (checkoutPlan === 'agent_addon') {
                setCheckoutPlan(null);
                void refreshTier();
                void refreshUser();
                setUpgradeSuccessLabel('Agent Mode');
                setUpgradeSuccess(true);
                window.setTimeout(() => setUpgradeSuccess(false), 2500);
              } else {
                void handleCheckoutSuccess(checkoutPlan);
              }
            }}
            onError={onCheckoutError}
            onClose={onCheckoutClose}
          />
        )}

        <section className="pricing-hero" style={{ marginBottom: 0, paddingTop: '2rem', paddingBottom: '1.5rem' }}>
          <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.14em', color: '#B0A9A2', marginBottom: '0.5rem' }}>
            Simple, honest pricing
          </p>
          <h1 style={{ fontSize: '42px', fontWeight: 400, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.1, marginBottom: '0.5rem' }}>
            Start <span style={{ color: '#C4956A', fontStyle: 'italic', opacity: 0.9 }}>free.</span>
          </h1>
          <p style={{ fontSize: '13px', color: '#8B8480', maxWidth: '420px', lineHeight: 1.8, marginBottom: '1.5rem' }}>
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
              You are on the <strong>{isPro ? 'Pro' : 'Plus'}</strong> plan.
            </span>
            <button
              type="button"
              onClick={() => openModal('top-right', 'plan')}
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

        <div className="pricing-billing-wrap" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', width: '100%' }}>
          <div
            className="billing-toggle"
            style={{
              background: '#EFEFED',
              borderRadius: '999px',
              padding: '4px',
              display: 'inline-flex',
              gap: '4px',
              alignItems: 'center',
              flexWrap: 'wrap',
              width: '100%',
              maxWidth: 420,
              justifyContent: 'center',
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
                <span style={{ fontSize: '11px', color: '#8AA899', fontWeight: 400 }}>lower monthly rate</span>
              </button>
            </div>
          </div>
        </div>

        <section
          className="pricing-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            alignItems: 'stretch',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#FDFCFB',
              border: '0.5px solid #E8E2DA',
              borderRadius: '20px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            {isAuthenticated && isCurrentPlan('free') ? (
              <span
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: '#2C1810',
                  color: '#C4956A',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 10px',
                  borderRadius: 8,
                  zIndex: 2,
                }}
              >
                Your plan
              </span>
            ) : null}
            <div style={{ display: 'inline-flex', background: '#F0EBE3', color: '#6B6460', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', marginBottom: '1rem' }}>
              Free forever
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: '#6B6460', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Explorer
            </p>
            <div style={{ fontSize: '48px', fontWeight: 500, color: '#1A1714', lineHeight: 1, marginBottom: '0.25rem' }}>₹0</div>
            <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1rem' }}>forever</p>
            <div style={{ height: '0.5px', background: 'rgba(26,23,20,0.06)', margin: '0.75rem 0' }} />
            <FeatureList items={explorerFeatures} dotColor="#D4CCC4" textColor="#1A1714" subColor="#8B8480" />
            <button
              type="button"
              onClick={isCurrentPlan('free') ? undefined : () => navigate('/app')}
              onMouseEnter={isCurrentPlan('free') ? undefined : () => setFreeCtaHover(true)}
              onMouseLeave={isCurrentPlan('free') ? undefined : () => setFreeCtaHover(false)}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '999px',
                border: isCurrentPlan('free') ? '0.5px solid #E0D8D0' : '0.5px solid #DDD7D0',
                background: isCurrentPlan('free') ? '#F0EBE3' : freeCtaHover ? '#F5F2EF' : 'transparent',
                color: '#6B6460',
                fontSize: '14px',
                cursor: isCurrentPlan('free') ? 'default' : 'pointer',
                marginTop: 'auto',
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
              padding: '1.5rem',
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
            {isAuthenticated && isCurrentPlan('plus') ? (
              <span
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: '#2C1810',
                  color: '#C4956A',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 10px',
                  borderRadius: 8,
                  zIndex: 2,
                }}
              >
                Your plan
              </span>
            ) : null}
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: '#6B6460', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Plus
            </p>

            {billing === 'monthly' ? (
              <>
                <div style={{ fontSize: '40px', fontWeight: 400, letterSpacing: '-.02em', color: '#1A1714', lineHeight: 1, marginBottom: '0.25rem' }}>₹999/mo</div>
                <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1rem' }}>per month, billed monthly</p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '.35rem' }}>
                  <span style={{ fontSize: '40px', fontWeight: 400, letterSpacing: '-.02em', color: '#1A1714', lineHeight: 1 }}>₹742/mo</span>
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
                    Save 26%
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#8B8480', marginBottom: '4px' }}>Billed as ₹8,899/year</p>
                <p style={{ fontSize: '12px', color: '#C4B8AE', textDecoration: 'line-through', marginBottom: '1rem' }}>vs ₹11,988 if paid monthly</p>
              </>
            )}

            <div style={{ height: '0.5px', background: 'rgba(26,23,20,0.06)', margin: '0.75rem 0' }} />
            <FeatureList items={thinkerFeatures} dotColor="rgba(196,149,106,0.5)" textColor="#1A1714" subColor="#8B8480" />
            {isCurrentPlan('plus') ? (
              <div
                style={{
                  width: '100%',
                  padding: '11px',
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
                  marginTop: 'auto',
                }}
              >
                <Check size={16} color="#5A8A5A" />
                <span>Current plan</span>
              </div>
            ) : isPro ? (
              <div
                style={{
                  width: '100%',
                  padding: '11px',
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
                  marginTop: 'auto',
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
                  padding: '11px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: 'auto',
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
            {showAddonUpsell ? (
              <div
                style={{
                  background: '#FAF3EA',
                  border: '0.5px solid #C4956A',
                  borderRadius: 10,
                  padding: '14px 16px',
                  marginTop: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#2C1810' }}>⚡ Add Agent Mode</span>
                  <span style={{ fontSize: 13, color: '#C4956A', marginLeft: 'auto' }}>₹599/month</span>
                </div>
                <p style={{ fontSize: 11, color: '#8C7355', fontStyle: 'italic', margin: '6px 0 10px' }}>
                  Unlock the 7-stage research pipeline on your Plus plan. Plus limits apply.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutError(null);
                    setCheckoutPlan('agent_addon');
                  }}
                  style={{
                    width: '100%',
                    background: '#2C1810',
                    color: '#C4956A',
                    borderRadius: 20,
                    padding: '8px 18px',
                    fontSize: 12,
                    fontFamily: 'Georgia, serif',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Add Agent Mode →
                </button>
              </div>
            ) : null}
            {showAddonActiveBanner ? (
              <div
                style={{
                  background: '#EAF3DE',
                  border: '0.5px solid #97C459',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginTop: 10,
                  fontSize: 12,
                  color: '#3B6D11',
                  textAlign: 'center',
                }}
              >
                ✓ Agent Mode active on your plan
              </div>
            ) : null}
          </div>

          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid rgba(196,149,106,0.35)',
              borderRadius: '20px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            {isAuthenticated && isCurrentPlan('pro') ? (
              <span
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: '#2C1810',
                  color: '#C4956A',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 10px',
                  borderRadius: 8,
                  zIndex: 2,
                }}
              >
                Your plan
              </span>
            ) : null}
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: '#6B6460', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Pro
            </p>

            {billing === 'monthly' ? (
              <>
                <div style={{ fontSize: '40px', fontWeight: 400, color: '#1A1714', lineHeight: 1, marginBottom: '0.25rem' }}>₹2,499/mo</div>
                <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1rem' }}>per month, billed monthly</p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '.35rem' }}>
                  <span style={{ fontSize: '40px', fontWeight: 400, color: '#1A1714', lineHeight: 1 }}>₹1,650/mo</span>
                  <span
                    style={{
                      background: '#EFF4EF',
                      color: '#7A9B7A',
                      fontSize: '11px',
                      fontWeight: 400,
                      padding: '3px 9px',
                      borderRadius: '999px',
                    }}
                  >
                    Save 34%
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#8B8480', marginBottom: '4px' }}>billed ₹19,800/year</p>
                <p
                  style={{
                    fontSize: '12px',
                    color: '#C4B8AE',
                    textDecoration: 'line-through',
                    marginBottom: '1rem',
                  }}
                >
                  vs ₹29,988 if paid monthly
                </p>
              </>
            )}

            <div style={{ height: '0.5px', background: 'rgba(26,23,20,0.06)', margin: '0.75rem 0' }} />
            <FeatureList items={architectFeatures} dotColor="rgba(196,149,106,0.5)" textColor="#1A1714" subColor="#6B6460" />
            {isAuthenticated && isCurrentPlan('pro') ? (
              <p style={{ fontSize: 11, color: '#5A8C6A', fontStyle: 'italic', margin: '0 0 10px' }}>Agent Mode included</p>
            ) : null}
            {isCurrentPlan('pro') ? (
              <div
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '999px',
                  background: 'rgba(196,149,106,0.15)',
                  color: '#C4956A',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'default',
                  border: '0.5px solid rgba(196,149,106,0.3)',
                  textAlign: 'center',
                  marginTop: 'auto',
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
                  padding: '11px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: 'auto',
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.88';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Upgrade to Pro
              </button>
            )}
            <p
              style={{
                fontSize: '11px',
                color: '#A89070',
                fontStyle: 'italic',
                textAlign: 'center',
                marginTop: '8px',
                marginBottom: 0,
              }}
            >
              Stay 10 months, get months 11 &amp; 12 free
            </p>
          </div>
        </section>

        <section ref={mindsSectionRef} style={{ maxWidth: '760px', margin: '2.5rem auto 0', textAlign: 'center' }}>
          <p
            style={{
              fontSize: '10px',
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: '#B0A9A2',
              marginBottom: '0.5rem',
            }}
          >
            THE MINDS
          </p>
          <p style={{ fontSize: '13px', color: '#C4B8AE', marginBottom: '2rem' }}>Your panel. Your perspective.</p>

          <div
            onMouseEnter={() => setSectionHovered(true)}
            onMouseLeave={() => {
              setSectionHovered(false);
              setHoveredMind(null);
            }}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              justifyContent: 'center',
              padding: '2rem 2.5rem',
              background: 'rgba(26,23,20,0.02)',
              border: '0.5px solid rgba(26,23,20,0.05)',
              borderRadius: '24px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '300px',
                height: '200px',
                background: 'radial-gradient(ellipse, rgba(196,149,106,0.06) 0%, transparent 70%)',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />

            {MINDS.map((mind, index) => {
              const locked = (isPlus || isPro) ? false : mind.locked;
              const isWaveLit = locked && sectionHovered;
              const isUnlockedHover = !locked && hoveredMind === index;
              const enterDelay = `${index * 40}ms`;
              const lockedDelay = `${Math.max(index - 6, 0) * 50}ms`;

              return (
                <Fragment key={mind.name}>
                  <div
                    onMouseEnter={() => setHoveredMind(index)}
                    onMouseLeave={() => setHoveredMind((current) => (current === index ? null : current))}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      padding: '7px 14px',
                      borderRadius: '999px',
                      cursor: 'default',
                      transition: 'all 400ms ease',
                      transitionDelay: locked ? (sectionHovered ? lockedDelay : '0ms') : '0ms',
                      border: locked
                        ? isWaveLit
                          ? `1px solid ${hexToRgba(mind.color, 0.2)}`
                          : '1px solid rgba(26,23,20,0.08)'
                        : `1px solid ${hexToRgba(mind.color, isUnlockedHover ? 0.5 : 0.35)}`,
                      background: locked
                        ? isWaveLit
                          ? hexToRgba(mind.color, 0.05)
                          : 'transparent'
                        : hexToRgba(mind.color, isUnlockedHover ? 0.12 : 0.07),
                      transform: isUnlockedHover ? 'translateY(-1px)' : 'translateY(0)',
                      boxShadow: locked
                        ? 'none'
                        : isUnlockedHover
                          ? `0 4px 12px ${hexToRgba(mind.color, 0.15)}`
                          : undefined,
                      animation: `${mindsInView ? 'mindEnter 400ms cubic-bezier(0.16,1,0.3,1) both' : 'none'}${!locked ? `, pillBreathe ${unlockedPillTimings[Math.min(index, 5)]} ease-in-out infinite` : ''}`,
                      animationDelay: mindsInView ? `${enterDelay}${!locked ? ', 0s' : ''}` : undefined,
                      opacity: mindsInView ? 1 : 0,
                    }}
                  >
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: mind.color,
                        opacity: locked ? (isWaveLit ? 0.35 : 0.15) : 0.7,
                        display: 'inline-block',
                        marginRight: '6px',
                        verticalAlign: 'middle',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 400,
                        color: locked ? (isWaveLit ? 'rgba(26,23,20,0.5)' : 'rgba(26,23,20,0.2)') : '#1A1714',
                        letterSpacing: '0.01em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {mind.name}
                    </span>
                  </div>

                  {!isPlus && !isPro && index === 5 ? (
                    <Fragment>
                      <div
                        style={{
                          width: '100%',
                          height: 0,
                          margin: '2px 0',
                          opacity: mindsInView ? 1 : 0,
                          animation: mindsInView ? 'mindEnter 400ms cubic-bezier(0.16,1,0.3,1) both' : 'none',
                          animationDelay: '240ms',
                        }}
                      />
                      <div
                        style={{
                          width: '100%',
                          textAlign: 'center',
                          fontSize: '10px',
                          letterSpacing: '.12em',
                          textTransform: 'uppercase',
                          color: 'rgba(26,23,20,0.15)',
                          margin: '4px 0 6px',
                          opacity: mindsInView ? 1 : 0,
                          animation: mindsInView ? 'mindEnter 400ms cubic-bezier(0.16,1,0.3,1) both' : 'none',
                          animationDelay: '280ms',
                        }}
                      >
                        · · · Plus · · ·
                      </div>
                    </Fragment>
                  ) : null}
                </Fragment>
              );
            })}
          </div>

          <div style={{ marginTop: '1.2rem' }}>
            {isPlus || isPro ? (
              <p style={{ fontSize: '12px', color: '#8AA899' }}>All 16 minds available in your panel</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span
                    style={{
                      background: 'rgba(196,149,106,0.1)',
                      border: '0.5px solid rgba(196,149,106,0.25)',
                      color: '#C4956A',
                      fontSize: '11px',
                      padding: '4px 12px',
                      borderRadius: '999px',
                    }}
                  >
                    6 unlocked
                  </span>
                  <span style={{ color: '#C4B8AE' }}>·</span>
                  <span
                    style={{
                      background: 'rgba(26,23,20,0.04)',
                      border: '0.5px solid rgba(26,23,20,0.08)',
                      color: '#6B6460',
                      fontSize: '11px',
                      padding: '4px 12px',
                      borderRadius: '999px',
                    }}
                  >
                    10 with Plus
                  </span>
                </div>
                <p style={{ marginTop: '0.5rem', fontSize: '11px', color: '#B0A9A2' }}>Hover to preview the locked minds</p>
              </>
            )}
          </div>
        </section>

        <section style={{ marginBottom: '3rem', marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 500, color: '#1A1714', marginBottom: '1rem' }}>Compare plans</h2>
          <div className="comparison-table-wrapper" style={{ border: '0.5px solid #E0D8D0', borderRadius: '12px', overflow: 'hidden' }}>
            <div className="comparison-table" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', background: '#F0EBE3' }}>
              {['Feature', 'Explorer', 'Plus', 'Pro'].map((label) => (
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

        <section style={{ maxWidth: '760px', marginTop: '1.5rem' }}>
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
