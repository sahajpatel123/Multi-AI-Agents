import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Crown, RotateCcw, Share2, Sparkles, Swords } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Reveal } from '../components/Reveal';
import { Pressable } from '../components/Pressable';
import MicroLoader from '../components/MicroLoader';
import {
  PERSONA_BATTLE_PRESETS,
  findBattlePreset,
} from '../data/personaBattle';
import { PERSONAS } from '../data/personas';
import { submitPrompt, type StreamCallbacks, streamPrompt } from '../api';
import type { PromptResponse, ScoredAgent } from '../types';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/persona-battle-page.css';

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

interface VersusCardProps {
  readonly personaId: string;
  readonly response: ScoredAgent | null;
  readonly isWinner: boolean;
  readonly isLoser: boolean;
  readonly livePreview: string;
  readonly loading: boolean;
}

function VersusCard({
  personaId,
  response,
  isWinner,
  isLoser,
  livePreview,
  loading,
}: VersusCardProps) {
  const persona = findPersona(personaId);
  if (!persona) return null;
  const verdict = response?.response.one_liner ?? livePreview ?? '';
  return (
    <article
      className={`pb-versus${isWinner ? ' pb-versus--winner' : ''}${isLoser ? ' pb-versus--loser' : ''}`}
      style={{
        ['--pb-persona-color' as string]: persona.color,
        ['--pb-persona-bg' as string]: persona.bgTint,
      }}
      aria-label={`${persona.name} response`}
    >
      <header className="pb-versus__head">
        <span className="pb-versus__dot" aria-hidden="true" />
        <div>
          <p className="pb-versus__kicker">{isWinner ? 'Winner' : isLoser ? 'Challenger' : 'Mind'}</p>
          <h3 className="pb-versus__name">{persona.name}</h3>
          <p className="pb-versus__quote">"{persona.quote}"</p>
        </div>
      </header>
      <div className="pb-versus__body">
        {loading && !verdict ? (
          <div className="pb-versus__loader" aria-live="polite">
            <MicroLoader label="Reasoning" cycleWords={false} />
          </div>
        ) : (
          <p className="pb-versus__verdict">{verdict || '...'}</p>
        )}
      </div>
      {response && (
        <footer className="pb-versus__foot">
          <dl>
            <div>
              <dt>Score</dt>
              <dd>{response.score}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{(response.response.confidence * 100).toFixed(0)}%</dd>
            </div>
          </dl>
        </footer>
      )}
      {isWinner && (
        <span className="pb-versus__crown" aria-hidden="true">
          <Crown aria-hidden="true" />
        </span>
      )}
    </article>
  );
}

export function PersonaBattlePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();

  // Initial state from URL ?left=&right=&topic= deep link.
  const initialLeft = searchParams.get('left') ?? 'contrarian';
  const initialRight = searchParams.get('right') ?? 'optimist';
  const initialTopic = searchParams.get('topic') ?? '';
  const presetParam = searchParams.get('preset');
  const initialPreset = findBattlePreset(presetParam);

  const [leftId, setLeftId] = useState<string>(initialPreset?.leftId ?? initialLeft);
  const [rightId, setRightId] = useState<string>(initialPreset?.rightId ?? initialRight);
  const [topic, setTopic] = useState<string>(initialPreset?.topic ?? initialTopic);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(false);

  const [leftResponse, setLeftResponse] = useState<ScoredAgent | null>(null);
  const [rightResponse, setRightResponse] = useState<ScoredAgent | null>(null);
  const [leftPreview, setLeftPreview] = useState('');
  const [rightPreview, setRightPreview] = useState('');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPageVisible(true);
  }, []);

  const leftPersona = useMemo(() => findPersona(leftId), [leftId]);
  const rightPersona = useMemo(() => findPersona(rightId), [rightId]);
  const validPair =
    leftId !== rightId && Boolean(leftPersona) && Boolean(rightPersona);
  const validTopic = topic.trim().length >= 4;

  const canBattle = validPair && validTopic && !loading;

  const onSwap = () => {
    const prevLeft = leftId;
    setLeftId(rightId);
    setRightId(prevLeft);
  };

  const onPickPreset = (presetId: string) => {
    const preset = findBattlePreset(presetId);
    if (!preset) return;
    setLeftId(preset.leftId);
    setRightId(preset.rightId);
    setTopic(preset.topic);
    setLeftResponse(null);
    setRightResponse(null);
    setLeftPreview('');
    setRightPreview('');
    setWinnerId(null);
    setErrorMsg(null);
  };

  const runBattle = useCallback(async () => {
    if (!canBattle) return;
    setLoading(true);
    setErrorMsg(null);
    setLeftResponse(null);
    setRightResponse(null);
    setLeftPreview('');
    setRightPreview('');
    setWinnerId(null);

    const onToken: StreamCallbacks['onToken'] = (data) => {
      if (data.agent_id === 'agent_1') setLeftPreview((p) => p + data.token);
      else if (data.agent_id === 'agent_2') setRightPreview((p) => p + data.token);
    };
    const onResult: StreamCallbacks['onResult'] = (data: PromptResponse) => {
      const responses = data.all_responses ?? [];
      const left = responses.find((r) => {
        const personaId = (r.response as unknown as { persona_id?: string }).persona_id;
        return personaId === leftId || r.response.agent_id === 'agent_1';
      });
      const right = responses.find((r) => {
        const personaId = (r.response as unknown as { persona_id?: string }).persona_id;
        return personaId === rightId || r.response.agent_id === 'agent_2';
      });
      setLeftResponse(left ?? null);
      setRightResponse(right ?? null);
      setWinnerId(data.winner_agent_id ?? null);
      setLoading(false);
    };
    const onError: StreamCallbacks['onError'] = (data) => {
      setErrorMsg(data.message ?? data.detail ?? data.error ?? 'Battle failed.');
      setLoading(false);
    };

    try {
      await streamPrompt(
        topic.trim(),
        { onToken, onResult, onError },
        undefined,
        [leftId, rightId],
      );
    } catch (err) {
      // Fallback to non-streaming submit if the streaming endpoint is down.
      try {
        const result = await submitPrompt(topic.trim(), undefined, [leftId, rightId]);
        onResult(result);
      } catch (fallbackErr) {
        if (!errorMsg) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Could not run the battle.',
          );
        }
        setLoading(false);
      }
    }
  }, [canBattle, leftId, rightId, topic, errorMsg]);

  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/persona-battle?left=${leftId}&right=${rightId}&topic=${encodeURIComponent(topic.trim())}`;
    const text = `${leftPersona?.name ?? leftId} vs ${rightPersona?.name ?? rightId} on "${topic.trim()}" — Arena Persona Battle.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Battle', text, url });
        return;
      } catch (err) {
        /* fall through to clipboard */
      }
    }
    const ok = await copyToClipboard(`${text} ${url}`);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const onTryInArena = () => {
    if (typeof window === 'undefined') return;
    if (isAuthenticated) {
      navigate(`/app?seedPersona=${leftId}&seedPersona2=${rightId}`);
      return;
    }
    setRedirectIntent(`/app?seedPersona=${leftId}&seedPersona2=${rightId}`);
    navigate('/signin?tab=signup');
  };

  const winnerPersona = winnerId ? findPersona(winnerId) : null;
  const isLeftWinner = winnerId && leftPersona ? winnerId === leftPersona.id : false;
  const isRightWinner = winnerId && rightPersona ? winnerId === rightPersona.id : false;

  return (
    <div className={`pb-page${pageVisible ? ' pb-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pb-main${reduceMotion ? '' : ' pb-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pb-title"
      >
        <section className="pb-hero">
          <p className="pb-hero__eyebrow">Persona Battle</p>
          <h1 id="pb-title" className="pb-hero__title">
            <span>Two minds.</span>
            <span className="pb-hero__title-accent">One topic.</span>
            <span>One verdict.</span>
          </h1>
          <p className="pb-hero__lede">
            Pit any two of the sixteen Arena minds against each other on a topic
            of your choice. Watch both reason in parallel, see who scores higher,
            and share the verdict.
          </p>
        </section>

        <section className="pb-controls" aria-label="Battle controls">
          <div className="pb-controls__picks">
            <label className="pb-controls__field">
              <span className="pb-controls__label">Left mind</span>
              <select
                className="pb-controls__select"
                value={leftId}
                onChange={(e) => setLeftId(e.target.value)}
                aria-label="Left persona"
              >
                {PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {leftPersona && (
                <span
                  className="pb-controls__swatch"
                  style={{ background: leftPersona.color }}
                  aria-hidden="true"
                />
              )}
            </label>

            <button
              type="button"
              className="pb-controls__swap"
              onClick={onSwap}
              aria-label="Swap left and right minds"
              disabled={loading}
            >
              <Swords aria-hidden="true" />
            </button>

            <label className="pb-controls__field">
              <span className="pb-controls__label">Right mind</span>
              <select
                className="pb-controls__select"
                value={rightId}
                onChange={(e) => setRightId(e.target.value)}
                aria-label="Right persona"
              >
                {PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {rightPersona && (
                <span
                  className="pb-controls__swatch"
                  style={{ background: rightPersona.color }}
                  aria-hidden="true"
                />
              )}
            </label>
          </div>

          <label className="pb-controls__topic">
            <span className="pb-controls__label">Topic</span>
            <textarea
              className="pb-controls__textarea"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Should you ever lie to protect someone's feelings?"
              maxLength={500}
              rows={3}
              aria-label="Battle topic"
            />
          </label>

          <div className="pb-controls__cta">
            <MotionButton
              type="button"
              variant="primary"
              size="lg"
              onClick={runBattle}
              disabled={!canBattle}
              icon={<Sparkles aria-hidden="true" />}
            >
              {loading ? 'Battle in progress…' : 'Start the battle'}
            </MotionButton>
            {errorMsg && (
              <p className="pb-controls__error" role="alert">
                {errorMsg}
              </p>
            )}
          </div>

          <div className="pb-presets" aria-label="Battle presets">
            <p className="pb-presets__label">Or pick a preset</p>
            <ul>
              {PERSONA_BATTLE_PRESETS.map((preset) => (
                <li key={preset.id}>
                  <Pressable
                    type="button"
                    onClick={() => onPickPreset(preset.id)}
                    className="pb-preset"
                    disabled={loading}
                  >
                    <span className="pb-preset__tagline">{preset.tagline}</span>
                    <span className="pb-preset__matchup">
                      {findPersona(preset.leftId)?.name} <ArrowRight aria-hidden="true" />{' '}
                      {findPersona(preset.rightId)?.name}
                    </span>
                    <span className="pb-preset__topic">{preset.topic}</span>
                  </Pressable>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="pb-arena" aria-label="Battle arena">
          <div className="pb-arena__grid">
            <VersusCard
              personaId={leftId}
              response={leftResponse}
              isWinner={Boolean(isLeftWinner)}
              isLoser={Boolean(isRightWinner)}
              livePreview={leftPreview}
              loading={loading}
            />
            <div className="pb-arena__vs" aria-hidden="true">
              <span>VS</span>
            </div>
            <VersusCard
              personaId={rightId}
              response={rightResponse}
              isWinner={Boolean(isRightWinner)}
              isLoser={Boolean(isLeftWinner)}
              livePreview={rightPreview}
              loading={loading}
            />
          </div>

          {winnerPersona && (leftResponse || rightResponse) && (
            <Reveal>
              <div className="pb-verdict" role="status">
                <p className="pb-verdict__kicker">
                  <Crown aria-hidden="true" /> Verdict
                </p>
                <h2 className="pb-verdict__title">
                  {winnerPersona.name} wins this round.
                </h2>
                <p className="pb-verdict__copy">
                  Both minds responded. {winnerPersona.name} edged ahead on the
                  Arena scoring rubric — relevance, insight, clarity, and
                  intellectual honesty.
                </p>
                <div className="pb-verdict__actions">
                  <MotionButton
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={onTryInArena}
                    icon={<Swords aria-hidden="true" />}
                  >
                    Bring both into Arena
                  </MotionButton>
                  <MotionButton
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={onShare}
                    icon={<Share2 aria-hidden="true" />}
                  >
                    {copied ? 'Link copied' : 'Share battle'}
                  </MotionButton>
                  <button
                    type="button"
                    className="pb-verdict__rerun"
                    onClick={runBattle}
                    disabled={loading || !canBattle}
                  >
                    <RotateCcw aria-hidden="true" />
                    Re-battle
                  </button>
                </div>
              </div>
            </Reveal>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}