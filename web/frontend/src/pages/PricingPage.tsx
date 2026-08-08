import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ArrowRight, Check, CheckCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSubscriptionStatus } from '../api';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { Pressable } from '../components/Pressable';
import { Reveal } from '../components/Reveal';
import { RazorpayCheckout } from '../components/RazorpayCheckout';
import { useTier } from '../context/TierContext';
import { useProfileModal } from '../context/ProfileModalContext';
import { useAuth } from '../hooks/useAuth';
import { isFaqOpen, toggleFaqOpen } from '../lib/faqAccordion';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/verdict-pricing.css';

type BillingPeriod = 'monthly' | 'annual';
type PlanId = 'explorer' | 'plus' | 'pro';
type MatrixValue = 'yes' | 'no' | string;

type PlanDefinition = {
  id: PlanId;
  name: string;
  tone: string;
  monthly: string;
  annualEffective: string;
  annualTotal: string;
  annualSaving: string;
  limits: string;
  features: readonly string[];
};

const PLANS: readonly PlanDefinition[] = [
  {
    id: 'explorer',
    name: 'Explorer',
    tone: '#5ED8FF',
    monthly: '0',
    annualEffective: '0',
    annualTotal: '₹0',
    annualSaving: 'Free forever',
    limits: '5 questions · 25K credits · 6 minds',
    features: [
      'Four parallel responses',
      'Independent judge',
      'Copy and share',
      'Six starter personas',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    tone: '#D7F64A',
    monthly: '999',
    annualEffective: '742',
    annualTotal: '₹8,899',
    annualSaving: 'Save 26%',
    limits: '15 questions · 100K credits · 16 minds',
    features: [
      'Everything in Explorer',
      'Debate and focused chat',
      'Memory and full history',
      'Watchlist and rooms',
      'All 16 reasoning styles',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tone: '#A98CF8',
    monthly: '2,499',
    annualEffective: '1,650',
    annualTotal: '₹19,800',
    annualSaving: 'Save 34%',
    limits: '35 questions · 300K credits · Agent Mode',
    features: [
      'Everything in Plus',
      'Agent Mode included',
      'Unlimited debates',
      'Scoring audit',
      'Calibration tools',
    ],
  },
];

const COMPARISON_ROWS: readonly {
  label: string;
  explorer: MatrixValue;
  plus: MatrixValue;
  pro: MatrixValue;
}[] = [
  { label: 'Daily credits', explorer: '25K', plus: '100K', pro: '300K' },
  { label: 'Arena questions / day', explorer: '5', plus: '15', pro: '35' },
  { label: 'Pro rolling window', explorer: 'no', plus: 'no', pro: '45 / 5h' },
  { label: 'Personas available', explorer: '6', plus: '16', pro: '16' },
  { label: 'Debate mode', explorer: 'no', plus: 'yes', pro: 'yes' },
  { label: 'Focused chat', explorer: 'no', plus: 'yes', pro: 'yes' },
  { label: 'Memory', explorer: 'no', plus: 'yes', pro: 'yes' },
  { label: 'Saved responses + full history', explorer: 'no', plus: 'yes', pro: 'yes' },
  { label: 'Watchlist', explorer: 'no', plus: 'yes', pro: 'yes' },
  { label: 'Agent Mode', explorer: 'no', plus: '₹599 add-on', pro: 'Included' },
  { label: 'Unlimited debates', explorer: 'no', plus: 'no', pro: 'yes' },
  { label: 'Scoring audit', explorer: 'no', plus: 'no', pro: 'yes' },
  { label: 'Calibration', explorer: 'no', plus: 'no', pro: 'yes' },
];

const FAQS = [
  {
    question: 'Which minds are included with Explorer?',
    answer:
      'Explorer includes The Analyst, Philosopher, Pragmatist, Contrarian, Futurist, and Empath. Plus and Pro unlock all 16 reasoning styles.',
  },
  {
    question: 'What changes between Plus and Pro?',
    answer:
      'Plus adds all 16 minds, Debate, focused chat, memory, saved responses, full history, Watchlist, and rooms. Pro includes everything in Plus, then adds Agent Mode, unlimited debates, scoring audit, calibration, and higher Pro rate limits.',
  },
  {
    question: 'Can Plus use Agent Mode?',
    answer:
      'Yes. An active Plus subscriber can add Agent Mode for ₹599 per month. The add-on uses Plus plan limits. Pro includes Agent Mode without a separate add-on.',
  },
  {
    question: 'What is Agent Mode?',
    answer:
      'Agent Mode runs the seven visible research stages—planner, researcher, solver, critic, verifier, synthesizer, and judge—to produce a structured investigation. It is included with Pro or available as a Plus add-on.',
  },
  {
    question: 'How does annual billing work?',
    answer:
      'Annual prices are charged once for the year. The monthly number shown is the annual total divided by 12: ₹8,899 per year for Plus and ₹19,800 per year for Pro. Plus saves 26% versus 12 monthly payments. Pro saves 34% versus 12 list-price months; compared with Pro’s 10-paid + 2-free monthly loyalty cycle (₹24,990), annual Pro saves ₹5,190—about 21%.',
  },
  {
    question: 'Can I cancel a paid plan?',
    answer:
      'Yes. You can schedule cancellation from your account. Billing stops at the end of the current cycle, and paid access remains available through that period.',
  },
  {
    question: 'Does Agent Mode control my computer?',
    answer:
      'No. Arena is web-only. Local or on-device actions require Condura, a separate local-first companion. The browser never pretends to control your machine.',
  },
] as const;

function MatrixCell({ value }: { value: MatrixValue }) {
  if (value === 'yes') {
    return (
      <span className="pricing-matrix__mark pricing-matrix__mark--yes">
        <Check aria-hidden="true" />
        <span className="pricing-sr-only">Included</span>
      </span>
    );
  }
  if (value === 'no') {
    return (
      <span className="pricing-matrix__mark pricing-matrix__mark--no">
        <X aria-hidden="true" />
        <span className="pricing-sr-only">Not included</span>
      </span>
    );
  }
  return <span>{value}</span>;
}

export function PricingPage() {
  const navigate = useNavigate();
  const { openModal } = useProfileModal();
  const { isAuthenticated, refreshUser, user } = useAuth();
  const { tier, isPlus, isPro, refreshTier } = useTier();
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [upgradeSuccessLabel, setUpgradeSuccessLabel] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(1);
  const navigateTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const tierName = String(user?.tier ?? tier ?? '').toLowerCase();
  const isPlusUser = isAuthenticated && (tierName === 'plus' || isPlus);
  const hasAgentAddon = user?.agent_addon_active === true;
  const addonCancelling = user?.agent_addon_cancelling === true;

  useEffect(() => {
    if (!isAuthenticated) {
      setSubscriptionStatus(null);
      return;
    }

    let active = true;
    getSubscriptionStatus()
      .then((data) => {
        if (active) setSubscriptionStatus(data.status || null);
      })
      .catch(() => {
        if (active) setSubscriptionStatus(null);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      if (navigateTimerRef.current != null) window.clearTimeout(navigateTimerRef.current);
      if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const currentPlan: PlanId = isPro ? 'pro' : isPlus ? 'plus' : 'explorer';

  const hasActiveSubscription =
    isAuthenticated &&
    (isPlus || isPro) &&
    (subscriptionStatus == null ||
      ['created', 'authenticated', 'active', 'halted'].includes(subscriptionStatus));

  const showAgentAddonOffer =
    isPlusUser && !isPro && !hasAgentAddon && !addonCancelling;

  const beginCheckout = (planKey: string) => {
    if (!isAuthenticated) {
      setRedirectIntent('/pricing');
      navigate('/signin?tab=signup');
      return;
    }
    setCheckoutError(null);
    setCheckoutPlan(planKey);
  };

  const startFree = () => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    setRedirectIntent('/app');
    navigate('/signin?tab=signup');
  };

  const handleCheckoutSuccess = async (planKey: string) => {
    setUpgradeSuccessLabel(planKey.startsWith('pro') ? 'Pro' : 'Plus');
    setCheckoutPlan(null);
    setUpgradeSuccess(true);
    await refreshTier();
    await refreshUser();
    navigateTimerRef.current = window.setTimeout(() => navigate('/app'), 2000);
  };

  const handleAddonSuccess = async () => {
    setCheckoutPlan(null);
    await refreshTier();
    await refreshUser();
    setUpgradeSuccessLabel('Agent Mode');
    setUpgradeSuccess(true);
    noticeTimerRef.current = window.setTimeout(() => setUpgradeSuccess(false), 2500);
  };

  const onCheckoutError = useCallback((error: string) => {
    setCheckoutPlan(null);
    setCheckoutError(error);
  }, []);

  const onCheckoutClose = useCallback(() => {
    setCheckoutPlan(null);
  }, []);

  const priceFor = (plan: PlanDefinition) =>
    billing === 'monthly' ? plan.monthly : plan.annualEffective;

  const checkoutKeyFor = (plan: PlanId) =>
    `${plan}_${billing === 'monthly' ? 'monthly' : 'annual'}`;

  const planAction = (plan: PlanDefinition): ReactNode => {
    const rank: Record<PlanId, number> = { explorer: 0, plus: 1, pro: 2 };
    const currentRank = rank[currentPlan];
    const planRank = rank[plan.id];

    if (isAuthenticated && currentPlan === plan.id) {
      return (
        <div className="pricing-tier-card__state" role="status">
          <CheckCircle aria-hidden="true" />
          Current plan
        </div>
      );
    }

    if (isAuthenticated && currentRank > planRank) {
      return (
        <div className="pricing-tier-card__state">
          Included in {currentPlan === 'pro' ? 'Pro' : 'your plan'}
        </div>
      );
    }

    if (plan.id === 'explorer') {
      return (
        <Pressable type="button" className="pricing-tier-card__cta" onClick={startFree}>
          <span>{isAuthenticated ? 'Open Arena' : 'Start for free'}</span>
          <ArrowRight aria-hidden="true" />
        </Pressable>
      );
    }

    return (
      <Pressable
        type="button"
        className="pricing-tier-card__cta"
        onClick={() => beginCheckout(checkoutKeyFor(plan.id))}
      >
        <span>Get {plan.name}</span>
        <ArrowRight aria-hidden="true" />
      </Pressable>
    );
  };

  return (
    <div className="pricing-page pricing-studio-page">
      <Navbar />

      <main id="main-content" className="pricing-page__main" tabIndex={-1} aria-labelledby="pricing-title">
        {upgradeSuccess && (
          <div className="pricing-studio-notice pricing-studio-notice--success" role="status" aria-live="polite">
            <CheckCircle aria-hidden="true" />
            <span>
              {upgradeSuccessLabel === 'Agent Mode'
                ? 'Agent Mode add-on activated. Plus plan limits continue to apply.'
                : `Welcome to ${upgradeSuccessLabel}. Your account has been upgraded.`}
            </span>
          </div>
        )}

        {checkoutError && (
          <div className="pricing-studio-notice pricing-studio-notice--error" role="alert">
            <span>{checkoutError}</span>
            <button type="button" aria-label="Dismiss checkout error" onClick={() => setCheckoutError(null)}>
              <X aria-hidden="true" />
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
                void handleAddonSuccess();
              } else {
                void handleCheckoutSuccess(checkoutPlan);
              }
            }}
            onError={onCheckoutError}
            onClose={onCheckoutClose}
          />
        )}

        <header className="pricing-paywall-hero arena-reveal is-visible" aria-labelledby="pricing-title">
          <p className="pricing-paywall-hero__kicker">Pricing</p>
          <h1 id="pricing-title">
            Pay for depth.
            <span>Not access.</span>
          </h1>
          <p className="pricing-paywall-hero__lede">
            Start free with four minds and a judge. Upgrade when you need memory,
            Debate, or Agent Mode — prices in INR, cancel from your account.
          </p>
          <ul className="pricing-paywall-hero__trust" aria-label="Pricing commitments">
            <li>No card to start</li>
            <li>Cancel anytime</li>
            <li>Billed in INR</li>
          </ul>
        </header>

        {hasActiveSubscription && (
          <div className="pricing-active-strip" role="status">
            <CheckCircle aria-hidden="true" />
            <span>
              You are on <strong>{isPro ? 'Pro' : 'Plus'}</strong>.
            </span>
            <button type="button" onClick={() => openModal('top-right', 'plan')}>
              Manage <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}

        {showAgentAddonOffer && (
          <div className="pricing-addon-note" role="status">
            <span>Agent Mode is available on your Plus plan for ₹599 / month.</span>
            <button type="button" onClick={() => beginCheckout('agent_addon')}>
              Add Agent Mode <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}

        {addonCancelling && (
          <div className="pricing-addon-note" role="status">
            <span>Agent Mode remains active through the paid period.</span>
            <button type="button" onClick={() => openModal('top-right', 'plan')}>
              Manage <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}

        <Reveal
          as="section"
          id="pricing-plans"
          className="pricing-paywall-plans"
          aria-labelledby="pricing-plans-title"
        >
          <div className="pricing-paywall-plans__bar">
            <h2 id="pricing-plans-title">Choose a plan</h2>
            <div className="pricing-billing-control" role="group" aria-label="Billing period">
              <Pressable
                soft
                type="button"
                aria-pressed={billing === 'monthly'}
                className={billing === 'monthly' ? 'is-active' : ''}
                onClick={() => setBilling('monthly')}
              >
                Monthly
              </Pressable>
              <Pressable
                soft
                type="button"
                aria-pressed={billing === 'annual'}
                className={billing === 'annual' ? 'is-active' : ''}
                onClick={() => setBilling('annual')}
              >
                Annual
                <span>save more</span>
              </Pressable>
            </div>
          </div>

          <div className="pricing-deck" role="list" aria-label="Pricing plans">
            {PLANS.map((plan) => {
              const free = plan.id === 'explorer';
              const recommended = plan.id === 'plus';
              return (
                <article
                  key={plan.id}
                  id={`plan-${plan.id}`}
                  role="listitem"
                  className={`pricing-tier-card pricing-tier-card--${plan.id}${recommended ? ' is-recommended' : ''}`}
                  style={{ '--plan-tone': plan.tone } as CSSProperties}
                >
                  <div className="pricing-tier-card__top">
                    <h3>{plan.name}</h3>
                    {recommended ? (
                      <span className="pricing-tier-card__recommendation">Recommended</span>
                    ) : null}
                  </div>

                  <div
                    className="pricing-tier-card__price"
                    aria-label={
                      free
                        ? `${plan.name} price free`
                        : billing === 'annual'
                          ? `${plan.name} effective monthly price ₹${priceFor(plan)}; ${plan.annualTotal} charged yearly`
                          : `${plan.name} price ₹${priceFor(plan)} per month`
                    }
                  >
                    <b>₹{priceFor(plan)}</b>
                    <em>{free ? 'forever' : billing === 'annual' ? 'per month, billed yearly' : 'per month'}</em>
                  </div>

                  <p className="pricing-tier-card__billing-note">
                    {free
                      ? 'No card required'
                      : billing === 'annual'
                        ? `${plan.annualTotal} / year · ${plan.annualSaving}`
                        : 'Billed monthly · cancel anytime'}
                  </p>

                  <p className="pricing-tier-card__limits">{plan.limits}</p>

                  <ul className="pricing-tier-card__features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check aria-hidden="true" strokeWidth={2.5} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <footer>
                    {planAction(plan)}
                    {plan.id === 'pro' && billing === 'monthly' ? (
                      <p>After 10 paid months, 2 months free.</p>
                    ) : null}
                    {plan.id === 'pro' && billing === 'annual' ? (
                      <p>Save ₹5,190 vs monthly loyalty cycle.</p>
                    ) : null}
                  </footer>
                </article>
              );
            })}
          </div>
        </Reveal>

        <Reveal as="section" className="pricing-studio-section pricing-comparison-ledger" aria-labelledby="pricing-comparison-title">
          <header className="pricing-studio-section__head">
            <div>
              <span>Compare</span>
              <h2 id="pricing-comparison-title">Every limit, before checkout.</h2>
            </div>
            <p>Nothing important is hidden behind the card form.</p>
          </header>

          <p id="pricing-matrix-instructions" className="pricing-sr-only">
            Scroll horizontally on smaller screens to compare all three plans.
          </p>
          <div className="pricing-matrix-wrap">
            <table className="pricing-matrix" aria-describedby="pricing-matrix-instructions">
              <caption className="pricing-sr-only">Explorer, Plus, and Pro feature comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  {PLANS.map((plan) => (
                    <th key={plan.id} scope="col">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {PLANS.map((plan) => (
                      <td key={`${row.label}-${plan.id}`}>
                        <MatrixCell value={row[plan.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal as="section" className="pricing-studio-section pricing-faq-studio" aria-labelledby="pricing-faq-title">
          <header className="pricing-studio-section__head">
            <div>
              <span>FAQ</span>
              <h2 id="pricing-faq-title">Before you decide.</h2>
            </div>
            <p>Billing, cancellation, Agent Mode, and the web-only boundary.</p>
          </header>

          <div className="pricing-faq-studio__list">
            {FAQS.map((faq, index) => {
              const open = isFaqOpen(openFaqIndex, index);
              const panelId = `pricing-faq-panel-${index}`;
              const buttonId = `pricing-faq-button-${index}`;
              return (
                <article key={faq.question} className={open ? 'is-open' : ''}>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenFaqIndex((previous) => toggleFaqOpen(previous, index))}
                  >
                    <span>{faq.question}</span>
                    <b aria-hidden="true">{open ? '−' : '+'}</b>
                  </button>
                  {open ? (
                    <div id={panelId} role="region" aria-labelledby={buttonId}>
                      <p>{faq.answer}</p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </Reveal>

        <Reveal as="section" className="pricing-studio-close" aria-labelledby="pricing-close-title">
          <p>No card required</p>
          <h2 id="pricing-close-title">Ask one real question first.</h2>
          <div>
            <Pressable type="button" onClick={startFree}>
              {isAuthenticated ? 'Open Arena' : 'Start for free'} <ArrowRight aria-hidden="true" />
            </Pressable>
            {isAuthenticated && currentPlan !== 'explorer' ? (
              <Pressable type="button" onClick={() => openModal('top-right', 'plan')}>
                {currentPlan === 'pro' ? 'Pro is active' : 'Manage Plus'} <ArrowRight aria-hidden="true" />
              </Pressable>
            ) : (
              <Pressable type="button" onClick={() => beginCheckout(checkoutKeyFor('plus'))}>
                Get Plus <ArrowRight aria-hidden="true" />
              </Pressable>
            )}
          </div>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
