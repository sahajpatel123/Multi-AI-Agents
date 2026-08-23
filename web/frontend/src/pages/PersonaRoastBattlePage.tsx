import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Crown,
  History,
  RotateCcw,
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
  appendRoastBattleDecision,
  buildRoastBattle,
  clearRoastBattleCounter,
  clearRoastBattleDecisions,
  incrementRoastBattleCounter,
  readRoastBattleCounter,
  readRoastBattleDecisions,
  roastBattleShareUrl,
  roastBattleValid,
  winTally,
  type PersonaRoastBattle,
  type RoastBattleDecisionEntry,
} from '../data/personaRoastBattle';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-roast-battle-page.css';

const MAX_OUTPUT_CHARS = 800;

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
    label: 'Safe vs. sharp',
    a: 'Thank you for your inquiry. We appreciate your interest and will follow up shortly with the requested materials.',
    b: 'No. Here is why, and here is what I would do instead.',
  },
  {
    label: 'Generic vs. specific',
    a: 'There are many factors to consider. Each situation is unique and a thoughtful approach is recommended.',
    b: 'Your conversion rate is 2.3%, your ACV is $4,800, and the bottleneck is your trial onboarding — fix that first.',
  },
  {
    label: 'Hedged analysis vs. confident take',
    a: 'On one hand, there are clear benefits. On the other hand, the risks should not be overlooked. A balanced approach may be warranted.',
    b: 'AI-native workflows are winning because the cost of inference collapsed. The next 18 months are the inflection point.',
  },
];

export function PersonaRoastBattlePage() {
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
  const [decisions, setDecisions] = useState<ReadonlyArray<RoastBattleDecisionEntry>>([]);

  useEffect(() => {
    setPageVisible(true);
    setCastCount(readRoastBattleCounter());
    setDecisions(readRoastBattleDecisions());
    try {
      const raw = window.localStorage.getItem('arena:persona-roast-battle:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const battle: PersonaRoastBattle | null = useMemo(() => {
    if (!outputA.trim() || !outputB.trim()) return null;
    const b = buildRoastBattle(outputA, outputB);
    return roastBattleValid(b) ? b : null;
  }, [outputA, outputB]);

const lifetimeTally = useMemo(() => winTally(decisions), [decisions]);

  const onBattle = () => {
    if (typeof window === 'undefined') return;
    const url = roastBattleShareUrl(window.location.origin, outputA, outputB);
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
        'arena:persona-roast-battle:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    // Append the decision to the lifetime tally log.
    if (battle) {
      const decision: RoastBattleDecisionEntry = {
        id: `battle-${Date.now()}`,
        outputASnippet: outputA.length > 60 ? `${outputA.slice(0, 57)}...` : outputA,
        outputBSnippet: outputB.length > 60 ? `${outputB.slice(0, 57)}...` : outputB,
        winner: battle.winner,
        savedAt: new Date().toISOString(),
      };
      appendRoastBattleDecision(decision);
      setDecisions(readRoastBattleDecisions());
    }
    const c = incrementRoastBattleCounter();
    setCastCount(c);
  };

  const onResetLifetime = () => {
    clearRoastBattleCounter();
    clearRoastBattleDecisions();
    setCastCount(0);
    setDecisions([]);
  };

  const onReset = () => {
    setOutputA('');
    setOutputB('');
    if (typeof window !== 'undefined') {
      const url = roastBattleShareUrl(window.location.origin, '', '');
      window.history.replaceState({}, '', url);
    }
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setOutputA(sample.a);
    setOutputB(sample.b);
    if (typeof window !== 'undefined') {
      const url = roastBattleShareUrl(window.location.origin, sample.a, sample.b);
      window.history.replaceState({}, '', url);
    }
  };

  const onReplayHistory = (entry: { a: string; b: string }) => {
    setOutputA(entry.a);
    setOutputB(entry.b);
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-roast-battle:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !battle) return;
    const url = roastBattleShareUrl(window.location.origin, outputA, outputB);
    const winnerLabel = battle.winner === 'A' ? 'Output A' : 'Output B';
    const text = `Arena Roast Battle: 4 Arena minds picked ${winnerLabel} (${battle.tally[battle.winner.toLowerCase() as 'a' | 'b']} of 4). Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Roast Battle', text, url });
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
    const link = `/app?prompt=${encodeURIComponent(`Compare these two AI outputs and pick the better one: A) ${outputA} B) ${outputB}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  return (
    <div className={`prb-page${pageVisible ? ' prb-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`prb-main${reduceMotion ? '' : ' prb-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="prb-title"
      >
        <section className="prb-hero">
          <p className="prb-hero__eyebrow">
            <Swords aria-hidden="true" /> Persona Roast Battle
          </p>
          <h1 id="prb-title" className="prb-hero__title">
            <span>Two outputs.</span>
            <span className="prb-hero__title-accent">Four minds judge.</span>
            <span>One winner.</span>
          </h1>
          <p className="prb-hero__lede">
            Paste two AI outputs and the panel picks the sharper one.
            Each mind votes for a side + explains why. Same pair in
            always produces the same verdict, so a shared link
            replays the exact same battle.
          </p>
        </section>

        <section className="prb-input" aria-label="Battle input">
          <div className="prb-input__row">
            <label className="prb-input__field">
              <span className="prb-input__label">Output A</span>
              <textarea
                className="prb-input__textarea"
                value={outputA}
                onChange={(e) => setOutputA(e.target.value)}
                placeholder="Paste the first AI response."
                maxLength={MAX_OUTPUT_CHARS}
                rows={4}
                aria-label="Output A"
              />
            </label>
            <span className="prb-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="prb-input__field">
              <span className="prb-input__label">Output B</span>
              <textarea
                className="prb-input__textarea"
                value={outputB}
                onChange={(e) => setOutputB(e.target.value)}
                placeholder="Paste the second AI response."
                maxLength={MAX_OUTPUT_CHARS}
                rows={4}
                aria-label="Output B"
              />
            </label>
          </div>
          <div className="prb-input__meta">
            <span>
              {outputA.length + outputB.length}/{MAX_OUTPUT_CHARS * 2} chars total
            </span>
            <div className="prb-input__actions">
              <button
                type="button"
                className="prb-input__reset"
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
                icon={<Trophy aria-hidden="true" />}
              >
                Run the battle
              </MotionButton>
            </div>
          </div>
          <div className="prb-input__stats" aria-label="Battle stats">
            <div className="prb-input__stat">
              <Swords aria-hidden="true" />
              <span className="prb-input__stat-label">Battles run</span>
              <span className="prb-input__stat-value">{castCount}</span>
            </div>
            {lifetimeTally.total > 0 && (
              <div className="prb-input__stat prb-input__stat--a">
                <span className="prb-input__stat-label">A wins</span>
                <span className="prb-input__stat-value">{lifetimeTally.a}</span>
              </div>
            )}
            {lifetimeTally.total > 0 && (
              <div className="prb-input__stat prb-input__stat--b">
                <span className="prb-input__stat-label">B wins</span>
                <span className="prb-input__stat-value">{lifetimeTally.b}</span>
              </div>
            )}
            {(castCount > 0 || lifetimeTally.total > 0) && (
              <button
                type="button"
                className="prb-input__stat-reset"
                onClick={onResetLifetime}
                aria-label="Reset battles counter and lifetime tally"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        <section className="prb-samples" aria-label="Sample battles">
          <p className="prb-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_BATTLES.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="prb-sample"
                  onClick={() => onLoadSample({ a: sample.a, b: sample.b })}
                >
                  <span className="prb-sample__label">{sample.label}</span>
                  <span className="prb-sample__matchup">
                    <span className="prb-sample__half">"{sample.a.slice(0, 40)}..."</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="prb-sample__half">"{sample.b.slice(0, 40)}..."</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {battle && (
          <section className="prb-result" aria-label="Battle result">
            <header className="prb-result__head">
              <p className="prb-result__kicker">
                <Crown aria-hidden="true" /> The panel has chosen
              </p>
              <h2 className="prb-result__winner">
                <span className={`prb-result__winner-pill prb-result__winner-pill--${battle.winner.toLowerCase()}`}>
                  Output {battle.winner} wins
                </span>
                <span className="prb-result__tally">
                  {battle.tally.a} for A · {battle.tally.b} for B
                </span>
              </h2>
            </header>

            <div className="prb-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`prb-side prb-side--${side.toLowerCase()}${battle.winner === side ? ' prb-side--winner' : ''}`}
                >
                  <p className="prb-side__label">Output {side}</p>
                  <blockquote className="prb-side__quote">
                    {side === 'A' ? battle.outputA : battle.outputB}
                  </blockquote>
                </div>
              ))}
            </div>

            <ol className="prb-critics">
              {battle.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                return (
                  <li
                    key={critique.personaId}
                    className={`prb-critic prb-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--prb-persona-color' as string]: persona.color,
                      ['--prb-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="prb-critic__head">
                      <span className="prb-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="prb-critic__name">{persona.name}</p>
                        <p className="prb-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="prb-critic__pick">
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="prb-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="prb-result__actions">
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
          <section className="prb-history" aria-label="Recent battles">
            <div className="prb-history__head">
              <p className="prb-history__label">
                <History aria-hidden="true" /> Recent battles
              </p>
              <button
                type="button"
                className="prb-history__clear"
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
                    className="prb-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="prb-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="prb-history__b">B: "{entry.b}"</span>
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
