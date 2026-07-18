import { useEffect, useState, useRef, useCallback, useReducer } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Icons } from '../components/Icons';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';
import { useTier } from '../context/TierContext';
import { prefersReducedMotion, scrollBehavior } from '../lib/motion';
import '../styles/home.css';

function useScrollReveal<T extends HTMLElement>(delay = 0) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return {
    ref,
    className: isVisible ? 'blur-reveal visible' : 'blur-reveal',
    style: { animationDelay: `${delay}ms` },
  };
}

const LETTER_STAGGER_SECONDS = 0.04;
const LETTER_LINE_GAP = 2;

function springText(text: string, startIndex: number) {
  return text.split('').map((char, index) => (
    <span
      key={`${text}-${startIndex}-${index}`}
      aria-hidden="true"
      className="home-hero-letter"
      style={{
        display: 'inline-block',
        animation: `letterDrop 0.6s cubic-bezier(0.34,1.56,0.64,1) ${(startIndex + index) * LETTER_STAGGER_SECONDS}s both`,
        whiteSpace: char === ' ' ? 'pre' : 'normal',
      }}
    >
      {char}
    </span>
  ));
}

function renderDebateText(text: string, agent: HeroAgent, isTyping: boolean) {
  const tokens = text.split(/(\s+)/);

  return tokens.map((token, tokenIndex) => {
    if (/^\s+$/.test(token)) {
      return (
        <span
          key={`${agent}-space-${tokenIndex}`}
          style={{
            whiteSpace: 'pre-wrap',
          }}
        >
          {token}
        </span>
      );
    }

    return (
      <span
        key={`${agent}-token-${tokenIndex}`}
        style={{
          display: 'inline-block',
          animation: isTyping && tokenIndex === tokens.length - 1 ? 'heroLetterPop 80ms ease' : undefined,
        }}
      >
        {token}
      </span>
    );
  });
}

function CountUp({ target, duration = 800 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          observer.unobserve(entry.target);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;

    const steps = target;
    let currentStep = 0;

    const interval = window.setInterval(() => {
      currentStep += 1;
      setCount(currentStep);
      setIsBouncing(true);

      const bounceTimer = window.setTimeout(() => {
        setIsBouncing(false);
      }, 150);

      if (currentStep >= steps) {
        window.clearInterval(interval);
      }

      if (currentStep >= steps) {
        window.setTimeout(() => window.clearTimeout(bounceTimer), 0);
      }
    }, duration / steps);

    return () => {
      window.clearInterval(interval);
    };
  }, [started, target, duration]);

  const words = ['one', 'two', 'three', 'four'];

  return (
    <span
      ref={ref}
      style={{
        color: '#C4956A',
        display: 'inline-block',
        minWidth: '48px',
        transition: 'transform 150ms cubic-bezier(0.34,1.56,0.64,1)',
        transform: isBouncing ? 'scale(1.2)' : started ? 'scale(1)' : 'scale(0.8)',
      }}
    >
      {count === 0 ? 'one' : words[count - 1]}
    </span>
  );
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

const MORE_PERSONAS = [
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

const HERO_AGENT_ORDER = ['Pragmatist', 'Analyst', 'Contrarian', 'Philosopher'] as const;

type HeroAgent = (typeof HERO_AGENT_ORDER)[number];
type DebatePhase = 'typing' | 'scoring' | 'pausing' | 'transitioning';
type AgentState = 'idle' | 'listening' | 'thinking' | 'typing' | 'winning' | 'losing';
type HeroTopicIndex = 0 | 1 | 2;
type HeroRound = 1 | 2 | 3;
type ReactionState = 'none' | 'analyst' | 'philosopher' | 'pragmatist' | 'contrarian';

const HERO_AGENT_COLORS: Record<HeroAgent, string> = {
  Pragmatist: '#8AA899',
  Analyst: '#8C9BAB',
  Contrarian: '#B0977E',
  Philosopher: '#9B8FAA',
};

const HERO_TYPING_PROFILES: Record<
  HeroAgent,
  {
    thinkingTime: number;
    baseSpeed: number;
    getDelay?: (index: number, total: number) => number;
    pauseAt?: number;
    pauseDuration?: number;
  }
> = {
  Analyst: {
    thinkingTime: 800,
    baseSpeed: 28,
  },
  Philosopher: {
    thinkingTime: 1200,
    baseSpeed: 38,
    getDelay: (index, total) => (index < total * 0.25 ? 44 : 32),
    pauseAt: 0.4,
    pauseDuration: 600,
  },
  Pragmatist: {
    thinkingTime: 400,
    baseSpeed: 18,
  },
  Contrarian: {
    thinkingTime: 600,
    baseSpeed: 22,
    getDelay: (index, total) => (index < total * 0.3 ? 16 : 22),
    pauseAt: 0.3,
    pauseDuration: 400,
  },
};

const HERO_ROUND_ORDERS: Record<HeroRound, readonly HeroAgent[]> = {
  1: ['Pragmatist', 'Analyst', 'Contrarian', 'Philosopher'],
  2: ['Pragmatist', 'Analyst', 'Contrarian', 'Philosopher'],
  3: ['Pragmatist', 'Analyst', 'Contrarian', 'Philosopher'],
};

const HERO_DEBATES = [
  {
    question: 'Most important skill?',
    winner: 'Pragmatist' as HeroAgent,
    finalScores: {
      Pragmatist: 100,
      Analyst: 78,
      Contrarian: 70,
      Philosopher: 65,
    },
    rounds: {
      1: {
        Pragmatist: 'Sales. Every other skill becomes more valuable when you can convince people to act on it.',
        Analyst: 'The premise is flawed — importance depends entirely on context, role, and what problem you are solving.',
        Contrarian: 'Everyone chases technical skills while the real edge is the ability to sit with boredom and think.',
        Philosopher: 'Before answering, we should ask what we mean by important — financially? Existentially? Socially?',
      },
      2: {
        Pragmatist: 'Context is an excuse. Sales works everywhere. Show me a domain where convincing people is irrelevant.',
        Analyst: 'Sales only works if the product has merit. Critical thinking is what builds the product.',
        Contrarian: 'You are both optimizing for performance in a system. I am asking what makes the system.',
        Philosopher: 'The Pragmatist sells. The Analyst critiques. Neither asks why we are doing any of this.',
      },
      3: {
        Pragmatist: 'Learn to sell. Everything else is optional.',
        Analyst: 'Thinking clearly beats talking smoothly every time.',
        Contrarian: 'Boredom tolerance. That is it.',
        Philosopher: 'You are all answering the wrong question.',
      },
    } satisfies Record<HeroRound, Record<HeroAgent, string>>,
  },
  {
    question: 'Is AI replacing jobs?',
    winner: 'Contrarian' as HeroAgent,
    finalScores: {
      Pragmatist: 60,
      Analyst: 75,
      Contrarian: 88,
      Philosopher: 78,
    },
    rounds: {
      1: {
        Pragmatist: 'In the next 5 years: yes for repetitive cognitive work. No for anything requiring physical presence or judgment.',
        Analyst: 'Historically automation displaces specific tasks and creates new categories. The data does not support mass permanent unemployment.',
        Contrarian: 'AI replaces tasks not jobs and most people confuse the two because they do not understand what they actually do all day.',
        Philosopher: 'The question assumes jobs are natural phenomena rather than social constructs we invented and can reinvent.',
      },
      2: {
        Pragmatist: 'Stop theorizing. Retrain now or get replaced. That is the only relevant answer.',
        Analyst: 'Speed of transition is empirically contested. Fear is outrunning evidence.',
        Contrarian: 'Historically is doing a lot of work there. This transition is categorically faster.',
        Philosopher: 'Fast or slow misses the point. We are asking machines to give life meaning. That is new.',
      },
      3: {
        Pragmatist: 'Learn the tools or become one.',
        Analyst: 'The data says adapt. So adapt.',
        Contrarian: 'AI exposes who was never really working.',
        Philosopher: 'We built machines to free us and we are terrified.',
      },
    } satisfies Record<HeroRound, Record<HeroAgent, string>>,
  },
  {
    question: 'Should you start a startup?',
    winner: 'Analyst' as HeroAgent,
    finalScores: {
      Pragmatist: 72,
      Analyst: 90,
      Contrarian: 65,
      Philosopher: 78,
    },
    rounds: {
      1: {
        Pragmatist: 'Talk to 20 potential customers before writing a line of code. If you cannot do that, you are not ready.',
        Analyst: 'Only if you have identified a specific unsolved problem and evidence that people will pay you to solve it.',
        Contrarian: 'Most people who want to start a startup want to escape their manager. That is not a business model.',
        Philosopher: 'The startup has become the dominant narrative for ambition. Worth asking if the story is serving you or the other way around.',
      },
      2: {
        Pragmatist: 'Philosophy does not pay salaries. Customer discovery does.',
        Analyst: 'Evidence of demand is non-negotiable. Passion is not evidence. Payments are evidence.',
        Contrarian: 'You are all assuming the goal is a successful company. Most people just want freedom.',
        Philosopher: 'The Analyst measures. The Pragmatist tests. Neither asks if this is how you want to spend your life.',
      },
      3: {
        Pragmatist: 'Talk to customers first. Everything else is noise.',
        Analyst: 'Solve a real problem or do not start.',
        Contrarian: 'Most startups are just expensive therapy.',
        Philosopher: 'Know why before you ask how.',
      },
    } satisfies Record<HeroRound, Record<HeroAgent, string>>,
  },
] as const;

type DebateState = {
  topic: HeroTopicIndex;
  displayedTopic: HeroTopicIndex;
  round: HeroRound;
  phase: DebatePhase;
  currentTypingAgent: HeroAgent | null;
  agentStates: Record<HeroAgent, AgentState>;
  agentTexts: Record<HeroAgent, string>;
  agentScores: Record<HeroAgent, number>;
  winnerId: HeroAgent | null;
  typingCursor: Record<HeroAgent, boolean>;
  roundVisible: boolean;
  topicLabelVisible: boolean;
  topicLabelDirection: 'left' | 'right' | 'center';
  scoreBarsVisible: boolean;
  anticipation: boolean;
  overshootAgent: HeroAgent | null;
  satisfiedAgent: HeroAgent | null;
  reactions: Record<HeroAgent, ReactionState>;
  roundTransitioning: boolean;
};

type DebateAction =
  | { type: 'SET_PHASE'; phase: DebatePhase }
  | { type: 'SET_TOPIC_LABEL'; visible: boolean; direction: DebateState['topicLabelDirection'] }
  | { type: 'SET_ROUND'; round: HeroRound }
  | { type: 'SET_TOPIC'; topic: HeroTopicIndex; displayedTopic?: HeroTopicIndex }
  | { type: 'SET_AGENT_STATE'; agent: HeroAgent; state: AgentState }
  | { type: 'SET_AGENT_STATES'; states: Partial<Record<HeroAgent, AgentState>> }
  | { type: 'SET_ALL_AGENT_STATES'; state: AgentState }
  | { type: 'SET_AGENT_TEXT'; agent: HeroAgent; text: string }
  | { type: 'CLEAR_AGENT_TEXTS' }
  | { type: 'SET_CURRENT_TYPING_AGENT'; agent: HeroAgent | null }
  | { type: 'SET_TYPING_CURSOR'; agent: HeroAgent; visible: boolean }
  | { type: 'SET_ALL_TYPING_CURSORS'; visible: boolean }
  | { type: 'SET_AGENT_SCORE'; agent: HeroAgent; score: number }
  | { type: 'SET_ALL_AGENT_SCORES'; scores: Record<HeroAgent, number> }
  | { type: 'RESET_SCORES' }
  | { type: 'SET_WINNER'; winnerId: HeroAgent | null }
  | { type: 'SET_SCORE_BARS_VISIBLE'; visible: boolean }
  | { type: 'SET_ANTICIPATION'; value: boolean }
  | { type: 'SET_OVERSHOOT_AGENT'; agent: HeroAgent | null }
  | { type: 'SET_SATISFIED_AGENT'; agent: HeroAgent | null }
  | { type: 'SET_REACTIONS'; reactions: Record<HeroAgent, ReactionState> }
  | { type: 'SET_ROUND_TRANSITIONING'; value: boolean }
  | { type: 'RESET_TOPIC_STATE'; topic: HeroTopicIndex; round: HeroRound };

function createAgentRecord<T>(valueFactory: (agent: HeroAgent) => T): Record<HeroAgent, T> {
  return {
    Pragmatist: valueFactory('Pragmatist'),
    Analyst: valueFactory('Analyst'),
    Contrarian: valueFactory('Contrarian'),
    Philosopher: valueFactory('Philosopher'),
  };
}

function createInitialDebateState(): DebateState {
  return {
    topic: 0,
    displayedTopic: 0,
    round: 1,
    phase: 'typing',
    currentTypingAgent: null,
    agentStates: createAgentRecord(() => 'idle'),
    agentTexts: createAgentRecord(() => ''),
    agentScores: createAgentRecord(() => 0),
    winnerId: null,
    typingCursor: createAgentRecord(() => false),
    roundVisible: true,
    topicLabelVisible: true,
    topicLabelDirection: 'center',
    scoreBarsVisible: false,
    anticipation: false,
    overshootAgent: null,
    satisfiedAgent: null,
    reactions: createAgentRecord(() => 'none'),
    roundTransitioning: false,
  };
}

function debateReducer(state: DebateState, action: DebateAction): DebateState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_TOPIC_LABEL':
      return {
        ...state,
        topicLabelVisible: action.visible,
        topicLabelDirection: action.direction,
      };
    case 'SET_ROUND':
      return { ...state, round: action.round, roundVisible: true };
    case 'SET_TOPIC':
      return {
        ...state,
        topic: action.topic,
        displayedTopic: action.displayedTopic ?? action.topic,
      };
    case 'SET_AGENT_STATE':
      return {
        ...state,
        agentStates: { ...state.agentStates, [action.agent]: action.state },
      };
    case 'SET_AGENT_STATES':
      return {
        ...state,
        agentStates: { ...state.agentStates, ...action.states },
      };
    case 'SET_ALL_AGENT_STATES':
      return {
        ...state,
        agentStates: createAgentRecord(() => action.state),
      };
    case 'SET_AGENT_TEXT':
      return {
        ...state,
        agentTexts: { ...state.agentTexts, [action.agent]: action.text },
      };
    case 'CLEAR_AGENT_TEXTS':
      return {
        ...state,
        agentTexts: createAgentRecord(() => ''),
      };
    case 'SET_CURRENT_TYPING_AGENT':
      return {
        ...state,
        currentTypingAgent: action.agent,
      };
    case 'SET_TYPING_CURSOR':
      return {
        ...state,
        typingCursor: { ...state.typingCursor, [action.agent]: action.visible },
      };
    case 'SET_ALL_TYPING_CURSORS':
      return {
        ...state,
        typingCursor: createAgentRecord(() => action.visible),
      };
    case 'SET_AGENT_SCORE':
      return {
        ...state,
        agentScores: { ...state.agentScores, [action.agent]: action.score },
      };
    case 'SET_ALL_AGENT_SCORES':
      return {
        ...state,
        agentScores: action.scores,
      };
    case 'RESET_SCORES':
      return {
        ...state,
        agentScores: createAgentRecord(() => 0),
      };
    case 'SET_WINNER':
      return {
        ...state,
        winnerId: action.winnerId,
      };
    case 'SET_SCORE_BARS_VISIBLE':
      return {
        ...state,
        scoreBarsVisible: action.visible,
      };
    case 'SET_ANTICIPATION':
      return {
        ...state,
        anticipation: action.value,
      };
    case 'SET_OVERSHOOT_AGENT':
      return {
        ...state,
        overshootAgent: action.agent,
      };
    case 'SET_SATISFIED_AGENT':
      return {
        ...state,
        satisfiedAgent: action.agent,
      };
    case 'SET_REACTIONS':
      return {
        ...state,
        reactions: action.reactions,
      };
    case 'SET_ROUND_TRANSITIONING':
      return {
        ...state,
        roundTransitioning: action.value,
      };
    case 'RESET_TOPIC_STATE':
      return {
        ...createInitialDebateState(),
        topic: action.topic,
        displayedTopic: action.topic,
        round: action.round,
      };
    default:
      return state;
  }
}

function formatQuickAccessTierLabel(tier: string): string {
  const t = tier.toUpperCase();
  if (t === 'PRO') return 'Pro';
  if (t === 'PLUS') return 'Plus';
  if (t === 'FREE') return 'Free';
  if (t === 'GUEST') return 'Guest';
  return tier;
}

export function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { tier } = useTier();
  const [quickOpen, setQuickOpen] = useState(false);
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const [, setPromptPhase] = useState<'visible' | 'exiting' | 'entering'>('visible');
  const [isPromptHovered] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const giant4Ref = useRef<HTMLDivElement>(null);
  const ctaButtonRef = useRef<HTMLButtonElement>(null);
  const [heroCardTransforms, setHeroCardTransforms] = useState<Record<number, string>>({});
  const [heroCardHovered, setHeroCardHovered] = useState<number | null>(null);
  const [manifestoHovered, setManifestoHovered] = useState<number | null>(null);
  const [comparisonHovered, setComparisonHovered] = useState<'left' | 'right' | null>(null);
  const [howItWorksHovered, setHowItWorksHovered] = useState<number | null>(null);
  const [personaHovered, setPersonaHovered] = useState<number | null>(null);
  const [morePersonaHovered, setMorePersonaHovered] = useState<number | null>(null);
  const [debateState, dispatchDebate] = useReducer(debateReducer, undefined, createInitialDebateState);
  const debateStateRef = useRef<DebateState>(createInitialDebateState());
  const debateMountedRef = useRef(true);
  const debateTimeoutsRef = useRef<number[]>([]);

  const tickerReveal = useScrollReveal<HTMLDivElement>(0);
  const manifestoReveal = useScrollReveal<HTMLElement>(40);
  const comparisonReveal = useScrollReveal<HTMLElement>(80);
  const howItWorksReveal = useScrollReveal<HTMLElement>(120);
  const personaLibraryReveal = useScrollReveal<HTMLElement>(160);
  const agentMindsReveal = useScrollReveal<HTMLElement>(200);
  const ctaBandReveal = useScrollReveal<HTMLElement>(240);

  const line1 = 'Ask once.';
  const line2 = 'Hear four';
  const line3 = 'truths.';
  const line2StartIndex = line1.length + LETTER_LINE_GAP;
  const line3StartIndex = line2StartIndex + line2.length + LETTER_LINE_GAP;
  const activeTopic = HERO_DEBATES[debateState.displayedTopic];

  useEffect(() => {
    debateStateRef.current = debateState;
  }, [debateState]);

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
    const root = document.querySelector('.home-page-root') as HTMLElement | null;
    const reduce = prefersReducedMotion();

    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollHeight > 0 ? (window.scrollY / scrollHeight) * 100 : 0;
      setScrollProgress(progress);
      if (root) {
        root.style.setProperty('--home-scroll', `${Math.min(100, Math.max(0, progress))}%`);
      }

      if (giant4Ref.current && !reduce) {
        giant4Ref.current.style.transform = `translate3d(0, ${window.scrollY * 0.12}px, 0)`;
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Subtle pointer parallax on ambient orbs — cream atmosphere depth only.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const root = document.querySelector('.home-page-root') as HTMLElement | null;
    if (!root) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const nx = (e.clientX / window.innerWidth - 0.5) * 18;
        const ny = (e.clientY / window.innerHeight - 0.5) * 14;
        root.style.setProperty('--home-mx', `${nx.toFixed(2)}px`);
        root.style.setProperty('--home-my', `${ny.toFixed(2)}px`);
      });
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  useEffect(() => {
    if (!quickOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onPointer = (e: MouseEvent) => {
      const el = document.getElementById('quick-access-widget');
      if (el && !el.contains(e.target as Node)) {
        setQuickOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [quickOpen]);

  useEffect(() => {
    debateMountedRef.current = true;

    const safeDispatch = (action: DebateAction) => {
      if (debateMountedRef.current) {
        dispatchDebate(action);
      }
    };

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(() => resolve(), ms);
        debateTimeoutsRef.current.push(timeoutId);
      });

    const setListeningForOthers = (activeAgent: HeroAgent) => {
      const nextStates = createAgentRecord((agent) => {
        if (agent === activeAgent) {
          return debateStateRef.current.agentStates[agent];
        }
        return 'listening';
      });
      safeDispatch({ type: 'SET_AGENT_STATES', states: nextStates });
    };

    const triggerReactions = async (activeAgent: HeroAgent) => {
      await wait(200);
      if (!debateMountedRef.current) return;

      safeDispatch({
        type: 'SET_REACTIONS',
        reactions: createAgentRecord((agent) => {
          if (agent === activeAgent) return 'none';
          if (agent === 'Analyst') return 'analyst';
          if (agent === 'Philosopher') return 'philosopher';
          if (agent === 'Pragmatist') return 'pragmatist';
          return 'contrarian';
        }),
      });

      await wait(600);
      safeDispatch({ type: 'SET_REACTIONS', reactions: createAgentRecord(() => 'none') });
    };

    const typeResponse = async (agent: HeroAgent, response: string) => {
      const profile = HERO_TYPING_PROFILES[agent];
      let builtText = '';
      let pauseUsed = false;

      safeDispatch({ type: 'SET_AGENT_TEXT', agent, text: '' });
      safeDispatch({ type: 'SET_CURRENT_TYPING_AGENT', agent });
      safeDispatch({ type: 'SET_TYPING_CURSOR', agent, visible: true });
      safeDispatch({ type: 'SET_AGENT_STATE', agent, state: 'typing' });
      safeDispatch({ type: 'SET_SCORE_BARS_VISIBLE', visible: false });
      setListeningForOthers(agent);

      for (let index = 0; index < response.length; index += 1) {
        if (!debateMountedRef.current) return;

        builtText += response[index];
        safeDispatch({ type: 'SET_AGENT_TEXT', agent, text: builtText });

        if (profile.pauseAt && profile.pauseDuration && !pauseUsed && index >= Math.floor(response.length * profile.pauseAt)) {
          pauseUsed = true;
          await wait(profile.pauseDuration);
        }

        const delay = profile.getDelay ? profile.getDelay(index, response.length) : profile.baseSpeed;
        await wait(delay);
      }

      safeDispatch({ type: 'SET_TYPING_CURSOR', agent, visible: false });
      safeDispatch({ type: 'SET_CURRENT_TYPING_AGENT', agent: null });
      safeDispatch({ type: 'SET_AGENT_STATE', agent, state: 'idle' });
    };

    const runScoringMoment = async (topicIndex: HeroTopicIndex) => {
      const previousWinner = debateStateRef.current.winnerId;
      const topic = HERO_DEBATES[topicIndex];

      safeDispatch({ type: 'SET_PHASE', phase: 'scoring' });
      safeDispatch({ type: 'SET_SCORE_BARS_VISIBLE', visible: true });
      safeDispatch({ type: 'RESET_SCORES' });
      safeDispatch({ type: 'SET_OVERSHOOT_AGENT', agent: null });
      await wait(400);

      safeDispatch({ type: 'SET_ANTICIPATION', value: true });
      await wait(400);
      safeDispatch({ type: 'SET_ANTICIPATION', value: false });

      safeDispatch({ type: 'SET_ALL_AGENT_SCORES', scores: topic.finalScores });
      safeDispatch({ type: 'SET_OVERSHOOT_AGENT', agent: topic.winner });
      await wait(750);

      const nextStates = createAgentRecord((agent) => {
        if (agent === topic.winner) return 'winning';
        if (previousWinner === agent && previousWinner !== topic.winner) return 'losing';
        return 'idle';
      });
      safeDispatch({ type: 'SET_AGENT_STATES', states: nextStates });
      safeDispatch({ type: 'SET_WINNER', winnerId: topic.winner });
      safeDispatch({ type: 'SET_PHASE', phase: 'pausing' });
      await wait(2000);
    };

    const runTopicTransition = async (nextTopic: HeroTopicIndex) => {
      safeDispatch({ type: 'SET_PHASE', phase: 'transitioning' });
      safeDispatch({ type: 'SET_TOPIC_LABEL', visible: false, direction: 'left' });
      safeDispatch({ type: 'SET_OVERSHOOT_AGENT', agent: null });
      safeDispatch({ type: 'SET_SATISFIED_AGENT', agent: null });
      safeDispatch({ type: 'SET_ROUND_TRANSITIONING', value: false });
      await wait(400);

      safeDispatch({ type: 'CLEAR_AGENT_TEXTS' });
      safeDispatch({ type: 'RESET_SCORES' });
      safeDispatch({ type: 'SET_WINNER', winnerId: null });
      safeDispatch({ type: 'SET_ALL_AGENT_STATES', state: 'idle' });
      safeDispatch({ type: 'SET_SCORE_BARS_VISIBLE', visible: false });
      safeDispatch({ type: 'SET_ALL_TYPING_CURSORS', visible: false });
      safeDispatch({ type: 'SET_REACTIONS', reactions: createAgentRecord(() => 'none') });
      await wait(600);

      safeDispatch({ type: 'RESET_TOPIC_STATE', topic: nextTopic, round: 1 });
      safeDispatch({ type: 'SET_TOPIC_LABEL', visible: true, direction: 'right' });
      await wait(400);
      safeDispatch({ type: 'SET_TOPIC_LABEL', visible: true, direction: 'center' });
      await wait(200);
    };

    const runDebate = async () => {
      let topicIndex: HeroTopicIndex = 0;

      await wait(200);

      while (debateMountedRef.current) {
        for (const round of [1, 2, 3] as const) {
          safeDispatch({ type: 'SET_PHASE', phase: 'typing' });
          safeDispatch({ type: 'SET_ROUND', round });

          const agentOrder = HERO_ROUND_ORDERS[round];

          for (let index = 0; index < agentOrder.length; index += 1) {
            const agent = agentOrder[index];
            const profile = HERO_TYPING_PROFILES[agent];

            if (!debateMountedRef.current) return;

            setListeningForOthers(agent);
            safeDispatch({ type: 'SET_AGENT_STATE', agent, state: 'thinking' });
            await wait(profile.thinkingTime);
            await typeResponse(agent, HERO_DEBATES[topicIndex].rounds[round][agent]);

            safeDispatch({ type: 'SET_SATISFIED_AGENT', agent });
            safeDispatch({ type: 'SET_AGENT_STATE', agent, state: 'listening' });
            await triggerReactions(agent);
            await wait(400);
            safeDispatch({ type: 'SET_SATISFIED_AGENT', agent: null });

            if (index < agentOrder.length - 1) {
              await wait(800);
            }
          }

          if (round < 3) {
            safeDispatch({ type: 'SET_PHASE', phase: 'transitioning' });
            safeDispatch({ type: 'SET_ROUND_TRANSITIONING', value: true });
            await wait(300);
            safeDispatch({ type: 'CLEAR_AGENT_TEXTS' });
            safeDispatch({ type: 'SET_SCORE_BARS_VISIBLE', visible: false });
            await wait(400);
            safeDispatch({ type: 'SET_ROUND', round: (round + 1) as HeroRound });
            safeDispatch({ type: 'SET_ROUND_TRANSITIONING', value: false });
            safeDispatch({ type: 'SET_PHASE', phase: 'typing' });
            await wait(200);
          } else {
            await wait(500);
            await runScoringMoment(topicIndex);
            await wait(3000);
          }
        }

        topicIndex = ((topicIndex + 1) % HERO_DEBATES.length) as HeroTopicIndex;
        await runTopicTransition(topicIndex);
      }
    };

    void runDebate();

    return () => {
      debateMountedRef.current = false;
      debateTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      debateTimeoutsRef.current = [];
    };
  }, []);

  const handleHeroCardMouseMove = useCallback((idx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    setHeroCardTransforms((prev) => ({
      ...prev,
      [idx]: `rotateX(${-y * 8}deg) rotateY(${x * 8}deg)`,
    }));
  }, []);

  const handleHeroCardMouseLeave = useCallback((idx: number) => {
    setHeroCardTransforms((prev) => ({
      ...prev,
      [idx]: 'rotateX(0deg) rotateY(0deg)',
    }));
    setHeroCardHovered(null);
  }, []);

  const handleCTAButtonMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ctaButtonRef.current || prefersReducedMotion()) return;
    const rect = ctaButtonRef.current.getBoundingClientRect();
    const btnCenterX = rect.left + rect.width / 2;
    const btnCenterY = rect.top + rect.height / 2;
    const distX = (e.clientX - btnCenterX) * 0.22;
    const distY = (e.clientY - btnCenterY) * 0.22;
    ctaButtonRef.current.style.transform = `translate(${distX}px, ${distY}px)`;
    ctaButtonRef.current.style.transition = 'none';
  }, []);

  const handleCTAButtonMouseLeave = useCallback(() => {
    if (!ctaButtonRef.current) return;
    ctaButtonRef.current.style.transform = 'translate(0, 0)';
    ctaButtonRef.current.style.transition = prefersReducedMotion()
      ? 'none'
      : 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)';
  }, []);

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: scrollBehavior() });
  };

  return (
    <div className="home-page-root">
      <div className="noise-overlay" aria-hidden="true" />
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
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

      {/* Reading progress — gold rail over cream track */}
      <div
        className="home-scroll-progress"
        role="progressbar"
        aria-label="Page scroll progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(scrollProgress)}
      >
        <div className="home-scroll-progress__fill" />
      </div>

      {/* Ambient atmosphere — multi-orb wash + soft mesh (pointer parallax via CSS vars) */}
      <div className="home-ambient" aria-hidden="true">
        <div className="home-ambient__wash" />
        <div className="home-ambient__orb home-ambient__orb--gold" />
        <div className="home-ambient__orb home-ambient__orb--sage" />
        <div className="home-ambient__orb home-ambient__orb--lilac" />
        <div className="home-ambient__mesh" />
      </div>

      <Navbar />

      {/* Hero Section */}
      <section className="home-hero-section" style={{ position: 'relative', padding: '64px 0 48px' }}>
        <div className="home-hero-inner" style={{ maxWidth: '1080px', margin: '0 auto', padding: '0 24px' }}>
          <div className="hero-giant-num-wrap" ref={giant4Ref} aria-hidden="true">
            <div className="hero-giant-num">4</div>
          </div>

          <div className="hero-content" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '64px', alignItems: 'start', position: 'relative', zIndex: 1 }}>
            {/* Left Column */}
            <div>
              <div className="home-hero-status">
                <span className="home-hero-status__dot" aria-hidden="true">
                  <span className="home-hero-status__dot-ring" />
                  <span className="home-hero-status__dot-core" />
                </span>
                Now live · Free to try
              </div>

              <h1 className="hero-h1" style={{ marginBottom: '1.2rem' }}>
                <span aria-label={line1} style={{ display: 'block', color: '#1A1714', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.05 }}>
                  {springText(line1, 0)}
                </span>
                <span aria-label={line2} style={{ display: 'block', WebkitTextStroke: '1.5px #1A1714', color: 'transparent', fontStyle: 'italic', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.05 }}>
                  {springText(line2, line2StartIndex)}
                </span>
                <span aria-label={line3} style={{ display: 'block', color: '#C4956A', fontStyle: 'italic', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.05 }}>
                  {springText(line3, line3StartIndex)}
                </span>
              </h1>

              <p
                className="home-hero-sub"
                style={{ marginBottom: '1.5rem', animation: 'heroSubtext 500ms ease 400ms backwards' }}
              >
                Four AI personalities with opposing worldviews compete to answer your question. Scored on logic, directness, and originality. The best answer wins — automatically.
              </p>

              <div className="hero-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem', animation: 'heroSubtext 500ms ease 400ms backwards', flexWrap: 'wrap' }}>
                <Button variant="primary" size="lg" icon={Icons.arrowRight(18)} onClick={() => navigate('/app')}>
                  Begin thinking
                </Button>
                <Button variant="secondary" size="lg" onClick={scrollToHowItWorks}>
                  Watch it work
                </Button>
              </div>
            </div>

            {/* Right Column — Live debate stage */}
            <div className="hero-right home-debate-stage" aria-label="Live debate example">
              <div className="home-debate-stage__header">
                <span className="home-debate-stage__live">
                  <span className="home-debate-stage__live-dot" aria-hidden="true" />
                  Live
                </span>
                <span
                  className="home-debate-stage__topic"
                  style={{
                    opacity: debateState.topicLabelVisible ? 1 : 0,
                    transform: debateState.topicLabelDirection === 'left'
                      ? 'translateX(-10px)'
                      : debateState.topicLabelDirection === 'right'
                        ? 'translateX(10px)'
                        : 'translateX(0)',
                  }}
                >
                  {activeTopic.question}
                </span>
                <span className="home-debate-stage__topic-rule" aria-hidden="true" />
              </div>

              <div className="home-debate-intensity" aria-hidden="true">
                <span className="home-debate-intensity__label">Intensity</span>
                <div className="home-debate-intensity__track">
                  <div
                    className="home-debate-intensity__fill"
                    style={{
                      width: debateState.round === 1 ? '33%' : debateState.round === 2 ? '66%' : '100%',
                      background:
                        debateState.round === 1
                          ? '#8AA899'
                          : debateState.round === 2
                            ? '#C4956A'
                            : '#B0977E',
                    }}
                  />
                  <div className="home-debate-intensity__ticks">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <span
                  className="home-debate-intensity__level"
                  style={{
                    color:
                      debateState.round === 1
                        ? '#8AA899'
                        : debateState.round === 2
                          ? '#C4956A'
                          : '#B0977E',
                  }}
                >
                  {debateState.round === 1 ? 'Low' : debateState.round === 2 ? 'High' : 'Peak'}
                </span>
              </div>

              <div className="home-debate-rounds" aria-label={`Round ${debateState.round} of 3`}>
                <span className="home-debate-rounds__label">Round {debateState.round} of 3</span>
                <div className="home-debate-rounds__steps">
                  {[1, 2, 3].map((step, stepIdx) => {
                    const done = step < debateState.round;
                    const active = step === debateState.round;
                    return (
                      <div key={step} className="home-debate-rounds__step">
                        {stepIdx > 0 ? (
                          <span
                            className={`home-debate-rounds__connector${done || active ? ' is-done' : ''}`}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span
                          className={`home-debate-rounds__node${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}
                        >
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="home-debate-stack">
                {HERO_AGENT_ORDER.map((agent, idx) => {
                  const agentState = debateState.agentStates[agent];
                  const isWinner = debateState.winnerId === agent;
                  const score = debateState.agentScores[agent];
                  const text = debateState.agentTexts[agent];
                  const color = HERO_AGENT_COLORS[agent];
                  const isTyping = debateState.currentTypingAgent === agent;
                  const isThinking = agentState === 'thinking';
                  const isListening = agentState === 'listening';
                  const isWinning = agentState === 'winning' || isWinner;
                  const isLosing = agentState === 'losing';
                  const isSatisfied = debateState.satisfiedAgent === agent;
                  const isTransitioning = debateState.phase === 'transitioning';
                  const reaction = debateState.reactions[agent];
                  const scorePercent = `${score}%`;
                  const overshootPercent = `${Math.min(score * 1.08, 100)}%`;
                  const cardScale = isListening ? 0.985 : 1;
                  const cardTranslateX = isListening ? -2 : 0;
                  const cardTranslateY = isWinning ? -5 : 0;
                  const cardOpacity = isListening ? 0.75 : 1;
                  const reactionRotate = reaction === 'contrarian' ? 'rotate(-0.8deg)' : 'rotate(0deg)';
                  const cardTransform = `translateX(${cardTranslateX}px) translateY(${cardTranslateY}px) scale(${cardScale}) ${reactionRotate} ${heroCardTransforms[idx] || 'rotateX(0deg) rotateY(0deg)'}`;
                  const textOpacity = isTransitioning ? 0 : 1;
                  const cardClass = [
                    'home-hero-card',
                    'debate-card',
                    isWinning ? 'is-winning' : '',
                    isListening ? 'is-listening' : '',
                    isTyping ? 'is-typing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div
                      key={agent}
                      onMouseMove={(e) => handleHeroCardMouseMove(idx, e)}
                      onMouseEnter={() => setHeroCardHovered(idx)}
                      onMouseLeave={() => handleHeroCardMouseLeave(idx)}
                      className={cardClass}
                      style={{
                        ['--debate-accent' as string]: color,
                        animation: `heroCard${idx + 1} 600ms cubic-bezier(0.16,1,0.3,1) ${300 + idx * 120}ms backwards, floatCard${idx + 1} ${[4, 5, 3.5, 4.5][idx]}s ease-in-out infinite`,
                        transform: cardTransform,
                        opacity: cardOpacity,
                        transition: heroCardHovered === idx
                          ? 'opacity 400ms ease, border-color 300ms ease, background 300ms ease, box-shadow 400ms ease'
                          : 'transform 500ms ease, opacity 400ms ease, border-color 300ms ease, background 300ms ease, box-shadow 400ms ease',
                      }}
                    >
                      <div className="debate-card__sheen" aria-hidden="true" />

                      {reaction === 'philosopher' ? (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(155,143,170,0.06)',
                            pointerEvents: 'none',
                            zIndex: 0,
                          }}
                          aria-hidden="true"
                        />
                      ) : null}

                      <div className="debate-card__meta" style={{ position: 'relative', zIndex: 1 }}>
                        <div
                          className={`debate-card__avatar${!isSatisfied ? ' breathe' : ''}`}
                          style={{
                            background: color,
                            animation: reaction === 'analyst'
                              ? 'analystFlicker 300ms ease'
                              : isSatisfied
                              ? 'dotSatisfied 400ms ease'
                              : `breathe ${isThinking ? 1 : isTyping ? 2 : isListening ? 4 : 2.4}s ease-in-out infinite`,
                          }}
                        />
                        <span className="debate-card__name">{agent}</span>
                        <span
                          className="debate-card__trophy"
                          style={{
                            opacity: isWinning ? 1 : 0,
                            transform: isWinning ? 'scale(1)' : 'scale(0.5)',
                            animation: isWinning ? 'trophyPop 400ms cubic-bezier(0.34,1.56,0.64,1)' : 'none',
                          }}
                          aria-hidden={!isWinning}
                        >
                          🏆
                        </span>
                        <div
                          className={`debate-card__badge${isWinning ? ' is-winner' : ''}`}
                          style={{
                            opacity: isWinning ? 1 : 0.85,
                            transform: reaction === 'pragmatist' ? 'scale(1.15)' : isWinning ? 'scale(1)' : 'scale(0.96)',
                          }}
                        >
                          {isWinning ? `Winner · ${activeTopic.finalScores[agent]}` : activeTopic.finalScores[agent]}
                        </div>
                      </div>

                      <div className="debate-card__typing-hint" style={{ position: 'relative', zIndex: 1 }}>
                        {isThinking ? <span className="debate-ellipsis" /> : null}
                      </div>

                      <p
                        className="dc-text"
                        style={{
                          position: 'relative',
                          zIndex: 1,
                          opacity: textOpacity,
                          transform: isTransitioning ? 'translateY(-8px)' : 'translateY(0)',
                          transition: `opacity 200ms ease ${idx * 60}ms, transform 200ms ease ${idx * 60}ms`,
                        }}
                      >
                        {renderDebateText(text, agent, isTyping)}
                        {debateState.typingCursor[agent] ? (
                          <span
                            className="debate-card__caret"
                            style={{ background: color }}
                            aria-hidden="true"
                          />
                        ) : null}
                      </p>

                      <div
                        className="debate-card__score"
                        style={{
                          position: 'relative',
                          zIndex: 1,
                          opacity: debateState.scoreBarsVisible ? (isLosing ? 0.5 : 1) : 0,
                          transform: debateState.anticipation ? 'scaleX(1.01)' : 'scaleX(1)',
                        }}
                      >
                        <div
                          className={
                            debateState.overshootAgent === agent && debateState.phase === 'scoring'
                              ? 'hero-score-fill hero-score-fill-overshoot'
                              : 'hero-score-fill'
                          }
                          style={
                            {
                              background: color,
                              width: debateState.scoreBarsVisible ? scorePercent : '0%',
                              transition:
                                debateState.phase === 'scoring'
                                  ? 'width 700ms cubic-bezier(0.16,1,0.3,1)'
                                  : 'width 300ms ease',
                              '--score': scorePercent,
                              '--overshoot-score': overshootPercent,
                              animationDelay: `${idx * 50}ms`,
                            } as React.CSSProperties & Record<'--score' | '--overshoot-score', string>
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Prompt ticker — live questions marquee */}
      <div
        ref={tickerReveal.ref}
        style={tickerReveal.style}
        className={`home-ticker ${tickerReveal.className}`}
        aria-label="Example questions people ask in Arena"
      >
        <div className="home-ticker__inner">
          <div className="home-ticker__label">
            <span className="home-ticker__label-dot" aria-hidden="true" />
            People ask
          </div>
          <div className="home-ticker__viewport">
            <div className="home-ticker__track">
              {/* Duplicate groups for seamless loop */}
              {[0, 1].map((group) => (
                <div className="home-ticker__group" key={group} aria-hidden={group === 1}>
                  {TICKER_ITEMS.map((item) => (
                    <div className="home-ticker__chip" key={`${group}-${item}`}>
                      <span className="home-ticker__chip-mark" aria-hidden="true">
                        →
                      </span>
                      <span className="home-ticker__chip-text">{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Manifesto Strip — three editorial beats */}
      <section
        ref={manifestoReveal.ref}
        style={manifestoReveal.style}
        className={`home-manifesto ${manifestoReveal.className}`}
        aria-label="How Arena thinks"
      >
        <p className="home-manifesto__eyebrow">The idea in three lines</p>
        <div className="home-manifesto__list" role="list">
          <div
            className={`manifesto-line${manifestoHovered === 1 ? ' is-hovered' : ''}`}
            role="listitem"
            tabIndex={0}
            onMouseEnter={() => setManifestoHovered(1)}
            onMouseLeave={() => setManifestoHovered(null)}
            onFocus={() => setManifestoHovered(1)}
            onBlur={() => setManifestoHovered(null)}
          >
            <span className="ml-index" aria-hidden="true">
              01
            </span>
            <p className="ml-text">
              <span className="ml-muted">One</span> AI gives you one answer.
            </p>
            <span className="ml-tag">The old way</span>
          </div>

          <div
            className={`manifesto-line${manifestoHovered === 2 ? ' is-hovered' : ''}`}
            role="listitem"
            tabIndex={0}
            onMouseEnter={() => setManifestoHovered(2)}
            onMouseLeave={() => setManifestoHovered(null)}
            onFocus={() => setManifestoHovered(2)}
            onBlur={() => setManifestoHovered(null)}
          >
            <span className="ml-index" aria-hidden="true">
              02
            </span>
            <p className="ml-text">
              Arena gives you{' '}
              <span className="ml-count">
                <CountUp target={4} />
              </span>{' '}
              that compete.
            </p>
            <span className="ml-tag is-arena">The Arena way</span>
          </div>

          <div
            className={`manifesto-line${manifestoHovered === 3 ? ' is-hovered' : ''}`}
            role="listitem"
            tabIndex={0}
            onMouseEnter={() => setManifestoHovered(3)}
            onMouseLeave={() => setManifestoHovered(null)}
            onFocus={() => setManifestoHovered(3)}
            onBlur={() => setManifestoHovered(null)}
          >
            <span className="ml-index" aria-hidden="true">
              03
            </span>
            <p className="ml-text">
              The best one <span className="ml-em">wins.</span>
            </p>
            <span className="ml-tag is-arena">Always</span>
          </div>
        </div>
      </section>

      {/* Comparison — One AI vs Arena */}
      <section
        ref={comparisonReveal.ref}
        style={comparisonReveal.style}
        className={`home-compare ${comparisonReveal.className}`}
        aria-labelledby="home-compare-title"
      >
        <div className="home-compare__header">
          <div>
            <p className="home-compare__eyebrow">Why Arena</p>
            <h2 className="home-compare__title" id="home-compare-title">
              Why Arena beats asking one AI
            </h2>
          </div>
          <p className="home-compare__lede">
            Same question. Different architecture. One gives comfort — the other gives contention.
          </p>
        </div>

        <div className="compare-grid">
          <span className="home-compare__vs" aria-hidden="true">
            vs
          </span>

          <article
            className={`compare-card compare-card--solo${comparisonHovered === 'left' ? ' is-hovered' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setComparisonHovered('left')}
            onMouseLeave={() => setComparisonHovered(null)}
            onFocus={() => setComparisonHovered('left')}
            onBlur={() => setComparisonHovered(null)}
          >
            <div className="compare-card__badge">
              <span className="compare-card__badge-dot" aria-hidden="true" />
              One AI
            </div>
            <h3 className="compare-card__title">Single perspective</h3>
            <ul className="compare-card__list">
              {[
                'Optimized to agree with you',
                'No competing viewpoints',
                'Confidence without challenge',
                'No ranking — all answers feel equal',
              ].map((item) => (
                <li className="compare-card__row" key={item}>
                  <span className="compare-card__icon" aria-hidden="true">
                    ✕
                  </span>
                  <p className="compare-card__text">{item}</p>
                </li>
              ))}
            </ul>
          </article>

          <article
            className={`compare-card compare-card--arena${comparisonHovered === 'right' ? ' is-hovered' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setComparisonHovered('right')}
            onMouseLeave={() => setComparisonHovered(null)}
            onFocus={() => setComparisonHovered('right')}
            onBlur={() => setComparisonHovered(null)}
          >
            <div className="compare-card__badge">
              <span className="compare-card__badge-dot" aria-hidden="true" />
              Arena
            </div>
            <h3 className="compare-card__title">Four competing minds</h3>
            <ul className="compare-card__list">
              {[
                'Four opposing worldviews on every answer',
                'Scored on logic, directness, originality',
                'Winner surfaces with a reason why',
                'Challenge, debate, go 1-on-1 on demand',
              ].map((item) => (
                <li className="compare-card__row" key={item}>
                  <span className="compare-card__icon" aria-hidden="true">
                    ✓
                  </span>
                  <p className="compare-card__text">{item}</p>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      {/* How It Works — four-step journey */}
      <section
        id="how-it-works"
        ref={howItWorksReveal.ref}
        style={howItWorksReveal.style}
        className={`home-how ${howItWorksReveal.className}`}
      >
        <div className="home-how__header">
          <div>
            <p className="home-how__eyebrow">How it works</p>
            <h2 className="home-how__title">Four steps. One clearer answer.</h2>
          </div>
          <p className="home-how__lede">
            From a single prompt to a scored winner — then as deep as you want to go.
          </p>
        </div>

        <div
          className={`home-how__rail${howItWorksReveal.className.includes('visible') || howItWorksHovered !== null ? ' is-active' : ''}`}
          aria-hidden="true"
        >
          <div
            className="home-how__rail-fill"
            style={
              howItWorksHovered !== null
                ? { width: `${((howItWorksHovered + 1) / 4) * 100}%`, animation: 'none' }
                : undefined
            }
          />
        </div>

        <div className="how-steps" role="list">
          {(
            [
              {
                num: '01',
                title: 'Ask anything',
                body: 'A question, a decision, a debate. No restrictions.',
                foot: 'Your prompt',
                accent: '#8AA899',
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 19V5M12 5l-5 5M12 5l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                num: '02',
                title: 'Four minds fire',
                body: 'All four respond simultaneously, each from a radically different angle.',
                foot: 'Parallel stream',
                accent: '#8C9BAB',
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="7" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="17" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="7" cy="16" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="17" cy="16" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                ),
              },
              {
                num: '03',
                title: 'A winner emerges',
                body: 'Scored by a fifth AI. Best answer surfaces automatically.',
                foot: 'Judge scores',
                accent: '#C4956A',
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                ),
              },
              {
                num: '04',
                title: 'Go deeper',
                body: 'Challenge, debate, or go 1-on-1. You control the depth.',
                foot: 'Your control',
                accent: '#B0977E',
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ),
              },
            ] as const
          ).map((step, idx) => {
            const isHovered = howItWorksHovered === idx;
            return (
              <div
                className={`how-step${isHovered ? ' is-hovered' : ''}`}
                key={step.num}
                role="listitem"
                onMouseEnter={() => setHowItWorksHovered(idx)}
                onMouseLeave={() => setHowItWorksHovered(null)}
                onFocus={() => setHowItWorksHovered(idx)}
                onBlur={() => setHowItWorksHovered(null)}
                tabIndex={0}
                style={{ ['--how-accent' as string]: step.accent }}
              >
                <div className="how-step__icon">{step.icon}</div>
                <div className="hs-num">{step.num}</div>
                {idx < 3 ? (
                  <div className="hs-arrow" aria-hidden="true">
                    →
                  </div>
                ) : null}
                <h3 className="how-step__title">{step.title}</h3>
                <p className="how-step__body">{step.body}</p>
                <div className="how-step__foot">
                  <span className="how-step__foot-dot" aria-hidden="true" />
                  {step.foot}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Persona Library — live product surface */}
      <section
        ref={personaLibraryReveal.ref}
        style={personaLibraryReveal.style}
        className={`home-personas ${personaLibraryReveal.className}`}
        aria-labelledby="home-personas-title"
      >
        <div className="persona-header">
          <div>
            <p className="home-personas__eyebrow">
              <span className="home-personas__eyebrow-dot" aria-hidden="true" />
              Available now
            </p>
            <h2 className="home-personas__title" id="home-personas-title">
              The Persona Library
              <span className="home-personas__title-count">16 minds</span>
            </h2>
          </div>
          <div className="home-personas__aside">
            <p className="persona-subtitle">
              Pick any four to build your panel. Different problems call for different thinkers.
            </p>
            <button
              type="button"
              className="arena-btn arena-btn--secondary arena-btn--sm"
              onClick={() => navigate('/personas')}
            >
              Build your panel →
            </button>
          </div>
        </div>

        <div className="home-personas__group">
          <p className="home-personas__group-label">Core four · default panel</p>
          <div className="persona-grid" role="list">
            {ACTIVE_PERSONAS.map((persona, idx) => {
              const hovered = personaHovered === idx;
              return (
                <article
                  key={persona.name}
                  role="listitem"
                  tabIndex={0}
                  className={`persona-card is-core${hovered ? ' is-hovered' : ''}`}
                  style={{ ['--persona-accent' as string]: persona.color }}
                  onMouseEnter={() => setPersonaHovered(idx)}
                  onMouseLeave={() => setPersonaHovered(null)}
                  onFocus={() => setPersonaHovered(idx)}
                  onBlur={() => setPersonaHovered(null)}
                >
                  <div className="persona-card__head">
                    <span className="persona-card__dot" aria-hidden="true" />
                    <span className="persona-card__name">{persona.name}</span>
                    <span className="persona-card__badge">Live</span>
                  </div>
                  <p className="persona-card__quote">{persona.quote}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="home-personas__group">
          <p className="home-personas__group-label">Also in the library</p>
          <div className="persona-grid" role="list">
            {MORE_PERSONAS.map((persona, idx) => {
              const hovered = morePersonaHovered === idx;
              return (
                <article
                  key={persona.name}
                  role="listitem"
                  tabIndex={0}
                  className={`persona-card${hovered ? ' is-hovered' : ''}`}
                  style={{ ['--persona-accent' as string]: '#C4B8AE' }}
                  onMouseEnter={() => setMorePersonaHovered(idx)}
                  onMouseLeave={() => setMorePersonaHovered(null)}
                  onFocus={() => setMorePersonaHovered(idx)}
                  onBlur={() => setMorePersonaHovered(null)}
                >
                  <div className="persona-card__head">
                    <span className="persona-card__dot" aria-hidden="true" />
                    <span className="persona-card__name">{persona.name}</span>
                  </div>
                  <p className="persona-card__quote">{persona.quote}</p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="home-personas__footer">
          <p className="home-personas__footer-text">Explore every mind and craft a custom panel.</p>
          <button
            type="button"
            className="home-personas__footer-link"
            onClick={() => navigate('/personas')}
          >
            Open full library →
          </button>
        </div>
      </section>

      {/* The Four Minds — temperature portraits */}
      <section
        ref={agentMindsReveal.ref}
        style={agentMindsReveal.style}
        className={`home-minds ${agentMindsReveal.className}`}
        aria-labelledby="home-minds-title"
      >
        <div className="home-minds__header">
          <div>
            <p className="home-minds__eyebrow">Default panel</p>
            <h2 className="home-minds__title" id="home-minds-title">
              Meet the four minds
            </h2>
          </div>
          <p className="home-minds__lede">
            Active now. Each built with a different temperature and reasoning mandate.
          </p>
        </div>

        <div className="agents-deep-grid" role="list">
          {(
            [
              {
                name: 'The Analyst',
                color: '#8C9BAB',
                bg: '#EEF0F2',
                temp: 0.2,
                band: 'Cool',
                quote: 'I find the flaw in everything.',
              },
              {
                name: 'The Philosopher',
                color: '#9B8FAA',
                bg: '#F0EDF2',
                temp: 0.7,
                band: 'Warm',
                quote: 'I question the premise first.',
              },
              {
                name: 'The Pragmatist',
                color: '#8AA899',
                bg: '#EDF2EF',
                temp: 0.5,
                band: 'Balanced',
                quote: 'I only care what works.',
              },
              {
                name: 'The Contrarian',
                color: '#B0977E',
                bg: '#F2EDE8',
                temp: 1.0,
                band: 'Hot',
                quote: 'I say what no one else will.',
              },
            ] as const
          ).map((agent) => (
            <article
              key={agent.name}
              role="listitem"
              tabIndex={0}
              className="mind-card"
              style={
                {
                  ['--mind-color' as string]: agent.color,
                  ['--mind-bg' as string]: agent.bg,
                } as React.CSSProperties
              }
            >
              <div className="mind-card__rail" aria-hidden="true">
                <div className="mind-card__rail-fill" />
              </div>
              <div className="mind-card__head">
                <span className="mind-card__dot" aria-hidden="true" />
                <span className="mind-card__name">{agent.name}</span>
                <span className="mind-card__temp-tag">{agent.band}</span>
              </div>
              <p className="mind-card__quote">{agent.quote}</p>
              <div
                className="mind-card__meter"
                aria-label={`Temperature ${agent.temp}`}
              >
                <span className="mind-card__meter-label">Temp</span>
                <div className="mind-card__meter-track">
                  <div
                    className="mind-card__meter-fill"
                    style={{ width: `${agent.temp * 100}%` }}
                  />
                </div>
                <span className="mind-card__meter-value">{agent.temp.toFixed(1)}</span>
              </div>
              <div className="mind-card__scale" aria-hidden="true">
                <span>Precise</span>
                <span>Bold</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CTA Band — closing conversion moment */}
      <section
        ref={ctaBandReveal.ref}
        style={ctaBandReveal.style}
        className={`home-cta ${ctaBandReveal.className}`}
      >
        <div className="cta-band">
          <div className="cta-band__glow cta-band__glow--a" aria-hidden="true" />
          <div className="cta-band__glow cta-band__glow--b" aria-hidden="true" />

          <div className="cta-band__copy">
            <p className="cta-band__eyebrow">
              <span className="cta-band__eyebrow-line" aria-hidden="true" />
              Ready to think differently?
            </p>
            <h2 className="cta-band-title">
              Stop asking one AI. Start asking <em>four.</em>
            </h2>
            <div className="cta-band__minds" aria-hidden="true">
              <span className="cta-band__minds-label">Four minds</span>
              <div className="cta-band__dots">
                <span className="cta-band__dot" style={{ background: '#8C9BAB' }} />
                <span className="cta-band__dot" style={{ background: '#9B8FAA' }} />
                <span className="cta-band__dot" style={{ background: '#8AA899' }} />
                <span className="cta-band__dot" style={{ background: '#B0977E' }} />
              </div>
            </div>
          </div>

          <div className="cta-band-right">
            <button
              type="button"
              className="cta-main"
              ref={ctaButtonRef}
              onClick={() => {
                if (isAuthenticated) {
                  navigate('/app');
                  return;
                }
                setRedirectIntent('/app');
                navigate('/signin');
              }}
              onMouseMove={handleCTAButtonMouseMove}
              onMouseLeave={handleCTAButtonMouseLeave}
            >
              <span className="cta-main__label">
                Try Arena free
                <span className="cta-main__arrow" aria-hidden="true">
                  →
                </span>
              </span>
            </button>
            <p className="cta-band__note">Free account · no card to start</p>
            <div className="cta-band__proof" aria-hidden="true">
              <span className="cta-band__chip">4 personas</span>
              <span className="cta-band__chip">5th judge</span>
              <span className="cta-band__chip">&lt;30s</span>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {typeof document !== 'undefined'
        ? createPortal(
            <>
              {!quickOpen ? (
                <Button
                  type="button"
                  className="quick-access-floating quick-access-floating--corner quick-access-fab"
                  variant="primary"
                  size="md"
                  icon={Icons.sparkle(16)}
                  onClick={() => setQuickOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={false}
                >
                  <span className="quick-access-fab__live" aria-hidden="true" />
                  Open Arena
                </Button>
              ) : (
                <>
                  <div
                    className="quick-access-backdrop"
                    role="presentation"
                    aria-hidden
                    onClick={() => setQuickOpen(false)}
                  />
                  <div
                    id="quick-access-widget"
                    className="quick-access-floating quick-access-floating--corner quick-access-panel"
                    role="dialog"
                    aria-label="Quick access"
                    aria-modal="true"
                  >
                    <button
                      type="button"
                      className="quick-access-panel__close"
                      aria-label="Close quick access"
                      onClick={() => setQuickOpen(false)}
                    >
                      ×
                    </button>

                    <div className="quick-access-card-inner">
                      <div className="quick-access-card__header">
                        <span className="quick-access-card__header-dot" aria-hidden="true" />
                        <span className="quick-access-card__header-kicker">Jump in</span>
                      </div>

                      <button
                        type="button"
                        className="quick-access-row"
                        onClick={() => {
                          setQuickOpen(false);
                          if (isAuthenticated) navigate('/app');
                          else {
                            setRedirectIntent('/app');
                            navigate('/signin');
                          }
                        }}
                      >
                        <span className="quick-access-row__icon quick-access-row__icon--arena" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                            <path
                              d="M12 8v5l2.5 2.5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="quick-access-row__copy">
                          <span className="quick-access-row__title">Arena</span>
                          <span className="quick-access-row__sub">Four minds debate your question</span>
                        </span>
                        <span className="quick-access-row__arrow" aria-hidden="true">
                          →
                        </span>
                      </button>

                      <button
                        type="button"
                        className="quick-access-row"
                        onClick={() => {
                          setQuickOpen(false);
                          if (isAuthenticated) navigate('/agent');
                          else {
                            setRedirectIntent('/agent');
                            navigate('/signin');
                          }
                        }}
                      >
                        <span className="quick-access-row__icon quick-access-row__icon--agent" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 2L2 7l10 5 10-5-10-5z"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M2 17l10 5 10-5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M2 12l10 5 10-5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="quick-access-row__copy">
                          <span className="quick-access-row__title">Agent</span>
                          <span className="quick-access-row__sub">7-stage deep research pipeline</span>
                        </span>
                        <span className="quick-access-row__arrow" aria-hidden="true">
                          →
                        </span>
                      </button>

                      <div
                        className={`quick-access-card__foot${isAuthenticated ? '' : ' is-guest'}`}
                      >
                        {isAuthenticated
                          ? `${formatQuickAccessTierLabel(tier)} · Active`
                          : 'Sign in to access both modes'}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
