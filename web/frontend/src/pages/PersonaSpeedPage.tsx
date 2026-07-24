import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  Timer,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  SPEED_BASE_POINTS,
  SPEED_MAX_SPEED_BONUS,
  SPEED_TOTAL_SECONDS,
  buildSpeedQuestions,
  computeSpeedPoints,
  speedVerdict,
  type PersonaSpeedQuestion,
} from '../data/personaSpeed';
import { PERSONAS } from '../data/personas';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-speed-page.css';

const HIGH_SCORE_KEY = 'arena:persona-speed:high-score:v1';

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

function readHighScore(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(HIGH_SCORE_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeHighScore(score: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    /* silent */
  }
}

interface SpeedQuestionCardProps {
  readonly question: PersonaSpeedQuestion;
  readonly selected: string | null;
  readonly revealed: boolean;
  readonly onSelect: (optionId: string) => void;
}

function SpeedQuestionCard({
  question,
  selected,
  revealed,
  onSelect,
}: SpeedQuestionCardProps) {
  const persona = findPersona(question.correctId);
  const accent = persona?.color ?? 'var(--vp-ivory)';
  return (
    <article
      className="ps-queue__card"
      style={{ ['--ps-persona-color' as string]: accent }}
    >
      <blockquote className="ps-queue__quote">"{question.quote}"</blockquote>
      <p className="ps-queue__ask">Which Arena mind?</p>
      <ul className="ps-queue__options">
        {question.options.map((optionId, idx) => {
          const optionPersona = findPersona(optionId);
          if (!optionPersona) return null;
          const isSelected = selected === optionId;
          const isCorrect = revealed && optionId === question.correctId;
          const isWrong =
            revealed && isSelected && optionId !== question.correctId;
          let stateClass = '';
          if (isCorrect) stateClass = ' ps-option--correct';
          else if (isWrong) stateClass = ' ps-option--wrong';
          else if (revealed) stateClass = ' ps-option--dim';
          return (
            <li key={optionId}>
              <Pressable
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`ps-option${isSelected ? ' ps-option--selected' : ''}${stateClass}`}
                onClick={() => onSelect(optionId)}
                disabled={revealed}
              >
                <span className="ps-option__key" aria-hidden="true">{idx + 1}</span>
                <span className="ps-option__name">{optionPersona.name}</span>
                <span className="ps-option__icon" aria-hidden="true">
                  {revealed && isCorrect ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : revealed && isWrong ? (
                    <XCircle aria-hidden="true" />
                  ) : null}
                </span>
              </Pressable>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function PersonaSpeedPage() {
  const reduceMotion = prefersReducedMotion();
  const [pageVisible, setPageVisible] = useState(false);
  const [questions, setQuestions] = useState<ReadonlyArray<PersonaSpeedQuestion>>(
    () => buildSpeedQuestions(),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SPEED_TOTAL_SECONDS);
  const [done, setDone] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const roundStartRef = useRef<number>(0);

  useEffect(() => {
    setPageVisible(true);
    setHighScore(readHighScore());
  }, []);

  // Points per question
  const pointsByQuestion = useMemo(() => {
    const map: Record<string, number> = {};
    const now = Date.now();
    const elapsed = now - roundStartRef.current;
    for (const q of questions) {
      const pickedId = answers[q.id];
      if (!pickedId) continue;
      const correct = pickedId === q.correctId;
      map[q.id] = computeSpeedPoints(correct, elapsed);
    }
    return map;
  }, [questions, answers, done]);

  const totalPoints = useMemo(
    () => Object.values(pointsByQuestion).reduce((sum, p) => sum + p, 0),
    [pointsByQuestion],
  );

  const correctCount = useMemo(() => {
    let count = 0;
    for (const q of questions) {
      if (answers[q.id] === q.correctId) count++;
    }
    return count;
  }, [questions, answers]);

  // Timer loop — fires every 250ms while running.
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - roundStartRef.current) / 1000);
      const remaining = Math.max(0, SPEED_TOTAL_SECONDS - elapsed);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setRunning(false);
        setDone(true);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  // When the round ends, persist high score.
  useEffect(() => {
    if (done && totalPoints > highScore) {
      writeHighScore(totalPoints);
      setHighScore(totalPoints);
    }
  }, [done, totalPoints, highScore]);

  const onStart = () => {
    setQuestions(buildSpeedQuestions());
    setAnswers({});
    setDone(false);
    setRunning(true);
    setSecondsLeft(SPEED_TOTAL_SECONDS);
    roundStartRef.current = Date.now();
  };

  const onSelect = (questionId: string, optionId: string) => {
    if (done || !running) return;
    // Auto-advance the active question — but since we show all questions
    // in a queue, the user can answer any in any order. After answering
    // a question, lock it.
    setAnswers((prev) =>
      prev[questionId] !== undefined ? prev : { ...prev, [questionId]: optionId },
    );
  };

  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/persona-speed`;
    const text = `I scored ${totalPoints} pts (${correctCount}/${questions.length} correct) in Arena Persona Speed Round — can you beat my time?`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Speed Round', text, url });
        return;
      } catch (err) {
        /* fall through */
      }
    }
    const ok = await copyToClipboard(`${text} ${url}`);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  // Keyboard nav: 1-4 picks the option for the first unanswered question,
  // Enter starts a new round on the start screen. Skipped when an input
  // has focus.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'Enter') {
        if (!running && !done) {
          event.preventDefault();
          onStart();
        }
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (!Number.isInteger(digit) || digit < 1 || digit > 4) return;
      if (!running) return;
      const firstUnanswered = questions.find((q) => !answers[q.id]);
      const target2 = firstUnanswered ?? questions[0];
      if (!target2) return;
      const opt = target2.options[digit - 1];
      if (!opt) return;
      event.preventDefault();
      onSelect(target2.id, opt);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [running, done, questions, answers]);

  const verdict = speedVerdict(totalPoints, questions.length);
  const maxScore = questions.length * (SPEED_BASE_POINTS + SPEED_MAX_SPEED_BONUS);
  const pct = maxScore > 0 ? Math.round((totalPoints / maxScore) * 100) : 0;
  const secondsPct = Math.round((secondsLeft / SPEED_TOTAL_SECONDS) * 100);
  const isNewHighScore = done && totalPoints === highScore && totalPoints > 0;
  const answeredCount = Object.keys(answers).length;

  return (
    <div
      ref={containerRef}
      className={`ps-page${pageVisible ? ' ps-page--enter' : ''}`}
    >
      <Navbar />

      <main
        id="main-content"
        className={`ps-main${reduceMotion ? '' : ' ps-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="ps-title"
      >
        <section className="ps-hero">
          <p className="ps-hero__eyebrow">
            <Zap aria-hidden="true" /> Persona Speed Round
          </p>
          <h1 id="ps-title" className="ps-hero__title">
            <span>Sixty seconds.</span>
            <span className="ps-hero__title-accent">Sixteen minds.</span>
            <span>One reflex.</span>
          </h1>
          <p className="ps-hero__lede">
            Ten quotes, four options, sixty seconds on the clock. Pick the
            persona, beat the timer. Faster correct answers earn more
            points — slow and steady still scores, just less.
          </p>
        </section>

        <section className="ps-controls" aria-label="Speed round controls">
          <div className="ps-stats">
            <div className="ps-stat">
              <span className="ps-stat__label">High score</span>
              <span className="ps-stat__value">{highScore}</span>
            </div>
            {running && (
              <div className="ps-timer" role="timer" aria-live="polite">
                <Clock aria-hidden="true" />
                <span className="ps-timer__value">{secondsLeft}s</span>
                <div className="ps-timer__bar">
                  <div
                    className="ps-timer__fill"
                    style={{ width: `${secondsPct}%` }}
                  />
                </div>
              </div>
            )}
            {!running && (
              <MotionButton
                type="button"
                variant="primary"
                size="lg"
                onClick={onStart}
                icon={<Play aria-hidden="true" />}
              >
                {done ? 'Play again' : 'Start round'}
              </MotionButton>
            )}
            {running && (
              <p className="ps-controls__hint">
                <span>
                  <kbd>1</kbd>–<kbd>4</kbd> answer · answered {answeredCount}/{questions.length}
                </span>
              </p>
            )}
          </div>
        </section>

        {!running && done && (
          <section className="ps-results" aria-label="Round results">
            <div className="ps-score-card" role="status">
              <p className="ps-score-card__kicker">
                <Target aria-hidden="true" /> Final score
              </p>
              <div className="ps-score-card__main">
                <span className="ps-score-card__big">{totalPoints}</span>
                <span className="ps-score-card__denominator">/ {maxScore}</span>
                <span className="ps-score-card__percent">{pct}%</span>
              </div>
              <div className="ps-score-card__meta">
                <span>
                  <CheckCircle2 aria-hidden="true" /> {correctCount}/{questions.length} correct
                </span>
                <span>
                  <Timer aria-hidden="true" /> Speed bonus {totalPoints - correctCount * SPEED_BASE_POINTS} pts
                </span>
              </div>
              <p className="ps-score-card__verdict">{verdict}</p>
              {isNewHighScore && (
                <p className="ps-score-card__record">
                  <Trophy aria-hidden="true" /> New high score
                </p>
              )}
            </div>

            <div className="ps-results__cta">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onStart}
                icon={<RefreshCw aria-hidden="true" />}
              >
                Play again
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share score'}
              </MotionButton>
              <a href="/persona-trivia" className="ps-results__link">
                Try the slow round <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </section>
        )}

        <section className="ps-queue" aria-label="Question queue">
          <ol className="ps-queue__list">
            {questions.map((question, index) => (
              <li key={question.id} data-question-id={question.id}>
                <SpeedQuestionCard
                  question={question}
                  selected={answers[question.id] ?? null}
                  revealed={done || answers[question.id] !== undefined}
                  onSelect={(optionId) => onSelect(question.id, optionId)}
                />
                {answers[question.id] && (
                  <p className="ps-queue__points">
                    <Sparkles aria-hidden="true" />{' '}
                    +{pointsByQuestion[question.id] ?? 0} pts
                  </p>
                )}
                {!answers[question.id] && (
                  <p className="ps-queue__number">Q{index + 1}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      </main>

      <Footer />
    </div>
  );
}