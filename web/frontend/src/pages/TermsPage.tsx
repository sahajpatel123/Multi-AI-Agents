import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/verdict-terms.css';

type ClauseAccent = 'cyan' | 'violet' | 'coral' | 'acid' | 'amber';

type TermsClause = {
  id: string;
  number: string;
  navLabel: string;
  title: string;
  signal: string;
  accent: ClauseAccent;
  paragraphs: readonly string[];
  bullets?: readonly string[];
};

const TERMS_CLAUSES: readonly TermsClause[] = [
  {
    id: 'acceptance',
    number: '01',
    navLabel: 'Acceptance',
    title: 'Acceptance of these terms',
    signal: 'Using Arena means accepting the full agreement.',
    accent: 'cyan',
    paragraphs: [
      'By accessing or using Arena, you agree to these Terms of Service. If you do not agree, do not access or use the service.',
      'The summaries, signals, and clause labels on this page are reading aids. They do not replace or override the full wording of these Terms.',
    ],
  },
  {
    id: 'acceptable-use',
    number: '02',
    navLabel: 'Acceptable use',
    title: 'Use the service lawfully',
    signal: 'Do not use Arena to harm people, systems, or the service.',
    accent: 'coral',
    paragraphs: [
      'Arena is provided for personal and informational use. You must use it lawfully and in a way that does not harm other people, systems, or the service.',
      'We may restrict or suspend access when reasonably necessary to enforce these Terms or protect Arena and its users.',
    ],
    bullets: [
      'Do not generate harmful, illegal, or malicious content.',
      'Do not attempt unauthorized access or interfere with normal operation.',
      'Do not abuse automated interfaces or evade plan, safety, or rate limits.',
    ],
  },
  {
    id: 'accounts',
    number: '03',
    navLabel: 'Accounts',
    title: 'Accounts and account data',
    signal: 'Keep your credentials secure; activity under your account is your responsibility.',
    accent: 'violet',
    paragraphs: [
      'If you create an account, you are responsible for keeping its credentials secure and for activity under that account. Do not share credentials or use another person’s account without permission.',
      'Arena stores the account and service data needed to operate: your email, a hashed password, session and prompt history, and subscription-status metadata. Arena does not sell your data.',
    ],
  },
  {
    id: 'billing',
    number: '04',
    navLabel: 'Billing',
    title: 'Subscriptions and billing',
    signal: 'Razorpay handles payments; access follows your active plan and add-ons.',
    accent: 'amber',
    paragraphs: [
      'Optional Plus and Pro subscriptions—and the Agent Mode add-on available to Plus members—unlock additional features. Fees, renewals, and cancellations are processed through Razorpay according to the plan and billing period you select.',
      'Feature access follows your active plan tier and add-on status. When you schedule cancellation, paid access remains available through the current paid period and billing stops at the end of that cycle.',
      'Razorpay handles payment-card details. Arena does not store full card numbers on its servers.',
    ],
  },
  {
    id: 'content-and-ip',
    number: '05',
    navLabel: 'Content and IP',
    title: 'Your content and Arena intellectual property',
    signal: 'Arena does not claim your prompts or model output as its own.',
    accent: 'acid',
    paragraphs: [
      'Arena’s interface, branding, design, software, and underlying architecture remain the property of the creator and applicable licensors. These Terms do not transfer those rights to you.',
      'You retain any rights you hold in content you submit. By sending content to Arena, you authorize Arena and the relevant service providers to process it as needed to provide, secure, and maintain the service.',
      'Arena does not claim ownership of AI-generated responses. Whether an output can be owned or reused depends on applicable law, provider terms, and third-party rights. You are responsible for checking those constraints before publishing or using output commercially.',
    ],
  },
  {
    id: 'ai-output',
    number: '06',
    navLabel: 'AI output',
    title: 'AI output and reliance',
    signal: 'A winning answer is still machine-generated output—not a guarantee.',
    accent: 'cyan',
    paragraphs: [
      'Arena compares responses from multiple AI personas and may use a separate AI scorer to rank a winner. That ranking is a comparative product signal; it is not independent factual verification.',
      'AI-generated responses can be inaccurate, incomplete, outdated, biased, or unsuitable for your situation. They may also resemble content produced for other users.',
      'Do not treat Arena output as a substitute for legal, medical, financial, or other professional advice. Verify important claims and use qualified professionals for high-stakes decisions.',
    ],
  },
  {
    id: 'availability',
    number: '07',
    navLabel: 'Availability',
    title: 'Service availability and changes',
    signal: 'Features, providers, limits, and availability may change.',
    accent: 'violet',
    paragraphs: [
      'Arena is provided on an as-is and as-available basis. We do not promise that every feature will be uninterrupted, error-free, or available in every location or at every time.',
      'Features, model and persona availability, usage limits, and plan entitlements may evolve. Access to paid capabilities follows your active subscription and the product state presented in Arena.',
    ],
  },
  {
    id: 'suspension',
    number: '08',
    navLabel: 'Suspension',
    title: 'Suspension and ending use',
    signal: 'Material violations or security risks can result in restricted access.',
    accent: 'coral',
    paragraphs: [
      'We may restrict or suspend an account that violates these Terms, creates a security or integrity risk, or must be restricted to comply with law.',
      'You may stop using Arena at any time. If you have a paid plan, schedule cancellation through your account so future billing stops at the end of the current cycle.',
    ],
  },
  {
    id: 'liability',
    number: '09',
    navLabel: 'Liability',
    title: 'Disclaimers and limitation of liability',
    signal: 'Use your judgment; legal protections that cannot be excluded still apply.',
    accent: 'amber',
    paragraphs: [
      'To the extent permitted by applicable law, Arena is provided without warranties about the accuracy, reliability, or fitness of AI-generated responses for a particular purpose.',
      'You are responsible for decisions you make based on Arena output. To the extent the law allows, Arena and its creator are not responsible for losses arising from reliance on generated output or from an inability to use the service.',
      'Nothing in these Terms excludes liability or consumer rights that applicable law does not allow to be excluded or limited.',
    ],
  },
  {
    id: 'changes-and-contact',
    number: '10',
    navLabel: 'Changes and contact',
    title: 'Changes to these terms and contact',
    signal: 'The revision date identifies the current published terms.',
    accent: 'acid',
    paragraphs: [
      'We may update these Terms from time to time. The revision date at the top of this page identifies the current version. Continued use of Arena after updated Terms take effect constitutes acceptance of the updated Terms.',
      'Questions about these Terms can be raised through the project’s GitHub repository or LinkedIn channel. Privacy questions should be read alongside the Privacy Policy.',
    ],
  },
] as const;

const QUICK_SIGNALS = [
  {
    label: 'Access',
    value: 'Using Arena means accepting the complete agreement.',
    accent: 'cyan',
  },
  {
    label: 'Account',
    value: 'You are responsible for credentials and account activity.',
    accent: 'violet',
  },
  {
    label: 'Payment',
    value: 'Razorpay processes paid plans and card details.',
    accent: 'amber',
  },
  {
    label: 'Output',
    value: 'AI answers can be wrong. Verify before relying.',
    accent: 'coral',
  },
] as const;

const CLAUSE_IDS = TERMS_CLAUSES.map((clause) => clause.id);

function hashClause(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = decodeURIComponent(window.location.hash.slice(1));
    return CLAUSE_IDS.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function TermsPage() {
  const reduceMotion = prefersReducedMotion();
  const [activeClause, setActiveClause] = useState(
    () => hashClause() ?? TERMS_CLAUSES[0].id,
  );

  useEffect(() => {
    const updateFromHash = () => {
      const clause = hashClause();
      if (clause) setActiveClause(clause);
    };

    const updateFromScroll = () => {
      const threshold = window.innerWidth <= 1020 ? 156 : 180;
      let current = TERMS_CLAUSES[0].id;

      for (const clause of TERMS_CLAUSES) {
        const element = document.getElementById(clause.id);
        if (!element || element.getBoundingClientRect().top > threshold) break;
        current = clause.id;
      }

      const pageHeight = document.documentElement.scrollHeight;
      if (
        pageHeight > window.innerHeight &&
        window.scrollY + window.innerHeight >= pageHeight - 8
      ) {
        current = TERMS_CLAUSES[TERMS_CLAUSES.length - 1].id;
      }

      setActiveClause(current);
    };

    updateFromHash();
    window.addEventListener('hashchange', updateFromHash);
    window.addEventListener('scroll', updateFromScroll, { passive: true });

    return () => {
      window.removeEventListener('hashchange', updateFromHash);
      window.removeEventListener('scroll', updateFromScroll);
    };
  }, []);

  const activeIndex = TERMS_CLAUSES.findIndex(
    (clause) => clause.id === activeClause,
  );

  return (
    <div
      className={`legal-page terms-page${reduceMotion ? '' : ' terms-page--motion'}`}
    >
      <Navbar />
      <main id="main-content" tabIndex={-1} aria-labelledby="terms-title">
        <header className="terms-hero">
          <div className="terms-hero__folio" aria-label="Document reference">
            <span>LEGAL / DOCUMENT 01</span>
            <span>REVISION 2026.07</span>
          </div>

          <div className="terms-hero__grid">
            <div className="terms-hero__copy">
              <p className="terms-eyebrow">Agreement ledger</p>
              <h1
                id="terms-title"
                className="terms-hero__title"
                aria-label="Terms of Service"
              >
                <span>Terms</span>
                <span>of Service</span>
              </h1>
              <p className="terms-hero__lede">
                The operating agreement for access, accounts, paid plans, and
                the judgment required around model-generated output.
              </p>
              <div className="terms-hero__actions" aria-label="Document actions">
                <a className="terms-action terms-action--primary" href="#acceptance">
                  Begin with clause 01 <span aria-hidden="true">↓</span>
                </a>
                <Link className="terms-action terms-action--secondary" to="/privacy">
                  Read Privacy <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>

            <aside className="terms-control" aria-label="Document control">
              <div className="terms-control__header">
                <span>Document control</span>
                <strong>ARENA / TOS</strong>
              </div>
              <dl className="terms-control__rows">
                <div>
                  <dt>Status</dt>
                  <dd><span aria-hidden="true" /> Published</dd>
                </div>
                <div>
                  <dt>Last revised</dt>
                  <dd>July 2026</dd>
                </div>
                <div>
                  <dt>Applies to</dt>
                  <dd>Website + web app</dd>
                </div>
                <div>
                  <dt>Clauses</dt>
                  <dd>{String(TERMS_CLAUSES.length).padStart(2, '0')}</dd>
                </div>
              </dl>
              <p className="terms-control__notice">
                Read the complete clauses. Summaries are navigation aids, not
                substitutes for the agreement.
              </p>
            </aside>
          </div>
        </header>

        <section className="terms-signals" aria-labelledby="terms-signals-title">
          <div className="terms-section-heading">
            <p className="terms-eyebrow">Before you continue</p>
            <h2 id="terms-signals-title">Four signals worth holding</h2>
          </div>
          <div className="terms-signals__grid" role="list">
            {QUICK_SIGNALS.map((signal, index) => (
              <article
                key={signal.label}
                className="terms-signal"
                data-accent={signal.accent}
                role="listitem"
              >
                <span className="terms-signal__index" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3>{signal.label}</h3>
                <p>{signal.value}</p>
              </article>
            ))}
          </div>
          <p className="terms-signals__disclaimer">
            <strong>Reading aid:</strong> these signals compress the themes;
            the numbered clauses below are the agreement.
          </p>
        </section>

        <section className="terms-ledger" aria-label="Terms agreement">
          <aside className="terms-index">
            <div className="terms-index__sticky">
              <div className="terms-index__head">
                <p>Clause index</p>
                <span aria-hidden="true">
                  {String(activeIndex + 1).padStart(2, '0')} /{' '}
                  {String(TERMS_CLAUSES.length).padStart(2, '0')}
                </span>
              </div>
              <nav aria-label="Terms clauses">
                <ol>
                  {TERMS_CLAUSES.map((clause) => (
                    <li key={clause.id}>
                      <a
                        href={`#${clause.id}`}
                        aria-label={`${clause.number} ${clause.navLabel}`}
                        aria-current={activeClause === clause.id ? 'location' : undefined}
                        onClick={() => setActiveClause(clause.id)}
                      >
                        <span>{clause.number}</span>
                        <strong>{clause.navLabel}</strong>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="terms-index__companion">
                <span>Companion document</span>
                <Link to="/privacy">Privacy Policy <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
          </aside>

          <div className="terms-sheet">
            <header className="terms-sheet__header">
              <div>
                <p>Full agreement</p>
                <h2>Terms of Service</h2>
              </div>
              <span>ARENA—2026</span>
            </header>

            <div className="terms-sheet__clauses">
              {TERMS_CLAUSES.map((clause) => (
                <article
                  key={clause.id}
                  id={clause.id}
                  className="terms-clause"
                  data-accent={clause.accent}
                  aria-labelledby={`${clause.id}-title`}
                >
                  <div className="terms-clause__marker" aria-hidden="true">
                    <span>{clause.number}</span>
                    <i />
                  </div>
                  <div className="terms-clause__content">
                    <p className="terms-clause__signal">{clause.signal}</p>
                    <h3 id={`${clause.id}-title`}>{clause.title}</h3>
                    <div className="terms-clause__body">
                      {clause.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      {clause.bullets ? (
                        <ul>
                          {clause.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                      {clause.id === 'accounts' ? (
                        <p className="terms-clause__crosslink">
                          Data handling is described in the{' '}
                          <Link to="/privacy">Privacy Policy</Link>.
                        </p>
                      ) : null}
                      {clause.id === 'billing' ? (
                        <p className="terms-clause__crosslink">
                          Review current plan options on the{' '}
                          <Link to="/pricing">Pricing page</Link>.
                        </p>
                      ) : null}
                      {clause.id === 'changes-and-contact' ? (
                        <div className="terms-clause__links" aria-label="Terms resources">
                          <a
                            href="https://github.com/sahajpatel123/Multi-AI-Agents"
                            target="_blank"
                            rel="noreferrer"
                          >
                            GitHub repository <span aria-hidden="true">↗</span>
                          </a>
                          <Link to="/privacy">
                            Privacy Policy <span aria-hidden="true">↗</span>
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <footer className="terms-sheet__end">
              <div>
                <span>END / DOCUMENT 01</span>
                <strong>Read. Question. Proceed deliberately.</strong>
              </div>
              <a href="#main-content">Return to top <span aria-hidden="true">↑</span></a>
            </footer>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
