import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Compass,
  Filter,
  History,
  MessageSquare,
  RotateCcw,
  Share2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  buildCouncil,
  clearCouncilCounter,
  councilShareUrl,
  councilValid,
  dominantStance,
  incrementCouncilCounter,
  readCouncilCounter,
  type CouncilTake,
  type PersonaCouncil,
} from '../data/personaCouncil';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-council-page.css';

const MAX_QUESTION_CHARS = 300;

const STANCE_LABELS: Record<CouncilTake['stance'], string> = {
  agrees: 'agrees',
  cautions: 'cautions',
  reframes: 'reframes',
  pushes: 'pushes',
  listens: 'listens',
};

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

export function PersonaCouncilPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialQuestion = searchParams.get('q') ?? '';

  const [question, setQuestion] = useState(initialQuestion);
  const [committed, setCommitted] = useState(initialQuestion);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [convenedCount, setConvenedCount] = useState(0);
  const [stanceFilter, setStanceFilter] = useState<CouncilTake['stance'] | null>(null);

  useEffect(() => {
    setPageVisible(true);
    setConvenedCount(readCouncilCounter());
    try {
      const raw = window.localStorage.getItem('arena:persona-council:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const council: PersonaCouncil | null = useMemo(() => {
    if (!committed.trim()) return null;
    const c = buildCouncil(committed);
    return councilValid(c) ? c : null;
  }, [committed]);

  const dominant = useMemo(
    () => (council ? dominantStance(council) : null),
    [council],
  );

  const filteredTakes = useMemo(() => {
    if (!council) return [];
    if (!stanceFilter) return council.takes;
    return council.takes.filter((t) => t.stance === stanceFilter);
  }, [council, stanceFilter]);

  const onConvene = () => {
    setCommitted(question);
    if (typeof window !== 'undefined') {
      const url = councilShareUrl(window.location.origin, question);
      window.history.replaceState({}, '', url);
    }
    // Append to history.
    try {
      const next = [question, ...history.filter((q) => q !== question)].slice(0, 8);
      window.localStorage.setItem(
        'arena:persona-council:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    // Bump lifetime counter.
    const c = incrementCouncilCounter();
    setConvenedCount(c);
  };

  const onReset = () => {
    setQuestion('');
    setCommitted('');
    if (typeof window !== 'undefined') {
      const url = councilShareUrl(window.location.origin, '');
      window.history.replaceState({}, '', url);
    }
  };

  const onReplayHistory = (q: string) => {
    setQuestion(q);
    setCommitted(q);
    if (typeof window !== 'undefined') {
      const url = councilShareUrl(window.location.origin, q);
      window.history.replaceState({}, '', url);
    }
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-council:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  const onResetCounter = () => {
    clearCouncilCounter();
    setConvenedCount(0);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !council) return;
    const url = councilShareUrl(window.location.origin, committed);
    const dom = dominant
      ? `The council is mostly ${STANCE_LABELS[dominant]}.`
      : 'The council has spoken.';
    const text = `Arena Council: "${committed}" — ${dom} Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Council', text, url });
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

  const onTryInArena = () => {
    if (typeof window === 'undefined' || !committed.trim()) return;
    // Send the question to Arena as a prompt.
    const link = `/app?prompt=${encodeURIComponent(committed)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  return (
    <div className={`pcoun-page${pageVisible ? ' pcoun-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pcoun-main${reduceMotion ? '' : ' pcoun-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pcoun-title"
      >
        <section className="pcoun-hero">
          <p className="pcoun-hero__eyebrow">
            <Compass aria-hidden="true" /> Persona Council
          </p>
          <h1 id="pcoun-title" className="pcoun-hero__title">
            <span>One question.</span>
            <span className="pcoun-hero__title-accent">Sixteen minds.</span>
          </h1>
          <p className="pcoun-hero__lede">
            Convene the full council. Ask a question, every Arena mind
            weighs in with a one-liner. The same question always
            convenes the same council — share the result.
          </p>
        </section>

        <section className="pcoun-input" aria-label="Question input">
          <label className="pcoun-input__label" htmlFor="pcoun-question-input">
            <MessageSquare aria-hidden="true" /> Your question
          </label>
          <textarea
            id="pcoun-question-input"
            className="pcoun-input__textarea"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the council anything — strategy, ethics, taste, life."
            maxLength={MAX_QUESTION_CHARS}
            rows={3}
            aria-label="Question for the council"
          />
          <div className="pcoun-input__meta">
            <span>
              {question.length}/{MAX_QUESTION_CHARS} chars
            </span>
            <div className="pcoun-input__actions">
              <button
                type="button"
                className="pcoun-input__reset"
                onClick={onReset}
                disabled={!question && !committed}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onConvene}
                disabled={!question.trim()}
                icon={<Users aria-hidden="true" />}
              >
                Convene the council
              </MotionButton>
            </div>
          </div>
          <div className="pcoun-input__stats" aria-label="Council stats">
            <div className="pcoun-input__stat">
              <Sparkles aria-hidden="true" />
              <span className="pcoun-input__stat-label">Council convened</span>
              <span className="pcoun-input__stat-value">{convenedCount}</span>
            </div>
            {convenedCount > 0 && (
              <button
                type="button"
                className="pcoun-input__stat-reset"
                onClick={onResetCounter}
                aria-label="Reset convenings counter"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        {council && (
          <section className="pcoun-result" aria-label="Council result">
            <header className="pcoun-result__head">
              <p className="pcoun-result__kicker">
                <Users aria-hidden="true" /> The council has spoken
              </p>
              <h2 className="pcoun-result__question">"{council.question}"</h2>
              {dominant && (
                <p className="pcoun-result__dominant">
                  <Sparkles aria-hidden="true" /> The dominant stance is{' '}
                  <strong>{STANCE_LABELS[dominant]}</strong> ·{' '}
                  {council.summary[dominant]} of {council.takes.length}
                </p>
              )}
            </header>

            <div className="pcoun-filter" role="radiogroup" aria-label="Filter by stance">
              <span className="pcoun-filter__label">
                <Filter aria-hidden="true" /> Filter
              </span>
              <Pressable
                type="button"
                role="radio"
                aria-checked={stanceFilter === null}
                className={`pcoun-filter__chip${stanceFilter === null ? ' pcoun-filter__chip--active' : ''}`}
                onClick={() => setStanceFilter(null)}
              >
                All ({council.takes.length})
              </Pressable>
              {(Object.keys(STANCE_LABELS) as CouncilTake['stance'][]).map(
                (stance) => {
                  const count = council.summary[stance];
                  if (count === 0) return null;
                  return (
                    <Pressable
                      key={stance}
                      type="button"
                      role="radio"
                      aria-checked={stanceFilter === stance}
                      className={`pcoun-filter__chip pcoun-filter__chip--${stance}${stanceFilter === stance ? ' pcoun-filter__chip--active' : ''}`}
                      onClick={() => setStanceFilter(stance)}
                    >
                      {STANCE_LABELS[stance]} ({count})
                    </Pressable>
                  );
                },
              )}
            </div>

            <ul className="pcoun-grid" aria-label="Council members">
              {filteredTakes.map((take) => {
                const persona = findPersona(take.personaId);
                if (!persona) return null;
                return (
                  <li
                    key={take.personaId}
                    className="pcoun-card"
                    data-stance={take.stance}
                    style={{
                      ['--pcoun-persona-color' as string]: persona.color,
                      ['--pcoun-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pcoun-card__head">
                      <span className="pcoun-card__dot" aria-hidden="true" />
                      <div>
                        <p className="pcoun-card__name">{persona.name}</p>
                        <p className="pcoun-card__stance">
                          {STANCE_LABELS[take.stance]}
                        </p>
                      </div>
                    </header>
                    <p className="pcoun-card__take">{take.take}</p>
                  </li>
                );
              })}
            </ul>

            <div className="pcoun-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Sparkles aria-hidden="true" />}
              >
                Send the question to Arena
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share council'}
              </MotionButton>
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="pcoun-history" aria-label="Recent questions">
            <div className="pcoun-history__head">
              <p className="pcoun-history__label">
                <History aria-hidden="true" /> Recent questions
              </p>
              <button
                type="button"
                className="pcoun-history__clear"
                onClick={onClearHistory}
                aria-label="Clear question history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.map((q, idx) => (
                <li key={`${idx}-${q.slice(0, 16)}`}>
                  <Pressable
                    type="button"
                    className="pcoun-history__item"
                    onClick={() => onReplayHistory(q)}
                  >
                    <span className="pcoun-history__q">"{q}"</span>
                    <ChevronRight aria-hidden="true" />
                  </Pressable>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

function timeAgo(_iso?: string): null {
  return null;
}

// Suppress unused-warning while keeping the helper available for future use.
void timeAgo;