import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/verdict-privacy.css';

/** Dwell time per data-route card while autoplay is running. */
const ROUTE_AUTOPLAY_MS = 4000;
/** After a manual pick, wait this long before autoplay resumes. */
const ROUTE_RESUME_AFTER_INTERACTION_MS = 12_000;

type PrivacyAccent = 'cyan' | 'violet' | 'coral' | 'acid' | 'amber';

type DataRoute = {
  id: string;
  number: string;
  label: string;
  title: string;
  accent: PrivacyAccent;
  summary: string;
  nodes: readonly {
    label: string;
    detail: string;
    boundary: 'you' | 'arena' | 'processor';
  }[];
  data: string;
  outside: string;
  control: string;
};

type PrivacyChapter = {
  id: string;
  number: string;
  navLabel: string;
  title: string;
  signal: string;
  accent: PrivacyAccent;
};

const DATA_ROUTES = [
  {
    id: 'account-route',
    number: '01',
    label: 'Account',
    title: 'Identity and profile',
    accent: 'cyan',
    summary: 'Account records stay in Arena unless a feature needs a named processor.',
    nodes: [
      {
        label: 'You',
        detail: 'Email, name, password, profile choices',
        boundary: 'you',
      },
      {
        label: 'Arena account',
        detail: 'Authentication, profile, plan access',
        boundary: 'arena',
      },
      {
        label: 'Account store',
        detail: 'Hashed credentials and service records',
        boundary: 'arena',
      },
    ],
    data: 'Email, display name, one-way password hash, expertise settings, tier, account dates, and related service records.',
    outside: 'When checkout starts, Razorpay receives the account email and Arena user ID needed to create or locate a payment customer.',
    control: 'Profile fields can be changed in Account. Full account deletion is currently handled by request rather than a self-service endpoint.',
  },
  {
    id: 'conversation-route',
    number: '02',
    label: 'Conversation',
    title: 'Prompts, context, and answers',
    accent: 'violet',
    summary: 'Generation can trigger web search and require more context than the newest prompt alone.',
    nodes: [
      {
        label: 'You',
        detail: 'Prompt, reply, attachment, feedback',
        boundary: 'you',
      },
      {
        label: 'Arena context',
        detail: 'Panel, history, memory, instructions',
        boundary: 'arena',
      },
      {
        label: 'Selected model',
        detail: 'Provider processes the assembled request',
        boundary: 'processor',
      },
    ],
    data: 'Prompts, model responses, session history, saved answers, discuss threads, Agent tasks, ratings, feedback, selected memory summaries, and prompt- or planner-derived search queries.',
    outside: 'When search triggers, a derived query is sent through a multi-provider search library whose upstream service can vary. Anthropic, OpenAI, xAI, or DeepSeek may then receive submitted content plus feature-dependent context; optional model routes can fall back to Anthropic.',
    control: 'Delete individual sessions, saved items, memories, discuss threads, or Agent tasks where those feature controls are available. Avoid submitting secrets.',
  },
  {
    id: 'billing-route',
    number: '03',
    label: 'Billing',
    title: 'Subscription and payment',
    accent: 'coral',
    summary: 'Razorpay handles the payment instrument; Arena keeps entitlement records.',
    nodes: [
      {
        label: 'You',
        detail: 'Plan choice and payment details',
        boundary: 'you',
      },
      {
        label: 'Razorpay',
        detail: 'Checkout and payment instrument',
        boundary: 'processor',
      },
      {
        label: 'Arena billing',
        detail: 'Subscription status and entitlements',
        boundary: 'arena',
      },
    ],
    data: 'Plan, billing period, amount, currency, provider customer and subscription IDs, status, payment count, and period dates.',
    outside: 'Razorpay receives the information needed to run checkout and process payment. Its own privacy policy applies to that handling.',
    control: 'Arena does not store full card numbers or bank credentials. Subscription controls are available from the account and pricing flows.',
  },
  {
    id: 'integration-route',
    number: '04',
    label: 'Integrations',
    title: 'Connected tools and context',
    accent: 'amber',
    summary: 'Connected-tool data moves only when you invoke an integration-backed feature.',
    nodes: [
      {
        label: 'Connected service',
        detail: 'Notion, GitHub, or another MCP source',
        boundary: 'processor',
      },
      {
        label: 'Arena Agent',
        detail: 'Retrieves selected tool context',
        boundary: 'arena',
      },
      {
        label: 'Model request',
        detail: 'Relevant tool context may be included',
        boundary: 'processor',
      },
    ],
    data: 'Service name, display name, encrypted access or refresh credentials, connection metadata, and selected content returned by the tool.',
    outside: 'The connected service processes requests under its own terms. Relevant retrieved context may also be included in an Agent model request.',
    control: 'You choose whether to connect a service. Disconnecting currently marks the connection inactive but retains its encrypted credential record so it can be re-enabled; it is not immediate credential erasure.',
  },
  {
    id: 'local-route',
    number: '05',
    label: 'Local work',
    title: 'Condura handoff',
    accent: 'acid',
    summary: 'Arena is web-only; on-device actions are delegated to the separate Condura daemon.',
    nodes: [
      {
        label: 'Arena web',
        detail: 'Prepares a capability handoff',
        boundary: 'arena',
      },
      {
        label: 'Your browser',
        detail: 'Forwards a signed local payload',
        boundary: 'you',
      },
      {
        label: 'Condura',
        detail: 'Runs the approved on-device action',
        boundary: 'processor',
      },
    ],
    data: 'Capability, execution environment, status, timestamps, limited summaries, browser-forwarded events, and—if saved—a handoff draft payload.',
    outside: 'Condura is separately installed and handles local execution on your device. Arena may retain a handoff status mirror or a saved draft.',
    control: 'Review each handoff before sending it. Saved handoff drafts can be deleted; local Condura data is governed by that product’s controls.',
  },
] as const satisfies readonly DataRoute[];

type DataRouteId = (typeof DATA_ROUTES)[number]['id'];
type RouteEnterDirection = 'forward' | 'back';

function resolveRouteEnterDirection(
  fromId: DataRouteId,
  toId: DataRouteId,
): RouteEnterDirection {
  if (fromId === toId) return 'forward';
  const fromIndex = DATA_ROUTES.findIndex((route) => route.id === fromId);
  const toIndex = DATA_ROUTES.findIndex((route) => route.id === toId);
  if (fromIndex < 0 || toIndex < 0) return 'forward';

  // Autoplay wrap last → first continues forward through the cycle.
  if (fromIndex === DATA_ROUTES.length - 1 && toIndex === 0) return 'forward';
  // Manual wrap first → last reads as stepping backward.
  if (fromIndex === 0 && toIndex === DATA_ROUTES.length - 1) return 'back';
  return toIndex > fromIndex ? 'forward' : 'back';
}

const PRIVACY_CHAPTERS = [
  {
    id: 'scope',
    number: '01',
    navLabel: 'Scope',
    title: 'Scope and how to read this policy',
    signal: 'This policy covers Arena’s website and web app.',
    accent: 'cyan',
  },
  {
    id: 'data-we-hold',
    number: '02',
    navLabel: 'Data we hold',
    title: 'Data Arena receives and creates',
    signal: 'Account, content, billing, and service records are different data classes.',
    accent: 'violet',
  },
  {
    id: 'data-we-do-not',
    number: '03',
    navLabel: 'Data we avoid',
    title: 'Data Arena does not seek or sell',
    signal: 'No sale, no cross-site tracking, and no full card storage.',
    accent: 'acid',
  },
  {
    id: 'uses',
    number: '04',
    navLabel: 'How data is used',
    title: 'How Arena uses service data',
    signal: 'Operate, personalize, secure, measure, and administer the service.',
    accent: 'amber',
  },
  {
    id: 'model-providers',
    number: '05',
    navLabel: 'Model providers',
    title: 'AI model providers and request context',
    signal: 'A generation request can contain context beyond the latest prompt.',
    accent: 'coral',
  },
  {
    id: 'payments',
    number: '06',
    navLabel: 'Payments',
    title: 'Razorpay and subscription records',
    signal: 'Payment instruments stay with Razorpay; entitlement metadata returns to Arena.',
    accent: 'cyan',
  },
  {
    id: 'integrations-condura',
    number: '07',
    navLabel: 'Tools + Condura',
    title: 'Connected tools and local execution',
    signal: 'External tool context and local handoffs follow separate boundaries.',
    accent: 'violet',
  },
  {
    id: 'security-retention',
    number: '08',
    navLabel: 'Security + retention',
    title: 'Storage, security, and retention',
    signal: 'Security controls differ by data type; there is no single public retention period.',
    accent: 'amber',
  },
  {
    id: 'choices-deletion',
    number: '09',
    navLabel: 'Choices + deletion',
    title: 'Your controls and deletion requests',
    signal: 'Feature-level deletion exists; full account deletion is currently request-based.',
    accent: 'acid',
  },
  {
    id: 'changes-contact',
    number: '10',
    navLabel: 'Changes + contact',
    title: 'External policies, changes, and contact',
    signal: 'The revision marker identifies the current published version.',
    accent: 'coral',
  },
] as const satisfies readonly PrivacyChapter[];

type PrivacyChapterId = (typeof PRIVACY_CHAPTERS)[number]['id'];

const PRIVACY_CHAPTER_IDS: readonly PrivacyChapterId[] = PRIVACY_CHAPTERS.map(
  (chapter) => chapter.id,
);

const POSTURE_SIGNALS = [
  {
    code: 'P-01',
    label: 'No sale',
    value: 'Arena does not sell personal data.',
    accent: 'cyan',
  },
  {
    code: 'P-02',
    label: 'Context travels',
    value: 'Model requests can include history, memories, files, and instructions.',
    accent: 'violet',
  },
  {
    code: 'P-03',
    label: 'Cards stay out',
    value: 'Razorpay—not Arena—handles full card or bank credentials.',
    accent: 'coral',
  },
  {
    code: 'P-04',
    label: 'Controls vary',
    value: 'Some records are self-service; full account deletion is by request.',
    accent: 'acid',
  },
] as const;

const INVENTORY_ROWS = [
  {
    category: 'Account + profile',
    examples: 'Email, name, password hash, expertise, tier, account dates',
    purpose: 'Sign-in, profile, personalization, entitlements',
    boundary: 'Razorpay at checkout; infrastructure needed to host Arena',
  },
  {
    category: 'Conversation + research',
    examples: 'Prompts, responses, sessions, memories, attachments, tasks, feedback',
    purpose: 'Generate answers, preserve chosen history, improve continuity',
    boundary: 'Search service when triggered; selected model provider; connected source when invoked',
  },
  {
    category: 'Billing',
    examples: 'Plan, amount, period, customer/subscription IDs, status',
    purpose: 'Checkout, renewals, cancellation, feature access',
    boundary: 'Razorpay',
  },
  {
    category: 'Service + security',
    examples: 'Request/session IDs, guest IP, usage, timing, persona and UX events',
    purpose: 'Rate limits, reliability, abuse prevention, product operation',
    boundary: 'Hosting and operational infrastructure',
  },
  {
    category: 'Tools + handoffs',
    examples: 'Encrypted MCP credentials, retrieved context, handoff status or drafts',
    purpose: 'Connected research and user-approved on-device actions',
    boundary: 'Connected service, model provider, or local Condura as selected',
  },
  {
    category: 'Browser + transient',
    examples: 'Tokens, recent prompts, drafts, signing key; process memory, temporary uploads, rotating logs',
    purpose: 'Session continuity, draft recovery, active work, uploads, diagnostics',
    boundary: 'Browser storage, server memory/files, and Google Fonts browser requests',
  },
] as const;

const PROVIDER_LINKS = [
  { label: 'Anthropic', href: 'https://www.anthropic.com/privacy' },
  { label: 'OpenAI', href: 'https://openai.com/privacy' },
  { label: 'xAI', href: 'https://x.ai/legal/privacy-policy' },
  {
    label: 'DeepSeek',
    href: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html',
  },
] as const;

function hashChapter(): PrivacyChapterId | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = decodeURIComponent(window.location.hash.slice(1));
    return PRIVACY_CHAPTER_IDS.includes(value as PrivacyChapterId)
      ? (value as PrivacyChapterId)
      : null;
  } catch {
    return null;
  }
}

function PolicyChapter({
  chapter,
  children,
}: {
  chapter: PrivacyChapter;
  children: ReactNode;
}) {
  return (
    <article
      id={chapter.id}
      className="privacy-chapter"
      data-accent={chapter.accent}
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className="privacy-chapter__coordinate" aria-hidden="true">
        <span>{chapter.number}</span>
        <i />
      </div>
      <div className="privacy-chapter__content">
        <p className="privacy-chapter__signal">Field note / {chapter.signal}</p>
        <h3 id={`${chapter.id}-title`}>{chapter.title}</h3>
        <div className="privacy-chapter__body">{children}</div>
      </div>
    </article>
  );
}

export function PrivacyPage() {
  const reduceMotion = prefersReducedMotion();
  const [activeRouteId, setActiveRouteId] =
    useState<DataRouteId>('account-route');
  const [activeChapter, setActiveChapter] = useState<PrivacyChapterId>(
    () => hashChapter() ?? PRIVACY_CHAPTERS[0].id,
  );
  const [routeInspectorInView, setRouteInspectorInView] = useState(false);
  const [routePointerInside, setRoutePointerInside] = useState(false);
  const [routeUserPaused, setRouteUserPaused] = useState(false);
  const [routeAutoplayEpoch, setRouteAutoplayEpoch] = useState(0);
  const [routeEnterDirection, setRouteEnterDirection] =
    useState<RouteEnterDirection>('forward');
  const chapterNavigationRef = useRef<HTMLElement>(null);
  const routeNavigationRef = useRef<HTMLDivElement>(null);
  const routeInspectorRef = useRef<HTMLElement>(null);
  const routeResumeTimerRef = useRef<number | undefined>(undefined);
  const activeRouteIdRef = useRef<DataRouteId>(activeRouteId);
  activeRouteIdRef.current = activeRouteId;

  const activeRoute =
    DATA_ROUTES.find((route) => route.id === activeRouteId) ?? DATA_ROUTES[0];

  const routeAutoplayActive =
    !reduceMotion &&
    routeInspectorInView &&
    !routePointerInside &&
    !routeUserPaused;

  const activateDataRoute = (routeId: DataRouteId, source: 'user' | 'auto') => {
    const current = activeRouteIdRef.current;
    if (current !== routeId) {
      setRouteEnterDirection(resolveRouteEnterDirection(current, routeId));
      setActiveRouteId(routeId);
      activeRouteIdRef.current = routeId;
    }
    if (source !== 'user') return;

    setRouteUserPaused(true);
    setRouteAutoplayEpoch((epoch) => epoch + 1);
    if (routeResumeTimerRef.current !== undefined) {
      window.clearTimeout(routeResumeTimerRef.current);
    }
    routeResumeTimerRef.current = window.setTimeout(() => {
      setRouteUserPaused(false);
      routeResumeTimerRef.current = undefined;
      setRouteAutoplayEpoch((epoch) => epoch + 1);
    }, ROUTE_RESUME_AFTER_INTERACTION_MS);
  };

  useEffect(() => {
    let hashScrollFrame: number | undefined;
    let hashScrollTimer: number | undefined;
    let scrollGeneration = 0;

    const scheduleHashScroll = (chapter: string) => {
      const generation = ++scrollGeneration;
      let attemptsRemaining = 4;

      const attempt = () => {
        if (generation !== scrollGeneration) return;
        hashScrollFrame = window.requestAnimationFrame(() => {
          if (generation !== scrollGeneration) return;
          document.getElementById(chapter)?.scrollIntoView({
            behavior: 'auto',
            block: 'start',
          });
          if (attemptsRemaining > 0) {
            attemptsRemaining -= 1;
            hashScrollTimer = window.setTimeout(attempt, 120);
          }
        });
      };

      attempt();
    };

    const updateFromHash = () => {
      const chapter = hashChapter();
      if (!chapter) return;

      setActiveChapter(chapter);
      if (hashScrollFrame !== undefined) {
        window.cancelAnimationFrame(hashScrollFrame);
      }
      if (hashScrollTimer !== undefined) {
        window.clearTimeout(hashScrollTimer);
      }
      scheduleHashScroll(chapter);
    };

    const updateFromScroll = () => {
      const threshold = window.innerWidth <= 1020 ? 158 : 182;
      let current: PrivacyChapterId = PRIVACY_CHAPTERS[0].id;

      for (const chapter of PRIVACY_CHAPTERS) {
        const element = document.getElementById(chapter.id);
        if (!element || element.getBoundingClientRect().top > threshold) break;
        current = chapter.id;
      }

      const pageHeight = document.documentElement.scrollHeight;
      if (
        pageHeight > window.innerHeight &&
        window.scrollY + window.innerHeight >= pageHeight - 8
      ) {
        current = PRIVACY_CHAPTERS[PRIVACY_CHAPTERS.length - 1].id;
      }

      setActiveChapter(current);
    };

    updateFromHash();
    window.addEventListener('hashchange', updateFromHash);
    window.addEventListener('scroll', updateFromScroll, { passive: true });

    return () => {
      scrollGeneration += 1;
      if (hashScrollFrame !== undefined) {
        window.cancelAnimationFrame(hashScrollFrame);
      }
      if (hashScrollTimer !== undefined) {
        window.clearTimeout(hashScrollTimer);
      }
      window.removeEventListener('hashchange', updateFromHash);
      window.removeEventListener('scroll', updateFromScroll);
    };
  }, []);

  useEffect(() => {
    const navigation = chapterNavigationRef.current;
    const activeLink = navigation?.querySelector<HTMLElement>(
      `a[href="#${activeChapter}"]`,
    );
    if (
      !navigation ||
      !activeLink ||
      navigation.scrollWidth <= navigation.clientWidth
    ) {
      return;
    }

    const targetLeft =
      activeLink.offsetLeft -
      (navigation.clientWidth - activeLink.offsetWidth) / 2;
    navigation.scrollTo({ left: Math.max(0, targetLeft), behavior: 'auto' });
  }, [activeChapter]);

  useEffect(() => {
    const navigation = routeNavigationRef.current;
    const activeButton = navigation?.querySelector<HTMLElement>(
      `button[data-route-id="${activeRouteId}"]`,
    );
    if (
      !navigation ||
      !activeButton ||
      navigation.scrollWidth <= navigation.clientWidth
    ) {
      return;
    }

    const targetLeft =
      activeButton.offsetLeft -
      (navigation.clientWidth - activeButton.offsetWidth) / 2;
    navigation.scrollTo({ left: Math.max(0, targetLeft), behavior: 'auto' });
  }, [activeRouteId]);

  useEffect(() => {
    const inspector = routeInspectorRef.current;
    if (!inspector || typeof IntersectionObserver !== 'function') {
      setRouteInspectorInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setRouteInspectorInView(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.35, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(inspector);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (routeResumeTimerRef.current !== undefined) {
        window.clearTimeout(routeResumeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      reduceMotion ||
      !routeInspectorInView ||
      routePointerInside ||
      routeUserPaused
    ) {
      return;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled || document.hidden) return;
      setActiveRouteId((current) => {
        const index = DATA_ROUTES.findIndex((route) => route.id === current);
        const nextIndex = index < 0 ? 0 : (index + 1) % DATA_ROUTES.length;
        const nextId = DATA_ROUTES[nextIndex].id;
        setRouteEnterDirection(resolveRouteEnterDirection(current, nextId));
        return nextId;
      });
    };

    const onVisibility = () => {
      if (document.hidden) return;
      // Restart the dwell clock when the tab becomes visible again.
      setRouteAutoplayEpoch((epoch) => epoch + 1);
    };

    const intervalId = window.setInterval(tick, ROUTE_AUTOPLAY_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    reduceMotion,
    routeInspectorInView,
    routePointerInside,
    routeUserPaused,
    routeAutoplayEpoch,
  ]);

  const activeChapterIndex = PRIVACY_CHAPTERS.findIndex(
    (chapter) => chapter.id === activeChapter,
  );

  return (
    <div
      className={`privacy-page${reduceMotion ? '' : ' privacy-page--motion'}`}
    >
      <Navbar />
      <main id="main-content" tabIndex={-1} aria-labelledby="privacy-title">
        <header className="privacy-hero">
          <div className="privacy-hero__folio" aria-label="Document reference">
            <span>LEGAL / DOCUMENT 02</span>
            <span>REVISION 2026.07</span>
          </div>

          <div className="privacy-hero__grid">
            <div className="privacy-hero__copy">
              <p className="privacy-eyebrow">Data flow field guide</p>
              <h1
                id="privacy-title"
                className="privacy-hero__title"
                aria-label="Privacy Policy"
              >
                <span>Privacy</span>
                <span>Policy</span>
              </h1>
              <p className="privacy-hero__lede">
                A route-by-route account of what Arena holds, what can leave
                its boundary, why it moves, and which controls are available.
              </p>
              <div className="privacy-hero__actions" aria-label="Policy actions">
                <a
                  className="privacy-action privacy-action--primary"
                  href="#route-inspector"
                >
                  Inspect data routes <span aria-hidden="true">↓</span>
                </a>
                <a
                  className="privacy-action privacy-action--secondary"
                  href="#scope"
                >
                  Read full policy <span aria-hidden="true">↘</span>
                </a>
              </div>
            </div>

            <figure className="privacy-boundary" aria-labelledby="boundary-title">
              <div className="privacy-boundary__header">
                <span>Boundary map</span>
                <strong>LIVE POLICY / 05 ROUTES</strong>
              </div>
              <div className="privacy-boundary__field">
                <p id="boundary-title">Typical generation path</p>
                <div className="privacy-boundary__lane">
                  <span className="privacy-boundary__node">You</span>
                  <i aria-hidden="true">01</i>
                  <span className="privacy-boundary__node privacy-boundary__node--arena">
                    Arena
                  </span>
                  <i aria-hidden="true">02</i>
                  <span className="privacy-boundary__node privacy-boundary__node--outside">
                    Provider
                  </span>
                </div>
                <div className="privacy-boundary__legend" aria-label="Boundary key">
                  <span><i data-kind="first" /> First-party system</span>
                  <span><i data-kind="outside" /> External processor</span>
                </div>
              </div>
              <figcaption>
                The destination changes by feature. The route inspector below
                identifies the meaningful variations.
              </figcaption>
            </figure>
          </div>
        </header>

        <section className="privacy-posture" aria-labelledby="posture-title">
          <div className="privacy-section-heading">
            <div>
              <p className="privacy-eyebrow">Policy posture</p>
              <span className="privacy-section-heading__meta">04 / reading aids</span>
            </div>
            <h2 id="posture-title">Four points to carry forward</h2>
          </div>
          <div className="privacy-posture__grid" role="list">
            {POSTURE_SIGNALS.map((signal) => (
              <article
                key={signal.code}
                className="privacy-posture-card"
                data-accent={signal.accent}
                role="listitem"
              >
                <span>{signal.code}</span>
                <h3>{signal.label}</h3>
                <p>{signal.value}</p>
              </article>
            ))}
          </div>
          <p className="privacy-reading-note">
            <strong>Reading aid:</strong> these cards summarize the posture;
            the route details and full policy chapters provide the complete context.
          </p>
        </section>

        <section
          id="route-inspector"
          ref={routeInspectorRef}
          className="privacy-inspector"
          aria-labelledby="route-inspector-title"
        >
          <header className="privacy-inspector__header">
            <div>
              <p className="privacy-eyebrow">Interactive route inspector</p>
              <h2 id="route-inspector-title">Follow one class of data</h2>
            </div>
            <p>
              Routes rotate on their own while this section is in view. Pick one
              to pause and inspect collection, destination, purpose, and control.
            </p>
          </header>

          <div
            className="privacy-inspector__console"
            onMouseEnter={() => setRoutePointerInside(true)}
            onMouseLeave={() => setRoutePointerInside(false)}
            onFocusCapture={() => setRoutePointerInside(true)}
            onBlurCapture={(event) => {
              const next = event.relatedTarget;
              if (
                next instanceof Node &&
                event.currentTarget.contains(next)
              ) {
                return;
              }
              setRoutePointerInside(false);
            }}
          >
            <div
              ref={routeNavigationRef}
              className="privacy-route-selector"
              role="group"
              aria-label="Select a data route"
            >
              {DATA_ROUTES.map((route) => (
                <button
                  key={route.id}
                  id={`select-${route.id}`}
                  type="button"
                  data-route-id={route.id}
                  data-accent={route.accent}
                  data-autoplay={
                    routeAutoplayActive && activeRouteId === route.id
                      ? 'true'
                      : undefined
                  }
                  style={
                    {
                      '--privacy-route-dwell': `${ROUTE_AUTOPLAY_MS}ms`,
                    } as CSSProperties
                  }
                  aria-pressed={activeRouteId === route.id}
                  aria-controls="privacy-route-panel"
                  onClick={() => activateDataRoute(route.id, 'user')}
                >
                  <span>{route.number}</span>
                  <strong>{route.label}</strong>
                </button>
              ))}
            </div>

            <div
              id="privacy-route-panel"
              className="privacy-route-panel"
              data-accent={activeRoute.accent}
              data-direction={routeEnterDirection}
              role="region"
              aria-live="polite"
              aria-labelledby={`select-${activeRoute.id}`}
            >
              <div
                key={activeRoute.id}
                className={`privacy-route-panel__stage${
                  reduceMotion ? '' : ' is-entering'
                }`}
                data-direction={routeEnterDirection}
              >
                <header className="privacy-route-panel__header">
                  <div>
                    <span>ROUTE / {activeRoute.number}</span>
                    <h3>{activeRoute.title}</h3>
                  </div>
                  <p>{activeRoute.summary}</p>
                </header>

                <ol
                  className="privacy-route-flow"
                  aria-label={`${activeRoute.title} flow`}
                >
                  {activeRoute.nodes.map((node, index) => (
                    <li
                      key={`${activeRoute.id}-${node.label}`}
                      data-boundary={node.boundary}
                      style={
                        reduceMotion
                          ? undefined
                          : ({
                              '--privacy-route-stagger': `${80 + index * 55}ms`,
                            } as CSSProperties)
                      }
                    >
                      <span className="privacy-route-flow__step" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <strong>{node.label}</strong>
                      <p>{node.detail}</p>
                    </li>
                  ))}
                </ol>

                <dl className="privacy-route-facts">
                  <div>
                    <dt>Data in motion</dt>
                    <dd>{activeRoute.data}</dd>
                  </div>
                  <div>
                    <dt>Outside Arena</dt>
                    <dd>{activeRoute.outside}</dd>
                  </div>
                  <div>
                    <dt>Your control</dt>
                    <dd>{activeRoute.control}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section className="privacy-inventory" aria-labelledby="inventory-title">
          <div className="privacy-section-heading privacy-section-heading--inventory">
            <div>
              <p className="privacy-eyebrow">Inventory matrix</p>
              <span className="privacy-section-heading__meta">Non-exhaustive / current product</span>
            </div>
            <h2 id="inventory-title">What exists, and why</h2>
          </div>
          <p className="privacy-inventory__intro">
            The matrix groups the service’s main records. Exact fields vary by
            feature, account tier, and whether you choose to save or connect something.
          </p>
          <div
            className="privacy-inventory__scroll"
            tabIndex={0}
            role="region"
            aria-label="Scrollable data inventory table"
          >
            <table>
              <caption>Current Arena data inventory by category</caption>
              <thead>
                <tr>
                  <th scope="col">Data class</th>
                  <th scope="col">Examples</th>
                  <th scope="col">Primary purpose</th>
                  <th scope="col">Meaningful external boundary</th>
                </tr>
              </thead>
              <tbody>
                {INVENTORY_ROWS.map((row, index) => (
                  <tr key={row.category}>
                    <th scope="row">
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {row.category}
                    </th>
                    <td>{row.examples}</td>
                    <td>{row.purpose}</td>
                    <td>{row.boundary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="privacy-inventory__scroll-hint">
            <span aria-hidden="true">↔</span> Table scrolls horizontally on compact screens.
          </p>
        </section>

        <section className="privacy-manual" aria-label="Full privacy policy">
          <aside className="privacy-index" aria-label="Privacy policy navigation">
            <div className="privacy-index__sticky">
              <div className="privacy-index__head">
                <p>Field manual</p>
                <span aria-hidden="true">
                  {String(activeChapterIndex + 1).padStart(2, '0')} /{' '}
                  {String(PRIVACY_CHAPTERS.length).padStart(2, '0')}
                </span>
              </div>
              <nav ref={chapterNavigationRef} aria-label="Privacy chapters">
                <ol>
                  {PRIVACY_CHAPTERS.map((chapter) => (
                    <li key={chapter.id}>
                      <a
                        href={`#${chapter.id}`}
                        aria-label={`${chapter.number} ${chapter.navLabel}`}
                        aria-current={
                          activeChapter === chapter.id ? 'location' : undefined
                        }
                        onClick={() => setActiveChapter(chapter.id)}
                      >
                        <span>{chapter.number}</span>
                        <strong>{chapter.navLabel}</strong>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="privacy-index__companion">
                <span>Companion document</span>
                <Link to="/terms">
                  Terms of Service <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
          </aside>

          <div className="privacy-manual__sheet">
            <header className="privacy-manual__header">
              <div>
                <p>Published policy</p>
                <h2>Privacy field manual</h2>
              </div>
              <dl>
                <div><dt>Revised</dt><dd>July 2026</dd></div>
                <div><dt>Chapters</dt><dd>10</dd></div>
              </dl>
            </header>

            <div className="privacy-manual__chapters">
              <PolicyChapter chapter={PRIVACY_CHAPTERS[0]}>
                <p>
                  This Privacy Policy explains how Arena handles information
                  when you use the public website or web application. “Arena,”
                  “we,” and “the service” refer to this web product.
                </p>
                <p>
                  The diagrams, route labels, field notes, and inventory matrix
                  are plain-language reading aids. They are designed to make the
                  underlying data flows legible, not to hide exceptions or replace
                  the detail in these chapters.
                </p>
                <div className="privacy-callout" data-kind="scope">
                  <strong>Scope boundary</strong>
                  <p>
                    Model providers, variable upstream web-search services,
                    Razorpay, connected services, hosting infrastructure, Google
                    Fonts, and Condura apply their own policies to data they process.
                    Their handling is not controlled by this page.
                  </p>
                </div>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[1]}>
                <p>
                  Arena receives information you provide, records generated while
                  you use the service, and technical metadata needed to operate it.
                  The exact set depends on your tier and the features you choose.
                </p>
                <ul>
                  <li><strong>Account and profile:</strong> email, display name, one-way password hash, expertise settings, tier, and account activity dates.</li>
                  <li><strong>Conversation and research:</strong> prompts, model responses, sessions, selected memories, saved responses, discuss threads, attachments, Agent tasks and results, room or watchlist content, feedback, and ratings.</li>
                  <li><strong>Billing:</strong> plan and period, amount and currency, provider identifiers, subscription status, dates, and payment count.</li>
                  <li><strong>Service and security:</strong> request and session identifiers, guest IP addresses used for rate limiting, usage counts, persona or panel choices, timing, feature events, and error or audit records.</li>
                  <li><strong>Optional tools and handoffs:</strong> connected-service metadata and credentials, selected tool context, and Condura handoff records or saved drafts.</li>
                  <li><strong>Browser and transient storage:</strong> access and refresh tokens, recent prompt snippets, opted-in draft text, a session-scoped Condura signing key, active in-process state, temporary Agent uploads, and rotating operational logs.</li>
                </ul>
                <p>
                  This list is intentionally specific but non-exhaustive: a feature
                  may create closely related service records needed to make that
                  feature work, keep it secure, or preserve a control you selected.
                </p>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[2]}>
                <p>
                  Arena does not sell personal data or track you across unrelated
                  websites for advertising. Arena does not ask for precise
                  geolocation and does not store full card numbers or bank
                  credentials on its servers.
                </p>
                <p>
                  Generation requests are not designed to include your password,
                  authentication token, full payment-card details, or account email.
                  Do not place passwords, private keys, payment credentials, health
                  records, or other secrets into a prompt, attachment, connected
                  tool query, or handoff draft.
                </p>
                <div className="privacy-callout" data-kind="avoid">
                  <strong>Important distinction</strong>
                  <p>
                    An IP address may be processed for security and rate limiting.
                    That is different from asking for precise device location.
                  </p>
                </div>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[3]}>
                <p>Arena uses data to provide and administer the service, including to:</p>
                <ul>
                  <li>create accounts, authenticate users, and maintain sessions;</li>
                  <li>derive and send web-search queries when a prompt or research task triggers search, assemble model requests, return responses, rank results, and run selected research features;</li>
                  <li>save history, memories, preferences, panels, tasks, rooms, and connected-tool settings when those features are used;</li>
                  <li>apply tier limits, plan entitlements, subscriptions, cancellations, and add-ons;</li>
                  <li>detect abuse, enforce rate limits, investigate errors, protect service integrity, and maintain audit records; and</li>
                  <li>measure first-party feature use, reliability, latency, and product performance.</li>
                </ul>
                <p>
                  First-party usage and UX records may associate an event with an
                  account or session. Arena does not use those records to build a
                  cross-site advertising profile.
                </p>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[4]}>
                <p>
                  Arena routes model work among Anthropic, OpenAI, xAI, and
                  DeepSeek according to the selected persona or task. When an
                  optional provider route is unavailable, the service can fall
                  back to an Anthropic model, so the provider that processes a
                  request may differ from the preferred route.
                </p>
                <p>
                  Depending on the feature, a provider may receive the content you
                  submit plus context needed to produce the requested response:
                  relevant conversation history, prior model responses, selected
                  memory summaries, attachment text or images, profile or expertise
                  instructions, and context retrieved from a connected tool.
                </p>
                <p>
                  For prompts or Agent tasks that trigger web search, Arena derives
                  one or more queries from the submitted prompt or planner output
                  (up to three in an Agent research stage) and sends them through a
                  multi-provider search library before model generation. The exact
                  upstream search service can vary. Search-result titles, snippets,
                  and URLs can then be included in model context.
                </p>
                <p>
                  Arena does not intentionally send your password, authentication
                  token, full payment-card details, or email address to model
                  providers as part of generation requests. Each provider applies
                  its own policy and data-handling terms.
                </p>
                <div className="privacy-provider-links" aria-label="Model provider privacy policies">
                  {PROVIDER_LINKS.map((provider) => (
                    <a
                      key={provider.label}
                      href={provider.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>{provider.label}</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  ))}
                </div>
                <div className="privacy-callout" data-kind="models">
                  <strong>Not independent verification</strong>
                  <p>
                    Arena’s separate scorer compares model answers. A winning
                    answer remains model-generated output and is not a factual
                    guarantee or independent human review.
                  </p>
                </div>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[5]}>
                <p>
                  Razorpay provides checkout and payment processing. When Arena
                  creates a Razorpay customer, it sends the account email and an
                  Arena user identifier. Razorpay receives and processes payment
                  instrument details under its own privacy policy.
                </p>
                <p>
                  Arena stores the service-side records needed to manage access:
                  Razorpay customer and subscription identifiers, plan, tier,
                  billing period, amount, currency, status, period dates, and
                  payment count. Arena does not store full card numbers or bank
                  credentials.
                </p>
                <a
                  className="privacy-inline-link"
                  href="https://razorpay.com/privacy/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read Razorpay’s privacy policy <span aria-hidden="true">↗</span>
                </a>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[6]}>
                <p>
                  If you connect an MCP-compatible service, Arena stores the
                  service and display names, connection metadata, and encrypted
                  access or refresh credentials. When you invoke the integration,
                  selected content returned by that service can become context for
                  an Agent request and may therefore reach the selected model provider.
                </p>
                <p>
                  Arena’s web service cannot directly open desktop applications,
                  write files, or control your device. Those actions require the
                  separately installed Condura daemon. A browser handoff can carry
                  a signed capability payload to Condura; Arena may keep a limited
                  handoff status or summary and can store a handoff draft if you
                  explicitly save one.
                </p>
                <p>
                  You can disconnect an Arena integration and delete saved handoff
                  drafts. The current integration disconnect endpoint marks the
                  connection inactive but retains the encrypted credential record
                  for possible re-enabling; it does not immediately erase that record.
                  The connected service and local Condura installation have their own
                  controls and policies.
                </p>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[7]}>
                <p>
                  Persistent relational records use managed PostgreSQL. Active chat
                  and Agent state can also live in process memory. Agent uploads are
                  written to temporary server storage and registered with a two-hour
                  expiration; expired files are removed on best-effort cleanup. JSON
                  operational logs rotate daily, with up to 30 daily backups configured.
                </p>
                <p>
                  Passwords use one-way bcrypt hashes and are never stored as plain
                  text. Current password writes apply a SHA-256 prehash before bcrypt;
                  legacy direct-bcrypt rows remain readable for compatibility and are
                  upgraded after the next successful login. Connected MCP credentials
                  are encrypted at rest. Arena also applies access, request-size,
                  rate-limit, and transport controls to protect the service.
                </p>
                <p>
                  In your browser, Arena stores access and refresh tokens, up to eight
                  recent prompt snippets, and opted-in prompt drafts in localStorage.
                  A Condura handoff private signing key is kept in sessionStorage.
                  Signing out or using feature controls removes some items; clearing
                  Arena site data removes the browser-held copies. The page also loads
                  Source Serif 4 from Google Fonts, so the browser makes requests to
                  Google that can carry ordinary network metadata such as IP address
                  and user-agent information under Google’s policy.
                </p>
                <p>
                  No system can promise absolute security. Use a unique password,
                  protect your session, disconnect tools you no longer use, and do
                  not submit information that is not needed for the request.
                </p>
                <p>
                  Records are retained as needed to provide selected features,
                  administer subscriptions, preserve security or audit integrity,
                  resolve failures, and meet legal obligations. Arena does not
                  publish one fixed retention period that applies to every data class.
                </p>
                <div className="privacy-callout" data-kind="retention">
                  <strong>History window ≠ deletion schedule</strong>
                  <p>
                    Tier-specific history windows control which Agent tasks the
                    interface returns. They should not be read as a promise that
                    the underlying record is automatically deleted on that date.
                  </p>
                </div>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[8]}>
                <p>
                  You can update profile settings from Account. Depending on the
                  feature and whether it is exposed in the interface or API, Arena
                  provides controls to delete individual sessions, saved responses,
                  memory summaries, discuss threads, Agent tasks, ratings, and handoff
                  drafts. Other destructive labels have narrower effects: disconnecting
                  an integration marks it inactive while retaining the encrypted
                  credential record, resetting a panel replaces its choices with
                  defaults, and deleting a room deactivates the room record.
                </p>
                <p>
                  Arena does not currently expose a self-service endpoint for
                  deleting the entire account or publish a dedicated private privacy
                  inbox. The responsible project operator is the maintainer identified
                  on the canonical GitHub repository. Use the repository to request a
                  private follow-up channel, but do not place an account email, prompts,
                  credentials, or other personal data in a public issue. We may need to
                  verify that a request comes from the account owner, and some records
                  may be retained where reasonably necessary for security, billing,
                  dispute resolution, or legal obligations.
                </p>
                <a
                  className="privacy-inline-link"
                  href="https://github.com/sahajpatel123/Multi-AI-Agents"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the GitHub repository <span aria-hidden="true">↗</span>
                </a>
              </PolicyChapter>

              <PolicyChapter chapter={PRIVACY_CHAPTERS[9]}>
                <p>
                  External providers apply their own privacy terms to information
                  they process. Review those terms before using a model provider,
                  an automatically triggered web search, Razorpay checkout, a
                  connected service, Google Fonts, or a Condura workflow if its
                  handling matters to your decision.
                </p>
                <p>
                  We may update this policy as the product, providers, or data flows
                  change. The revision marker at the top of the page identifies the
                  current published version. Material product changes should be read
                  with the current Terms of Service and in-product controls.
                </p>
                <p>
                  Arena does not currently publish a dedicated private privacy inbox.
                  For privacy questions or deletion requests, use the canonical GitHub
                  repository to request a private follow-up channel, and do not include
                  personal data in a public issue. No unlinked social-media contact
                  channel is presented as a privacy request path.
                </p>
                <a
                  className="privacy-inline-link"
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read Google’s privacy policy <span aria-hidden="true">↗</span>
                </a>
                <div className="privacy-contact-band">
                  <a
                    href="https://github.com/sahajpatel123/Multi-AI-Agents"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Request private follow-up / GitHub <span aria-hidden="true">↗</span>
                  </a>
                  <Link to="/terms">
                    Companion / Terms <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </PolicyChapter>
            </div>

            <footer className="privacy-manual__footer">
              <span>END / PRIVACY FIELD MANUAL</span>
              <a href="#main-content">Return to top <span aria-hidden="true">↑</span></a>
            </footer>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
