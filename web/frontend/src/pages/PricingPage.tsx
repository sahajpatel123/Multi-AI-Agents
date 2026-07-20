import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ArrowRight, Check, CheckCircle, Lock, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSubscriptionStatus } from '../api';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
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
  index: string;
  name: string;
  verb: string;
  fit: string;
  tone: string;
  monthly: string;
  annualEffective: string;
  annualTotal: string;
  annualSaving: string;
  metrics: readonly { value: string; label: string }[];
  features: readonly string[];
};

const DEPTH_OPTIONS: readonly {
  plan: PlanId;
  index: string;
  verb: string;
  label: string;
  prompt: string;
  tone: string;
}[] = [
  {
    plan: 'explorer',
    index: '01',
    verb: 'Orient',
    label: 'Explorer',
    prompt: 'I need distinct perspectives on everyday questions.',
    tone: '#5ED8FF',
  },
  {
    plan: 'plus',
    index: '02',
    verb: 'Decide',
    label: 'Plus',
    prompt: 'I need a thinking system that remembers and pushes back.',
    tone: '#D7F64A',
  },
  {
    plan: 'pro',
    index: '03',
    verb: 'Investigate',
    label: 'Pro',
    prompt: 'I need a structured research pipeline for consequential work.',
    tone: '#A98CF8',
  },
];

const PLANS: readonly PlanDefinition[] = [
  {
    id: 'explorer',
    index: 'P-01',
    name: 'Explorer',
    verb: 'Orient',
    fit: 'For learning how useful four genuinely different lenses can be.',
    tone: '#5ED8FF',
    monthly: '0',
    annualEffective: '0',
    annualTotal: '₹0',
    annualSaving: 'Free forever',
    metrics: [
      { value: '05', label: 'questions / day' },
      { value: '25K', label: 'credits / day' },
      { value: '06', label: 'reasoning styles' },
    ],
    features: [
      'Four parallel persona responses',
      'Independent judge selects a winner',
      'Copy and share responses',
      'Six starter personas',
    ],
  },
  {
    id: 'plus',
    index: 'P-02',
    name: 'Plus',
    verb: 'Decide',
    fit: 'For recurring decisions that benefit from memory, challenge, and a wider room.',
    tone: '#D7F64A',
    monthly: '999',
    annualEffective: '742',
    annualTotal: '₹8,899',
    annualSaving: 'Save 26%',
    metrics: [
      { value: '15', label: 'questions / day' },
      { value: '100K', label: 'credits / day' },
      { value: '16', label: 'reasoning styles' },
    ],
    features: [
      'Everything in Explorer',
      'Debate and focused chat',
      'Memory, saved responses, and full history',
      'Watchlist and collaborative rooms',
      'Build panels from all 16 minds',
    ],
  },
  {
    id: 'pro',
    index: 'P-03',
    name: 'Pro',
    verb: 'Investigate',
    fit: 'For complex questions that need a research pipeline, audit trail, and more room.',
    tone: '#A98CF8',
    monthly: '2,499',
    annualEffective: '1,650',
    annualTotal: '₹19,800',
    annualSaving: 'Save 34%',
    metrics: [
      { value: '35', label: 'questions / day' },
      { value: '300K', label: 'credits / day' },
      { value: '16', label: 'reasoning styles' },
    ],
    features: [
      'Everything in Plus',
      'Agent Mode included',
      'Unlimited debates',
      'Scoring audit and calibration',
      'Higher Pro rate limits',
    ],
  },
];

const MINDS = [
  { name: 'The Analyst', starter: true, color: '#8C9BAB' },
  { name: 'The Philosopher', starter: true, color: '#9B8FAA' },
  { name: 'The Pragmatist', starter: true, color: '#8AA899' },
  { name: 'The Contrarian', starter: true, color: '#B0977E' },
  { name: 'The Futurist', starter: true, color: '#9BAA7A' },
  { name: 'The Empath', starter: true, color: '#AA8A9B' },
  { name: 'The Scientist', starter: false, color: '#7A9BAB' },
  { name: 'The Historian', starter: false, color: '#9B8A7A' },
  { name: 'The Economist', starter: false, color: '#7A9B8A' },
  { name: 'The Ethicist', starter: false, color: '#AA8F9B' },
  { name: 'The Stoic', starter: false, color: '#8A8A9B' },
  { name: 'The Strategist', starter: false, color: '#AA957A' },
  { name: 'The Engineer', starter: false, color: '#7A8A9B' },
  { name: 'The Optimist', starter: false, color: '#9BAA8A' },
  { name: 'First Principles', starter: false, color: '#9B9BAA' },
  { name: "Devil's Advocate", starter: false, color: '#AA7A7A' },
] as const;

const AGENT_STAGES = [
  'Plan',
  'Research',
  'Solve',
  'Critique',
  'Verify',
  'Synthesize',
  'Judge',
] as const;

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

function SectionHeading({
  id,
  eyebrow,
  title,
  body,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <header className="pricing-studio-section__head">
      <div>
        <span>{eyebrow}</span>
        <h2 id={id}>{title}</h2>
      </div>
      <p>{body}</p>
    </header>
  );
}

export function PricingPage() {
  const navigate = useNavigate();
  const { openModal } = useProfileModal();
  const { isAuthenticated, refreshUser, user } = useAuth();
  const { tier, isPlus, isPro, refreshTier } = useTier();
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [focusedPlan, setFocusedPlan] = useState<PlanId>('plus');
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
  const selectedDepth = DEPTH_OPTIONS.find((option) => option.plan === focusedPlan) ?? DEPTH_OPTIONS[1];
  const visibleMindCount = focusedPlan === 'explorer' ? 6 : 16;

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

  const currentPlan: PlanId = isPro
    ? 'pro'
    : isPlus
      ? 'plus'
      : 'explorer';

  const hasActiveSubscription =
    isAuthenticated &&
    (isPlus || isPro) &&
    (subscriptionStatus == null ||
      ['created', 'authenticated', 'active', 'halted'].includes(subscriptionStatus));

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
      return <div className="pricing-tier-card__state">Included in {currentPlan === 'pro' ? 'Pro' : 'your plan'}</div>;
    }

    if (plan.id === 'explorer') {
      return (
        <button type="button" className="pricing-tier-card__cta" onClick={startFree}>
          <span>{isAuthenticated ? 'Open Arena' : 'Start for free'}</span>
          <ArrowRight aria-hidden="true" />
        </button>
      );
    }

    return (
      <button
        type="button"
        className="pricing-tier-card__cta"
        onClick={() => beginCheckout(checkoutKeyFor(plan.id))}
      >
        <span>Get {plan.name}</span>
        <ArrowRight aria-hidden="true" />
      </button>
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

        <section className="pricing-studio-hero" aria-labelledby="pricing-title">
          <div className="pricing-studio-hero__copy">
            <p className="pricing-studio-kicker"><span aria-hidden="true" /> Pricing / clear by design</p>
            <h1 id="pricing-title">Start free. <em>Go deeper when the work demands it.</em></h1>
            <p>
              Four distinct minds and a separate judge are free to start. Upgrade for more
              questions, persistent context, all 16 reasoning styles, or Agent Mode research.
            </p>
            <div className="pricing-studio-hero__actions">
              <a href="#pricing-plans">See the three plans <ArrowRight aria-hidden="true" /></a>
              <button type="button" onClick={startFree}>Start free · no card</button>
            </div>
            <ul className="pricing-studio-trust" aria-label="Pricing commitments">
              <li><Check aria-hidden="true" /> No card to start</li>
              <li><Check aria-hidden="true" /> Prices shown in INR</li>
              <li><Check aria-hidden="true" /> Cancel from your account</li>
            </ul>
            <dl className="pricing-studio-proof">
              <div><dt>₹0</dt><dd>registered free tier</dd></div>
              <div><dt>06–16</dt><dd>reasoning styles</dd></div>
              <div><dt>07</dt><dd>visible Agent stages</dd></div>
            </dl>
          </div>

          <aside className="pricing-depth-instrument" aria-label="Choose the depth of work">
            <header><span>Find your fit</span><b>{selectedDepth.index} / 03</b></header>
            <div className="pricing-depth-instrument__options">
              {DEPTH_OPTIONS.map((option) => (
                <button
                  key={option.plan}
                  type="button"
                  aria-pressed={focusedPlan === option.plan}
                  className={focusedPlan === option.plan ? 'is-active' : ''}
                  style={{ '--depth-tone': option.tone } as CSSProperties}
                  onClick={() => setFocusedPlan(option.plan)}
                >
                  <small>{option.index}</small>
                  <span><strong>{option.verb}</strong><em>{option.label}</em></span>
                  <b aria-hidden="true">{focusedPlan === option.plan ? '●' : '○'}</b>
                </button>
              ))}
            </div>
            <footer>
              <span>Your current fit / {selectedDepth.label}</span>
              <p>{selectedDepth.prompt}</p>
            </footer>
          </aside>
        </section>

        {hasActiveSubscription && (
          <div className="pricing-active-strip" role="status">
            <CheckCircle aria-hidden="true" />
            <span>You are on <strong>{isPro ? 'Pro' : 'Plus'}</strong>.</span>
            <button type="button" onClick={() => openModal('top-right', 'plan')}>
              Manage subscription <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}

        <section id="pricing-plans" className="pricing-studio-section pricing-plan-studio" aria-labelledby="pricing-plans-title">
          <header className="pricing-studio-section__head">
            <div>
              <span>01 / Choose your plan</span>
              <h2 id="pricing-plans-title">Pay for leverage, not access.</h2>
            </div>
            <p>
              Start with Explorer for ₹0. Plus is the best fit for recurring decisions; Pro is for
              structured research. Annual totals are charged once yearly, with monthly equivalents shown only for comparison.
            </p>
          </header>

          <div className="pricing-plan-toolbar">
            <div aria-live="polite">
              <small>Plan preview</small>
              <strong>{selectedDepth.label} / {selectedDepth.verb}</strong>
              <span>{selectedDepth.prompt}</span>
            </div>
            <div className="pricing-billing-control" role="group" aria-label="Billing period">
              <button
                type="button"
                aria-pressed={billing === 'monthly'}
                className={billing === 'monthly' ? 'is-active' : ''}
                onClick={() => setBilling('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                aria-pressed={billing === 'annual'}
                className={billing === 'annual' ? 'is-active' : ''}
                onClick={() => setBilling('annual')}
              >
                Annual <span>charged yearly</span>
              </button>
            </div>
          </div>

          <div className="pricing-deck" role="list" aria-label="Pricing plans">
            {PLANS.map((plan) => {
              const focused = focusedPlan === plan.id;
              const free = plan.id === 'explorer';
              return (
                <article
                  key={plan.id}
                  role="listitem"
                  className={`pricing-tier-card pricing-tier-card--${plan.id}${focused ? ' is-focused' : ''}`}
                  style={{ '--plan-tone': plan.tone } as CSSProperties}
                >
                  <div className="pricing-tier-card__rail" aria-hidden="true" />
                  {plan.id === 'plus' ? (
                    <div className="pricing-tier-card__recommendation">
                      <Sparkles aria-hidden="true" /> Best fit for ongoing decisions
                    </div>
                  ) : null}
                  <header>
                    <span>{plan.index} / {plan.verb}</span>
                    <button
                      type="button"
                      aria-pressed={focused}
                      aria-label={`Focus ${plan.name} plan`}
                      onClick={() => setFocusedPlan(plan.id)}
                    >
                      {focused ? 'Selected' : 'Preview plan'}
                    </button>
                  </header>
                  <div className="pricing-tier-card__intro">
                    <div className="pricing-tier-card__name-row">
                      <h3>{plan.name}</h3>
                      {plan.id === 'explorer' ? <span>Registered free tier</span> : null}
                    </div>
                    <p>{plan.fit}</p>
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
                    <span>₹</span><strong>{priceFor(plan)}</strong>{free ? <em>forever</em> : <em>{billing === 'annual' ? '/ effective month' : '/ month'}</em>}
                  </div>
                  <div className="pricing-tier-card__billing-note">
                    {free ? (
                      <><strong>No card required</strong><span>Free registered account</span></>
                    ) : billing === 'annual' ? (
                      <><strong>{plan.annualTotal} charged yearly</strong><span>{plan.annualSaving} vs 12 list-price months</span></>
                    ) : (
                      <><strong>Charged monthly</strong><span>Switch or schedule cancellation from your account</span></>
                    )}
                  </div>
                  <dl className="pricing-tier-card__metrics">
                    {plan.metrics.map((metric) => (
                      <div key={metric.label}><dt>{metric.value}</dt><dd>{metric.label}</dd></div>
                    ))}
                  </dl>
                  <ul className="pricing-tier-card__features">
                    {plan.features.map((feature) => (
                      <li key={feature}><Check aria-hidden="true" /><span>{feature}</span></li>
                    ))}
                  </ul>
                  <footer>
                    {planAction(plan)}
                    {plan.id === 'pro' ? (
                      <p>
                        {billing === 'monthly'
                          ? 'Monthly loyalty: after 10 paid months, the next 2 months are free.'
                          : 'Versus the 10-paid + 2-free monthly cycle: save ₹5,190 (about 21%).'}
                      </p>
                    ) : null}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>

        <section className="pricing-studio-section pricing-agent-bridge" aria-labelledby="agent-access-title">
          <SectionHeading
            id="agent-access-title"
            eyebrow="02 / Agent access"
            title="Add research depth only when you need it."
            body="Agent Mode is a separate research path—not a vague unlimited tier. Pro includes it; active Plus subscribers can add it for ₹599 per month while keeping Plus limits."
          />

          <div className="pricing-agent-bridge__instrument">
            <div className="pricing-agent-bridge__pipeline">
              <header><span>Agent Mode / visible pipeline</span><b>07 stages</b></header>
              <ol aria-label="Seven visible Agent Mode stages">
                {AGENT_STAGES.map((stage, index) => (
                  <li key={stage}><small>{String(index + 1).padStart(2, '0')}</small><strong>{stage}</strong></li>
                ))}
              </ol>
              <blockquote>
                A structured investigation with explicit planning, critique, verification, synthesis, and judgment.
              </blockquote>
              <footer>Arena remains web-only. Local actions require Condura.</footer>
            </div>

            <div className="pricing-agent-bridge__routes">
              <article className="pricing-agent-route pricing-agent-route--plus">
                <header><span>Route A</span><b>Plus add-on</b></header>
                <div><span>₹</span><strong>599</strong><em>/ month</em></div>
                <p>₹599 per month, billed separately. Available only to active Plus subscribers; Plus usage limits continue to apply.</p>
                {isPlusUser ? (
                  hasAgentAddon ? (
                    <div className="pricing-agent-route__state"><CheckCircle aria-hidden="true" /> Active on Plus</div>
                  ) : addonCancelling ? (
                    <button type="button" className="pricing-agent-route__state" onClick={() => openModal('top-right', 'plan')}>
                      Active through paid period · Manage
                    </button>
                  ) : (
                    <button type="button" className="pricing-agent-route__cta" onClick={() => beginCheckout('agent_addon')}>
                      Add Agent Mode <ArrowRight aria-hidden="true" />
                    </button>
                  )
                ) : (
                  <a href="#pricing-plans" onClick={() => setFocusedPlan('plus')}>View Plus <ArrowRight aria-hidden="true" /></a>
                )}
              </article>

              <article className="pricing-agent-route pricing-agent-route--pro">
                <header><span>Route B</span><b>Pro inclusion</b></header>
                <div><Sparkles aria-hidden="true" /><strong>Included</strong></div>
                <p>Agent Mode is part of Pro—no separate add-on checkout or add-on fee.</p>
                {isPro ? (
                  <div className="pricing-agent-route__state"><CheckCircle aria-hidden="true" /> Included in your plan</div>
                ) : (
                  <button type="button" className="pricing-agent-route__cta" onClick={() => beginCheckout(checkoutKeyFor('pro'))}>
                    Get Pro <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </article>
            </div>
          </div>
        </section>

        <section className="pricing-studio-section pricing-comparison-ledger" aria-labelledby="pricing-comparison-title">
          <SectionHeading
            id="pricing-comparison-title"
            eyebrow="03 / Compare every detail"
            title="Nothing important hidden behind checkout."
            body="Use the plan control to inspect one column on smaller screens. Every limit, workspace feature, and Agent Mode boundary stays visible before checkout."
          />

          <div className="pricing-comparison-ledger__focus" role="group" aria-label="Focus comparison plan">
            {PLANS.map((plan) => (
              <button
                key={`${plan.id}-matrix`}
                type="button"
                aria-pressed={focusedPlan === plan.id}
                className={focusedPlan === plan.id ? 'is-active' : ''}
                onClick={() => setFocusedPlan(plan.id)}
              >
                <span>{plan.index}</span>{plan.name}
              </button>
            ))}
          </div>

          <p id="pricing-matrix-instructions" className="pricing-sr-only">On smaller screens, choose a plan above to display its comparison column.</p>
          <div className="pricing-matrix-wrap">
            <table className="pricing-matrix" aria-describedby="pricing-matrix-instructions">
              <caption className="pricing-sr-only">Explorer, Plus, and Pro feature comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  {PLANS.map((plan) => (
                    <th key={plan.id} scope="col" data-plan={plan.id} className={focusedPlan === plan.id ? 'is-focused' : ''}>{plan.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {PLANS.map((plan) => (
                      <td key={`${row.label}-${plan.id}`} data-plan={plan.id} className={focusedPlan === plan.id ? 'is-focused' : ''}>
                        <MatrixCell value={row[plan.id]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pricing-studio-section pricing-mind-access" aria-labelledby="pricing-minds-title">
          <SectionHeading
            id="pricing-minds-title"
            eyebrow="04 / Persona access"
            title="Six to start. All sixteen when perspective matters."
            body="Explorer includes six starter minds. Plus and Pro unlock all sixteen. This compact preview follows the selected plan without changing your account."
          />

          <div className="pricing-mind-access__console">
            <header>
              <div>
                <small>Access preview</small>
                <strong>{String(visibleMindCount).padStart(2, '0')} / 16 minds</strong>
              </div>
              <div role="group" aria-label="Preview persona access by plan">
                {PLANS.map((plan) => (
                  <button
                    key={`${plan.id}-mind-preview`}
                    type="button"
                    aria-pressed={focusedPlan === plan.id}
                    className={focusedPlan === plan.id ? 'is-active' : ''}
                    onClick={() => setFocusedPlan(plan.id)}
                  >
                    {plan.name}
                  </button>
                ))}
              </div>
            </header>

            <div className="pricing-mind-access__grid" role="list" aria-label={`${selectedDepth.label} persona access preview`}>
              {MINDS.map((mind, index) => {
                const included = focusedPlan !== 'explorer' || mind.starter;
                return (
                  <article
                    key={mind.name}
                    role="listitem"
                    className={included ? 'is-included' : 'is-locked'}
                    style={{ '--mind-tone': mind.color } as CSSProperties}
                  >
                    <header><small>{String(index + 1).padStart(2, '0')}</small>{included ? <Check aria-hidden="true" /> : <Lock aria-hidden="true" />}</header>
                    <strong>{mind.name}</strong>
                    <footer>{included ? 'Included' : 'Plus / Pro'}</footer>
                  </article>
                );
              })}
            </div>
            <footer className="pricing-mind-access__foot">
              <p>Access preview only. Actual availability follows the tier on your account.</p>
              <button type="button" onClick={() => navigate('/personas')}>
                Meet all 16 minds <ArrowRight aria-hidden="true" />
              </button>
            </footer>
          </div>
        </section>

        <section className="pricing-studio-section pricing-faq-studio" aria-labelledby="pricing-faq-title">
          <SectionHeading
            id="pricing-faq-title"
            eyebrow="05 / Decision support"
            title="Questions before you choose."
            body="Clear answers about billing, cancellation, Agent Mode, and the web-only boundary—before any checkout opens."
          />

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
                    <small>{String(index + 1).padStart(2, '0')}</small>
                    <span>{faq.question}</span>
                    <b aria-hidden="true">{open ? '×' : '+'}</b>
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
        </section>

        <section className="pricing-studio-close" aria-labelledby="pricing-close-title">
          <small>START / NO CARD REQUIRED</small>
          <h2 id="pricing-close-title">Let one real question prove the value.</h2>
          <p>Explorer costs ₹0 for registered users and includes five Arena questions each day. Upgrade only when the work earns it.</p>
          <div>
            <button type="button" onClick={startFree}>{isAuthenticated ? 'Open Arena' : 'Start for free'} <ArrowRight aria-hidden="true" /></button>
            {isAuthenticated && currentPlan !== 'explorer' ? (
              <button type="button" onClick={() => openModal('top-right', 'plan')}>
                {currentPlan === 'pro' ? 'Pro is active' : 'Manage Plus'} <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={() => beginCheckout(checkoutKeyFor('plus'))}>
                Get Plus <ArrowRight aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
