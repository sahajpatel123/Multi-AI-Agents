import { useEffect, useState, useRef, useCallback, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

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

export function HomePage() {
  const navigate = useNavigate();
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
      <div className="noise-overlay" />
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
          <div className="hero-giant-num" ref={giant4Ref} style={{ position: 'absolute', top: '-20px', right: '15%', fontSize: '280px', fontWeight: 500, color: '#F0EBE3', pointerEvents: 'none', zIndex: 0, userSelect: 'none', letterSpacing: '-0.06em', animation: 'slowRotate 40s linear infinite', willChange: 'transform' }}>4</div>

          <div className="hero-content" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '64px', alignItems: 'start', position: 'relative', zIndex: 1 }}>
            {/* Left Column */}
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '0.5px solid #E0D8D0', borderRadius: '999px', padding: '5px 14px', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '1.4rem', animation: 'heroTagPill 400ms ease 0ms backwards' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#8AA899' }} className="breathe-slow" />
                Now live · Free to try
              </div>

              <h1 className="hero-h1" style={{ marginBottom: '1.2rem' }}>
                <span aria-label={line1} style={{ display: 'block', color: '#1A1714', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.0 }}>
                  {springText(line1, 0)}
                </span>
                <span aria-label={line2} style={{ display: 'block', WebkitTextStroke: '1.5px #1A1714', color: 'transparent', fontStyle: 'italic', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.0 }}>
                  {springText(line2, line2StartIndex)}
                </span>
                <span aria-label={line3} style={{ display: 'block', color: '#C4956A', fontStyle: 'italic', fontSize: '58px', fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.0 }}>
                  {springText(line3, line3StartIndex)}
                </span>
              </h1>

              <p style={{ fontSize: '14px', color: '#6B6460', lineHeight: 1.75, maxWidth: '320px', marginBottom: '1.5rem', animation: 'heroSubtext 500ms ease 400ms backwards' }}>
                Four AI personalities with opposing worldviews compete to answer your question. Scored on logic, directness, and originality. The best answer wins — automatically.
              </p>

              <div className="hero-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem', animation: 'heroSubtext 500ms ease 400ms backwards' }}>
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
            <div className="hero-right" style={{ position: 'relative', height: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460' }}>Live example</span>
                <span
                  style={{
                    fontSize: '13px',
                    color: '#C4956A',
                    opacity: debateState.topicLabelVisible ? 1 : 0,
                    transform: debateState.topicLabelDirection === 'left'
                      ? 'translateX(-10px)'
                      : debateState.topicLabelDirection === 'right'
                        ? 'translateX(10px)'
                        : 'translateX(0)',
                    transition: 'opacity 400ms ease, transform 400ms ease',
                  }}
                >
                  · {activeTopic.question}
                </span>
                <div style={{ flex: 1, height: '0.5px', background: '#E0D8D0' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#6B6460', minWidth: '44px' }}>
                  Intensity
                </span>
                <div style={{ flex: 1, height: '2px', borderRadius: '999px', background: '#F0EBE3', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: debateState.round === 1 ? '33%' : debateState.round === 2 ? '66%' : '100%',
                      borderRadius: '999px',
                      background: debateState.round === 1 ? '#8AA899' : debateState.round === 2 ? '#C4956A' : '#B0977E',
                      transition: 'width 600ms ease, transform 600ms ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: debateState.round === 1 ? '#8AA899' : debateState.round === 2 ? '#C4956A' : '#B0977E',
                    minWidth: '28px',
                    textAlign: 'right',
                  }}
                >
                  {debateState.round === 1 ? 'Low' : debateState.round === 2 ? 'High' : 'Peak'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460' }}>
                  Round {debateState.round} of 3
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {[1, 2, 3].map((dot) => (
                    <div
                      key={dot}
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: dot === debateState.round ? '#C4956A' : 'transparent',
                        border: dot === debateState.round ? 'none' : '0.5px solid #E0D8D0',
                        transform: dot === debateState.round ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all 300ms ease',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', perspective: '800px' }}>
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

                  return (
                    <div
                      key={agent}
                      onMouseMove={(e) => handleHeroCardMouseMove(idx, e)}
                      onMouseEnter={() => setHeroCardHovered(idx)}
                      onMouseLeave={() => handleHeroCardMouseLeave(idx)}
                      className="home-hero-card debate-card"
                      style={{
                        background: isWinning ? '#FFFCF9' : '#FFFFFF',
                        border: isWinning ? '1px solid #C4956A' : '0.5px solid #E0D8D0',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        width: '100%',
                        minHeight: '90px',
                        maxHeight: '120px',
                        overflow: 'hidden',
                        position: 'relative',
                        animation: `heroCard${idx + 1} 600ms cubic-bezier(0.16,1,0.3,1) ${300 + idx * 120}ms backwards, floatCard${idx + 1} ${[4, 5, 3.5, 4.5][idx]}s ease-in-out infinite`,
                        transformStyle: 'preserve-3d',
                        transform: cardTransform,
                        opacity: cardOpacity,
                        boxShadow: isWinning ? '0 10px 28px rgba(196,149,106,0.14)' : 'none',
                        transition: heroCardHovered === idx
                          ? 'opacity 400ms ease, border 300ms ease, background 300ms ease, box-shadow 400ms ease'
                          : 'transform 500ms ease, opacity 400ms ease, border 300ms ease, background 300ms ease, box-shadow 400ms ease',
                        willChange: 'transform, opacity',
                      }}
                    >
                      {reaction === 'philosopher' ? (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(155,143,170,0.06)',
                            opacity: 1,
                            transition: 'opacity 600ms ease',
                            pointerEvents: 'none',
                          }}
                        />
                      ) : null}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
                        <div
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            background: color,
                            animation: reaction === 'analyst'
                              ? 'analystFlicker 300ms ease'
                              : isSatisfied
                              ? 'dotSatisfied 400ms ease'
                              : `breathe ${isThinking ? 1 : isTyping ? 2 : isListening ? 4 : 2.4}s ease-in-out infinite`,
                          }}
                          className={!isSatisfied ? 'breathe' : undefined}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{agent}</span>
                        <span
                          style={{
                            opacity: isWinning ? 1 : 0,
                            transform: isWinning ? 'scale(1)' : 'scale(0.5)',
                            animation: isWinning ? 'trophyPop 400ms cubic-bezier(0.34,1.56,0.64,1)' : 'none',
                            transformOrigin: 'center',
                            fontSize: '11px',
                            lineHeight: 1,
                          }}
                        >
                          🏆
                        </span>
                        <div
                          style={{
                            marginLeft: 'auto',
                            background: isWinning ? '#C4956A' : '#F0EBE3',
                            color: isWinning ? '#FAF7F4' : '#6B6460',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            opacity: isWinning ? 1 : 0.85,
                            transform: reaction === 'pragmatist' ? 'scale(1.15)' : isWinning ? 'scale(1)' : 'scale(0.96)',
                            transition: 'opacity 300ms ease, background 300ms ease, color 300ms ease, transform 300ms ease',
                          }}
                        >
                          {isWinning ? `Winner · ${activeTopic.finalScores[agent]}` : activeTopic.finalScores[agent]}
                        </div>
                      </div>

                      <div style={{ minHeight: '16px', marginBottom: '4px' }}>
                        {isThinking ? (
                          <span style={{ fontSize: '12px', color: '#C4B8AE', fontStyle: 'italic' }} className="debate-ellipsis" />
                        ) : null}
                      </div>

                      <p
                        className="dc-text"
                        style={{
                          fontSize: '12px',
                          color: '#6B6460',
                          lineHeight: 1.6,
                          margin: '7px 0',
                          minHeight: '40px',
                          opacity: textOpacity,
                          transform: isTransitioning ? 'translateY(-8px)' : 'translateY(0)',
                          transition: `opacity 200ms ease ${idx * 60}ms, transform 200ms ease ${idx * 60}ms`,
                        }}
                      >
                        {renderDebateText(text, agent, isTyping)}
                        {debateState.typingCursor[agent] ? (
                          <span style={{ color, animation: 'blink 0.8s step-end infinite' }}>|</span>
                        ) : null}
                      </p>

                      <div
                        style={{
                          height: '2px',
                          background: '#F0EBE3',
                          borderRadius: '999px',
                          overflow: 'hidden',
                          opacity: debateState.scoreBarsVisible ? (isLosing ? 0.5 : 1) : 0,
                          transform: debateState.anticipation ? 'scaleX(1.01)' : 'scaleX(1)',
                          transition: 'opacity 200ms ease, transform 300ms ease',
                          marginTop: '8px',
                        }}
                      >
                        <div
                          className={debateState.overshootAgent === agent && debateState.phase === 'scoring' ? 'hero-score-fill hero-score-fill-overshoot' : 'hero-score-fill'}
                          style={
                            {
                              height: '100%',
                              background: color,
                              width: debateState.scoreBarsVisible ? scorePercent : '0%',
                              borderRadius: '999px',
                              transition: debateState.phase === 'scoring' ? 'width 700ms cubic-bezier(0.16,1,0.3,1)' : 'width 300ms ease',
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

      {/* Ticker */}
      <div ref={tickerReveal.ref} style={{ ...tickerReveal.style, borderTop: '0.5px solid #E0D8D0', borderBottom: '0.5px solid #E0D8D0', overflow: 'hidden', padding: '9px 0' }} className={tickerReveal.className}>
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
      <section ref={manifestoReveal.ref} style={{ ...manifestoReveal.style, maxWidth: '1080px', margin: '0 auto', padding: '48px 24px', borderTop: '0.5px solid #E0D8D0' }} className={manifestoReveal.className}>
        <div
          className="manifesto-line"
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
        >
          <span style={{ fontSize: '13px', color: '#C4956A', letterSpacing: '.1em', width: '32px' }}>01</span>
          <p className="ml-text" style={{ fontSize: '30px', fontWeight: 500, letterSpacing: '-.02em', flex: 1, lineHeight: 1.2, padding: '0 2rem', color: '#1A1714' }}>
            <span style={{ color: '#C4B8AE' }}>One</span> AI gives you one answer.
          </p>
          <span className="ml-tag" style={{ fontSize: '13px', color: '#6B6460', border: '0.5px solid #E0D8D0', padding: '4px 12px', borderRadius: '999px' }}>The old way</span>
        </div>

        <div
          className="manifesto-line"
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
        >
          <span style={{ fontSize: '13px', color: '#C4956A', letterSpacing: '.1em', width: '32px' }}>02</span>
          <p className="ml-text" style={{ fontSize: '30px', fontWeight: 500, letterSpacing: '-.02em', flex: 1, lineHeight: 1.2, padding: '0 2rem', color: '#1A1714' }}>
            Arena gives you{' '}<span style={{ fontWeight: 500, letterSpacing: manifestoHovered === 2 ? '0.01em' : '-.02em', transition: 'letter-spacing 300ms ease' }}><CountUp target={4} /></span>{' '}that compete.
          </p>
          <span className="ml-tag" style={{ fontSize: '13px', color: '#6B6460', border: '0.5px solid #E0D8D0', padding: '4px 12px', borderRadius: '999px' }}>The Arena way</span>
        </div>

        <div
          className="manifesto-line"
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
        >
          <span style={{ fontSize: '13px', color: '#C4956A', letterSpacing: '.1em', width: '32px' }}>03</span>
          <p className="ml-text" style={{ fontSize: '30px', fontWeight: 500, letterSpacing: '-.02em', flex: 1, lineHeight: 1.2, padding: '0 2rem', color: '#1A1714' }}>
            The best one <span style={{ color: '#C4956A', fontStyle: 'italic', letterSpacing: manifestoHovered === 3 ? '0.01em' : '-.02em', transition: 'letter-spacing 300ms ease' }}>wins.</span>
          </p>
          <span className="ml-tag" style={{ fontSize: '13px', color: '#6B6460', border: '0.5px solid #E0D8D0', padding: '4px 12px', borderRadius: '999px' }}>Always</span>
        </div>
      </section>

      {/* Comparison Section */}
      <section ref={comparisonReveal.ref} style={{ ...comparisonReveal.style, maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px' }} className={comparisonReveal.className}>
        <p style={{ fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '1.2rem' }}>Why Arena beats asking one AI</p>

        <div className="compare-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* One AI Card */}
          <div
            onMouseEnter={() => setComparisonHovered('left')}
            onMouseLeave={() => setComparisonHovered(null)}
            style={{
              border: '0.5px solid #E0D8D0',
              borderRadius: '16px',
              padding: '1.5rem',
              transform: comparisonHovered === 'left' ? 'translateY(-6px)' : 'translateY(0)',
              transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1)',
            }}
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
            onMouseEnter={() => setComparisonHovered('right')}
            onMouseLeave={() => setComparisonHovered(null)}
            style={{
              background: '#1A1714',
              borderRadius: '16px',
              padding: '1.5rem',
              transform: comparisonHovered === 'right' ? 'translateY(-6px)' : 'translateY(0)',
              transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1)',
            }}
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
      <section id="how-it-works" ref={howItWorksReveal.ref} style={{ ...howItWorksReveal.style, maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px' }} className={howItWorksReveal.className}>
        <p style={{ fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6460', marginBottom: '1.2rem' }}>How it works</p>

        <div className="how-steps" style={{ display: 'flex', border: '0.5px solid #E0D8D0', borderRadius: '16px', overflow: 'hidden' }}>
          {[
            { num: '01', title: 'Ask anything', body: 'A question, a decision, a debate. No restrictions.' },
            { num: '02', title: 'Four minds fire', body: 'All four respond simultaneously, each from a radically different angle.' },
            { num: '03', title: 'A winner emerges', body: 'Scored by a fifth AI. Best answer surfaces automatically.' },
            { num: '04', title: 'Go deeper', body: 'Challenge, debate, or go 1-on-1. You control the depth.' },
          ].map((step, idx) => (
            <div
              className="how-step"
              key={step.num}
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
            >
              <div className="hs-num" style={{ fontSize: '48px', fontWeight: 500, color: howItWorksHovered === idx ? 'rgba(196,149,106,0.2)' : '#F0EBE3', lineHeight: 1, marginBottom: '.8rem', transition: 'color 200ms ease' }}>{step.num}</div>
              {idx < 3 && (
                <div className="hs-arrow" style={{ position: 'absolute', right: '-10px', top: '1.5rem', width: '20px', height: '20px', borderRadius: '50%', background: '#FAF7F4', border: '0.5px solid #E0D8D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: howItWorksHovered === idx ? '#1A1714' : '#C4956A', zIndex: 2, transform: howItWorksHovered === idx ? 'scale(1.2)' : 'scale(1)', transition: 'all 200ms ease' }}>→</div>
              )}
              <h4 style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714', marginBottom: '.5rem' }}>{step.title}</h4>
              <p style={{ fontSize: '13px', color: '#6B6460', lineHeight: 1.55 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Persona Library */}
      <section ref={personaLibraryReveal.ref} style={{ ...personaLibraryReveal.style, maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px' }} className={personaLibraryReveal.className}>
        <div className="persona-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#C4956A', marginBottom: '.4rem' }}>Coming soon</p>
            <h2 style={{ fontSize: '24px', fontWeight: 500, letterSpacing: '-.02em', color: '#1A1714' }}>The Persona Library</h2>
          </div>
          <p className="persona-subtitle" style={{ fontSize: '14px', color: '#6B6460', maxWidth: '240px', textAlign: 'right', lineHeight: 1.6 }}>
            16 distinct minds. Pick any four to build your panel. Different problems call for different thinkers.
          </p>
        </div>

        <div className="persona-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
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

          {MORE_PERSONAS.map((persona, idx) => (
            <div
              key={persona.name}
              onMouseEnter={() => setMorePersonaHovered(idx)}
              onMouseLeave={() => setMorePersonaHovered(null)}
              style={{
                border: '0.5px solid #E0D8D0',
                borderRadius: '12px',
                padding: '1rem',
                background: '#FFFFFF',
                transform: morePersonaHovered === idx ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)',
                boxShadow: morePersonaHovered === idx ? '0 8px 24px rgba(26,23,20,0.08)' : 'none',
                transition: 'all 200ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '.6rem' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C4B8AE', transform: morePersonaHovered === idx ? 'scale(1.6)' : 'scale(1)', transition: 'all 200ms ease' }} />
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#1A1714' }}>{persona.name}</span>
              </div>
              <p style={{ fontSize: '12px', fontStyle: 'italic', color: '#6B6460', lineHeight: 1.5 }}>{persona.quote}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: '14px', color: '#6B6460', marginTop: '1rem' }}>
          Explore all 16 personas in the library.
        </p>
      </section>

      {/* The Four Minds */}
      <section ref={agentMindsReveal.ref} style={{ ...agentMindsReveal.style, maxWidth: '1080px', margin: '5rem auto 0', padding: '0 24px' }} className={agentMindsReveal.className}>
        <h2 style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '-.02em', color: '#1A1714', marginBottom: '.4rem' }}>Meet the four minds</h2>
        <p style={{ fontSize: '14px', color: '#6B6460', marginBottom: '1.5rem' }}>Active now. Each built with a different temperature and reasoning mandate.</p>

        <div className="agents-deep-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
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
      <section ref={ctaBandReveal.ref} style={{ ...ctaBandReveal.style, maxWidth: '1080px', margin: '4rem auto 0', padding: '0 24px' }} className={ctaBandReveal.className}>
        <div className="cta-band" style={{ background: '#1A1714', borderRadius: '20px', padding: '2.5rem 3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(250,247,244,0.4)', marginBottom: '.6rem' }}>Ready to think differently?</p>
            <h2 className="cta-band-title" style={{ fontSize: '28px', fontWeight: 500, color: '#FAF7F4', letterSpacing: '-.02em', lineHeight: 1.2 }}>
              Stop asking one AI. Start asking <span style={{ color: '#C4956A', fontStyle: 'italic' }}>four.</span>
            </h2>
          </div>
          <div className="cta-band-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
            <button
              className="cta-main"
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
