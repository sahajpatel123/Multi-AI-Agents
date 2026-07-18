import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { prefersReducedMotion } from '../lib/motion';

const SECTIONS = [
  {
    title: 'What We Collect',
    body: 'Arena collects your email address and hashed password when you create an account. We store your prompt history, session data, and subscription status metadata (plan tier, billing period, and payment-provider identifiers) needed to power history, leaderboard, and billing features.',
  },
  {
    title: 'What We Do Not Collect',
    body: 'We do not collect location data or track you across other websites. We do not store your full card numbers or bank credentials on Arena servers — payment card details are handled by our payment processor (Razorpay) when you subscribe.',
  },
  {
    title: 'How We Use Your Data',
    body: 'Your data is used to provide the Arena service — authentication, session history, leaderboard tracking, plan entitlements, and subscription management. We do not sell your personal data.',
  },
  {
    title: 'Data Storage',
    body: 'Production data is stored in a managed PostgreSQL database. Passwords are hashed using bcrypt and never stored in plain text.',
  },
  {
    title: 'Third Parties',
    body: 'Arena relies on trusted infrastructure and service providers to operate securely, including hosting, analytics, authentication support, and payment processing via Razorpay. We only share the minimum information required for those services to function. Razorpay processes payments under its own privacy policy (razorpay.com/privacy).',
  },
  {
    title: 'AI Model Providers',
    body: "Arena's minds are powered by a selection of leading AI models, each chosen to match the reasoning style of that specific persona. The AI providers we work with include Anthropic (Claude), OpenAI (GPT), xAI (Grok), and DeepSeek. Your prompts may be processed by any of these providers depending on which minds are in your active panel.\n\nEach provider has their own privacy policy and data handling practices. We encourage you to review the privacy policies of these providers if you have specific concerns about how your data is processed:\n\n· Anthropic: anthropic.com/privacy\n· OpenAI: openai.com/privacy\n· xAI: x.ai/privacy\n· DeepSeek: deepseek.com/privacy\n\nWe do not share your account information, email address, or any personally identifiable information with these providers. Only the text of your prompts is transmitted for the purpose of generating responses.",
  },
  {
    title: 'Data Deletion',
    body: 'You can request deletion of your account and all associated data at any time by contacting us via GitHub.',
  },
  {
    title: 'Contact',
    body: 'For privacy concerns, reach out via the GitHub repository or LinkedIn.',
  },
] as const;

export function PrivacyPage() {
  const reduceMotion = prefersReducedMotion();

  return (
    <div className="legal-page">
      <Navbar />
      <main
        id="main-content"
        className={`legal-page__main${reduceMotion ? '' : ' page-enter'}`}
        tabIndex={-1}
        aria-labelledby="privacy-title"
      >
        <header className="legal-hero">
          <p className="legal-hero__kicker">
            <span className="legal-hero__kicker-dot" aria-hidden="true" />
            Legal
          </p>
          <h1 id="privacy-title" className="legal-hero__title">
            Privacy Policy
          </h1>
          <p className="legal-hero__meta">Last updated: July 2026</p>
          <p className="legal-hero__lede">
            How Arena handles your account, prompts, and billing data — in plain language.
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
                {section.body.split('\n').map((paragraph, paragraphIndex) => (
                  <p key={`${section.title}-${paragraphIndex}`}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
