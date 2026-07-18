import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { prefersReducedMotion } from '../lib/motion';

const SECTIONS = [
  {
    title: 'Acceptance of Terms',
    body: 'By accessing Arena, you agree to these terms. If you do not agree, please do not use the service.',
  },
  {
    title: 'Use of Service',
    body: 'Arena is provided for personal and informational use. You may not use Arena to generate harmful, illegal, or malicious content. We reserve the right to suspend accounts that violate these terms.',
  },
  {
    title: 'User Accounts',
    body: 'You are responsible for maintaining the security of your account. Arena stores account credentials (email and hashed password), session and prompt history, and subscription status metadata needed for plan entitlements. We do not sell your data. Paid plans are billed through Razorpay; card details are handled by Razorpay, not stored as full card numbers on Arena servers.',
  },
  {
    title: 'Subscriptions & Billing',
    body: 'Optional Plus and Pro subscriptions unlock additional features. Fees, renewals, and cancellations are processed through Razorpay according to the plan you select on the Pricing page. Feature access follows your active plan tier.',
  },
  {
    title: 'Intellectual Property',
    body: "Arena's interface, design, and underlying architecture are the property of the creator. AI-generated responses belong to no one — use them freely.",
  },
  {
    title: 'Limitation of Liability',
    body: 'Arena is provided as-is. We make no guarantees about the accuracy of AI-generated responses. Use your own judgment when acting on any response.',
  },
  {
    title: 'Changes to Terms',
    body: 'We may update these terms at any time. Continued use of Arena after changes constitutes acceptance of the new terms.',
  },
  {
    title: 'Contact',
    body: 'Questions? Reach out via the GitHub repository or LinkedIn.',
  },
] as const;

export function TermsPage() {
  const reduceMotion = prefersReducedMotion();

  return (
    <div className="legal-page">
      <Navbar />
      <main
        id="main-content"
        className={`legal-page__main${reduceMotion ? '' : ' page-enter'}`}
        tabIndex={-1}
        aria-labelledby="terms-title"
      >
        <header className="legal-hero">
          <p className="legal-hero__kicker">
            <span className="legal-hero__kicker-dot" aria-hidden="true" />
            Legal
          </p>
          <h1 id="terms-title" className="legal-hero__title">
            Terms of Service
          </h1>
          <p className="legal-hero__meta">Last updated: July 2026</p>
          <p className="legal-hero__lede">
            The ground rules for using Arena — accounts, billing, and fair use.
          </p>
        </header>

        <div className="legal-content" role="list">
          {SECTIONS.map((section, idx) => (
            <article
              key={section.title}
              className="legal-section"
              role="listitem"
              style={
                reduceMotion
                  ? undefined
                  : { animationDelay: `${Math.min(idx * 40, 280)}ms` }
              }
            >
              <span className="legal-section__index" aria-hidden="true">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <h2 className="legal-section__title">{section.title}</h2>
              <div className="legal-section__body">
                <p>{section.body}</p>
              </div>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
