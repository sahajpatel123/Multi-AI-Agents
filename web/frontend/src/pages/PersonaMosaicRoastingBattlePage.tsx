import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  History,
  RotateCcw,
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
  appendMosaicRoastingBattleDecision,
  buildMosaicRoastingBattle,
  clearMosaicRoastingBattleCounter,
  clearMosaicRoastingBattleDecisions,
  incrementMosaicRoastingBattleCounter,
  mosaicRoastingBattleMajorityInfo,
  mosaicRoastingBattleShareUrl,
  mosaicRoastingBattleValid,
  mosaicRoastingBattleWinTally,
  readMosaicRoastingBattleCounter,
  readMosaicRoastingBattleDecisions,
  type MosaicRoastingBattleDecisionEntry,
  type PersonaMosaicRoastingBattle,
} from '../data/personaMosaicRoastingBattle';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-mosaic-roasting-battle-page.css';

const MAX_OUTPUT_CHARS = 1500;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_BATTLES: ReadonlyArray<{ readonly label: string; readonly a: string; readonly b: string }> = [
  {
    label: 'Hedge vs. sharp',
    a: 'It depends on the context. There are many ways to think about this, and reasonable people might disagree on the right path forward.',
    b: 'Take the bold path. The cost of being right later is higher than the cost of being wrong now.',
  },
  {
    label: 'Generic vs. specific',
    a: 'There are many factors to consider. Each situation is unique and a thoughtful approach is recommended.',
    b: 'Your conversion rate is 2.3%, your ACV is $4,800, and the bottleneck is your trial onboarding — fix that first.',
  },
  {
    label: 'Hedged vs. confident',
    a: 'On one hand, there are clear benefits. On the other hand, the risks should not be overlooked. A balanced approach may be warranted.',
    b: 'AI-native workflows are winning because the cost of inference collapsed. The next 18 months are the inflection point.',
  },
  {
    label: 'Hedge vs. confidence',
    a: 'Some say X, others say Y, and the truth is probably somewhere in between. It depends on the specific context.',
    b: 'X. Here is why, and here is what you should do about it.',
  },
];

export function PersonaMosaicRoastingBattlePage() {
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
  const [castCount, setCastCount] = useState(0);
  const [decisions, setDecisions] = useState<ReadonlyArray<MosaicRoastingBattleDecisionEntry>>([]);

  useEffect(() => {
    setPageVisible(true);
    setCastCount(readMosaicRoastingBattleCounter());
    setDecisions(readMosaicRoastingBattleDecisions());
    try {
      const raw = window.localStorage.getItem('arena:persona-mosaic-roasting-battle:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const battle: PersonaMosaicRoastingBattle | null = useMemo(() => {
    if (!outputA.trim() || !outputB.trim()) return null;
    const b = buildMosaicRoastingBattle(outputA, outputB);
    return mosaicRoastingBattleValid(b) ? b : null;
  }, [outputA, outputB]);

  const lifetimeTally = useMemo(
    () => mosaicRoastingBattleWinTally(decisions),
    [decisions],
  );

  const majority = useMemo(
    () => (battle ? mosaicRoastingBattleMajorityInfo(battle.tally, battle.winner) : null),
    [battle],
  );

  const onBattle = () => {
    const url = mosaicRoastingBattleShareUrl(
      window.location.origin,
      outputA,
      outputB,
    );
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
        'arena:persona-mosaic-roasting-battle:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    if (battle) {
      const decision: MosaicRoastingBattleDecisionEntry = {
        id: `battle-${Date.now()}`,
        outputASnippet: outputA.length > 60 ? `${outputA.slice(0, 57)}...` : outputA,
        outputBSnippet: outputB.length > 60 ? `${outputB.slice(0, 57)}...` : outputB,
        winner: battle.winner,
        savedAt: new Date().toISOString(),
      };
      appendMosaicRoastingBattleDecision(decision);
      setDecisions(readMosaicRoastingBattleDecisions());
    }
    const c = incrementMosaicRoastingBattleCounter();
    setCastCount(c);
  };

  const onResetLifetime = () => {
    clearMosaicRoastingBattleCounter();
    clearMosaicRoastingBattleDecisions();
    setCastCount(0);
    setDecisions([]);
  };

  const onReset = () => {
    setOutputA('');
    setOutputB('');
    const url = mosaicRoastingBattleShareUrl(window.location.origin, '', '');
    window.history.replaceState({}, '', url);
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setOutputA(sample.a);
    setOutputB(sample.b);
    const url = mosaicRoastingBattleShareUrl(
      window.location.origin,
      sample.a,
      sample.b,
    );
    window.history.replaceState({}, '', url);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !battle) return;
    const url = mosaicRoastingBattleShareUrl(
      window.location.origin,
      outputA,
      outputB,
    );
    const winnerLabel = battle.winner === 'A' ? 'Output A' : 'Output B';
    const winnerCount = battle.winner === 'A' ? battle.tally.a : battle.tally.b;
    const text = `Arena Mosaic Roasting Battle: 4 Arena minds picked ${winnerLabel} (${winnerCount} of 4). Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Mosaic Roasting Battle', text, url });
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
    const link = `/app?prompt=${encodeURIComponent(`Mosaic Roasting Battle: A) ${outputA} B) ${outputB}`)}`;
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
      window.localStorage.removeItem('arena:persona-mosaic-roasting-battle:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  return (
    <div className={`pmrb-page${pageVisible ? ' pmrb-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pmrb-main${reduceMotion ? '' : ' pmrb-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pmrb-title"
      >
        <section className="pmrb-hero">
          <p className="pmrb-hero__eyebrow">
            <CheckCircle2 aria-hidden="true" /> Persona Mosaic Roasting Battle
          </p>
          <h1 id="pmrb-title" className="pmrb-hero__title">
            <span>Two Mosaic Roastings.</span>
            <span className="pmrb-hero__title-accent">Four minds judge.</span>
            <span>One is sharper.</span>
          </h1>
          <p className="pmrb-hero__lede">
            Paste two Mosaic Roasting results and a 4-persona
            panel picks the sharper one. Each mind votes +
            explains. Same inputs in = same verdict, so a
            shared link replays the exact same battle.
          </p>
        </section>

        <section className="pmrb-input" aria-label="Battle input">
          <div className="pmrb-input__row">
            <label className="pmrb-input__field">
              <span className="pmrb-input__label">Mosaic Roasting A</span>
              <textarea
                className="pmrb-input__textarea"
                value={outputA}
                onChange={(e) => setOutputA(e.target.value)}
                placeholder="Paste the first Mosaic Roasting result..."
                maxLength={MAX_OUTPUT_CHARS}
                rows={4}
                aria-label="Mosaic Roasting A"
              />
            </label>
            <span className="pmrb-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="pmrb-input__field">
              <span className="pmrb-input__label">Mosaic Roasting B</span>
              <textarea
                className="pmrb-input__textarea"
                value={outputB}
                onChange={(e) => setOutputB(e.target.value)}
                placeholder="Paste the second Mosaic Roasting result..."
                maxLength={MAX_OUTPUT_CHARS}
                rows={4}
                aria-label="Mosaic Roasting B"
              />
            </label>
          </div>
          <div className="pmrb-input__meta">
            <span>
              {outputA.length + outputB.length}/{MAX_OUTPUT_CHARS * 2} chars total
            </span>
            <div className="pmrb-input__actions">
              <button
                type="button"
                className="pmrb-input__reset"
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
                icon={<CheckCircle2 aria-hidden="true" />}
              >
                Run the battle
              </MotionButton>
            </div>
          </div>
          <div className="pmrb-input__stats" aria-label="Mosaic roasting battle stats">
            <div className="pmrb-input__stat">
              <Sparkles aria-hidden="true" />
              <span className="pmrb-input__stat-label">Battles cast</span>
              <span className="pmrb-input__stat-value">{castCount}</span>
            </div>
            {lifetimeTally.a > 0 && (
              <div className="pmrb-input__stat pmrb-input__stat--a">
                <span className="pmrb-input__stat-label">A wins</span>
                <span className="pmrb-input__stat-value">{lifetimeTally.a}</span>
              </div>
            )}
            {lifetimeTally.b > 0 && (
              <div className="pmrb-input__stat pmrb-input__stat--b">
                <span className="pmrb-input__stat-label">B wins</span>
                <span className="pmrb-input__stat-value">{lifetimeTally.b}</span>
              </div>
            )}
            {(castCount > 0 || lifetimeTally.a > 0 || lifetimeTally.b > 0) && (
              <button
                type="button"
                className="pmrb-input__stat-reset"
                onClick={onResetLifetime}
                aria-label="Reset battles counter and lifetime tally"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        <section className="pmrb-samples" aria-label="Sample battles">
          <p className="pmrb-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_BATTLES.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pmrb-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pmrb-sample__label">{sample.label}</span>
                  <span className="pmrb-sample__matchup">
                    <span className="pmrb-sample__half">"{sample.a.slice(0, 50)}..."</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmrb-sample__half">"{sample.b.slice(0, 50)}..."</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {battle && (
          <section className="pmrb-result" aria-label="Mosaic Roasting battle result">
            <header className="pmrb-result__head">
              <p className="pmrb-result__kicker">
                <CheckCircle2 aria-hidden="true" /> The 4-mind panel has chosen
              </p>
              <h2 className="pmrb-result__winner">
                <span
                  className={`pmrb-result__winner-pill pmrb-result__winner-pill--${battle.winner.toLowerCase()}`}
                >
                  Mosaic Roasting {battle.winner} is sharper
                </span>
                <span className="pmrb-result__tally">
                  {battle.tally.a} for A · {battle.tally.b} for B
                </span>
              </h2>
              {majority && (
                <p className={`pmrb-result__majority pmrb-result__majority--${majority.label}`}>
                  {majority.description}
                </p>
              )}
            </header>

            <div className="pmrb-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`pmrb-side pmrb-side--${side.toLowerCase()}${battle.winner === side ? ' pmrb-side--winner' : ''}`}
                >
                  <p className="pmrb-side__label">Mosaic Roasting {side}</p>
                  <blockquote className="pmrb-side__quote">
                    {side === 'A' ? battle.outputA : battle.outputB}
                  </blockquote>
                </div>
              ))}
            </div>

            <ol className="pmrb-critics">
              {battle.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                const isUp = critique.pick === 'A';
                return (
                  <li
                    key={critique.personaId}
                    className={`pmrb-critic pmrb-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--pmrb-persona-color' as string]: persona.color,
                      ['--pmrb-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pmrb-critic__head">
                      <span className="pmrb-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="pmrb-critic__name">{persona.name}</p>
                        <p className="pmrb-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pmrb-critic__pick">
                        {isUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="pmrb-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="pmrb-result__actions">
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
          <section className="pmrb-history" aria-label="Recent battles">
            <div className="pmrb-history__head">
              <p className="pmrb-history__label">
                <History aria-hidden="true" /> Recent battles
              </p>
              <button
                type="button"
                className="pmrb-history__clear"
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
                    className="pmrb-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="pmrb-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmrb-history__b">B: "{entry.b}"</span>
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