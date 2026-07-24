import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  History,
  RotateCcw,
  Share2,
  Sparkles,
  Swords,
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
  buildMosaicBattle,
  mosaicBattleShareUrl,
  mosaicBattleValid,
  type PersonaMosaicBattle,
} from '../data/personaMosaicBattle';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-mosaic-battle-page.css';

const MAX_OUTPUT_CHARS = 1500;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_BATTLES: ReadonlyArray<{ readonly label: string; readonly a: string; readonly b: string }> = [
  {
    label: 'Hedge vs. conviction',
    a: 'It depends on the context. There are many ways to think about this, and reasonable people might disagree on the right path forward.',
    b: 'Take the bold path. The cost of being right later is higher than the cost of being wrong now.',
  },
  {
    label: 'Generic vs. specific',
    a: 'There are many factors to consider. Each situation is unique and a thoughtful approach is recommended.',
    b: 'Your conversion rate is 2.3%, your ACV is $4,800, and the bottleneck is your trial onboarding — fix that first.',
  },
  {
    label: 'Mosaic #1',
    a: 'The philosopher reframes: "The question may be the right one at the wrong scope. Most dilemma framings are not. That is the difference."',
    b: 'The analyst: "Where this kind of dilemma has been resolved before, the answer was clear. Trust the precedent."',
  },
  {
    label: 'Mosaic #2',
    a: 'The contrarian: "I am taking the opposite side. The consensus is a polite disagreement you have not started yet."',
    b: 'The pragmatist: "You can act on this on Monday morning. That is the test most dilemma answers fail."',
  },
];

export function PersonaMosaicBattlePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialA = searchParams.get('a') ?? '';
  const initialB = searchParams.get('b') ?? '';

  const [outputA, setOutputA] = useState(initialA);
  const [outputB, setOutputB] = useState(initialB);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<{ a: string; b: string }>>([]);

  useEffect(() => {
    setPageVisible(true);
    try {
      const raw = window.localStorage.getItem('arena:persona-mosaic-battle:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const battle: PersonaMosaicBattle | null = useMemo(() => {
    if (!outputA.trim() || !outputB.trim()) return null;
    const b = buildMosaicBattle(outputA, outputB);
    return mosaicBattleValid(b) ? b : null;
  }, [outputA, outputB]);

  const onBattle = () => {
    if (typeof window === 'undefined') return;
    const url = mosaicBattleShareUrl(window.location.origin, outputA, outputB);
    window.history.replaceState({}, '', url);
    try {
      const snippetA = outputA.length > 60 ? `${outputA.slice(0, 57)}...` : outputA;
      const snippetB = outputB.length > 60 ? `${outputB.slice(0, 57)}...` : outputB;
      const entry = { a: snippetA, b: snippetB };
      const next = [
        entry,
        ...history.filter((h) => h.a !== snippetA || h.b !== snippetB),
      ].slice(0, 6);
      window.localStorage.setItem(
        'arena:persona-mosaic-battle:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
  };

  const onReset = () => {
    setOutputA('');
    setOutputB('');
    const url = mosaicBattleShareUrl(window.location.origin, '', '');
    window.history.replaceState({}, '', url);
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setOutputA(sample.a);
    setOutputB(sample.b);
    if (typeof window !== 'undefined') {
      const url = mosaicBattleShareUrl(window.location.origin, sample.a, sample.b);
      window.history.replaceState({}, '', url);
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !battle) return;
    const url = mosaicBattleShareUrl(window.location.origin, outputA, outputB);
    const winnerLabel = battle.winner === 'A' ? 'Output A' : 'Output B';
    const winnerCount = battle.winner === 'A' ? battle.tally.a : battle.tally.b;
    const text = `Arena Mosaic Battle: 4 Arena minds picked ${winnerLabel} (${winnerCount} of 4). Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Mosaic Battle', text, url });
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
    if (typeof window === 'undefined' || !outputA.trim() || !outputB.trim()) return;
    const link = `/app?prompt=${encodeURIComponent(`Mosaic Battle: which of these two outputs is sharper — A) ${outputA} B) ${outputB}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  const onReplayHistory = (entry: { a: string; b: string }) => {
    setOutputA(entry.a);
    setOutputB(entry.b);
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-mosaic-battle:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  return (
    <div className={`pmob-page${pageVisible ? ' pmob-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pmob-main${reduceMotion ? '' : ' pmob-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pmob-title"
      >
        <section className="pmob-hero">
          <p className="pmob-hero__eyebrow">
            <Swords aria-hidden="true" /> Persona Mosaic Battle
          </p>
          <h1 id="pmob-title" className="pmob-hero__title">
            <span>Two outputs.</span>
            <span className="pmob-hero__title-accent">Four minds judge.</span>
            <span>One winner.</span>
          </h1>
          <p className="pmob-hero__lede">
            Paste two AI outputs — including Mosaic responses — and
            a 4-persona panel picks the sharper one. Each mind votes
            + explains. Same pair in = same verdict, so a shared
            link replays the exact same battle.
          </p>
        </section>

        <section className="pmob-input" aria-label="Battle input">
          <div className="pmob-input__row">
            <label className="pmob-input__field">
              <span className="pmob-input__label">Output A</span>
              <textarea
                className="pmob-input__textarea"
                value={outputA}
                onChange={(e) => setOutputA(e.target.value)}
                placeholder="Paste the first AI response (Mosaic output, agent reply, etc.)."
                maxLength={MAX_OUTPUT_CHARS}
                rows={5}
                aria-label="Output A"
              />
            </label>
            <span className="pmob-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="pmob-input__field">
              <span className="pmob-input__label">Output B</span>
              <textarea
                className="pmob-input__textarea"
                value={outputB}
                onChange={(e) => setOutputB(e.target.value)}
                placeholder="Paste the second AI response."
                maxLength={MAX_OUTPUT_CHARS}
                rows={5}
                aria-label="Output B"
              />
            </label>
          </div>
          <div className="pmob-input__meta">
            <span>
              {outputA.length + outputB.length}/{MAX_OUTPUT_CHARS * 2} chars total
            </span>
            <div className="pmob-input__actions">
              <button
                type="button"
                className="pmob-input__reset"
                onClick={onReset}
                disabled={!outputA && !outputB}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onBattle}
                disabled={!outputA.trim() || !outputB.trim()}
                icon={<Swords aria-hidden="true" />}
              >
                Run the battle
              </MotionButton>
            </div>
          </div>
        </section>

        <section className="pmob-samples" aria-label="Sample battles">
          <p className="pmob-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_BATTLES.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pmob-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pmob-sample__label">{sample.label}</span>
                  <span className="pmob-sample__matchup">
                    <span className="pmob-sample__half">"{sample.a.slice(0, 50)}..."</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmob-sample__half">"{sample.b.slice(0, 50)}..."</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {battle && (
          <section className="pmob-result" aria-label="Battle result">
            <header className="pmob-result__head">
              <p className="pmob-result__kicker">
                <Swords aria-hidden="true" /> The mosaic has chosen
              </p>
              <h2 className="pmob-result__winner">
                <span
                  className={`pmob-result__winner-pill pmob-result__winner-pill--${battle.winner.toLowerCase()}`}
                >
                  Output {battle.winner} wins
                </span>
                <span className="pmob-result__tally">
                  {battle.tally.a} for A · {battle.tally.b} for B
                </span>
              </h2>
            </header>

            <div className="pmob-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`pmob-side pmob-side--${side.toLowerCase()}${battle.winner === side ? ' pmob-side--winner' : ''}`}
                >
                  <p className="pmob-side__label">Output {side}</p>
                  <blockquote className="pmob-side__quote">
                    {side === 'A' ? battle.outputA : battle.outputB}
                  </blockquote>
                </div>
              ))}
            </div>

            <ol className="pmob-critics">
              {battle.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                const isUp = critique.pick === 'A';
                return (
                  <li
                    key={critique.personaId}
                    className={`pmob-critic pmob-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--pmob-persona-color' as string]: persona.color,
                      ['--pmob-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pmob-critic__head">
                      <span className="pmob-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="pmob-critic__name">{persona.name}</p>
                        <p className="pmob-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pmob-critic__pick">
                        {isUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="pmob-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="pmob-result__actions">
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
          <section className="pmob-history" aria-label="Recent battles">
            <div className="pmob-history__head">
              <p className="pmob-history__label">
                <History aria-hidden="true" /> Recent battles
              </p>
              <button
                type="button"
                className="pmob-history__clear"
                onClick={onClearHistory}
                aria-label="Clear battle history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.map((entry, idx) => (
                <li key={`${idx}-${entry.a.slice(0, 16)}`}>
                  <Pressable
                    type="button"
                    className="pmob-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="pmob-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmob-history__b">B: "{entry.b}"</span>
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