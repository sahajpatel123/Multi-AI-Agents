import { useEffect, useState, useRef, useReducer, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../components/Button';
import { Icons } from '../components/Icons';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal, Stagger, StaggerItem, Eyebrow } from '../components/motion/Reveal';
import { Monitor } from '../components/motion/ConsoleFX';
import { TiltCard, Counter } from '../components/motion/TiltCard';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';
import { useTier } from '../context/TierContext';

/* ────────────────────────── data (preserved) ────────────────────────── */

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

const ACTPERSONAS = [
  { name: 'The Analyst', color: '#6F8DAD', quote: 'I find the flaw in everything.' },
  { name: 'The Philosopher', color: '#9B8FAA', quote: 'I question the premise first.' },
  { name: 'The Pragmatist', color: '#8AA899', quote: 'I only care what works.' },
  { name: 'The Contrarian', color: '#C49A6D', quote: 'I say what no one else will.' },
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
  Analyst: '#6F8DAD',
  Contrarian: '#C49A6D',
  Philosopher: '#9B8FAA',
};

const HERO_TYPING_PROFILES: Record<HeroAgent, { thinkingTime: number; baseSpeed: number; getDelay?: (index: number, total: number) => number; pauseAt?: number; pauseDuration?: number }> = {
  Analyst: { thinkingTime: 800, baseSpeed: 28 },
  Philosopher: { thinkingTime: 1200, baseSpeed: 38, getDelay: (index, total) => (index < total * 0.25 ? 44 : 32), pauseAt: 0.4, pauseDuration: 600 },
  Pragmatist: { thinkingTime: 400, baseSpeed: 18 },
  Contrarian: { thinkingTime: 600, baseSpeed: 22, getDelay: (index, total) => (index < total * 0.3 ? 16 : 22), pauseAt: 0.3, pauseDuration: 400 },
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
    finalScores: { Pragmatist: 100, Analyst: 78, Contrarian: 70, Philosopher: 65 },
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
    finalScores: { Pragmatist: 60, Analyst: 75, Contrarian: 88, Philosopher: 78 },
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
    finalScores: { Pragmatist: 72, Analyst: 90, Contrarian: 65, Philosopher: 78 },
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

/* ────────────────────────── debate state machine (preserved) ────────── */

type DebateState = {
  topic: HeroTopicIndex; displayedTopic: HeroTopicIndex; round: HeroRound; phase: DebatePhase;
  currentTypingAgent: HeroAgent | null; agentStates: Record<HeroAgent, AgentState>;
  agentTexts: Record<HeroAgent, string>; agentScores: Record<HeroAgent, number>;
  winnerId: HeroAgent | null; typingCursor: Record<HeroAgent, boolean>;
  roundVisible: boolean; topicLabelVisible: boolean; topicLabelDirection: 'left' | 'right' | 'center';
  scoreBarsVisible: boolean; anticipation: boolean; overshootAgent: HeroAgent | null;
  satisfiedAgent: HeroAgent | null; reactions: Record<HeroAgent, ReactionState>; roundTransitioning: boolean;
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
  return { Pragmatist: valueFactory('Pragmatist'), Analyst: valueFactory('Analyst'), Contrarian: valueFactory('Contrarian'), Philosopher: valueFactory('Philosopher') };
}
function createInitialDebateState(): DebateState {
  return {
    topic: 0, displayedTopic: 0, round: 1, phase: 'typing', currentTypingAgent: null,
    agentStates: createAgentRecord(() => 'idle'), agentTexts: createAgentRecord(() => ''),
    agentScores: createAgentRecord(() => 0), winnerId: null, typingCursor: createAgentRecord(() => false),
    roundVisible: true, topicLabelVisible: true, topicLabelDirection: 'center', scoreBarsVisible: false,
    anticipation: false, overshootAgent: null, satisfiedAgent: null, reactions: createAgentRecord(() => 'none'), roundTransitioning: false,
  };
}
function debateReducer(state: DebateState, action: DebateAction): DebateState {
  switch (action.type) {
    case 'SET_PHASE': return { ...state, phase: action.phase };
    case 'SET_TOPIC_LABEL': return { ...state, topicLabelVisible: action.visible, topicLabelDirection: action.direction };
    case 'SET_ROUND': return { ...state, round: action.round, roundVisible: true };
    case 'SET_TOPIC': return { ...state, topic: action.topic, displayedTopic: action.displayedTopic ?? action.topic };
    case 'SET_AGENT_STATE': return { ...state, agentStates: { ...state.agentStates, [action.agent]: action.state } };
    case 'SET_AGENT_STATES': return { ...state, agentStates: { ...state.agentStates, ...action.states } };
    case 'SET_ALL_AGENT_STATES': return { ...state, agentStates: createAgentRecord(() => action.state) };
    case 'SET_AGENT_TEXT': return { ...state, agentTexts: { ...state.agentTexts, [action.agent]: action.text } };
    case 'CLEAR_AGENT_TEXTS': return { ...state, agentTexts: createAgentRecord(() => '') };
    case 'SET_CURRENT_TYPING_AGENT': return { ...state, currentTypingAgent: action.agent };
    case 'SET_TYPING_CURSOR': return { ...state, typingCursor: { ...state.typingCursor, [action.agent]: action.visible } };
    case 'SET_ALL_TYPING_CURSORS': return { ...state, typingCursor: createAgentRecord(() => action.visible) };
    case 'SET_AGENT_SCORE': return { ...state, agentScores: { ...state.agentScores, [action.agent]: action.score } };
    case 'SET_ALL_AGENT_SCORES': return { ...state, agentScores: action.scores };
    case 'RESET_SCORES': return { ...state, agentScores: createAgentRecord(() => 0) };
    case 'SET_WINNER': return { ...state, winnerId: action.winnerId };
    case 'SET_SCORE_BARS_VISIBLE': return { ...state, scoreBarsVisible: action.visible };
    case 'SET_ANTICIPATION': return { ...state, anticipation: action.value };
    case 'SET_OVERSHOOT_AGENT': return { ...state, overshootAgent: action.agent };
    case 'SET_SATISFIED_AGENT': return { ...state, satisfiedAgent: action.agent };
    case 'SET_REACTIONS': return { ...state, reactions: action.reactions };
    case 'SET_ROUND_TRANSITIONING': return { ...state, roundTransitioning: action.value };
    case 'RESET_TOPIC_STATE': return { ...createInitialDebateState(), topic: action.topic, displayedTopic: action.topic, round: action.round };
    default: return state;
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

const TEAL = '#7DD3C0';
const AMBER = '#E8B86D';
const INK = '#E6EDF3';
const INK2 = '#AEB9C4';
const INK3 = '#6B7785';

export function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { tier } = useTier();
  const reduce = useReducedMotion();
  const [quickOpen, setQuickOpen] = useState(false);
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const [, setPromptPhase] = useState<'visible' | 'exiting' | 'entering'>('visible');
  const [debateState, dispatchDebate] = useReducer(debateReducer, undefined, createInitialDebateState);
  const debateStateRef = useRef<DebateState>(createInitialDebateState());
  const debateMountedRef = useRef(true);
  const debateTimeoutsRef = useRef<number[]>([]);
  const activeTopic = HERO_DEBATES[debateState.displayedTopic];

  useEffect(() => { debateStateRef.current = debateState; }, [debateState]);

  // rotating example prompt
  useEffect(() => {
    const rotate = window.setTimeout(() => {
      setPromptPhase('exiting');
      const swap = window.setTimeout(() => {
        setActivePromptIndex((p) => (p + 1) % EXAMPLE_PROMPTS.length);
        setPromptPhase('entering');
        requestAnimationFrame(() => requestAnimationFrame(() => setPromptPhase('visible')));
      }, 300);
      return () => window.clearTimeout(swap);
    }, 3000);
    return () => window.clearTimeout(rotate);
  }, [activePromptIndex]);

  // quick-access portal body lock
  useEffect(() => {
    if (!quickOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e: MouseEvent) => { const el = document.getElementById('quick-access-widget'); if (el && !el.contains(e.target as Node)) setQuickOpen(false); };
    document.addEventListener('mousedown', h);
    return () => { document.body.style.overflow = prev; document.removeEventListener('mousedown', h); };
  }, [quickOpen]);

  // ─── debate loop (preserved behavior) ───
  useEffect(() => {
    debateMountedRef.current = true;
    const safeDispatch = (a: DebateAction) => { if (debateMountedRef.current) dispatchDebate(a); };
    const wait = (ms: number) => new Promise<void>((r) => { const id = window.setTimeout(() => r(), ms); debateTimeoutsRef.current.push(id); });
    const setListening = (active: HeroAgent) => { safeDispatch({ type: 'SET_AGENT_STATES', states: createAgentRecord((g) => g === active ? debateStateRef.current.agentStates[g] : 'listening' as AgentState) }); };
    const typeResponse = async (agent: HeroAgent, response: string) => {
      const profile = HERO_TYPING_PROFILES[agent];
      let built = ''; let paused = false;
      safeDispatch({ type: 'SET_AGENT_TEXT', agent, text: '' });
      safeDispatch({ type: 'SET_CURRENT_TYPING_AGENT', agent });
      safeDispatch({ type: 'SET_TYPING_CURSOR', agent, visible: true });
      safeDispatch({ type: 'SET_AGENT_STATE', agent, state: 'typing' });
      safeDispatch({ type: 'SET_SCORE_BARS_VISIBLE', visible: false });
      setListening(agent);
      for (let i = 0; i < response.length; i += 1) {
        if (!debateMountedRef.current) return;
        built += response[i];
        safeDispatch({ type: 'SET_AGENT_TEXT', agent, text: built });
        if (profile.pauseAt && profile.pauseDuration && !paused && i >= Math.floor(response.length * profile.pauseAt)) { paused = true; await wait(profile.pauseDuration); }
        await wait(profile.getDelay ? profile.getDelay(i, response.length) : profile.baseSpeed);
      }
      safeDispatch({ type: 'SET_TYPING_CURSOR', agent, visible: false });
      safeDispatch({ type: 'SET_CURRENT_TYPING_AGENT', agent: null });
      safeDispatch({ type: 'SET_AGENT_STATE', agent, state: 'idle' });
    };
    const runScoring = async (topicIndex: HeroTopicIndex) => {
      const prevWinner = debateStateRef.current.winnerId;
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
      safeDispatch({ type: 'SET_AGENT_STATES', states: createAgentRecord((g) => (g === topic.winner ? 'winning' : prevWinner === g && prevWinner !== topic.winner ? 'losing' : 'idle') as AgentState) });
      safeDispatch({ type: 'SET_WINNER', winnerId: topic.winner });
      safeDispatch({ type: 'SET_PHASE', phase: 'pausing' });
      await wait(2000);
    };
    const runTransition = async (next: HeroTopicIndex) => {
      safeDispatch({ type: 'SET_PHASE', phase: 'transitioning' });
      safeDispatch({ type: 'SET_TOPIC_LABEL', visible: false, direction: 'left' });
      safeDispatch({ type: 'SET_OVERSHOOT_AGENT', agent: null });
      safeDispatch({ type: 'SET_SATISFIED_AGENT', agent: null });
      await wait(400);
      safeDispatch({ type: 'CLEAR_AGENT_TEXTS' });
      safeDispatch({ type: 'RESET_SCORES' });
      safeDispatch({ type: 'SET_WINNER', winnerId: null });
      safeDispatch({ type: 'SET_ALL_AGENT_STATES', state: 'idle' });
      safeDispatch({ type: 'SET_SCORE_BARS_VISIBLE', visible: false });
      safeDispatch({ type: 'SET_ALL_TYPING_CURSORS', visible: false });
      safeDispatch({ type: 'SET_REACTIONS', reactions: createAgentRecord(() => 'none') });
      await wait(600);
      safeDispatch({ type: 'RESET_TOPIC_STATE', topic: next, round: 1 });
      safeDispatch({ type: 'SET_TOPIC_LABEL', visible: true, direction: 'right' });
      await wait(400);
      safeDispatch({ type: 'SET_TOPIC_LABEL', visible: true, direction: 'center' });
      await wait(200);
    };
    const run = async () => {
      let topicIndex: HeroTopicIndex = 0;
      await wait(200);
      while (debateMountedRef.current) {
        for (const round of [1, 2, 3] as const) {
          safeDispatch({ type: 'SET_PHASE', phase: 'typing' });
          safeDispatch({ type: 'SET_ROUND', round });
          for (const agent of HERO_ROUND_ORDERS[round]) {
            safeDispatch({ type: 'SET_AGENT_STATE', agent, state: 'thinking' });
            await wait(HERO_TYPING_PROFILES[agent].thinkingTime);
            if (!debateMountedRef.current) return;
            await typeResponse(agent, HERO_DEBATES[topicIndex].rounds[round][agent]);
            await wait(300);
          }
          await runScoring(topicIndex);
        }
        topicIndex = ((topicIndex + 1) % HERO_DEBATES.length) as HeroTopicIndex;
        await runTransition(topicIndex);
      }
    };
    void run();
    return () => { debateMountedRef.current = false; debateTimeoutsRef.current.forEach(clearTimeout); };
  }, []);

  const goApp = () => { if (isAuthenticated) navigate('/app'); else { setRedirectIntent('/app'); navigate('/signin'); } };

  return (
    <div className="home-page-root">
      <Navbar />

      {/* ═══════════════ HERO — control room monitor wall ═══════════════ */}
      <section className="home-hero-section" style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 28px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.05fr)', gap: 48, alignItems: 'center' }} className="home-hero-inner hero-content">
          {/* left — thesis */}
          <div>
            <Reveal>
              <Eyebrow>Multi-AI Debate Console</Eyebrow>
            </Reveal>
            <motion.h1
              initial={reduce ? false : 'hidden'}
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.045, delayChildren: 0.1 } } }}
              style={{ fontSize: 'clamp(40px, 6vw, 76px)', fontWeight: 700, lineHeight: 1.02, marginTop: 18, marginBottom: 8, color: INK, letterSpacing: '-0.03em' }}
            >
              {['Ask once.', 'Hear four', 'truths.'].map((line, li) => (
                <span key={line} style={{ display: 'block' }}>
                  {line.split('').map((ch, ci) => (
                    <motion.span
                      key={`${li}-${ci}`}
                      style={{ display: 'inline-block', whiteSpace: ch === ' ' ? 'pre' : 'normal', color: li === 2 ? AMBER : line.includes('four') ? TEAL : INK }}
                      variants={{ hidden: { opacity: 0, y: -28, rotate: -6, filter: 'blur(6px)' }, visible: { opacity: 1, y: 0, rotate: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 220, damping: 18 } } }}
                    >
                      {ch}
                    </motion.span>
                  ))}
                </span>
              ))}
            </motion.h1>
            <Reveal delay={0.5}>
              <p className="home-hero-sub" style={{ fontSize: 18, color: INK2, lineHeight: 1.6, maxWidth: 480, margin: '20px 0 28px' }}>
                Send one prompt. <strong style={{ color: INK, fontWeight: 600 }}>Four AI minds</strong> with opposing worldviews answer in parallel — streamed token by token. A <strong style={{ color: TEAL, fontWeight: 600 }}>fifth LLM scores</strong> them, the best answer wins.
              </p>
            </Reveal>
            <Reveal delay={0.7}>
              <div className="hero-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Button variant="primary" size="lg" icon={Icons.sparkle(18)} onClick={goApp}>Open the Arena</Button>
                <Button variant="secondary" size="lg" onClick={() => navigate('/personas')}>Meet the minds</Button>
              </div>
            </Reveal>
            <Reveal delay={0.9}>
              <div style={{ display: 'flex', gap: 28, marginTop: 40, flexWrap: 'wrap' }}>
                {[
                  { v: 16, l: 'Reasoning minds', s: '' },
                  { v: 4, l: 'Answer in parallel', s: '' },
                  { v: 5, l: 'Judge scores them', s: 'th' },
                ].map((m) => (
                  <div key={m.l}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 700, color: INK, lineHeight: 1 }}>
                      <Counter value={m.v} />{m.s}
                    </div>
                    <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: INK3, marginTop: 6 }}>{m.l}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* right — monitor wall */}
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="hero-right"
          >
            <div className="hero-giant-num" aria-hidden style={{ position: 'absolute', marginTop: -8, marginLeft: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.22em', color: INK3, textTransform: 'uppercase' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: TEAL, marginRight: 8, verticalAlign: 'middle', boxShadow: '0 0 8px var(--teal-glow)' }} />
              LIVE · MONITOR WALL · CH 4
            </div>
            <Monitor active label="topic" style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: INK3, letterSpacing: '0.08em' }}>ROUND <AnimateRound round={debateState.round} /></div>
                <motion.div
                  key={activeTopic.question}
                  initial={reduce ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: INK, textAlign: 'right' }}
                >
                  {activeTopic.question}
                </motion.div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {HERO_AGENT_ORDER.map((agent) => {
                  const st = debateState.agentStates[agent];
                  const isWinner = debateState.winnerId === agent;
                  const score = debateState.agentScores[agent];
                  const text = debateState.agentTexts[agent];
                  const color = HERO_AGENT_COLORS[agent];
                  const isTyping = debateState.currentTypingAgent === agent;
                  const isThinking = st === 'thinking';
                  const isListening = st === 'listening';
                  const isWinning = st === 'winning' || isWinner;
                  const isLosing = st === 'losing';
                  const scorePct = `${score}%`;
                  const overPct = `${Math.min(score * 1.08, 100)}%`;
                  const dim = isListening ? 0.45 : isLosing ? 0.4 : 1;
                  return (
                    <motion.div
                      key={agent}
                      animate={reduce ? {} : { y: isWinning ? -5 : 0, opacity: dim }}
                      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
                      className="console-frame ticks"
                      style={{ position: 'relative', padding: '12px 14px', overflow: 'hidden', borderColor: isWinning ? `${AMBER}88` : 'var(--line-soft)' as never, background: isWinning ? 'linear-gradient(180deg, rgba(232,184,109,0.08), transparent)' : 'var(--bezel)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: isTyping || isThinking ? `0 0 10px ${color}` : 'none', animation: reduce ? 'none' : isThinking ? 'pulse 0.8s infinite' : isTyping ? 'pulse 1s infinite' : 'breathe 2.4s infinite' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: INK, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>{agent}</span>
                        {isWinning && (
                          <motion.span initial={reduce ? false : { scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} style={{ fontSize: 13 }}>🏆</motion.span>
                        )}
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px', borderRadius: 999, background: isWinning ? 'rgba(232,184,109,0.16)' : 'var(--line-soft)' as never, color: isWinning ? AMBER : INK2, border: `1px solid ${isWinning ? AMBER + '66' : 'transparent'}` }}>
                          {isWinning ? `WIN · ${activeTopic.finalScores[agent]}` : activeTopic.finalScores[agent]}
                        </span>
                      </div>
                      <div style={{ minHeight: 16 }}>
                        {isThinking && <span className="debate-ellipsis" style={{ fontSize: 12, color: INK3, fontStyle: 'italic' }} />}
                      </div>
                      <p style={{ fontSize: 12, color: INK2, lineHeight: 1.6, margin: '6px 0', minHeight: 40, opacity: debateState.phase === 'transitioning' ? 0 : 1 }}>
                        {text}
                        {debateState.typingCursor[agent] && <span style={{ color, animation: 'blink 0.8s step-end infinite' }}>▍</span>}
                      </p>
                      <div style={{ height: 3, background: 'rgba(125,211,192,0.08)', borderRadius: 999, overflow: 'hidden', marginTop: 8, opacity: debateState.scoreBarsVisible ? (isLosing ? 0.5 : 1) : 0 }}>
                        <div
                          style={{ height: '100%', background: isWinning ? AMBER : color, width: debateState.scoreBarsVisible ? scorePct : '0%', borderRadius: 999, boxShadow: isWinning ? '0 0 8px var(--amber)' : 'none', ['--score' as never]: scorePct, ['--overshoot-score' as never]: overPct } as CSSProperties & Record<string, string>}
                          className={debateState.overshootAgent === agent && debateState.phase === 'scoring' ? 'hero-score-fill hero-score-fill-overshoot' : 'hero-score-fill'}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Monitor>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ TICKER ═══════════════ */}
      <Reveal>
        <div style={{ borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)', overflow: 'hidden', padding: '11px 0', background: 'var(--stage-2)' }}>
          <motion.div
            animate={reduce ? {} : { x: ['0%', '-50%'] }}
            transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
            style={{ display: 'flex', whiteSpace: 'nowrap', width: 'max-content' }}
          >
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, idx) => (
              <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0 24px', borderRight: '1px solid var(--line-soft)', fontSize: 13, color: INK2, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: TEAL }}>→</span>{item}
              </div>
            ))}
          </motion.div>
        </div>
      </Reveal>

      {/* ═══════════════ MANIFESTO ═══════════════ */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 28px' }}>
        <Stagger>
          {[
            { n: '01', tag: 'The old way', body: (<><span style={{ color: INK3 }}>One</span> AI gives you one answer.</>) },
            { n: '02', tag: 'The Arena way', body: (<><span style={{ color: INK3 }}>Arena gives you </span><span style={{ color: TEAL, fontWeight: 600 }}>four</span><span style={{ color: INK3 }}> that compete.</span></>) },
            { n: '03', tag: 'Always', body: (<><span style={{ color: INK3 }}>The best one</span> <span style={{ color: AMBER, fontStyle: 'italic' }}>wins.</span></>) },
          ].map((m) => (
            <StaggerItem key={m.n}>
              <motion.div
                whileHover={reduce ? {} : {}}
                transition={{ duration: 0.25 }}
                className="manifesto-line"
                style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '1.1rem 0', borderBottom: '1px solid var(--line-soft)', borderRadius: 0, cursor: 'default' }}
              >
                <span className="mono" style={{ fontSize: 12, color: TEAL, letterSpacing: '0.18em', width: 32 }}>{m.n}</span>
                <p className="ml-text" style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 500, flex: 1, padding: '0 2rem', color: INK, margin: 0, lineHeight: 1.25, letterSpacing: '-0.02em' }}>{m.body}</p>
                <span style={{ fontSize: 11, color: INK3, border: '1px solid var(--line-soft)', padding: '4px 12px', borderRadius: 999, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{m.tag}</span>
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ═══════════════ COMPARISON ═══════════════ */}
      <section style={{ maxWidth: 1180, margin: '4rem auto 0', padding: '0 28px' }}>
        <Reveal><Eyebrow>Why Arena beats asking one AI</Eyebrow></Reveal>
        <div className="compare-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
          <TiltCard max={4} className="console-frame" style={{ padding: '1.6rem' }}>
            <div style={{ display: 'inline-block', fontSize: 10, padding: '5px 12px', borderRadius: 999, background: 'var(--line-soft)', color: INK3, marginBottom: 16, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>One AI</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: INK2 }}>Single perspective</h3>
            {['Optimized to agree with you', 'No competing viewpoints', 'Confidence without challenge', 'No ranking — all answers feel equal'].map((t, i) => (
              <motion.div key={t} initial={{ opacity: 0.6 }} whileHover={{ opacity: 1, x: 4 }} transition={{ delay: i * 0.04 }} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid crimson', color: 'var(--crimson)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✕</span>
                <span style={{ fontSize: 14, color: INK3 }}>{t}</span>
              </motion.div>
            ))}
          </TiltCard>
          <TiltCard max={6} className="console-frame" style={{ padding: '1.6rem', background: 'linear-gradient(180deg, rgba(125,211,192,0.10), rgba(125,211,192,0.02))', borderColor: TEAL + '44' }}>
            <div style={{ display: 'inline-block', fontSize: 10, padding: '5px 12px', borderRadius: 999, background: TEAL + '22', color: TEAL, marginBottom: 16, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em', textTransform: 'uppercase', border: `1px solid ${TEAL}55` }}>Arena</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: INK }}>Four competing minds</h3>
            {['Four opposing worldviews on every answer', 'Scored on logic, directness, originality', 'Winner surfaces with a reason why', 'Challenge, debate, go 1-on-1 on demand'].map((t, i) => (
              <motion.div key={t} initial={{ opacity: 0.75 }} whileHover={{ opacity: 1, x: 4 }} transition={{ delay: i * 0.04 }} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: TEAL + '22', border: `1px solid ${TEAL}`, color: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 14, color: INK2 }}>{t}</span>
              </motion.div>
            ))}
          </TiltCard>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section id="how-it-works" style={{ maxWidth: 1180, margin: '4rem auto 0', padding: '0 28px' }}>
        <Reveal><Eyebrow>How it works</Eyebrow></Reveal>
        <Stagger className="how-steps" >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 24, border: '1px solid var(--line-soft)', borderRadius: 18, overflow: 'hidden', background: 'var(--bezel)' }}>
            {[
              { num: '01', title: 'Ask anything', body: 'A question, a decision, a debate. No restrictions.' },
              { num: '02', title: 'Four minds fire', body: 'All four respond simultaneously, each from a radically different angle.' },
              { num: '03', title: 'A winner emerges', body: 'Scored by a fifth AI. Best answer surfaces automatically.' },
              { num: '04', title: 'Go deeper', body: 'Challenge, debate, or go 1-on-1. You control the depth.' },
            ].map((s, i) => (
              <StaggerItem key={s.num}>
                <motion.div whileHover={reduce ? {} : {}} transition={{ duration: 0.2 }} className="how-step" style={{ padding: '1.6rem', borderRight: i < 3 ? '1px solid var(--line-soft)' : 'none', position: 'relative' }}>
                  <div className="hs-num" style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 700, color: TEAL + '22', lineHeight: 1, marginBottom: 14 }}>{s.num}</div>
                  {i < 3 && <div className="hs-arrow" style={{ position: 'absolute', right: -10, top: '1.8rem', width: 22, height: 22, borderRadius: '50%', background: 'var(--bezel)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: TEAL, zIndex: 2 }}>→</div>}
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: INK, fontFamily: 'var(--font-display)' }}>{s.title}</h4>
                  <p style={{ fontSize: 13, color: INK3, lineHeight: 1.55, margin: 0 }}>{s.body}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </div>
        </Stagger>
      </section>

      {/* ═══════════════ PERSONA LIBRARY ═══════════════ */}
      <section style={{ maxWidth: 1180, margin: '4rem auto 0', padding: '0 28px' }}>
        <div className="persona-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <Reveal>
            <div>
              <Eyebrow>Available now</Eyebrow>
              <h2 style={{ fontSize: 26, fontWeight: 600, marginTop: 12 }}>The Persona Library</h2>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, maxWidth: 300 }}>
              <p className="persona-subtitle" style={{ fontSize: 14, color: INK2, textAlign: 'right', lineHeight: 1.6, margin: 0 }}>16 distinct minds. Pick any four to build your panel. Different problems call for different thinkers.</p>
              <Button variant="secondary" size="sm" onClick={() => navigate('/personas')}>Build your panel →</Button>
            </div>
          </Reveal>
        </div>
        <Stagger fast className="persona-grid">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {ACTPERSONAS.map((p) => (
              <StaggerItem key={p.name}>
                <motion.div whileHover={reduce ? {} : {}} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="console-frame" style={{ padding: '1rem', borderColor: p.color + '55' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className="breathe" style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: INK, fontFamily: 'var(--font-mono)' }}>{p.name.replace('The ', '')}</span>
                  </div>
                  <p style={{ fontSize: 12, fontStyle: 'italic', color: INK3, lineHeight: 1.5, margin: 0 }}>{p.quote}</p>
                </motion.div>
              </StaggerItem>
            ))}
            {MORE_PERSONAS.map((p) => (
              <StaggerItem key={p.name}>
                <motion.div whileHover={reduce ? {} : {}} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="console-frame" style={{ padding: '1rem', opacity: 0.78 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: INK3 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: INK2, fontFamily: 'var(--font-mono)' }}>{p.name.replace('The ', '')}</span>
                  </div>
                  <p style={{ fontSize: 12, fontStyle: 'italic', color: INK3, lineHeight: 1.5, margin: 0 }}>{p.quote}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </div>
        </Stagger>
        <p style={{ textAlign: 'center', fontSize: 13, color: INK3, marginTop: 16 }}>Explore all 16 personas in the library.</p>
      </section>

      {/* ═══════════════ THE FOUR MINDS ═══════════════ */}
      <section style={{ maxWidth: 1180, margin: '4rem auto 0', padding: '0 28px' }}>
        <Reveal><h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Meet the four minds</h2></Reveal>
        <Reveal delay={0.1}><p style={{ fontSize: 14, color: INK3, marginBottom: 24 }}>Active now. Each built with a different temperature and reasoning mandate.</p></Reveal>
        <Stagger>
          <div className="agents-deep-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { name: 'The Analyst', color: '#6F8DAD', temp: 0.2, quote: 'I find the flaw in everything.' },
              { name: 'The Philosopher', color: '#9B8FAA', temp: 0.7, quote: 'I question the premise first.' },
              { name: 'The Pragmatist', color: '#8AA899', temp: 0.5, quote: 'I only care what works.' },
              { name: 'The Contrarian', color: '#C49A6D', temp: 1.0, quote: 'I say what no one else will.' },
            ].map((a) => (
              <StaggerItem key={a.name}>
                <motion.div whileHover={reduce ? {} : {}} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="console-frame scanlines" style={{ padding: '1.2rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ height: 2, background: a.color, borderRadius: 999, marginBottom: 14, boxShadow: `0 0 8px ${a.color}` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className="breathe" style={{ width: 9, height: 9, borderRadius: '50%', background: a.color }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: INK, fontFamily: 'var(--font-mono)' }}>{a.name}</span>
                  </div>
                  <p style={{ fontSize: 13, color: INK2, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 14 }}>{a.quote}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="mono" style={{ fontSize: 10, color: INK3 }}>temp</span>
                    <div style={{ flex: 1, height: 3, background: 'var(--line-soft)', borderRadius: 999, overflow: 'hidden' }}>
                      <motion.div initial={{ width: 0 }} whileInView={{ width: `${a.temp * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} style={{ height: '100%', background: a.color, borderRadius: 999 }} />
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: INK2 }}>{a.temp}</span>
                  </div>
                </motion.div>
              </StaggerItem>
            ))}
          </div>
        </Stagger>
      </section>

      {/* ═══════════════ CTA BAND ═══════════════ */}
      <section style={{ maxWidth: 1180, margin: '4rem auto 0', padding: '0 28px' }}>
        <Reveal>
          <motion.div whileHover={reduce ? {} : {}} transition={{ type: 'spring', stiffness: 200, damping: 24 }} className="cta-band console-frame scanlines" style={{ padding: '2.6rem 3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(125,211,192,0.10), rgba(232,184,109,0.05))', borderColor: TEAL + '33', position: 'relative', overflow: 'hidden', flexWrap: 'wrap', gap: 24 }}>
            <div>
              <p className="cta-band-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: 10 }}>Ready to think differently?</p>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 600, color: INK, lineHeight: 1.2 }}>
                Stop asking one AI. Start asking <span style={{ color: AMBER, fontStyle: 'italic' }}>four.</span>
              </h2>
            </div>
            <div className="cta-band-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <Button variant="amber" size="lg" onClick={goApp}>Try Arena free →</Button>
              <span className="mono" style={{ fontSize: 11, color: INK3, letterSpacing: '0.06em' }}>Free account required</span>
            </div>
          </motion.div>
        </Reveal>
      </section>

      <Footer />

      {/* ═══════════════ QUICK-ACCESS PORTAL ═══════════════ */}
      {typeof document !== 'undefined' ? createPortal(
        <>
          {!quickOpen ? (
            <Button type="button" className="quick-access-floating quick-access-floating--corner" variant="primary" size="md" icon={Icons.sparkle(16)} onClick={() => setQuickOpen(true)} style={{ boxShadow: '0 8px 28px rgba(125,211,192,0.25)' }}>Open Arena</Button>
          ) : (
            <>
              <div className="quick-access-backdrop" role="presentation" aria-hidden onClick={() => setQuickOpen(false)} />
              <div id="quick-access-widget" className="quick-access-floating quick-access-floating--corner" style={{ position: 'relative' }}>
                <button type="button" aria-label="Close" onClick={() => setQuickOpen(false)} style={{ position: 'absolute', top: -16, right: -16, width: 32, height: 32, borderRadius: '50%', background: 'var(--bezel)', border: '1px solid var(--line)', color: TEAL, fontSize: 16, cursor: 'pointer', zIndex: 1001, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                <motion.div initial={reduce ? false : { opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="quick-access-card-inner console-frame" style={{ width: 260, background: 'var(--bezel)', borderRadius: 16, overflow: 'hidden', transformOrigin: 'bottom right' }}>
                  {[
                    { title: 'Arena', sub: 'Four minds debate your question', color: TEAL, route: '/app' as const },
                    { title: 'Agent', sub: '7-stage deep research pipeline', color: AMBER, route: '/agent' as const },
                  ].map((q) => (
                    <div key={q.title} role="button" tabIndex={0} onClick={() => { setQuickOpen(false); if (isAuthenticated) navigate(q.route); else { setRedirectIntent(q.route); navigate('/signin'); } }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setQuickOpen(false); if (isAuthenticated) navigate(q.route); else { setRedirectIntent(q.route); navigate('/signin'); } } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(125,211,192,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: q.color + '18', border: `1px solid ${q.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: q.color, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>{q.title[0]}</div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={{ fontSize: 14, color: INK, fontWeight: 600, marginBottom: 2, fontFamily: 'var(--font-display)' }}>{q.title}</div>
                        <div style={{ fontSize: 11, color: INK3, fontStyle: 'italic' }}>{q.sub}</div>
                      </div>
                      <span style={{ fontSize: 13, color: q.color, marginLeft: 'auto' }}>→</span>
                    </div>
                  ))}
                  <div style={{ padding: '9px 16px', background: 'var(--stage-2)', fontSize: 11, textAlign: 'center', letterSpacing: '0.06em', color: isAuthenticated ? INK3 : TEAL, fontFamily: 'var(--font-mono)' }}>
                    {isAuthenticated ? `${formatQuickAccessTierLabel(tier)} · Active` : 'Sign in to access both modes'}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </>,
        document.body,
      ) : null}
    </div>
  );
}

function AnimateRound({ round }: { round: HeroRound }) {
  const reduce = useReducedMotion();
  return (
    <motion.span key={round} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {round}/3
    </motion.span>
  );
}