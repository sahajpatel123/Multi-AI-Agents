import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Crown,
  Filter,
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
  appendRoastBattleCouncilDecision,
  buildRoastBattleCouncil,
  clearRoastBattleCouncilCounter,
  clearRoastBattleCouncilDecisions,
  incrementRoastBattleCouncilCounter,
  majorityInfo,
  readRoastBattleCouncilCounter,
  readRoastBattleCouncilDecisions,
  roastBattleCouncilShareUrl,
  roastBattleCouncilValid,
  roastBattleCouncilWinTally,
  type PersonaRoastBattleCouncil,
  type RoastBattleCouncilPick,
} from '../data/personaRoastBattleCouncil';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-roast-battle-council-page.css';

const MAX_OUTPUT_CHARS = 1500;
const MAX_PICKS_VISIBLE = 8;

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
    label: 'Hedged analysis vs. confident take',
    a: 'On one hand, there are clear benefits. On the other hand, the risks should not be overlooked. A balanced approach may be warranted.',
    b: 'AI-native workflows are winning because the cost of inference collapsed. The next 18 months are the inflection point.',
  },
];

export function PersonaRoastBattleCouncilPage() {
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
  const [filter, setFilter] = useState<RoastBattleCouncilPick | 'all'>('all');
  const [castCount, setCastCount] = useState(0);
  const [decisions, setDecisions] = useState<
    ReadonlyArray<
      ReturnType<typeof readRoastBattleCouncilDecisions>[number]
    >
  >([]);

  useEffect(() => {
    setPageVisible(true);
    setCastCount(readRoastBattleCouncilCounter());
    setDecisions(readRoastBattleCouncilDecisions());
    try {
      const raw = window.localStorage.getItem('arena:persona-roast-battle-council:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const council: PersonaRoastBattleCouncil | null = useMemo(() => {
    if (!outputA.trim() || !outputB.trim()) return null;
    const c = buildRoastBattleCouncil(outputA, outputB);
    return roastBattleCouncilValid(c) ? c : null;
  }, [outputA, outputB]);

  const visibleCritiques = useMemo(() => {
    if (!council) return [];
    if (filter === 'all') return council.critiques;
    return council.critiques.filter((c) => c.pick === filter);
  }, [council, filter]);

  const lifetimeTally = useMemo(
    () => roastBattleCouncilWinTally(decisions),
    [decisions],
  );

  const majority = useMemo(
    () => (council ? majorityInfo(council.tally, council.winner) : null),
    [council],
  );

  const onBattle = () => {
    if (typeof window === 'undefined') return;
    const url = roastBattleCouncilShareUrl(window.location.origin, outputA, outputB);
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
        'arena:persona-roast-battle-council:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    if (council) {
      const decision = {
        id: `battle-${Date.now()}`,
        outputASnippet: outputA.length > 60 ? `${outputA.slice(0, 57)}...` : outputA,
        outputBSnippet: outputB.length > 60 ? `${outputB.slice(0, 57)}...` : outputB,
        winner: council.winner,
        savedAt: new Date().toISOString(),
      };
      appendRoastBattleCouncilDecision(decision);
      setDecisions(readRoastBattleCouncilDecisions());
    }
    const c = incrementRoastBattleCouncilCounter();
    setCastCount(c);
  };

  const onResetLifetime = () => {
    clearRoastBattleCouncilCounter();
    clearRoastBattleCouncilDecisions();
    setCastCount(0);
    setDecisions([]);
  };

  const onReset = () => {
    setOutputA('');
    setOutputB('');
    setFilter('all');
    if (typeof window !== 'undefined') {
      const url = roastBattleCouncilShareUrl(window.location.origin, '', '');
      window.history.replaceState({}, '', url);
    }
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setOutputA(sample.a);
    setOutputB(sample.b);
    if (typeof window !== 'undefined') {
      const url = roastBattleCouncilShareUrl(window.location.origin, sample.a, sample.b);
      window.history.replaceState({}, '', url);
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !council) return;
    const url = roastBattleCouncilShareUrl(window.location.origin, outputA, outputB);
    const winnerLabel = council.winner === 'A' ? 'Output A' : 'Output B';
    const winnerCount = council.winner === 'A' ? council.tally.a : council.tally.b;
    const text = `Arena Roast Battle Council: 8 Arena minds picked ${winnerLabel} (${winnerCount} of 8). Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Roast Battle Council', text, url });
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
    const link = `/app?prompt=${encodeURIComponent(`Compare these two AI outputs: A) ${outputA} B) ${outputB}`)}`;
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
      window.localStorage.removeItem('arena:persona-roast-battle-council:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  return (
    <div className={`prbc-page${pageVisible ? ' prbc-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`prbc-main${reduceMotion ? '' : ' prbc-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="prbc-title"
      >
        <section className="prbc-hero">
          <p className="prbc-hero__eyebrow">
            <Crown aria-hidden="true" /> Persona Roast Battle Council
          </p>
          <h1 id="prbc-title" className="prbc-hero__title">
            <span>Two outputs.</span>
            <span className="prbc-hero__title-accent">Eight minds judge.</span>
            <span>One winner.</span>
          </h1>
          <p className="prbc-hero__lede">
            Paste two AI outputs and an 8-persona panel picks the
            sharper one. Each mind votes + explains. Same pair in
            produces the same verdict, so a shared link replays the
            exact same deliberation.
          </p>
        </section>

        <section className="prbc-input" aria-label="Battle input">
          <div className="prbc-input__row">
            <label className="prbc-input__field">
              <span className="prbc-input__label">Output A</span>
              <textarea
                className="prbc-input__textarea"
                value={outputA}
                onChange={(e) => setOutputA(e.target.value)}
                placeholder="Paste the first AI response."
                maxLength={MAX_OUTPUT_CHARS}
                rows={5}
                aria-label="Output A"
              />
            </label>
            <span className="prbc-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="prbc-input__field">
              <span className="prbc-input__label">Output B</span>
              <textarea
                className="prbc-input__textarea"
                value={outputB}
                onChange={(e) => setOutputB(e.target.value)}
                placeholder="Paste the second AI response."
                maxLength={MAX_OUTPUT_CHARS}
                rows={5}
                aria-label="Output B"
              />
            </label>
          </div>
          <div className="prbc-input__meta">
            <span>
              {outputA.length + outputB.length}/{MAX_OUTPUT_CHARS * 2} chars total
            </span>
            <div className="prbc-input__actions">
              <button
                type="button"
                className="prbc-input__reset"
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
                icon={<Crown aria-hidden="true" />}
              >
                Convene the council
              </MotionButton>
            </div>
          </div>
          <div className="prbc-input__stats" aria-label="Council stats">
            <div className="prbc-input__stat">
              <Crown aria-hidden="true" />
              <span className="prbc-input__stat-label">Councils convened</span>
              <span className="prbc-input__stat-value">{castCount}</span>
            </div>
            {(lifetimeTally.total ?? 0) > 0 && (
              <div className="prbc-input__stat prbc-input__stat--a">
                <span className="prbc-input__stat-label">A wins</span>
                <span className="prbc-input__stat-value">{lifetimeTally.a}</span>
              </div>
            )}
            {(lifetimeTally.total ?? 0) > 0 && (
              <div className="prbc-input__stat prbc-input__stat--b">
                <span className="prbc-input__stat-label">B wins</span>
                <span className="prbc-input__stat-value">{lifetimeTally.b}</span>
              </div>
            )}
            {(castCount > 0 || (lifetimeTally.total ?? 0) > 0) && (
              <button
                type="button"
                className="prbc-input__stat-reset"
                onClick={onResetLifetime}
                aria-label="Reset councils counter and lifetime tally"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        <section className="prbc-samples" aria-label="Sample battles">
          <p className="prbc-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_BATTLES.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="prbc-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="prbc-sample__label">{sample.label}</span>
                  <span className="prbc-sample__matchup">
                    <span className="prbc-sample__half">"{sample.a.slice(0, 50)}..."</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="prbc-sample__half">"{sample.b.slice(0, 50)}..."</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {council && (
          <section className="prbc-result" aria-label="Council verdict">
            <header className="prbc-result__head">
              <p className="prbc-result__kicker">
                <Crown aria-hidden="true" /> The 8-mind council has chosen
              </p>
              <h2 className="prbc-result__winner">
                <span
                  className={`prbc-result__winner-pill prbc-result__winner-pill--${council.winner.toLowerCase()}`}
                >
                  Output {council.winner} wins
                </span>
                <span className="prbc-result__tally">
                  {council.tally.a} for A · {council.tally.b} for B
                </span>
              </h2>
              {majority && (
                <p className={`prbc-result__majority prbc-result__majority--${majority.label}`}>
                  {majority.description}
                </p>
              )}
            </header>

            <div className="prbc-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`prbc-side prbc-side--${side.toLowerCase()}${council.winner === side ? ' prbc-side--winner' : ''}`}
                >
                  <p className="prbc-side__label">Output {side}</p>
                  <blockquote className="prbc-side__quote">
                    {side === 'A' ? council.outputA : council.outputB}
                  </blockquote>
                </div>
              ))}
            </div>

            <div className="prbc-filter" role="radiogroup" aria-label="Filter critics by pick">
              <span className="prbc-filter__label">
                <Filter aria-hidden="true" /> Show
              </span>
              <Pressable
                type="button"
                role="radio"
                aria-checked={filter === 'all'}
                className={`prbc-filter__chip${filter === 'all' ? ' prbc-filter__chip--active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({council.critiques.length})
              </Pressable>
              {(['A', 'B'] as const).map((side) => {
                const count = council.critiques.filter((c) => c.pick === side).length;
                if (count === 0) return null;
                return (
                  <Pressable
                    key={side}
                    type="button"
                    role="radio"
                    aria-checked={filter === side}
                    className={`prbc-filter__chip prbc-filter__chip--${side.toLowerCase()}${filter === side ? ' prbc-filter__chip--active' : ''}`}
                    onClick={() => setFilter(side)}
                  >
                    {side === 'A' ? 'Picks A' : 'Picks B'} ({count})
                  </Pressable>
                );
              })}
            </div>

            <ol className="prbc-critics">
              {visibleCritiques.slice(0, MAX_PICKS_VISIBLE).map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                const isUp = critique.pick === 'A';
                return (
                  <li
                    key={critique.personaId}
                    className={`prbc-critic prbc-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--prbc-persona-color' as string]: persona.color,
                      ['--prbc-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="prbc-critic__head">
                      <span className="prbc-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="prbc-critic__name">{persona.name}</p>
                        <p className="prbc-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="prbc-critic__pick">
                        {isUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="prbc-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="prbc-result__actions">
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
          <section className="prbc-history" aria-label="Recent battles">
            <div className="prbc-history__head">
              <p className="prbc-history__label">
                <History aria-hidden="true" /> Recent battles
              </p>
              <button
                type="button"
                className="prbc-history__clear"
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
                    className="prbc-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="prbc-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="prbc-history__b">B: "{entry.b}"</span>
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

function History(_props: { className?: string }) {
  return null;
}
