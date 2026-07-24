import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  buildTriviaQuestions,
  scoreTrivia,
  triviaScorePercent,
  triviaVerdict,
  type PersonaTriviaQuestion,
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
  const [revealed, setRevealed] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageVisible(true);
    setHighScore(readHighScore());
  }, []);

  const total = questions.length;
  const answered = useMemo(
    () => questions.filter((q) => Boolean(answers[q.id])).length,
    [questions, answers],
  );
  const allAnswered = answered === total;
  const score = useMemo(() => scoreTrivia(questions, answers), [questions, answers]);

  const onSelect = (questionId: string, optionId: string) => {
    if (revealed) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const onReveal = () => {
    if (!allAnswered) return;
    setRevealed(true);
    const finalScore = scoreTrivia(questions, answers);
    if (finalScore > highScore) {
      writeHighScore(finalScore);
      setHighScore(finalScore);
    }
  };

  const onRetry = () => {
    setQuestions(buildTriviaQuestions());
    setAnswers({});
    setRevealed(false);
  };

  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const pct = triviaScorePercent(score, total);
    const url = `${window.location.origin}/persona-trivia`;
    const text = `I scored ${score}/${total} (${pct}%) on Arena Persona Trivia — which Arena mind said it?`;
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

  const pct = triviaScorePercent(score, total);
  const verdict = triviaVerdict(score, total);
  const progressPct = Math.round((answered / total) * 100);
  const isNewHighScore = revealed && score === highScore && score > 0;

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
            persona — see how well you actually know the cast.
          </p>

          <div className="pt-hero__stats">
            <div className="pt-hero__stat">
              <span className="pt-hero__stat-label">High score</span>
              <span className="pt-hero__stat-value">{highScore}/{total}</span>
            </div>
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
              <span><kbd>1</kbd>–<kbd>4</kbd> pick · <kbd>Enter</kbd> reveal answers</span>
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
                <span className="pt-score-card__big">{score}</span>
                <span className="pt-score-card__denominator">/ {total}</span>
                <span className="pt-score-card__percent">{pct}%</span>
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
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}