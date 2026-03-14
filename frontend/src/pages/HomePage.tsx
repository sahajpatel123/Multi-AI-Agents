import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

function useScrollReveal(delay = 0) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [delay]);

  return { ref, isVisible };
}

const EXAMPLE_PROMPTS = [
  'Should I quit my job and start a business?',
  'Is AI going to replace most jobs?',
  "What's the most important skill to learn right now?",
] as const;

const TICKER_ITEMS = [
  'Should I quit my job?',
  'Is AI replacing jobs?',
  'Best investment right now?',
  'Is crypto dead?',
  'Should I move cities?',
  'Future of smartphones?',
  'Is college worth it in 2026?',
  'Start a startup or get a job?',
];

const ACTIVE_PERSONAS = [
  { name: 'The Analyst', color: '#8C9BAB', quote: 'I find the flaw in everything.' },
  { name: 'The Philosopher', color: '#9B8FAA', quote: 'I question the premise first.' },
  { name: 'The Pragmatist', color: '#8AA899', quote: 'I only care what works.' },
  { name: 'The Contrarian', color: '#B0977E', quote: 'I say what no one else will.' },
];

const LOCKED_PERSONAS = [
  { name: 'The Scientist', quote: 'Evidence, methodology, data.' },
  { name: 'The Historian', quote: 'Every pattern has a precedent.' },
  { name: 'The Economist', quote: 'Incentives explain everything.' },
  { name: 'The Ethicist', quote: 'What are the moral stakes?' },
  { name: 'The Stoic', quote: 'Remove the emotion. Then decide.' },
  { name: 'The Futurist', quote: 'What does this become in 10 years?' },
  { name: 'The Strategist', quote: 'Where is the leverage?' },
  { name: 'The Engineer', quote: 'What are the constraints?' },
  { name: 'The Optimist', quote: "What's the best that could happen?" },
  { name: 'The Empath', quote: 'Who does this affect and how?' },
  { name: 'First Principles', quote: 'Strip it to fundamentals.' },
  { name: "Devil's Advocate", quote: 'I argue against everything.' },
];

const HERO_CARDS = [
  { agent: 'Pragmatist', color: '#8AA899', score: 100, isWinner: true, text: "Learn to sell — it's the universal skill that makes every other skill more valuable." },
  { agent: 'Analyst', color: '#8C9BAB', score: 78, isWinner: false, text: 'There is no universally most important skill — context determines everything.' },
  { agent: 'Contrarian', color: '#B0977E', score: 70, isWinner: false, text: 'Boredom tolerance. The ability to think without stimulation beats any technical skill.' },
  { agent: 'Philosopher', color: '#9B8FAA', score: 65, isWinner: false, text: 'The question assumes skills are separable from the person practicing them.' },
];

export function HomePage() {
  const navigate = useNavigate();
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const [promptPhase, setPromptPhase] = useState<'visible' | 'exiting' | 'entering'>('visible');
  const [isPromptHovered, setIsPromptHovered] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const giant4Ref = useRef<HTMLDivElement>(null);
  const ctaButtonRef = useRef<HTMLButtonElement>(null);
  const [heroCardTransforms, setHeroCardTransforms] = useState<Record<number, string>>({});
  const [heroCardHovered, setHeroCardHovered] = useState<number | null>(null);
  const [manifestoHovered, setManifestoHovered] = useState<number | null>(null);
  const [comparisonHovered, setComparisonHovered] = useState<'left' | 'right' | null>(null);
  const [howItWorksHovered, setHowItWorksHovered] = useState<number | null>(null);
  const [personaHovered, setPersonaHovered] = useState<number | null>(null);
  const [lockedPersonaHovered, setLockedPersonaHovered] = useState<number | null>(null);

  const tickerReveal = useScrollReveal(0);
  const manifestoReveal1 = useScrollReveal(0);
  const manifestoReveal2 = useScrollReveal(80);
  const manifestoReveal3 = useScrollReveal(160);
  const comparisonRevealLeft = useScrollReveal(0);
  const comparisonRevealRight = useScrollReveal(120);
  const howItWorksReveal1 = useScrollReveal(0);
  const howItWorksReveal2 = useScrollReveal(80);
  const howItWorksReveal3 = useScrollReveal(160);
  const howItWorksReveal4 = useScrollReveal(240);
  const personaHeaderReveal = useScrollReveal(0);
  const agentMindsReveal = useScrollReveal(0);
  const ctaBandReveal = useScrollReveal(0);

  useEffect(() => {
    if (isPromptHovered) return;

    const rotateTimer = window.setTimeout(() => {
      setPromptPhase('exiting');

      const swapTimer = window.setTimeout(() => {
        setActivePromptIndex((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
        setPromptPhase('entering');

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPromptPhase('visible');
          });
        });
      }, 300);

      return () => window.clearTimeout(swapTimer);
    }, 3000);

    return () => window.clearTimeout(rotateTimer);
  }, [activePromptIndex, isPromptHovered]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (window.scrollY / scrollHeight) * 100;
      setScrollProgress(progress);

      if (giant4Ref.current) {
        giant4Ref.current.style.transform = `translateY(${window.scrollY * 0.15}px)`;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleHeroCardMouseMove = useCallback((idx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    setHeroCardTransforms((prev) => ({
      ...prev,
      [idx]: `rotateX(${-y * 8}deg) rotateY(${x * 8}deg) scale(1.02)`,
    }));
  }, []);

  const handleHeroCardMouseLeave = useCallback((idx: number) => {
    setHeroCardTransforms((prev) => ({
      ...prev,
      [idx]: 'rotateX(0deg) rotateY(0deg) scale(1)',
    }));
    setHeroCardHovered(null);
  }, []);

  const handleCTAButtonMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ctaButtonRef.current) return;
    const rect = ctaButtonRef.current.getBoundingClientRect();
    const btnCenterX = rect.left + rect.width / 2;
    const btnCenterY = rect.top + rect.height / 2;
    const distX = (e.clientX - btnCenterX) * 0.25;
    const distY = (e.clientY - btnCenterY) * 0.25;
    ctaButtonRef.current.style.transform = `translate(${distX}px, ${distY}px)`;
    ctaButtonRef.current.style.transition = 'none';
  }, []);

  const handleCTAButtonMouseLeave = useCallback(() => {
    if (!ctaButtonRef.current) return;
    ctaButtonRef.current.style.transform = 'translate(0, 0)';
    ctaButtonRef.current.style.transition = 'transform 400ms ease';
  }, []);

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ background: '#FAF7F4', minHeight: '100vh', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatOrb1 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(60px, 40px); }
        }
        @keyframes floatOrb2 {
          0% { transform: translate(0px, 0px); }
          100% { transform: translate(-50px, -60px); }
        }
        @keyframes slowRotate {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(3deg) scale(1.02); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes heroLine1 {
          from { opacity: 0; transform: translateY(24px) translateX(-8px); }
          to { opacity: 1; transform: translateY(0) translateX(0); }
        }
        @keyframes heroLine2 {
          from { opacity: 0; transform: translateY(24px) translateX(-8px); }
          to { opacity: 1; transform: translateY(0) translateX(0); }
        }
        @keyframes heroLine3 {
          from { opacity: 0; transform: translateY(24px) translateX(-8px); }
          to { opacity: 1; transform: translateY(0) translateX(0); }
        }
        @keyframes heroTagPill {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroSubtext {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroCard1 {
          from { opacity: 0; transform: translateX(20px) translateY(8px); }
          to { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes heroCard2 {
          from { opacity: 0; transform: translateX(20px) translateY(8px); }
          to { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes heroCard3 {
          from { opacity: 0; transform: translateX(20px) translateY(8px); }
          to { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes heroCard4 {
          from { opacity: 0; transform: translateX(20px) translateY(8px); }
          to { opacity: 1; transform: translateX(0) translateY(0); }
        }
        @keyframes floatCard1 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes floatCard2 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes floatCard3 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes floatCard4 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes scrollReveal {
          from { opacity: 0; transform: translateY(32px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up { animation: fadeUp 500ms ease forwards; }
        .breathe { animation: breathe 2.4s ease-in-out infinite; }
        .breathe-slow { animation: breathe 3.2s ease-in-out infinite; }
        .scroll-reveal { animation: scrollReveal 600ms cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>

      {/* Scroll Progress Bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, height: '2px', background: '#C4956A', width: `${scrollProgress}%`, zIndex: 101, transition: 'width 50ms linear' }} />

      {/* Ambient Orbs */}
      <div style={{ position: 'fixed', top: '-100px', left: '-200px', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,149,106,0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0, animation: 'floatOrb1 18s ease-in-out infinite alternate', willChange: 'transform' }} />
      <div style={{ position: 'fixed', bottom: '-100px', right: '-150px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(138,168,153,0.05) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0, animation: 'floatOrb2 22s ease-in-out infinite alternate', willChange: 'transform' }} />

      <Navbar />

      {/* Hero Section */}
      <section style={{ position: 'relative', padding: '64px 0 48px' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '0 24px' }}>
          <div ref={giant4Ref} style={{ position: 'absolute', top: '-20px', right: '15%', fontSize: '280px', fontWeight: 500, color: '#F0EBE3', pointerEvents: 'none', zIndex: 0, userSelect: 'none', letterSpacing: '-0.06em', animation: 'slowRotate 40s linear infinite', willChange: 'transform' }}>4</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '64px', alignItems: 'start', position: 'relative', zIndex: 1 }}>
            {/* Left Column */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '0.5px solid #E0D8D0', borderRadius: '999px', padding: '5px 14px', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '1.4rem', animation: 'heroTagPill 400ms ease 0ms backwards' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#8AA899' }} className="breathe-slow" />
                Now live · Free to try
              </div>

              <h1 style={{ marginBottom: '1.2rem' }}>
                <span style={{ display: 'block', color: '#1A1714', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.0, animation: 'heroLine1 700ms cubic-bezier(0.16,1,0.3,1) 0ms backwards' }}>Ask once.</span>
                <span style={{ display: 'block', WebkitTextStroke: '1.5px #1A1714', color: 'transparent', fontStyle: 'italic', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.0, animation: 'heroLine2 700ms cubic-bezier(0.16,1,0.3,1) 120ms backwards' }}>Hear four</span>
                <span style={{ display: 'block', color: '#C4956A', fontStyle: 'italic', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.0, animation: 'heroLine3 700ms cubic-bezier(0.16,1,0.3,1) 240ms backwards' }}>truths.</span>
              </h1>

              <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.75, maxWidth: '320px', marginBottom: '1.5rem', animation: 'heroSubtext 500ms ease 400ms backwards' }}>
                Four AI personalities with opposing worldviews compete to answer your question. Scored on logic, directness, and originality. The best answer wins — automatically.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem', animation: 'heroSubtext 500ms ease 400ms backwards' }}>
                <button
                  onClick={() => navigate('/app')}
                  style={{
                    padding: '11px 24px',
                    borderRadius: '999px',
                    background: '#1A1714',
                    color: '#FAF7F4',
                    fontSize: '13px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'opacity 150ms',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Ask your first question
                </button>
                <button
                  onClick={scrollToHowItWorks}
                  style={{
                    padding: '11px 24px',
                    borderRadius: '999px',
                    border: '0.5px solid #1A1714',
                    color: '#1A1714',
                    background: 'transparent',
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#1A1714';
                    e.currentTarget.style.color = '#FAF7F4';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#1A1714';
                  }}
                >
                  See it in action
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', animation: 'fadeUp 500ms ease 350ms backwards' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EEF0F2', border: '2px solid #FAF7F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, color: '#8C9BAB', marginLeft: 0 }}>S</div>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#F0EDF2', border: '2px solid #FAF7F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, color: '#9B8FAA', marginLeft: '-8px' }}>A</div>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EDF2EF', border: '2px solid #FAF7F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, color: '#8AA899', marginLeft: '-8px' }}>R</div>
                <span style={{ fontSize: '13px', color: '#6B6460', marginLeft: '10px' }}>Early users · No credit card needed</span>
              </div>
            </div>

            {/* Right Column - Live Example */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460' }}>Live example</span>
                <span style={{ fontSize: '13px', color: '#C4956A' }}>· 'Most important skill to learn?'</span>
                <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', perspective: '800px' }}>
                {HERO_CARDS.map((card, idx) => (
                  <div
                    key={card.agent}
                    onMouseMove={(e) => handleHeroCardMouseMove(idx, e)}
                    onMouseEnter={() => setHeroCardHovered(idx)}
                    onMouseLeave={() => handleHeroCardMouseLeave(idx)}
                    style={{
                      background: card.isWinner ? '#FFFCF9' : '#FFFFFF',
                      border: card.isWinner ? '1px solid #C4956A' : '0.5px solid #E0D8D0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      animation: `heroCard${idx + 1} 600ms cubic-bezier(0.16,1,0.3,1) ${300 + idx * 120}ms backwards, floatCard${idx + 1} ${[4, 5, 3.5, 4.5][idx]}s ease-in-out infinite`,
                      transformStyle: 'preserve-3d',
                      transform: heroCardTransforms[idx] || 'rotateX(0deg) rotateY(0deg) scale(1)',
                      transition: heroCardHovered === idx ? 'none' : 'transform 500ms ease',
                      willChange: 'transform',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: card.color }} className="breathe" />
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#1A1714' }}>{card.agent}</span>
                      <div style={{ marginLeft: 'auto', background: card.isWinner ? '#C4956A' : '#F0EBE3', color: card.isWinner ? '#FAF7F4' : '#6B6460', padding: '2px 8px', borderRadius: '999px', fontSize: '10px' }}>
                        {card.isWinner ? `Winner · ${card.score}` : card.score}
                      </div>
                    </div>
                    <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.55, margin: '7px 0' }}>{card.text}</p>
                    <div style={{ height: '2px', background: '#F0EBE3', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: card.color, width: `${card.score}%`, borderRadius: '999px' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div ref={tickerReveal.ref} style={{ borderTop: '0.5px solid #E0D8D0', borderBottom: '0.5px solid #E0D8D0', overflow: 'hidden', padding: '9px 0' }} className={tickerReveal.isVisible ? 'scroll-reveal' : ''}>
        <div style={{ display: 'flex', whiteSpace: 'nowrap', animation: 'ticker 22s linear infinite' }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, idx) => (
            <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0 20px', borderRight: '0.5px solid #E0D8D0', fontSize: '14px', color: '#6B6460' }}>
              <span style={{ fontSize: '13px', color: '#C4956A' }}>→</span>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Manifesto Strip */}
      <section style={{ maxWidth: '1080px', margin: '0 auto', padding: '48px 24px', borderTop: '0.5px solid #E0D8D0' }}>
        <div
          ref={manifestoReveal1.ref}
          onMouseEnter={() => setManifestoHovered(1)}
          onMouseLeave={() => setManifestoHovered(null)}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '1rem 0',
            paddingLeft: manifestoHovered === 1 ? '12px' : '0',
            borderBottom: '0.5px solid #F0EBE3',
            borderRadius: manifestoHovered === 1 ? '12px' : '0',
            background: manifestoHovered === 1 ? 'rgba(196,149,106,0.04)' : 'transparent',
            transition: 'all 200ms ease',
            cursor: 'default',
          }}
          className={manifestoReveal1.isVisible ? 'scroll-reveal' : ''}
        >
          <span style={{ fontSize: '13px', color: '#C4956A', letterSpacing: '.1em', width: '32px' }}>01</span>
          <p style={{ fontSize: '30px', fontWeight: 500, letterSpacing: '-.02em', flex: 1, lineHeight: 1.2, padding: '0 2rem', color: '#1A1714' }}>
            <span style={{ color: '#C4B8AE' }}>One</span> AI gives you one answer.
          </p>
          <span style={{ fontSize: '13px', color: '#6B6460', border: '0.5px solid #E0D8D0', padding: '4px 12px', borderRadius: '999px' }}>The old way</span>
        </div>

        <div
          ref={manifestoReveal2.ref}
          onMouseEnter={() => setManifestoHovered(2)}
          onMouseLeave={() => setManifestoHovered(null)}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '1rem 0',
            paddingLeft: manifestoHovered === 2 ? '12px' : '0',
            borderBottom: '0.5px solid #F0EBE3',
            borderRadius: manifestoHovered === 2 ? '12px' : '0',
            background: manifestoHovered === 2 ? 'rgba(196,149,106,0.04)' : 'transparent',
            transition: 'all 200ms ease',
            cursor: 'default',
          }}
          className={manifestoReveal2.isVisible ? 'scroll-reveal' : ''}
        >
          <span style={{ fontSize: '13px', color: '#C4956A', letterSpacing: '.1em', width: '32px' }}>02</span>
          <p style={{ fontSize: '30px', fontWeight: 500, letterSpacing: '-.02em', flex: 1, lineHeight: 1.2, padding: '0 2rem', color: '#1A1714' }}>
            Arena gives you <span style={{ color: '#C4956A', fontWeight: 500, letterSpacing: manifestoHovered === 2 ? '0.01em' : '-.02em', transition: 'letter-spacing 300ms ease' }}>four</span> that compete.
          </p>
          <span style={{ fontSize: '13px', color: '#6B6460', border: '0.5px solid #E0D8D0', padding: '4px 12px', borderRadius: '999px' }}>The Arena way</span>
        </div>

        <div
          ref={manifestoReveal3.ref}
          onMouseEnter={() => setManifestoHovered(3)}
          onMouseLeave={() => setManifestoHovered(null)}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '1rem 0',
            paddingLeft: manifestoHovered === 3 ? '12px' : '0',
            borderBottom: '0.5px solid #F0EBE3',
            borderRadius: manifestoHovered === 3 ? '12px' : '0',
            background: manifestoHovered === 3 ? 'rgba(196,149,106,0.04)' : 'transparent',
            transition: 'all 200ms ease',
            cursor: 'default',
          }}
          className={manifestoReveal3.isVisible ? 'scroll-reveal' : ''}
        >
          <span style={{ fontSize: '13px', color: '#C4956A', letterSpacing: '.1em', width: '32px' }}>03</span>
          <p style={{ fontSize: '30px', fontWeight: 500, letterSpacing: '-.02em', flex: 1, lineHeight: 1.2, padding: '0 2rem', color: '#1A1714' }}>
            The best one <span style={{ color: '#C4956A', fontStyle: 'italic', letterSpacing: manifestoHovered === 3 ? '0.01em' : '-.02em', transition: 'letter-spacing 300ms ease' }}>wins.</span>
          </p>
          <span style={{ fontSize: '13px', color: '#6B6460', border: '0.5px solid #E0D8D0', padding: '4px 12px', borderRadius: '999px' }}>Always</span>
        </div>
      </section>

      {/* Comparison Section */}
      <section style={{ maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px' }}>
        <p style={{ fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '1.2rem' }}>Why Arena beats asking one AI</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* One AI Card */}
          <div
            ref={comparisonRevealLeft.ref}
            onMouseEnter={() => setComparisonHovered('left')}
            onMouseLeave={() => setComparisonHovered(null)}
            style={{
              border: '0.5px solid #E0D8D0',
              borderRadius: '16px',
              padding: '1.5rem',
              transform: comparisonHovered === 'left' ? 'translateY(-6px)' : 'translateY(0)',
              transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1)',
            }}
            className={comparisonRevealLeft.isVisible ? 'scroll-reveal' : ''}
          >
            <div style={{ background: '#F0EBE3', color: '#6B6460', fontSize: '10px', padding: '4px 10px', borderRadius: '999px', display: 'inline-block', marginBottom: '1rem' }}>One AI</div>
            <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#1A1714', marginBottom: '1rem' }}>Single perspective</h3>
            
            {['Optimized to agree with you', 'No competing viewpoints', 'Confidence without challenge', 'No ranking — all answers feel equal'].map((item, itemIdx) => (
              <div
                key={itemIdx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '.7rem',
                  transform: comparisonHovered === 'left' ? 'translateX(4px)' : 'translateX(0)',
                  opacity: comparisonHovered === 'left' ? 1 : 0.7,
                  transition: `all 300ms ease ${itemIdx * 30}ms`,
                }}
              >
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#F0EBE3', color: '#B0977E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>✕</div>
                <span style={{ fontSize: '14px', color: '#6B6460' }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Arena Card */}
          <div
            ref={comparisonRevealRight.ref}
            onMouseEnter={() => setComparisonHovered('right')}
            onMouseLeave={() => setComparisonHovered(null)}
            style={{
              background: '#1A1714',
              borderRadius: '16px',
              padding: '1.5rem',
              transform: comparisonHovered === 'right' ? 'translateY(-6px)' : 'translateY(0)',
              transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1)',
            }}
            className={comparisonRevealRight.isVisible ? 'scroll-reveal' : ''}
          >
            <div style={{ background: '#C4956A', color: '#FAF7F4', fontSize: '10px', padding: '4px 10px', borderRadius: '999px', display: 'inline-block', marginBottom: '1rem' }}>Arena</div>
            <h3 style={{ fontSize: '16px', fontWeight: 500, color: '#FAF7F4', marginBottom: '1rem' }}>Four competing minds</h3>
            
            {['Four opposing worldviews on every answer', 'Scored on logic, directness, originality', 'Winner surfaces with a reason why', 'Challenge, debate, go 1-on-1 on demand'].map((item, itemIdx) => (
              <div
                key={itemIdx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '.7rem',
                  transform: comparisonHovered === 'right' ? 'translateX(4px)' : 'translateX(0)',
                  opacity: comparisonHovered === 'right' ? 1 : 0.7,
                  transition: `all 300ms ease ${itemIdx * 30}ms`,
                }}
              >
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#C4956A', color: '#FAF7F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>✓</div>
                <span style={{ fontSize: '14px', color: 'rgba(250,247,244,0.7)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" style={{ maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px' }}>
        <p style={{ fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '1.2rem' }}>How it works</p>

        <div style={{ display: 'flex', border: '0.5px solid #E0D8D0', borderRadius: '16px', overflow: 'hidden' }}>
          {[
            { num: '01', title: 'Ask anything', body: 'A question, a decision, a debate. No restrictions.', reveal: howItWorksReveal1 },
            { num: '02', title: 'Four minds fire', body: 'All four respond simultaneously, each from a radically different angle.', reveal: howItWorksReveal2 },
            { num: '03', title: 'A winner emerges', body: 'Scored by a fifth AI. Best answer surfaces automatically.', reveal: howItWorksReveal3 },
            { num: '04', title: 'Go deeper', body: 'Challenge, debate, or go 1-on-1. You control the depth.', reveal: howItWorksReveal4 },
          ].map((step, idx) => (
            <div
              key={step.num}
              ref={step.reveal.ref}
              onMouseEnter={() => setHowItWorksHovered(idx)}
              onMouseLeave={() => setHowItWorksHovered(null)}
              style={{
                flex: 1,
                padding: '1.5rem',
                borderRight: idx < 3 ? '0.5px solid #E0D8D0' : 'none',
                position: 'relative',
                background: howItWorksHovered === idx ? 'rgba(196,149,106,0.04)' : 'transparent',
                transition: 'all 200ms ease',
              }}
              className={step.reveal.isVisible ? 'scroll-reveal' : ''}
            >
              <div style={{ fontSize: '48px', fontWeight: 500, color: howItWorksHovered === idx ? 'rgba(196,149,106,0.2)' : '#F0EBE3', lineHeight: 1, marginBottom: '.8rem', transition: 'color 200ms ease' }}>{step.num}</div>
              {idx < 3 && (
                <div style={{ position: 'absolute', right: '-10px', top: '1.5rem', width: '20px', height: '20px', borderRadius: '50%', background: '#FAF7F4', border: '0.5px solid #E0D8D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: howItWorksHovered === idx ? '#1A1714' : '#C4956A', zIndex: 2, transform: howItWorksHovered === idx ? 'scale(1.2)' : 'scale(1)', transition: 'all 200ms ease' }}>→</div>
              )}
              <h4 style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714', marginBottom: '.5rem' }}>{step.title}</h4>
              <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.55 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Persona Library */}
      <section style={{ maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px' }}>
        <div ref={personaHeaderReveal.ref} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }} className={personaHeaderReveal.isVisible ? 'scroll-reveal' : ''}>
          <div>
            <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#C4956A', marginBottom: '.4rem' }}>Coming soon</p>
            <h2 style={{ fontSize: '24px', fontWeight: 500, letterSpacing: '-.02em', color: '#1A1714' }}>The Persona Library</h2>
          </div>
          <p style={{ fontSize: '14px', color: '#6B6460', maxWidth: '240px', textAlign: 'right', lineHeight: 1.6 }}>
            16 distinct minds. Pick any four to build your panel. Different problems call for different thinkers.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {ACTIVE_PERSONAS.map((persona, idx) => (
            <div
              key={persona.name}
              onMouseEnter={() => setPersonaHovered(idx)}
              onMouseLeave={() => setPersonaHovered(null)}
              style={{
                border: personaHovered === idx ? `0.5px solid ${persona.color}` : '0.5px solid #E0D8D0',
                borderRadius: '12px',
                padding: '1rem',
                background: '#FFFFFF',
                transform: personaHovered === idx ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)',
                boxShadow: personaHovered === idx ? '0 8px 24px rgba(26,23,20,0.08)' : 'none',
                transition: 'all 200ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '.6rem' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: persona.color, transform: personaHovered === idx ? 'scale(1.6)' : 'scale(1)', boxShadow: personaHovered === idx ? `0 0 8px ${persona.color}` : 'none', transition: 'all 200ms ease' }} className="breathe" />
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#1A1714' }}>{persona.name}</span>
              </div>
              <p style={{ fontSize: '12px', fontStyle: 'italic', color: '#6B6460', lineHeight: 1.5 }}>{persona.quote}</p>
            </div>
          ))}

          {LOCKED_PERSONAS.map((persona, idx) => (
            <div
              key={persona.name}
              onMouseEnter={() => setLockedPersonaHovered(idx)}
              onMouseLeave={() => setLockedPersonaHovered(null)}
              style={{
                border: '0.5px solid #E0D8D0',
                borderRadius: '12px',
                padding: '1rem',
                background: '#F7F5F2',
                opacity: lockedPersonaHovered === idx ? 0.85 : 0.65,
                position: 'relative',
                transform: lockedPersonaHovered === idx ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'all 200ms ease',
              }}
            >
              {lockedPersonaHovered === idx && (
                <div style={{ position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)', background: '#1A1714', color: '#FAF7F4', fontSize: '11px', padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap', opacity: 1, transition: 'opacity 150ms ease' }}>
                  Unlocking soon
                </div>
              )}
              <Lock style={{ position: 'absolute', top: '10px', right: '10px', width: '10px', height: '10px', color: '#6B6460' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '.6rem' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4B8AE' }} />
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#1A1714' }}>{persona.name}</span>
              </div>
              <p style={{ fontSize: '12px', fontStyle: 'italic', color: '#6B6460', lineHeight: 1.5 }}>{persona.quote}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: '14px', color: '#6B6460', marginTop: '1rem' }}>
          12 more personas unlocking soon — <span style={{ color: '#C4956A' }}>join the waitlist</span>
        </p>
      </section>

      {/* The Four Minds */}
      <section ref={agentMindsReveal.ref} style={{ maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px' }} className={agentMindsReveal.isVisible ? 'scroll-reveal' : ''}>
        <h2 style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '-.02em', color: '#1A1714', marginBottom: '.4rem' }}>Meet the four minds</h2>
        <p style={{ fontSize: '14px', color: '#6B6460', marginBottom: '1.5rem' }}>Active now. Each built with a different temperature and reasoning mandate.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { name: 'The Analyst', color: '#8C9BAB', bg: '#EEF0F2', temp: 0.2, quote: 'I find the flaw in everything.' },
            { name: 'The Philosopher', color: '#9B8FAA', bg: '#F0EDF2', temp: 0.7, quote: 'I question the premise first.' },
            { name: 'The Pragmatist', color: '#8AA899', bg: '#EDF2EF', temp: 0.5, quote: 'I only care what works.' },
            { name: 'The Contrarian', color: '#B0977E', bg: '#F2EDE8', temp: 1.0, quote: 'I say what no one else will.' },
          ].map((agent) => (
            <div key={agent.name} style={{ background: agent.bg, borderRadius: '14px', padding: '1.2rem' }}>
              <div style={{ height: '2px', background: agent.color, borderRadius: '999px', marginBottom: '1rem' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '.6rem' }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: agent.color }} className="breathe" />
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{agent.name}</span>
              </div>
              <p style={{ fontSize: '13px', color: '#6B6460', fontStyle: 'italic', lineHeight: 1.5, marginBottom: '.8rem' }}>{agent.quote}</p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', color: '#6B6460' }}>temp</span>
                <div style={{ flex: 1, height: '2px', background: 'rgba(0,0,0,0.1)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: agent.color, opacity: 0.7, width: `${agent.temp * 100}%`, borderRadius: '999px' }} />
                </div>
                <span style={{ fontSize: '10px', color: '#6B6460' }}>{agent.temp}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Band */}
      <section ref={ctaBandReveal.ref} style={{ maxWidth: '1080px', margin: '4rem auto 0', padding: '0 24px' }} className={ctaBandReveal.isVisible ? 'scroll-reveal' : ''}>
        <div style={{ background: '#1A1714', borderRadius: '20px', padding: '2.5rem 3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(250,247,244,0.4)', marginBottom: '.6rem' }}>Ready to think differently?</p>
            <h2 style={{ fontSize: '28px', fontWeight: 500, color: '#FAF7F4', letterSpacing: '-.02em', lineHeight: 1.2 }}>
              Stop asking one AI. Start asking <span style={{ color: '#C4956A', fontStyle: 'italic' }}>four.</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
            <button
              ref={ctaButtonRef}
              onClick={() => navigate('/app')}
              onMouseMove={handleCTAButtonMouseMove}
              onMouseLeave={handleCTAButtonMouseLeave}
              style={{
                padding: '12px 28px',
                borderRadius: '999px',
                background: '#C4956A',
                color: '#FAF7F4',
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 150ms',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
            >
              Try Arena free →
            </button>
            <span style={{ fontSize: '12px', color: 'rgba(250,247,244,0.4)' }}>No signup · 5 free questions</span>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
