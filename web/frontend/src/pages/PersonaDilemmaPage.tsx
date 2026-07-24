import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  RotateCcw,
  Scale,
  Share2,
  Sparkles,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  appendDecision,
  buildDilemma,
  clearDecisions,
  dilemmaShareUrl,
  dilemmaTally,
  dilemmaValid,
  readDecisions,
  winTally,
  type PersonaDilemma,
} from '../data/personaDilemma';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-dilemma-page.css';

const MAX_OPTION_CHARS = 120;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_DILEMMAS: ReadonlyArray<{ readonly label: string; readonly left: string; readonly right: string }> = [
  {
    label: 'The job offer',
    left: 'Take the safe job',
    right: 'Take the risky startup',
  },
  {
    label: 'The launch',
    left: 'Ship when ready',
    right: 'Ship to learn',
  },
  {
    label: 'The conversation',
    left: 'Tell them the hard truth',
    right: 'Let them figure it out',
  },
  {
    label: 'The strategy',
    left: 'Specialize',
    right: 'Stay generalist',
  },
];

export function PersonaDilemmaPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialLeft = searchParams.get('l') ?? '';
  const initialRight = searchParams.get('r') ?? '';

  const [left, setLeft] = useState(initialLeft);
  const [right, setRight] = useState(initialRight);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [winner, setWinner] = useState<'left' | 'right' | null>(null);
  const [history, setHistory] = useState<ReadonlyArray<{ left: string; right: string }>>([]);
  const [muted, setMuted] = useState<ReadonlyArray<string>>([]);
  const [decisions, setDecisions] = useState<ReturnType<typeof readDecisions>>([]);

  useEffect(() => {
    setPageVisible(true);
    setDecisions(readDecisions());
    try {
      const raw = window.localStorage.getItem('arena:persona-dilemma:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const dilemma: PersonaDilemma | null = useMemo(() => {
    if (!left.trim() || !right.trim()) return null;
    const d = buildDilemma(left, right);
    return dilemmaValid(d) ? d : null;
  }, [left, right]);

  const filteredDilemma = useMemo(() => {
    if (!dilemma) return null;
    if (muted.length === 0) return dilemma;
    return {
      ...dilemma,
      takes: dilemma.takes.filter((t) => !muted.includes(t.personaId)),
    };
  }, [dilemma, muted]);

  const tally = useMemo(
    () => (filteredDilemma ? dilemmaTally(filteredDilemma) : { left: 0, right: 0 }),
    [filteredDilemma],
  );

  const lifetimeTally = useMemo(() => winTally(decisions), [decisions]);

  const onShare = async () => {
    if (typeof window === 'undefined' || !dilemma) return;
    const url = dilemmaShareUrl(window.location.origin, left, right);
    const winLabel = winner === 'left' ? left : winner === 'right' ? right : 'undecided';
    const text = `Arena Dilemma: "${left}" vs "${right}" — I picked ${winLabel}. Run it:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Dilemma', text, url });
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

  const onReset = () => {
    setLeft('');
    setRight('');
    setWinner(null);
    if (typeof window !== 'undefined') {
      const url = dilemmaShareUrl(window.location.origin, '', '');
      window.history.replaceState({}, '', url);
    }
  };

  const onPickWinner = (side: 'left' | 'right') => {
    setWinner(side);
    if (typeof window !== 'undefined') {
      const url = dilemmaShareUrl(window.location.origin, left, right);
      window.history.replaceState({}, '', url);
    }
    // Append to history.
    try {
      const entry = { left, right };
      const next = [entry, ...history.filter((h) => h.left !== left || h.right !== right)].slice(0, 6);
      window.localStorage.setItem(
        'arena:persona-dilemma:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    // Append to decisions tally (lifetime win tracking).
    const id = `decision-${Date.now()}`;
    appendDecision({
      id,
      left,
      right,
      winner: side,
      savedAt: new Date().toISOString(),
    });
    setDecisions(readDecisions());
  };

  const onToggleMute = (personaId: string) => {
    setMuted((prev) =>
      prev.includes(personaId)
        ? prev.filter((id) => id !== personaId)
        : [...prev, personaId],
    );
  };

  const onClearLifetime = () => {
    clearDecisions();
    setDecisions([]);
  };

  const onLoadSample = (sample: { left: string; right: string }) => {
    setLeft(sample.left);
    setRight(sample.right);
    setWinner(null);
    if (typeof window !== 'undefined') {
      const url = dilemmaShareUrl(window.location.origin, sample.left, sample.right);
      window.history.replaceState({}, '', url);
    }
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-dilemma:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  const onTryInArena = () => {
    if (typeof window === 'undefined' || !dilemma) return;
    const link = `/app?prompt=${encodeURIComponent(`${left} vs ${right}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  return (
    <div className={`pdil-page${pageVisible ? ' pdil-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pdil-main${reduceMotion ? '' : ' pdil-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pdil-title"
      >
        <section className="pdil-hero">
          <p className="pdil-hero__eyebrow">
            <Scale aria-hidden="true" /> Persona Dilemma
          </p>
          <h1 id="pdil-title" className="pdil-hero__title">
            <span>Two options.</span>
            <span className="pdil-hero__title-accent">Four minds.</span>
            <span>One verdict.</span>
          </h1>
          <p className="pdil-hero__lede">
            Put two choices in front of the council. Four Arena minds
            split into arguing sides; you pick the winner. Same dilemma
            in = same lineup out, so a shared link replays the exact
            same debate.
          </p>
        </section>

        <section className="pdil-input" aria-label="Dilemma options">
          <div className="pdil-input__row">
            <label className="pdil-input__field">
              <span className="pdil-input__label">Option A</span>
              <input
                type="text"
                className="pdil-input__text"
                value={left}
                onChange={(e) => setLeft(e.target.value)}
                placeholder="The safe option"
                maxLength={MAX_OPTION_CHARS}
                aria-label="Option A"
              />
            </label>
            <span className="pdil-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="pdil-input__field">
              <span className="pdil-input__label">Option B</span>
              <input
                type="text"
                className="pdil-input__text"
                value={right}
                onChange={(e) => setRight(e.target.value)}
                placeholder="The risky option"
                maxLength={MAX_OPTION_CHARS}
                aria-label="Option B"
              />
            </label>
          </div>
          <div className="pdil-input__meta">
            <span>
              {left.length + right.length}/{MAX_OPTION_CHARS * 2} chars total
            </span>
            <div className="pdil-input__actions">
              <button
                type="button"
                className="pdil-input__reset"
                onClick={onReset}
                disabled={!left && !right}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
            </div>
          </div>
        </section>

        <section className="pdil-samples" aria-label="Sample dilemmas">
          <p className="pdil-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_DILEMMAS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pdil-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pdil-sample__label">{sample.label}</span>
                  <span className="pdil-sample__matchup">
                    {sample.left} <ArrowRight aria-hidden="true" /> {sample.right}
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {dilemma && (
          <section className="pdil-result" aria-label="Dilemma result">
            <header className="pdil-result__head">
              <p className="pdil-result__kicker">
                <Swords aria-hidden="true" /> The council has split
              </p>
              <h2 className="pdil-result__title">
                <span className="pdil-result__side pdil-result__side--left">{dilemma.left}</span>
                <span className="pdil-result__vs" aria-hidden="true">vs</span>
                <span className="pdil-result__side pdil-result__side--right">{dilemma.right}</span>
              </h2>
              <p className="pdil-result__tally">
                <span>{tally.left} argue for A</span>
                <span className="pdil-result__tally-sep">·</span>
                <span>{tally.right} argue for B</span>
              </p>
              {lifetimeTally.total > 0 && (
                <p className="pdil-result__lifetime">
                  <Trophy aria-hidden="true" /> Your lifetime verdicts: {lifetimeTally.left} for A · {lifetimeTally.right} for B ({lifetimeTally.total} total)
                </p>
              )}
            </header>

            <div
              className="pdil-mute"
              role="group"
              aria-label="Mute minds from this debate"
            >
              <p className="pdil-mute__label">
                <EyeOff aria-hidden="true" /> Mute a mind
              </p>
              <ul>
                {dilemma.takes.map((take) => {
                  const persona = findPersona(take.personaId);
                  if (!persona) return null;
                  const isMuted = muted.includes(take.personaId);
                  return (
                    <li key={take.personaId}>
                      <Pressable
                        type="button"
                        className={`pdil-mute__chip${isMuted ? ' pdil-mute__chip--muted' : ''}`}
                        onClick={() => onToggleMute(take.personaId)}
                        aria-pressed={isMuted}
                        style={{ ['--pdil-mute-color' as string]: persona.color }}
                      >
                        {isMuted ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        )}
                        {persona.name}
                      </Pressable>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="pdil-sides">
              {(['left', 'right'] as const).map((side) => (
                <div
                  key={side}
                  className={`pdil-side pdil-side--${side}${winner === side ? ' pdil-side--winner' : ''}`}
                >
                  <p className="pdil-side__label">
                    {side === 'left' ? 'Argues for A' : 'Argues for B'}
                  </p>
                  <ul className="pdil-side__takes">
                    {(filteredDilemma?.takes ?? [])
                      .filter((t) => t.side === side)
                      .map((take) => {
                        const persona = findPersona(take.personaId);
                        if (!persona) return null;
                        return (
                          <li
                            key={take.personaId}
                            className="pdil-take"
                            style={{
                              ['--pdil-persona-color' as string]: persona.color,
                              ['--pdil-persona-bg' as string]: persona.bgTint,
                            }}
                          >
                            <header className="pdil-take__head">
                              <span className="pdil-take__dot" aria-hidden="true" />
                              <span className="pdil-take__name">{persona.name}</span>
                              <span className="pdil-take__temp">
                                T{persona.temperature.toFixed(1)}
                              </span>
                            </header>
                            <p className="pdil-take__take">{take.take}</p>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="pdil-pick" aria-label="Pick a winner">
              <p className="pdil-pick__label">
                <Sparkles aria-hidden="true" /> Who wins?
              </p>
              <div className="pdil-pick__buttons">
                <MotionButton
                  type="button"
                  variant={winner === 'left' ? 'primary' : 'secondary'}
                  size="md"
                  onClick={() => onPickWinner('left')}
                  icon={<CheckCircle2 aria-hidden="true" />}
                >
                  Pick {dilemma.left}
                </MotionButton>
                <MotionButton
                  type="button"
                  variant={winner === 'right' ? 'primary' : 'secondary'}
                  size="md"
                  onClick={() => onPickWinner('right')}
                  icon={<CheckCircle2 aria-hidden="true" />}
                >
                  Pick {dilemma.right}
                </MotionButton>
              </div>
            </div>

            <div className="pdil-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Sparkles aria-hidden="true" />}
              >
                Send the dilemma to Arena
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share dilemma'}
              </MotionButton>
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="pdil-history" aria-label="Recent dilemmas">
            <div className="pdil-history__head">
              <p className="pdil-history__label">
                <History aria-hidden="true" /> Recent dilemmas
              </p>
              <button
                type="button"
                className="pdil-history__clear"
                onClick={() => {
                  onClearHistory();
                  onClearLifetime();
                }}
                aria-label="Clear all history and lifetime tally"
              >
                <X aria-hidden="true" /> Clear all
              </button>
            </div>
            <ul>
              {history.slice(0, 6).map((entry, idx) => (
                <li key={`${idx}-${entry.left}-${entry.right}`}>
                  <Pressable
                    type="button"
                    className="pdil-history__item"
                    onClick={() => onLoadSample(entry)}
                  >
                    <span className="pdil-history__matchup">
                      {entry.left} <ArrowRight aria-hidden="true" /> {entry.right}
                    </span>
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