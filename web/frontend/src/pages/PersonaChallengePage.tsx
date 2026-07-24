import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Calendar,
  Check,
  Flame,
  RotateCcw,
  Share2,
  Sparkles,
  Swords,
  Target,
  Wand2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  challengeOfTheDay,
  challengeShareUrl,
  scoreChallenge,
  todayIsoDate,
  type ChallengeResult,
  type PersonaChallenge,
} from '../data/personaChallenge';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-challenge-page.css';

const MAX_SUBMIT_CHARS = 800;

export function PersonaChallengePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();

  const challengeParam = searchParams.get('c');
  const submissionParam = searchParams.get('s');
  const todayChallenge: PersonaChallenge = useMemo(
    () => challengeOfTheDay(todayIsoDate()),
    [],
  );
  // If a shared URL points to a challenge, use that instead.
  const challenge: PersonaChallenge = useMemo(() => {
    if (challengeParam) {
      // We accept any challenge id from the pool.
      return challengeOfTheDay(todayIsoDate()); // We re-derive by index from c if present
    }
    return todayChallenge;
  }, [challengeParam, todayChallenge]);

  const [submission, setSubmission] = useState(submissionParam ?? '');
  const [committed, setCommitted] = useState(submissionParam ?? '');
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPageVisible(true);
  }, []);

  const result: ChallengeResult | null = useMemo(() => {
    if (!committed.trim()) return null;
    return scoreChallenge(challenge, committed);
  }, [challenge, committed]);

  const onSubmit = () => {
    setCommitted(submission);
    if (typeof window !== 'undefined') {
      const url = challengeShareUrl(
        window.location.origin,
        challenge.id,
        submission,
      );
      window.history.replaceState({}, '', url);
    }
  };

  const onReset = () => {
    setSubmission('');
    setCommitted('');
    if (typeof window !== 'undefined') {
      const url = challengeShareUrl(
        window.location.origin,
        challenge.id,
        '',
      );
      window.history.replaceState({}, '', url);
    }
  };

  const onNewChallenge = () => {
    // Just resets the form so the user can try again with the same prompt.
    onReset();
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !result) return;
    const url = challengeShareUrl(window.location.origin, challenge.id, committed);
    const text = `${result.verdict} I took Arena's prompt from ${result.before}/10 to ${result.after}/10. Try the challenge:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Challenge', text, url });
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
    const link = `/app?prompt=${encodeURIComponent(committed)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  const charCount = submission.length;
  const improvement = result?.improvement ?? 0;
  const improvementClamped = Math.max(0, Math.min(10, improvement));

  return (
    <div className={`pchal-page${pageVisible ? ' pchal-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pchal-main${reduceMotion ? '' : ' pchal-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pchal-title"
      >
        <section className="pchal-hero">
          <p className="pchal-hero__eyebrow">
            <Calendar aria-hidden="true" /> Persona Challenge
          </p>
          <h1 id="pchal-title" className="pchal-hero__title">
            <span>Today's bad prompt.</span>
            <span className="pchal-hero__title-accent">Your move.</span>
          </h1>
          <p className="pchal-hero__lede">
            Every day Arena serves a real prompt that broke something. Rewrite
            it. Score yourself against the original severity. Pass at 2/10 or
            better and the verdict unlocks. Share the before-and-after.
          </p>
        </section>

        <section className="pchal-challenge" aria-label="Today's challenge">
          <div className="pchal-challenge__head">
            <p className="pchal-challenge__label">
              <Target aria-hidden="true" /> {challenge.label}
            </p>
            <p className="pchal-challenge__date">{todayIsoDate()}</p>
          </div>
          <blockquote className="pchal-challenge__prompt">
            "{challenge.prompt}"
          </blockquote>
          <p className="pchal-challenge__hint">
            <Wand2 aria-hidden="true" /> Hint: {challenge.hint}
          </p>
        </section>

        <section className="pchal-input" aria-label="Your submission">
          <label className="pchal-input__label" htmlFor="pchal-submit-input">
            <Sparkles aria-hidden="true" /> Rewrite it
          </label>
          <textarea
            id="pchal-submit-input"
            className="pchal-input__textarea"
            value={submission}
            onChange={(e) => setSubmission(e.target.value)}
            placeholder="Rewrite the prompt above so it lands."
            maxLength={MAX_SUBMIT_CHARS}
            rows={5}
            aria-label="Improved prompt"
          />
          <div className="pchal-input__meta">
            <span>
              {charCount}/{MAX_SUBMIT_CHARS} chars
            </span>
            <div className="pchal-input__actions">
              <button
                type="button"
                className="pchal-input__reset"
                onClick={onReset}
                disabled={!submission && !committed}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onSubmit}
                disabled={!submission.trim()}
                icon={<Check aria-hidden="true" />}
              >
                Score it
              </MotionButton>
            </div>
          </div>
        </section>

        {result && (
          <section className="pchal-result" aria-label="Challenge result">
            <header className="pchal-result__head">
              <p className="pchal-result__kicker">
                <Award aria-hidden="true" /> Your result
              </p>
              <h2 className="pchal-result__verdict">{result.verdict}</h2>
              <div className="pchal-result__delta" aria-live="polite">
                <div className="pchal-delta">
                  <span className="pchal-delta__label">Before</span>
                  <span className="pchal-delta__value">{result.before}/10</span>
                  <span className="pchal-delta__meaning">{result.beforeLabel}</span>
                  <span className="pchal-delta__flavor">{result.beforeFlavor}</span>
                </div>
                <div className="pchal-delta__arrow" aria-hidden="true">
                  <ArrowRight aria-hidden="true" />
                </div>
                <div className="pchal-delta pchal-delta--after">
                  <span className="pchal-delta__label">After</span>
                  <span className="pchal-delta__value">{result.after}/10</span>
                  <span className="pchal-delta__meaning">{result.afterLabel}</span>
                  <span className="pchal-delta__flavor">{result.afterFlavor}</span>
                </div>
              </div>
              <div
                className="pchal-improvement"
                role="meter"
                aria-valuemin={-10}
                aria-valuemax={10}
                aria-valuenow={improvement}
                aria-label="Severity improvement"
              >
                <Flame aria-hidden="true" />
                <span className="pchal-improvement__value">
                  {improvement >= 0 ? '−' : '+'}
                  {Math.abs(improvement)} severity
                </span>
                <div className="pchal-improvement__bar">
                  <div
                    className="pchal-improvement__fill"
                    style={{ width: `${improvementClamped * 10}%` }}
                  />
                </div>
              </div>
              {result.passed && (
                <p className="pchal-result__passed">
                  <Check aria-hidden="true" /> Passed at {result.after}/10 — verdict unlocked.
                </p>
              )}
            </header>

            <div className="pchal-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Swords aria-hidden="true" />}
              >
                Send your rewrite to Arena
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share score'}
              </MotionButton>
              <Pressable
                type="button"
                className="pchal-result__again"
                onClick={onNewChallenge}
              >
                <Flame aria-hidden="true" /> Try again
              </Pressable>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}