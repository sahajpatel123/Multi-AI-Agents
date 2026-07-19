import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSubscriptionStatus } from '../api';
import { Button } from '../components/Button';
import { Footer } from '../components/Footer';
import { Icons } from '../components/Icons';
import { Navbar } from '../components/Navbar';
import { RazorpayCheckout } from '../components/RazorpayCheckout';
import { useAuth } from '../hooks/useAuth';
import { useTier } from '../context/TierContext';
import { useProfileModal } from '../context/ProfileModalContext';
import { setRedirectIntent } from '../utils/redirectIntent';
import { isFaqOpen, toggleFaqOpen } from '../lib/faqAccordion';

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
    question: 'What is Agent Mode?',
    answer:
      'Agent Mode is a 7-stage research pipeline (planner → researcher → steelman → solver → critic → verifier → synthesizer → judge) that returns a single best-supported take with assumptions surfaced, sources attached, and a confidence score. Pro unlocks it fully; Plus can add it as an in-app add-on.',
  },
  {
    question: 'What is Watchlist?',
    answer:
      'Watchlist lets you turn any research question into a recurring task. Arena re-runs it on your schedule (daily / every 3 days / weekly) and only surfaces a new finding when the latest answer actually changes — so you stay current without polling.',
  },
  {
    question: 'What is the difference between Saved and Watchlist?',
    answer:
      'Saved takes are one-off bookmarks of past Arena or Agent answers you want to revisit. Watchlist is recurring — Arena re-checks the question on a schedule and notifies you when findings change.',
  },
  {
    question: 'How does calibration work?',
    answer:
      'When you rate an Agent answer as Accurate, Partial, or Inaccurate, Arena updates your calibration profile. After enough ratings, Arena uses your history to gently adjust the displayed confidence so it matches how you actually evaluate answers.',
  },
  {
    question: 'Can I change plans anytime?',
    answer: 'Yes. Upgrade or downgrade at any time. Changes take effect immediately.',
  },
  {
    question: 'Does Agent Mode control my computer?',
    answer:
      'No. Arena is web-only. On-device actions need Condura (free, local-first) on your machine. The browser never fakes local control.',
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
  'Watchlist (recurring research)',
  'Saved takes + Rooms (collaboration)',
  'Calibration learns how you evaluate answers',
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

function PriceDisplay({ amount, period = '/mo' }: { amount: string; period?: string }) {
  return (
    <div className="price-display">
      <span className="currency">₹</span>
      <span className="amount">{amount}</span>
      {period ? <span className="period">{period}</span> : null}
    </div>
  );
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
    <div
      className="pricing-feature-list"
      style={
        {
          '--fl-dot-color': dotColor,
          '--fl-text-color': textColor,
          '--fl-sub-color': subColor,
        } as CSSProperties
      }
    >
      {items.map((item) => {
        const sub = isSubFeature(item);
        return (
          <div
            key={item}
            className={`pricing-feature-list__row${sub ? ' pricing-feature-list__row--sub' : ''}`}
          >
            {sub ? (
              <span className="pricing-feature-list__spacer" aria-hidden="true" />
            ) : (
              <span
                className="pricing-feature-list__dot"
                aria-hidden="true"
              />
            )}
            <span className="pricing-feature-list__text">{item}</span>
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
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [sectionHovered, setSectionHovered] = useState(false);
  const [hoveredMind, setHoveredMind] = useState<number | null>(null);
  const [mindsInView, setMindsInView] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
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
      setRedirectIntent('/pricing');
      navigate('/signin?tab=signup');
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

  return (
    <div className="pricing-page">
      <Navbar />

      <main id="main-content" className="pricing-page__main" tabIndex={-1}>
        {upgradeSuccess && (
          <div className="pricing-banner pricing-banner--success" role="status" aria-live="polite">
            {upgradeSuccessLabel === 'Agent Mode'
              ? 'Agent Mode add-on activated. Your Plus plan now includes the research pipeline.'
              : `Welcome to ${upgradeSuccessLabel}! Your account has been upgraded.`}
          </div>
        )}

        {checkoutError && (
          <div className="pricing-banner pricing-banner--error" role="alert">
            <span className="pricing-banner__text">{checkoutError}</span>
            <button
              type="button"
              className="pricing-banner__dismiss"
              aria-label="Dismiss"
              onClick={() => setCheckoutError(null)}
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

        <section className="pricing-hero" aria-labelledby="pricing-title">
          <p className="pricing-hero__kicker">
            <span className="pricing-hero__kicker-dot" aria-hidden="true" />
            Simple, honest pricing
          </p>
          <h1 id="pricing-title" className="pricing-hero__title">
            Start <span className="pricing-hero__accent">free.</span>
          </h1>
          <p className="pricing-hero__lede">
            Upgrade when Arena becomes part of how you think. Cancel anytime — no lock-in.
          </p>
          <ul className="pricing-hero__proof" aria-hidden="true">
            <li className="pricing-hero__proof-item">Cancel anytime</li>
            <li className="pricing-hero__proof-item">No lock-in</li>
            <li className="pricing-hero__proof-item">Free tier forever</li>
          </ul>
        </section>

        {hasActiveSubscription && (
          <div className="pricing-active-banner" role="status">
            <CheckCircle size={16} color="#5A8A5A" aria-hidden />
            <span>
              You are on the <strong>{isPro ? 'Pro' : 'Plus'}</strong> plan.
            </span>
            <button
              type="button"
              className="pricing-active-banner__manage"
              onClick={() => openModal('top-right', 'plan')}
            >
              Manage subscription →
            </button>
          </div>
        )}

        <div className="pricing-billing-wrap">
          <div className="billing-toggle-v2" role="group" aria-label="Billing period">
            <button
              type="button"
              className={`billing-toggle-option${billing === 'monthly' ? ' billing-toggle-option--active' : ''}`}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`billing-toggle-option${billing === 'annual' ? ' billing-toggle-option--active' : ''}`}
              onClick={() => setBilling('annual')}
            >
              Annual
              {billing === 'monthly' ? <span className="billing-toggle-save-badge">· save 26%</span> : null}
            </button>
          </div>
        </div>

        <section className="pricing-grid" aria-label="Pricing plans">
          <div className="pricing-plan-card">
            {isAuthenticated && isCurrentPlan('free') ? (
              <span className="pricing-plan-card__badge">Your plan</span>
            ) : null}
            <div className="pricing-plan-card__pill">Free forever</div>
            <p className="pricing-plan-card__name">Explorer</p>
            <PriceDisplay amount="0" period="" />
            <p className="pricing-price-sub" style={{ marginBottom: '1rem' }}>
              forever
            </p>
            <div className="pricing-plan-card__divider" />
            <FeatureList items={explorerFeatures} dotColor="#D4CCC4" textColor="#1A1714" subColor="#8B8480" />
            {isCurrentPlan('free') ? (
              <div
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '999px',
                  border: '0.5px solid #E0D8D0',
                  background: '#F0EBE3',
                  color: '#6B6460',
                  fontSize: '14px',
                  cursor: 'default',
                  marginTop: 'auto',
                  textAlign: 'center',
                }}
              >
                Current plan
              </div>
            ) : (
              <div style={{ marginTop: 'auto', width: '100%' }}>
                <Button variant="secondary" size="lg" fullWidth onClick={() => navigate('/app')}>
                  Start for free
                </Button>
              </div>
            )}
          </div>

          <div className="pricing-plan-card pricing-plan-card--featured">
            <div className="pricing-plan-card__ribbon">Most popular</div>
            {isAuthenticated && isCurrentPlan('plus') ? (
              <span className="pricing-plan-card__badge">Your plan</span>
            ) : null}
            <div className="pricing-plan-card__pill">Best value</div>
            <p className="pricing-plan-card__name">Plus</p>

            {billing === 'monthly' ? (
              <>
                <PriceDisplay amount="999" />
                <p className="pricing-price-sub" style={{ marginBottom: '1rem' }}>
                  per month, billed monthly
                </p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: 0 }}>
                  <PriceDisplay amount="742" />
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
                <p className="pricing-price-sub" style={{ marginBottom: '4px' }}>
                  per month, billed annually
                </p>
                <p style={{ fontSize: '16px', color: '#8C7355', marginBottom: '4px' }}>Billed as ₹8,899/year</p>
                <p style={{ fontSize: '12px', color: '#C4B8AE', textDecoration: 'line-through', marginBottom: '1rem' }}>vs ₹11,988 if paid monthly</p>
              </>
            )}

            <div className="pricing-plan-card__divider" />
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
              <div style={{ marginTop: 'auto', width: '100%' }}>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  fullWidth
                  icon={Icons.lightning(18)}
                  onClick={() => handleUpgrade(billing === 'monthly' ? 'plus_monthly' : 'plus_annual')}
                >
                  Get Plus
                </Button>
              </div>
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
                  <div className="price-display price-display--compact" style={{ marginLeft: 'auto' }}>
                    <span className="currency">₹</span>
                    <span className="amount">599</span>
                    <span className="period">/month</span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: '#8C7355', fontStyle: 'italic', margin: '6px 0 10px' }}>
                  Unlock the 7-stage research pipeline on your Plus plan. Plus limits apply.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => {
                    setCheckoutError(null);
                    setCheckoutPlan('agent_addon');
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                    Add Agent Mode —
                    <span className="price-display price-display--compact">
                      <span className="currency">₹</span>
                      <span className="amount">599</span>
                      <span className="period">/mo</span>
                    </span>
                  </span>
                </Button>
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

          <div className="pricing-plan-card">
            {isAuthenticated && isCurrentPlan('pro') ? (
              <span className="pricing-plan-card__badge">Your plan</span>
            ) : null}
            <div className="pricing-plan-card__pill">Full power</div>
            <p className="pricing-plan-card__name">Pro</p>

            {billing === 'monthly' ? (
              <>
                <PriceDisplay amount="2,499" />
                <p className="pricing-price-sub" style={{ marginBottom: '1rem' }}>
                  per month, billed monthly
                </p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: 0 }}>
                  <PriceDisplay amount="1,650" />
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
                <p className="pricing-price-sub" style={{ marginBottom: '4px' }}>
                  per month, billed annually
                </p>
                <p style={{ fontSize: '16px', color: '#8C7355', marginBottom: '4px' }}>billed ₹19,800/year</p>
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

            <div className="pricing-plan-card__divider" />
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
              <div style={{ marginTop: 'auto', width: '100%' }}>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  fullWidth
                  icon={Icons.star(18)}
                  onClick={() => handleUpgrade(billing === 'monthly' ? 'pro_monthly' : 'pro_annual')}
                >
                  Get Pro
                </Button>
              </div>
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

        <section style={{ maxWidth: '760px', marginTop: '1.5rem' }} aria-label="Common questions">
          <h2 style={{ fontSize: '20px', fontWeight: 500, color: '#1A1714', marginBottom: '1rem' }}>Common questions</h2>
          {faqs.map((faq, index) => {
            const open = isFaqOpen(openFaqIndex, index);
            const panelId = `pricing-faq-panel-${index}`;
            const buttonId = `pricing-faq-button-${index}`;
            return (
              <div
                key={faq.question}
                className="faq-item"
                style={{ borderBottom: '0.5px solid rgba(26,23,20,0.06)', padding: '0.35rem 0' }}
              >
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenFaqIndex((prev) => toggleFaqOpen(prev, index))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    background: 'none',
                    border: 'none',
                    padding: '0.75rem 0',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714' }}>{faq.question}</span>
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      fontSize: 18,
                      color: '#C4956A',
                      lineHeight: 1,
                      transform: open ? 'rotate(45deg)' : 'none',
                      transition: 'transform 160ms ease',
                    }}
                  >
                    +
                  </span>
                </button>
                {open ? (
                  <div id={panelId} role="region" aria-labelledby={buttonId} style={{ padding: '0 0 0.85rem' }}>
                    <p style={{ fontSize: '13px', color: '#8B8480', lineHeight: 1.7, margin: 0 }}>{faq.answer}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      </main>

      <Footer />
    </div>
  );
}
