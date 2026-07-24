import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, RotateCcw, Share2, Sparkles, Swords } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/persona-match-page.css';

const STORAGE_KEY = 'arena:persona-match:v1';

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

interface StoredMatch {
  readonly v: 1;
  readonly answers: Record<string, string>;
  readonly personaId: string;
  readonly savedAt: string;
}

function readStoredMatch(): StoredMatch | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMatch;
    if (parsed?.v !== 1 || typeof parsed.answers !== 'object' || !parsed.answers) {
      return null;
    }
    if (!PERSONAS.some((p) => p.id === parsed.personaId)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredMatch(answers: Record<string, string>, personaId: string) {
  if (typeof window === 'undefined') return;
  const payload: StoredMatch = {
    v: 1,
    answers,
    personaId,
    savedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — silent fail */
  }
}

function clearStoredMatch() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
  }
}

interface ResultPanelProps {
  readonly personaId: string;
  readonly score: number;
  readonly runnerUps: ReadonlyArray<{ personaId: string; score: number }>;
  readonly onTryInArena: () => void;
}

function ResultPanel({ personaId, score, runnerUps, onTryInArena }: ResultPanelProps) {
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

  const shareText = `I'm ${persona.name} on Arena. "${persona.quote}" — which Arena mind are you?`;

  const onShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Match', text: shareText, url: shareUrl });
        return;
      } catch (err) {
        // user cancelled or share unavailable — fall through to clipboard
      }
    }
    const ok = await copyToClipboard(`${shareText} ${shareUrl}`);
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
          onClick={onTryInArena}
          icon={<Swords aria-hidden="true" />}
        >
          Try {persona.name} in Arena
        </MotionButton>
        <MotionButton
          type="button"
          variant="secondary"
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
          {question.options.map((option, optionIndex) => {
            const isSelected = selected === option.id;
            const hotkey = optionIndex + 1;
            return (
              <li key={option.id}>
                <Pressable
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`pm-option${isSelected ? ' pm-option--selected' : ''}`}
                  onClick={() => onSelect(option.id)}
                >
                  <span className="pm-option__indicator" aria-hidden="true">
                    <span className="pm-option__hotkey">{hotkey}</span>
                  </span>
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
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [restoredMatch, setRestoredMatch] = useState<StoredMatch | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageVisible(true);
  }, []);

  // 1) URL ?p= wins (shared links).
  // 2) Otherwise, restore last match from localStorage so refreshes feel seamless.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('p');
    if (shared && PERSONAS.some((p) => p.id === shared)) {
      setAnswers({ __shared: shared });
      setRevealed(true);
      return;
    }
    const stored = readStoredMatch();
    if (stored) {
      setRestoredMatch(stored);
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
    if (allAnswered) {
      const match = topPersonaMatch(answers);
      if (match) writeStoredMatch(answers, match.personaId);
      setRevealed(true);
    }
  };

  const onReset = () => {
    setAnswers({});
    setRevealed(false);
    setRestoredMatch(null);
    clearStoredMatch();
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('p');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const onRestore = () => {
    if (!restoredMatch) return;
    setAnswers(restoredMatch.answers);
    setRevealed(true);
    setRestoredMatch(null);
  };

  const onDismissRestore = () => {
    setRestoredMatch(null);
    clearStoredMatch();
  };

  const onTryInArena = useCallback(() => {
    if (typeof window === 'undefined') return;
    const personaId = answers.__shared
      ? answers.__shared
      : topMatch?.personaId;
    if (!personaId) return;
    if (isAuthenticated) {
      navigate(`/app?seedPersona=${personaId}`);
      return;
    }
    setRedirectIntent(`/app?seedPersona=${personaId}`);
    navigate('/signin?tab=signup');
  }, [answers, topMatch, isAuthenticated, navigate]);

  // Global keyboard navigation: number keys 1-4 select an option for the
  // first unanswered question; Enter reveals; R resets. Skipped when an
  // input/textarea/contenteditable has focus so we don't hijack typing.
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

      if (event.key === 'r' || event.key === 'R') {
        if (answered > 0) {
          event.preventDefault();
          onReset();
        }
        return;
      }
      if (event.key === 'Enter') {
        if (allAnswered) {
          event.preventDefault();
          onReveal();
        }
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (!Number.isInteger(digit) || digit < 1 || digit > 4) return;
      // Pick the first unanswered question, or fall back to the first one
      // whose <digit>th option is currently unselected.
      const questions = PERSONA_MATCH_QUESTIONS;
      const firstUnanswered = questions.find((q) => !answers[q.id]);
      const target2 = firstUnanswered ?? questions[0];
      if (!target2) return;
      const opt = target2.options[digit - 1];
      if (!opt) return;
      event.preventDefault();
      onSelect(target2.id, opt.id);
      // Scroll the just-answered question into view so the user sees the
      // selection register visually on large layouts.
      const el = containerRef.current?.querySelector(
        `[data-question-id="${target2.id}"]`,
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [revealed, answered, allAnswered, answers]);

  const progressPct = Math.round((answered / total) * 100);

  const activePersonaId = answers.__shared
    ? answers.__shared
    : topMatch?.personaId;

  return (
    <div
      ref={containerRef}
      className={`pm-page${pageVisible ? ' pm-page--enter' : ''}`}
    >
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

          {!revealed && (
            <p className="pm-hero__hints" aria-hidden={false}>
              <span><kbd>1</kbd>–<kbd>4</kbd> pick · <kbd>Enter</kbd> reveal · <kbd>R</kbd> reset</span>
            </p>
          )}
        </section>

        {restoredMatch && !revealed && (
          <aside className="pm-restore" role="region" aria-label="Previous match">
            <div className="pm-restore__copy">
              <p className="pm-restore__kicker">Welcome back</p>
              <p className="pm-restore__text">
                We saved your last match —{' '}
                <strong>{findPersona(restoredMatch.personaId)?.name ?? 'A persona'}</strong>.
                Restore it, or start fresh.
              </p>
            </div>
            <div className="pm-restore__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onRestore}
              >
                See my match
              </MotionButton>
              <button
                type="button"
                className="pm-restore__dismiss"
                onClick={onDismissRestore}
                aria-label="Discard saved match and start over"
              >
                Start over
              </button>
            </div>
          </aside>
        )}

        {!revealed ? (
          <section className="pm-quiz" aria-label="Persona match quiz">
            <ol className="pm-quiz__list">
              {PERSONA_MATCH_QUESTIONS.map((question, index) => (
                <li key={question.id} data-question-id={question.id}>
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
            {activePersonaId ? (
              <ResultPanel
                personaId={activePersonaId}
                score={
                  ranked.find((r) => r.personaId === activePersonaId)?.score ?? 0
                }
                runnerUps={ranked}
                onTryInArena={onTryInArena}
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