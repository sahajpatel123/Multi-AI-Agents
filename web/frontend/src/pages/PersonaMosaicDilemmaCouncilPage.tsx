import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  History,
  RotateCcw,
  Scale,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  buildMosaicDilemmaCouncil,
  mosaicDilemmaCouncilShareUrl,
  mosaicDilemmaCouncilValid,
  type PersonaMosaicDilemmaCouncil,
} from '../data/personaMosaicDilemmaCouncil';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-mosaic-dilemma-council-page.css';

const MAX_OPTION_CHARS = 120;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_DILEMMAS: ReadonlyArray<{ readonly label: string; readonly a: string; readonly b: string }> = [
  {
    label: 'Career paths',
    a: 'Take the safe job',
    b: 'Take the risky startup',
  },
  {
    label: 'The launch',
    a: 'Ship when ready',
    b: 'Ship to learn',
  },
  {
    label: 'The strategy',
    a: 'Specialize',
    b: 'Stay generalist',
  },
  {
    label: 'The communication',
    a: 'Tell them the hard truth',
    b: 'Let them figure it out',
  },
];

export function PersonaMosaicDilemmaCouncilPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialA = searchParams.get('a') ?? '';
  const initialB = searchParams.get('b') ?? '';

  const [optionA, setOptionA] = useState(initialA);
  const [optionB, setOptionB] = useState(initialB);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<{ a: string; b: string }>>([]);

  useEffect(() => {
    setPageVisible(true);
    try {
      const raw = window.localStorage.getItem('arena:persona-mosaic-dilemma-council:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const council: PersonaMosaicDilemmaCouncil | null = useMemo(() => {
    if (!optionA.trim() || !optionB.trim()) return null;
    const c = buildMosaicDilemmaCouncil(optionA, optionB);
    return mosaicDilemmaCouncilValid(c) ? c : null;
  }, [optionA, optionB]);

  const onConvene = () => {
    const url = mosaicDilemmaCouncilShareUrl(
      window.location.origin,
      optionA,
      optionB,
    );
    window.history.replaceState({}, '', url);
    try {
      const snippetA = optionA.length > 40 ? `${optionA.slice(0, 37)}...` : optionA;
      const snippetB = optionB.length > 40 ? `${optionB.slice(0, 37)}...` : optionB;
      const entry = { a: snippetA, b: snippetB };
      const next = [
        entry,
        ...history.filter((h) => h.a !== snippetA || h.b !== snippetB),
      ].slice(0, 6);
      window.localStorage.setItem(
        'arena:persona-mosaic-dilemma-council:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
  };

  const onReset = () => {
    setOptionA('');
    setOptionB('');
    const url = mosaicDilemmaCouncilShareUrl(window.location.origin, '', '');
    window.history.replaceState({}, '', url);
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setOptionA(sample.a);
    setOptionB(sample.b);
    const url = mosaicDilemmaCouncilShareUrl(
      window.location.origin,
      sample.a,
      sample.b,
    );
    window.history.replaceState({}, '', url);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !council) return;
    const url = mosaicDilemmaCouncilShareUrl(
      window.location.origin,
      optionA,
      optionB,
    );
    const winnerLabel = council.winner === 'A' ? 'Option A' : 'Option B';
    const winnerCount = council.winner === 'A' ? council.tally.a : council.tally.b;
    const text = `Arena Mosaic Dilemma Council: 8 Arena minds picked ${winnerLabel} (${winnerCount} of 8). Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Mosaic Dilemma Council', text, url });
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
    if (typeof window === 'undefined' || !optionA.trim() || !optionB.trim()) return;
    const link = `/app?prompt=${encodeURIComponent(`Mosaic Dilemma Council on: A) ${optionA} B) ${optionB}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  const onReplayHistory = (entry: { a: string; b: string }) => {
    setOptionA(entry.a);
    setOptionB(entry.b);
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-mosaic-dilemma-council:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  return (
    <div className={`pmdc-page${pageVisible ? ' pmdc-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pmdc-main${reduceMotion ? '' : ' pmdc-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pmdc-title"
      >
        <section className="pmdc-hero">
          <p className="pmdc-hero__eyebrow">
            <Scale aria-hidden="true" /> Persona Mosaic Dilemma Council
          </p>
          <h1 id="pmdc-title" className="pmdc-hero__title">
            <span>Two options.</span>
            <span className="pmdc-hero__title-accent">Eight minds vote.</span>
            <span>One verdict.</span>
          </h1>
          <p className="pmdc-hero__lede">
            Pick two options for a real dilemma. An 8-persona panel
            votes for a side + explains. Same pair in = same verdict,
            so a shared link replays the exact same deliberation.
          </p>
        </section>

        <section className="pmdc-input" aria-label="Dilemma input">
          <div className="pmdc-input__row">
            <label className="pmdc-input__field">
              <span className="pmdc-input__label">Option A</span>
              <input
                type="text"
                className="pmdc-input__text"
                value={optionA}
                onChange={(e) => setOptionA(e.target.value)}
                placeholder="Take the safe job"
                maxLength={MAX_OPTION_CHARS}
                aria-label="Option A"
              />
            </label>
            <span className="pmdc-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="pmdc-input__field">
              <span className="pmdc-input__label">Option B</span>
              <input
                type="text"
                className="pmdc-input__text"
                value={optionB}
                onChange={(e) => setOptionB(e.target.value)}
                placeholder="Take the risky startup"
                maxLength={MAX_OPTION_CHARS}
                aria-label="Option B"
              />
            </label>
          </div>
          <div className="pmdc-input__meta">
            <span>
              {optionA.length + optionB.length}/{MAX_OPTION_CHARS * 2} chars total
            </span>
            <div className="pmdc-input__actions">
              <button
                type="button"
                className="pmdc-input__reset"
                onClick={onReset}
                disabled={!optionA && !optionB}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onConvene}
                disabled={!optionA.trim() || !optionB.trim()}
                icon={<Scale aria-hidden="true" />}
              >
                Convene the council
              </MotionButton>
            </div>
          </div>
        </section>

        <section className="pmdc-samples" aria-label="Sample dilemmas">
          <p className="pmdc-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_DILEMMAS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pmdc-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pmdc-sample__label">{sample.label}</span>
                  <span className="pmdc-sample__matchup">
                    <span className="pmdc-sample__half">"{sample.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmdc-sample__half">"{sample.b}"</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {council && (
          <section className="pmdc-result" aria-label="Council verdict">
            <header className="pmdc-result__head">
              <p className="pmdc-result__kicker">
                <Scale aria-hidden="true" /> The 8-mind council has chosen
              </p>
              <h2 className="pmdc-result__winner">
                <span
                  className={`pmdc-result__winner-pill pmdc-result__winner-pill--${council.winner.toLowerCase()}`}
                >
                  Option {council.winner} wins
                </span>
                <span className="pmdc-result__tally">
                  {council.tally.a} for A · {council.tally.b} for B
                </span>
              </h2>
            </header>

            <div className="pmdc-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`pmdc-side pmdc-side--${side.toLowerCase()}${council.winner === side ? ' pmdc-side--winner' : ''}`}
                >
                  <p className="pmdc-side__label">Option {side}</p>
                  <blockquote className="pmdc-side__quote">
                    {side === 'A' ? council.optionA : council.optionB}
                  </blockquote>
                </div>
              ))}
            </div>

            <ol className="pmdc-critics">
              {council.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                const isUp = critique.pick === 'A';
                return (
                  <li
                    key={critique.personaId}
                    className={`pmdc-critic pmdc-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--pmdc-persona-color' as string]: persona.color,
                      ['--pmdc-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pmdc-critic__head">
                      <span className="pmdc-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="pmdc-critic__name">{persona.name}</p>
                        <p className="pmdc-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pmdc-critic__pick">
                        {isUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="pmdc-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="pmdc-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Sparkles aria-hidden="true" />}
              >
                Send to Arena for a real panel
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share verdict'}
              </MotionButton>
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="pmdc-history" aria-label="Recent dilemmas">
            <div className="pmdc-history__head">
              <p className="pmdc-history__label">
                <History aria-hidden="true" /> Recent dilemmas
              </p>
              <button
                type="button"
                className="pmdc-history__clear"
                onClick={onClearHistory}
                aria-label="Clear dilemma history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.map((entry, idx) => (
                <li key={`${idx}-${entry.a.slice(0, 16)}`}>
                  <Pressable
                    type="button"
                    className="pmdc-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="pmdc-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmdc-history__b">B: "{entry.b}"</span>
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