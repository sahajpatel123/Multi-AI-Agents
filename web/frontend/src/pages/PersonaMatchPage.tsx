import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, RotateCcw, Share2, Sparkles } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Reveal } from '../components/Reveal';
import { Pressable } from '../components/Pressable';
import {
  PERSONA_MATCH_QUESTIONS,
  scorePersonaMatch,
  topPersonaMatch,
  type PersonaMatchQuestion,
} from '../data/personaMatch';
import { PERSONAS } from '../data/personas';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-match-page.css';

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

interface ResultPanelProps {
  readonly personaId: string;
  readonly score: number;
  readonly runnerUps: ReadonlyArray<{ personaId: string; score: number }>;
}

function ResultPanel({ personaId, score, runnerUps }: ResultPanelProps) {
  const persona = findPersona(personaId);
  const [copied, setCopied] = useState(false);

  if (!persona) {
    return (
      <div className="pm-result pm-result--empty" role="status">
        <p>No persona matched. Try answering a few questions.</p>
      </div>
    );
  }

  const shareUrl = typeof window === 'undefined'
    ? ''
    : `${window.location.origin}/persona-match?p=${personaId}`;

  const shareText = `I am ${persona.name} on Arena Arena. Take the quiz:`;

  const onShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Match', text: shareText, url: shareUrl });
        return;
      } catch (err) {
        // fall through to clipboard
      }
    }
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="pm-result" role="status" aria-live="polite">
      <p className="pm-result__kicker">
        <Sparkles aria-hidden="true" /> Your match
      </p>
      <div
        className="pm-result__card"
        style={{
          ['--pm-persona-color' as string]: persona.color,
          ['--pm-persona-bg' as string]: persona.bgTint,
        }}
      >
        <span className="pm-result__dot" aria-hidden="true" />
        <h2 className="pm-result__name">{persona.name}</h2>
        <p className="pm-result__quote">"{persona.quote}"</p>
        <p className="pm-result__copy">{persona.description}</p>
        <dl className="pm-result__meta">
          <div>
            <dt>Persona score</dt>
            <dd>{score}</dd>
          </div>
          <div>
            <dt>Temperature</dt>
            <dd>{persona.temperature.toFixed(1)}</dd>
          </div>
        </dl>
      </div>

      {runnerUps.length > 1 && (
        <div className="pm-result__runners">
          <p className="pm-result__runners-label">Closest runner-ups</p>
          <ul>
            {runnerUps.slice(1, 4).map((r) => {
              const p = findPersona(r.personaId);
              if (!p) return null;
              return (
                <li key={r.personaId}>
                  <span
                    className="pm-result__runners-dot"
                    style={{ background: p.color }}
                    aria-hidden="true"
                  />
                  <span className="pm-result__runners-name">{p.name}</span>
                  <span className="pm-result__runners-score">{r.score}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="pm-result__actions">
        <MotionButton
          type="button"
          variant="primary"
          size="md"
          onClick={onShare}
          icon={<Share2 aria-hidden="true" />}
        >
          {copied ? 'Link copied' : 'Share result'}
        </MotionButton>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  index,
  total,
  selected,
  onSelect,
}: {
  readonly question: PersonaMatchQuestion;
  readonly index: number;
  readonly total: number;
  readonly selected: string | null;
  readonly onSelect: (optionId: string) => void;
}) {
  return (
    <Reveal>
      <article
        className="pm-question"
        aria-labelledby={`${question.id}-prompt`}
        aria-describedby={`${question.id}-helper`}
      >
        <header className="pm-question__head">
          <span className="pm-question__step">
            Q{index + 1} of {total}
          </span>
          <h2 id={`${question.id}-prompt`} className="pm-question__prompt">
            {question.prompt}
          </h2>
          <p id={`${question.id}-helper`} className="pm-question__helper">
            {question.helper}
          </p>
        </header>
        <ul className="pm-question__options" role="radiogroup" aria-label={question.prompt}>
          {question.options.map((option) => {
            const isSelected = selected === option.id;
            return (
              <li key={option.id}>
                <Pressable
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`pm-option${isSelected ? ' pm-option--selected' : ''}`}
                  onClick={() => onSelect(option.id)}
                >
                  <span className="pm-option__indicator" aria-hidden="true" />
                  <span className="pm-option__label">{option.label}</span>
                </Pressable>
              </li>
            );
          })}
        </ul>
      </article>
    </Reveal>
  );
}

export function PersonaMatchPage() {
  const reduceMotion = prefersReducedMotion();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);

  useEffect(() => {
    setPageVisible(true);
  }, []);

  // Restore top match from URL ?p=param so shared links deep-link to a result.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('p');
    if (shared && PERSONAS.some((p) => p.id === shared)) {
      setAnswers({ __shared: shared });
      setRevealed(true);
    }
  }, []);

  const total = PERSONA_MATCH_QUESTIONS.length;
  const answered = useMemo(
    () =>
      PERSONA_MATCH_QUESTIONS.filter((q) => Boolean(answers[q.id])).length,
    [answers],
  );
  const allAnswered = answered === total;

  const topMatch = useMemo(() => topPersonaMatch(answers), [answers]);
  const ranked = useMemo(() => scorePersonaMatch(answers), [answers]);

  const onSelect = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const onReveal = () => {
    if (allAnswered) setRevealed(true);
  };

  const onReset = () => {
    setAnswers({});
    setRevealed(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('p');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const progressPct = Math.round((answered / total) * 100);

  return (
    <div className={`pm-page${pageVisible ? ' pm-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pm-main${reduceMotion ? '' : ' pm-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pm-title"
      >
        <section className="pm-hero">
          <p className="pm-hero__eyebrow">Persona Match</p>
          <h1 id="pm-title" className="pm-hero__title">
            <span>Which Arena mind</span>
            <span className="pm-hero__title-accent">are you?</span>
          </h1>
          <p className="pm-hero__lede">
            Five questions. Sixteen minds. One match. Discover which reasoning style
            fits the way you actually think — then bring it into the arena.
          </p>

          <div
            className="pm-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={answered}
            aria-label="Quiz progress"
          >
            <div className="pm-progress__track">
              <div className="pm-progress__fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="pm-progress__count">
              {answered} / {total} answered
            </span>
          </div>
        </section>

        {!revealed ? (
          <section className="pm-quiz" aria-label="Persona match quiz">
            <ol className="pm-quiz__list">
              {PERSONA_MATCH_QUESTIONS.map((question, index) => (
                <li key={question.id}>
                  <QuestionCard
                    question={question}
                    index={index}
                    total={total}
                    selected={answers[question.id] ?? null}
                    onSelect={(optionId) => onSelect(question.id, optionId)}
                  />
                </li>
              ))}
            </ol>

            <div className="pm-quiz__cta">
              <MotionButton
                type="button"
                variant="primary"
                size="lg"
                disabled={!allAnswered}
                onClick={onReveal}
                icon={<Sparkles aria-hidden="true" />}
              >
                {allAnswered ? 'Reveal my match' : `Answer all ${total} questions`}
              </MotionButton>
              <button
                type="button"
                className="pm-quiz__reset"
                onClick={onReset}
                disabled={answered === 0}
                aria-label="Reset quiz"
              >
                <RotateCcw aria-hidden="true" />
                Reset
              </button>
            </div>
          </section>
        ) : (
          <section className="pm-results" aria-label="Persona match results">
            {answers.__shared ? (
              <ResultPanel
                personaId={answers.__shared}
                score={ranked.find((r) => r.personaId === answers.__shared)?.score ?? 0}
                runnerUps={ranked}
              />
            ) : topMatch ? (
              <ResultPanel
                personaId={topMatch.personaId}
                score={topMatch.score}
                runnerUps={ranked}
              />
            ) : null}

            <div className="pm-results__cta">
              <a href="/personas" className="pm-results__link">
                Browse all 16 minds <ArrowRight aria-hidden="true" />
              </a>
              <button
                type="button"
                className="pm-results__retake"
                onClick={onReset}
              >
                <RotateCcw aria-hidden="true" />
                Retake the quiz
              </button>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
