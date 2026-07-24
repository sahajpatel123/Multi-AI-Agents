import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  History,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  Timer,
  Trophy,
  XCircle,
  X,
  Zap,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  BASE_POINTS,
  DEFAULT_TIME_BUDGET_MS,
  appendTriviaHistory,
  buildTriviaQuestions,
  clearTriviaHistory,
  computeMaxStreak,
  computeQuestionPoints,
  readTriviaHistory,
  scoreTrivia,
  triviaScorePercent,
  triviaVerdict,
  type PersonaTriviaQuestion,
  type TriviaRoundEntry,
} from '../data/personaTrivia';
import { PERSONAS } from '../data/personas';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-trivia-page.css';

const HIGH_SCORE_KEY = 'arena:persona-trivia:high-score:v1';

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

interface TriviaQuestionCardProps {
  readonly question: PersonaTriviaQuestion;
  readonly index: number;
  readonly total: number;
  readonly selected: string | null;
  readonly revealed: boolean;
  readonly onSelect: (optionId: string) => void;
}

function TriviaQuestionCard({
  question,
  index,
  total,
  selected,
  revealed,
  onSelect,
}: TriviaQuestionCardProps) {
  const persona = findPersona(question.correctId);
  const accent = persona?.color ?? 'var(--vp-ivory)';
  const options = useMemo(() => {
    return [question.correctId, ...question.distractors].sort(() =>
      Math.random() - 0.5,
    );
  }, [question]);

  return (
    <article
      className={`pt-question${revealed ? ' pt-question--revealed' : ''}`}
      style={{ ['--pt-persona-color' as string]: accent }}
      aria-labelledby={`${question.id}-quote`}
    >
      <header className="pt-question__head">
        <span className="pt-question__step">
          Q{index + 1} of {total}
        </span>
        <blockquote id={`${question.id}-quote`} className="pt-question__quote">
          "{question.quote}"
        </blockquote>
        <p className="pt-question__ask">Which Arena mind said this?</p>
      </header>
      <ul className="pt-question__options" role="radiogroup" aria-label={question.quote}>
        {options.map((optionId) => {
          const optionPersona = findPersona(optionId);
          if (!optionPersona) return null;
          const isSelected = selected === optionId;
          const isCorrect = revealed && optionId === question.correctId;
          const isWrongPick =
            revealed && isSelected && optionId !== question.correctId;
          let stateClass = '';
          if (isCorrect) stateClass = ' pt-option--correct';
          else if (isWrongPick) stateClass = ' pt-option--wrong';
          else if (revealed) stateClass = ' pt-option--dim';
          return (
            <li key={optionId}>
              <Pressable
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`pt-option${isSelected ? ' pt-option--selected' : ''}${stateClass}`}
                onClick={() => onSelect(optionId)}
                disabled={revealed}
              >
                <span className="pt-option__indicator" aria-hidden="true">
                  {revealed && isCorrect ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : revealed && isWrongPick ? (
                    <XCircle aria-hidden="true" />
                  ) : null}
                </span>
                <span className="pt-option__name">{optionPersona.name}</span>
                <span className="pt-option__quote">
                  "{optionPersona.quote}"
                </span>
              </Pressable>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

export function PersonaTriviaPage() {
  const reduceMotion = prefersReducedMotion();
  const [pageVisible, setPageVisible] = useState(false);
  const [questions, setQuestions] = useState<ReadonlyArray<PersonaTriviaQuestion>>(
    () => buildTriviaQuestions(),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Track the time each question was first answered (ms since round start).
  const [answerTimes, setAnswerTimes] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<TriviaRoundEntry>>([]);
  const [roundStart] = useState<number>(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageVisible(true);
    setHighScore(readHighScore());
    setHistory(readTriviaHistory());
  }, []);

  const total = questions.length;
  const answered = useMemo(
    () => questions.filter((q) => Boolean(answers[q.id])).length,
    [questions, answers],
  );
  const allAnswered = answered === total;
  const score = useMemo(() => scoreTrivia(questions, answers), [questions, answers]);

  // Compute total points (base + speed bonus) and max streak for the round.
  const pointsByQuestion = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of questions) {
      const pickedId = answers[q.id];
      if (!pickedId) continue;
      const correct = pickedId === q.correctId;
      const elapsed = answerTimes[q.id] ?? DEFAULT_TIME_BUDGET_MS;
      map[q.id] = computeQuestionPoints(correct, elapsed);
    }
    return map;
  }, [questions, answers, answerTimes]);

  const totalPoints = useMemo(
    () => Object.values(pointsByQuestion).reduce((sum, p) => sum + p, 0),
    [pointsByQuestion],
  );

  const perQuestionResults = useMemo(
    () =>
      questions.map((q) => ({
        questionId: q.id,
        correct: answers[q.id] === q.correctId,
      })),
    [questions, answers],
  );

  const maxStreak = useMemo(
    () => computeMaxStreak(perQuestionResults),
    [perQuestionResults],
  );

  // Current streak (resets on wrong answer).
  const currentStreak = useMemo(() => {
    let streak = 0;
    for (const r of perQuestionResults) {
      if (r.correct) streak += 1;
      else break;
    }
    return streak;
  }, [perQuestionResults]);

  const onSelect = (questionId: string, optionId: string) => {
    if (revealed) return;
    const now = Date.now();
    const elapsed = now - roundStart;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    setAnswerTimes((prev) =>
      prev[questionId] !== undefined ? prev : { ...prev, [questionId]: elapsed },
    );
  };

  const onReveal = () => {
    if (!allAnswered) return;
    setRevealed(true);
    if (totalPoints > highScore) {
      writeHighScore(totalPoints);
      setHighScore(totalPoints);
    }
    const entry: TriviaRoundEntry = {
      id: `round-${roundStart}`,
      score: totalPoints,
      total: total * (BASE_POINTS + 50),
      maxStreak,
      savedAt: new Date().toISOString(),
    };
    appendTriviaHistory(entry);
    setHistory(readTriviaHistory());
  };

  const onRetry = () => {
    setQuestions(buildTriviaQuestions());
    setAnswers({});
    setAnswerTimes({});
    setRevealed(false);
  };

  const onClearHistory = () => {
    clearTriviaHistory();
    setHistory([]);
  };

  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const maxPossible = total * (BASE_POINTS + 50);
    const pct = Math.round((totalPoints / maxPossible) * 100);
    const url = `${window.location.origin}/persona-trivia`;
    const text = `I scored ${totalPoints}/${maxPossible} (${pct}%) with a ${maxStreak}-streak on Arena Persona Trivia — which Arena mind said it?`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Trivia', text, url });
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

  useEffect(() => {
    if (revealed) return;
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
        if (allAnswered) {
          event.preventDefault();
          onReveal();
        }
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (!Number.isInteger(digit) || digit < 1 || digit > 4) return;
      const firstUnanswered = questions.find((q) => !answers[q.id]);
      const target2 = firstUnanswered ?? questions[0];
      if (!target2) return;
      const opt = [target2.correctId, ...target2.distractors].sort(
        () => Math.random() - 0.5,
      )[digit - 1];
      if (!opt) return;
      event.preventDefault();
      onSelect(target2.id, opt);
      const el = containerRef.current?.querySelector(
        `[data-question-id="${target2.id}"]`,
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [revealed, allAnswered, questions, answers]);

  const correctCount = score;
  const pct = triviaScorePercent(correctCount, total);
  const verdict = triviaVerdict(correctCount, total);
  const progressPct = Math.round((answered / total) * 100);
  const isNewHighScore = revealed && totalPoints === highScore && totalPoints > 0;

  return (
    <div
      ref={containerRef}
      className={`pt-page${pageVisible ? ' pt-page--enter' : ''}`}
    >
      <Navbar />

      <main
        id="main-content"
        className={`pt-main${reduceMotion ? '' : ' pt-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pt-title"
      >
        <section className="pt-hero">
          <p className="pt-hero__eyebrow">Persona Trivia</p>
          <h1 id="pt-title" className="pt-hero__title">
            <span>Which Arena mind</span>
            <span className="pt-hero__title-accent">said this?</span>
          </h1>
          <p className="pt-hero__lede">
            Ten quotes. Sixteen minds. One score. Read the line, pick the
            persona — see how well you actually know the cast. Faster
            correct answers earn more points.
          </p>

          <div className="pt-hero__stats">
            <div className="pt-hero__stat">
              <span className="pt-hero__stat-label">High score</span>
              <span className="pt-hero__stat-value">{highScore}</span>
              <span className="pt-hero__stat-sub">points</span>
            </div>
            {!revealed && currentStreak >= 2 && (
              <div className="pt-hero__streak" aria-live="polite">
                <Flame aria-hidden="true" />
                <span className="pt-hero__streak-count">{currentStreak}</span>
                <span className="pt-hero__streak-label">streak</span>
              </div>
            )}
            <div
              className="pt-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={answered}
              aria-label="Trivia progress"
            >
              <div className="pt-progress__track">
                <div className="pt-progress__fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="pt-progress__count">
                {answered} / {total} answered
              </span>
            </div>
          </div>

          {!revealed && (
            <p className="pt-hero__hints">
              <span><kbd>1</kbd>–<kbd>4</kbd> pick · <kbd>Enter</kbd> reveal answers · <Zap aria-hidden="true" /> faster = more points</span>
            </p>
          )}
        </section>

        {!revealed ? (
          <section className="pt-quiz" aria-label="Persona trivia quiz">
            <ol className="pt-quiz__list">
              {questions.map((question, index) => (
                <li key={question.id} data-question-id={question.id}>
                  <TriviaQuestionCard
                    question={question}
                    index={index}
                    total={total}
                    selected={answers[question.id] ?? null}
                    revealed={revealed}
                    onSelect={(optionId) => onSelect(question.id, optionId)}
                  />
                </li>
              ))}
            </ol>

            <div className="pt-quiz__cta">
              <MotionButton
                type="button"
                variant="primary"
                size="lg"
                onClick={onReveal}
                disabled={!allAnswered}
                icon={<Sparkles aria-hidden="true" />}
              >
                {allAnswered ? 'Reveal answers' : `Answer all ${total} questions`}
              </MotionButton>
            </div>
          </section>
        ) : (
          <section className="pt-results" aria-label="Trivia results">
            <div className="pt-score-card" role="status">
              <p className="pt-score-card__kicker">
                <Target aria-hidden="true" /> Your score
              </p>
              <div className="pt-score-card__main">
                <span className="pt-score-card__big">{totalPoints}</span>
                <span className="pt-score-card__denominator">
                  / {total * (BASE_POINTS + 50)}
                </span>
                <span className="pt-score-card__percent">{pct}%</span>
              </div>
              <div className="pt-score-card__meta">
                <span>
                  <CheckCircle2 aria-hidden="true" /> {correctCount}/{total} correct
                </span>
                <span>
                  <Flame aria-hidden="true" /> {maxStreak}-streak
                </span>
                <span>
                  <Timer aria-hidden="true" /> Speed bonus: {totalPoints - correctCount * BASE_POINTS} pts
                </span>
              </div>
              <p className="pt-score-card__verdict">{verdict}</p>
              {isNewHighScore && (
                <p className="pt-score-card__record">
                  <Trophy aria-hidden="true" /> New high score
                </p>
              )}
            </div>

            <ol className="pt-quiz__list pt-quiz__list--revealed">
              {questions.map((question, index) => (
                <li key={question.id} data-question-id={question.id}>
                  <TriviaQuestionCard
                    question={question}
                    index={index}
                    total={total}
                    selected={answers[question.id] ?? null}
                    revealed={revealed}
                    onSelect={(optionId) => onSelect(question.id, optionId)}
                  />
                </li>
              ))}
            </ol>

            <div className="pt-results__cta">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onRetry}
                icon={<RefreshCw aria-hidden="true" />}
              >
                New round
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
              <a href="/personas" className="pt-results__link">
                Study the cast <ArrowRight aria-hidden="true" />
              </a>
            </div>

            {history.length > 0 && (
              <div className="pt-history" aria-label="Recent rounds">
                <div className="pt-history__head">
                  <p className="pt-history__label">
                    <History aria-hidden="true" /> Recent rounds
                  </p>
                  <button
                    type="button"
                    className="pt-history__clear"
                    onClick={onClearHistory}
                    aria-label="Clear round history"
                  >
                    <X aria-hidden="true" /> Clear
                  </button>
                </div>
                <ul>
                  {history.slice(0, 6).map((entry) => (
                    <li key={entry.id} className="pt-history__item">
                      <span className="pt-history__score">
                        {entry.score} pts
                      </span>
                      <span className="pt-history__streak">
                        <Flame aria-hidden="true" /> {entry.maxStreak}
                      </span>
                      <span className="pt-history__time">
                        <Clock aria-hidden="true" /> {timeAgo(entry.savedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

function timeAgo(iso: string): string {
  const saved = new Date(iso).getTime();
  if (!Number.isFinite(saved)) return '';
  const diffMs = Date.now() - saved;
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}