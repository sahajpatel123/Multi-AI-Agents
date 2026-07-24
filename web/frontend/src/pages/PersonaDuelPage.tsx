import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Crown,
  Dices,
  RotateCcw,
  Share2,
  Sparkles,
  Swords,
  Trophy,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  applyPick,
  buildBracket,
  championDescription,
  currentChampion,
  duelShareUrl,
  generateSeed,
  pickCount,
  totalMatchups,
  type DuelBracket,
  type DuelMatchup,
} from '../data/personaDuel';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-duel-page.css';

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

interface MatchupCardProps {
  readonly matchup: DuelMatchup;
  readonly onPick: (winnerId: string) => void;
  readonly disabled?: boolean;
}

function MatchupCard({ matchup, onPick, disabled }: MatchupCardProps) {
  const left = findPersona(matchup.leftId);
  const right = findPersona(matchup.rightId);
  if (!left || !right) return null;
  return (
    <div className="pduel-matchup" data-decided={matchup.winnerId ? 'true' : 'false'}>
      <button
        type="button"
        className={`pduel-slot${matchup.winnerId === left.id ? ' pduel-slot--winner' : ''}${matchup.winnerId && matchup.winnerId !== left.id ? ' pduel-slot--loser' : ''}`}
        onClick={() => onPick(left.id)}
        disabled={disabled || Boolean(matchup.winnerId)}
        style={{
          ['--pduel-slot-color' as string]: left.color,
          ['--pduel-slot-bg' as string]: left.bgTint,
        }}
      >
        <span className="pduel-slot__dot" aria-hidden="true" />
        <span className="pduel-slot__name">{left.name}</span>
        <span className="pduel-slot__quote">"{left.quote}"</span>
        <span className="pduel-slot__temp">T{left.temperature.toFixed(1)}</span>
        {matchup.winnerId === left.id && (
          <span className="pduel-slot__crown" aria-hidden="true">
            <Crown aria-hidden="true" />
          </span>
        )}
      </button>
      <span className="pduel-vs" aria-hidden="true">
        vs
      </span>
      <button
        type="button"
        className={`pduel-slot${matchup.winnerId === right.id ? ' pduel-slot--winner' : ''}${matchup.winnerId && matchup.winnerId !== right.id ? ' pduel-slot--loser' : ''}`}
        onClick={() => onPick(right.id)}
        disabled={disabled || Boolean(matchup.winnerId)}
        style={{
          ['--pduel-slot-color' as string]: right.color,
          ['--pduel-slot-bg' as string]: right.bgTint,
        }}
      >
        <span className="pduel-slot__dot" aria-hidden="true" />
        <span className="pduel-slot__name">{right.name}</span>
        <span className="pduel-slot__quote">"{right.quote}"</span>
        <span className="pduel-slot__temp">T{right.temperature.toFixed(1)}</span>
        {matchup.winnerId === right.id && (
          <span className="pduel-slot__crown" aria-hidden="true">
            <Crown aria-hidden="true" />
          </span>
        )}
      </button>
    </div>
  );
}

export function PersonaDuelPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const sharedSeed = searchParams.get('seed');

  const [seed, setSeed] = useState<string>(sharedSeed ?? generateSeed());
  const [bracket, setBracket] = useState<DuelBracket>(() =>
    buildBracket(sharedSeed ?? generateSeed()),
  );
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPageVisible(true);
  }, []);

  // If a shared seed arrives later, rebuild the bracket for it.
  useEffect(() => {
    if (sharedSeed && sharedSeed !== bracket.seed) {
      setSeed(sharedSeed);
      setBracket(buildBracket(sharedSeed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSeed]);

  const championId = useMemo(() => currentChampion(bracket), [bracket]);
  const picks = useMemo(() => pickCount(bracket), [bracket]);
  const total = useMemo(() => totalMatchups(bracket), [bracket]);
  const champion = championId ? findPersona(championId) : null;

  // The active (next) matchup: first matchup with no winner.
  const nextMatchup = useMemo(() => {
    for (const round of bracket.rounds) {
      for (const m of round.matchups) {
        if (!m.winnerId) return m;
      }
    }
    return null;
  }, [bracket]);

  const onPick = useCallback(
    (matchupId: string, winnerId: string) => {
      setBracket((prev) => applyPick(prev, matchupId, winnerId));
    },
    [],
  );

  const onNewBracket = () => {
    const newSeed = generateSeed();
    setSeed(newSeed);
    setBracket(buildBracket(newSeed));
    if (typeof window !== 'undefined') {
      const url = duelShareUrl(window.location.origin, newSeed);
      window.history.replaceState({}, '', url);
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const url = duelShareUrl(window.location.origin, seed);
    const text = champion
      ? `My Arena Persona Duel champion is ${champion.name}. Run yours:`
      : `Run this Arena Persona Duel bracket:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Duel', text, url });
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
    if (typeof window === 'undefined' || !championId) return;
    const link = `/app?seedPersona=${championId}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  return (
    <div className={`pduel-page${pageVisible ? ' pduel-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pduel-main${reduceMotion ? '' : ' pduel-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pduel-title"
      >
        <section className="pduel-hero">
          <p className="pduel-hero__eyebrow">
            <Swords aria-hidden="true" /> Persona Duel
          </p>
          <h1 id="pduel-title" className="pduel-hero__title">
            <span>Sixteen minds.</span>
            <span className="pduel-hero__title-accent">One champion.</span>
          </h1>
          <p className="pduel-hero__lede">
            A single-elimination tournament. Pick the winner of every
            matchup. Four rounds, fifteen decisions, one champion. The
            bracket is deterministic from a seed, so a shared link
            replays the exact same tournament.
          </p>

          <div className="pduel-progress">
            <div className="pduel-progress__bar">
              <div
                className="pduel-progress__fill"
                style={{ width: `${total > 0 ? (picks / total) * 100 : 0}%` }}
              />
            </div>
            <span className="pduel-progress__count">
              {picks} / {total} matchups decided
            </span>
          </div>
        </section>

        {!championId && nextMatchup && (
          <section className="pduel-next" aria-label="Next matchup">
            <p className="pduel-next__label">
              <Sparkles aria-hidden="true" /> Next matchup
            </p>
            <MatchupCard matchup={nextMatchup} onPick={(id) => onPick(nextMatchup.id, id)} />
          </section>
        )}

        {champion && (
          <section className="pduel-champion" aria-label="Champion">
            <p className="pduel-champion__kicker">
              <Trophy aria-hidden="true" /> Your champion
            </p>
            <article
              className="pduel-champion__card"
              style={{
                ['--pduel-champion-color' as string]: champion.color,
                ['--pduel-champion-bg' as string]: champion.bgTint,
              }}
            >
              <span className="pduel-champion__dot" aria-hidden="true" />
              <h2 className="pduel-champion__name">{champion.name}</h2>
              <p className="pduel-champion__quote">"{champion.quote}"</p>
              <p className="pduel-champion__description">
                {championDescription(champion.id)}
              </p>
              <dl className="pduel-champion__meta">
                <div>
                  <dt>Temperature</dt>
                  <dd>T{champion.temperature.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Matchups won</dt>
                  <dd>{Math.log2(PERSONAS.length) | 0}</dd>
                </div>
              </dl>
            </article>
            <div className="pduel-champion__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Swords aria-hidden="true" />}
              >
                Bring {champion.name} into Arena
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share bracket'}
              </MotionButton>
            </div>
          </section>
        )}

        <section className="pduel-rounds" aria-label="Bracket rounds">
          {bracket.rounds.map((round) => (
            <div key={round.index} className="pduel-round">
              <h3 className="pduel-round__name">{round.name}</h3>
              <div className="pduel-round__matchups">
                {round.matchups.map((m) => (
                  <MatchupCard key={m.id} matchup={m} onPick={(id) => onPick(m.id, id)} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="pduel-cta" aria-label="Bracket controls">
          <Pressable
            type="button"
            className="pduel-cta__new"
            onClick={onNewBracket}
          >
            <Dices aria-hidden="true" /> New bracket
          </Pressable>
          <Pressable
            type="button"
            className="pduel-cta__reset"
            onClick={() => setBracket(buildBracket(seed))}
          >
            <RotateCcw aria-hidden="true" /> Reset picks
          </Pressable>
          <a href="/persona-library" className="pduel-cta__link">
            Or browse curated prompts <ArrowRight aria-hidden="true" />
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
}