import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { Navbar } from '../components/Navbar';

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
    question: 'How does the money back guarantee work?',
    answer: 'If you upgrade to Pro and are not satisfied within 30 days, contact us for a full refund. No questions asked.',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
      {items.map((item) => {
        const isSub = item.startsWith('· ') || item === 'Challenge any mind, watch the others react' || item === 'Minds remember your history' || item === '7-stage AI pipeline for complex tasks' || item === 'See exactly why a mind won';

        return (
          <div
            key={item}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginLeft: isSub ? '12px' : 0,
            }}
          >
            {!isSub ? (
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: dotColor,
                  flexShrink: 0,
                }}
              />
            ) : (
              <span style={{ width: '5px', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: '13px', color: isSub ? subColor : textColor, lineHeight: 1.6 }}>
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
              ) : item}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PricingPage() {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  const thinkerPrice = billing === 'monthly' ? '$12/mo' : '$99/yr';
  const architectPrice = billing === 'monthly' ? '$24/mo' : '$199/yr';

  return (
    <div style={{ background: '#FAF7F4', minHeight: '100vh' }}>
      <Navbar />

      <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '64px 24px' }}>
        <section className="pricing-hero" style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#6B6460', marginBottom: '1rem' }}>
            Simple, honest pricing
          </p>
          <h1 style={{ fontSize: '56px', fontWeight: 500, letterSpacing: '-.03em', color: '#1A1714', lineHeight: 1.05, marginBottom: '1rem' }}>
            Start <span style={{ color: '#C4956A', fontStyle: 'italic' }}>free.</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#6B6460', maxWidth: '420px', lineHeight: 1.8 }}>
            No credit card to start. Upgrade when Arena becomes part of how you think.
          </p>
        </section>

        <section
          className="pricing-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
            alignItems: 'stretch',
            marginBottom: '3rem',
          }}
        >
          <div style={{ background: '#FFFFFF', border: '0.5px solid #E0D8D0', borderRadius: '20px', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'inline-flex', background: '#F0EBE3', color: '#6B6460', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', marginBottom: '1rem' }}>
              Free forever
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: '#6B6460', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Explorer
            </p>
            <div style={{ fontSize: '48px', fontWeight: 500, color: '#1A1714', lineHeight: 1, marginBottom: '.35rem' }}>$0</div>
            <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1.5rem' }}>forever</p>
            <div style={{ height: '0.5px', background: '#E0D8D0', marginBottom: '1.5rem' }} />
            <div style={{ flex: 1 }}>
              <FeatureList items={explorerFeatures} dotColor="#C4B8AE" textColor="#1A1714" subColor="#6B6460" />
            </div>
            <button
              type="button"
              onClick={() => navigate('/app')}
              style={{
                width: '100%',
                border: '0.5px solid #1A1714',
                color: '#1A1714',
                background: 'transparent',
                borderRadius: '999px',
                padding: '12px 22px',
                fontSize: '14px',
                cursor: 'pointer',
                marginTop: '1.5rem',
              }}
            >
              Start exploring
            </button>
          </div>

          <div style={{ border: '1px solid #C4956A', borderRadius: '20px', padding: '2rem', position: 'relative', background: '#FFFFFF', display: 'flex', flexDirection: 'column' }}>
            <div className="featured-badge" style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#C4956A', color: '#FAF7F4', fontSize: '10px', padding: '4px 14px', borderRadius: '999px' }}>
              Most popular
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: '#6B6460', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Thinker
            </p>
            <div className="billing-toggle" style={{ display: 'inline-flex', background: '#F0EBE3', borderRadius: '999px', padding: '4px', gap: '4px', marginBottom: '1rem' }}>
              {(['monthly', 'annual'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setBilling(option)}
                  style={{
                    border: 'none',
                    borderRadius: '999px',
                    padding: '6px 12px',
                    background: billing === option ? '#1A1714' : '#F0EBE3',
                    color: billing === option ? '#FAF7F4' : '#6B6460',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {option === 'monthly' ? 'Monthly' : 'Annual'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '.35rem' }}>
              <div style={{ fontSize: '44px', fontWeight: 500, color: '#1A1714', lineHeight: 1 }}>{thinkerPrice}</div>
              {billing === 'annual' && (
                <span style={{ background: '#EDF2EF', color: '#8AA899', fontSize: '11px', padding: '3px 8px', borderRadius: '999px' }}>
                  Save 31%
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: '#6B6460', marginBottom: '1.5rem' }}>
              {billing === 'monthly' ? 'per month, billed monthly' : 'per year, billed annually'}
            </p>
            <div style={{ height: '0.5px', background: '#E0D8D0', marginBottom: '1.5rem' }} />
            <div style={{ flex: 1 }}>
              <FeatureList items={thinkerFeatures} dotColor="#C4956A" textColor="#1A1714" subColor="#6B6460" />
            </div>
            <button
              type="button"
              onClick={() => navigate('/signin')}
              style={{
                width: '100%',
                background: '#1A1714',
                color: '#FAF7F4',
                borderRadius: '999px',
                padding: '12px 22px',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '1.5rem',
              }}
            >
              Start with Plus
            </button>
            <p style={{ fontSize: '12px', color: '#6B6460', marginTop: '.8rem', textAlign: 'center' }}>
              No credit card required to start
            </p>
          </div>

          <div style={{ background: '#1A1714', borderRadius: '20px', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', color: 'rgba(250,247,244,0.5)', letterSpacing: '.08em', marginBottom: '.8rem' }}>
              Architect
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '.35rem' }}>
              <div style={{ fontSize: '44px', fontWeight: 500, color: '#FAF7F4', lineHeight: 1 }}>{architectPrice}</div>
              {billing === 'annual' && (
                <span style={{ background: 'rgba(250,247,244,0.1)', color: 'rgba(250,247,244,0.6)', fontSize: '11px', padding: '3px 8px', borderRadius: '999px' }}>
                  Save 31%
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(250,247,244,0.5)', marginBottom: '1.5rem' }}>
              {billing === 'monthly' ? 'per month, billed monthly' : 'per year, billed annually'}
            </p>
            <div style={{ height: '0.5px', background: 'rgba(250,247,244,0.1)', marginBottom: '1.5rem' }} />
            <div style={{ flex: 1 }}>
              <FeatureList items={architectFeatures} dotColor="rgba(250,247,244,0.3)" textColor="#FAF7F4" subColor="rgba(250,247,244,0.6)" badgeDark />
            </div>
            <button
              type="button"
              onClick={() => navigate('/signin')}
              style={{
                width: '100%',
                background: '#C4956A',
                color: '#FAF7F4',
                borderRadius: '999px',
                padding: '12px 22px',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                marginTop: '1.5rem',
              }}
            >
              Upgrade to Pro
            </button>
            <p style={{ fontSize: '12px', color: 'rgba(250,247,244,0.4)', marginTop: '.8rem', textAlign: 'center' }}>
              30-day money back guarantee
            </p>
          </div>
        </section>

        <section style={{ marginBottom: '3rem' }}>
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
            <div key={faq.question} className="faq-item" style={{ borderBottom: '0.5px solid #E0D8D0', padding: '1rem 0' }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#1A1714', marginBottom: '.45rem' }}>{faq.question}</p>
              <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.7 }}>{faq.answer}</p>
            </div>
          ))}
        </section>
      </div>

      <Footer />
    </div>
  );
}
