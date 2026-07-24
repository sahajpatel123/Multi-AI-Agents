import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CornerDownRight,
  Mic,
  Quote,
  RotateCcw,
  Share2,
  Sparkles,
  Swords,
  Wand2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import {
  buildEcho,
  echoShareUrl,
  type PersonaEcho,
} from '../data/personaEcho';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-echo-page.css';

const MAX_TEXT_CHARS = 2000;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

export function PersonaEchoPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialText = searchParams.get('text') ?? '';

  const [text, setText] = useState(initialText);
  const [committedText, setCommittedText] = useState(initialText);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPageVisible(true);
  }, []);

  const echo: PersonaEcho | null = useMemo(() => {
    if (!committedText.trim()) return null;
    return buildEcho(committedText);
  }, [committedText]);

  const charCount = text.length;

  const onEcho = () => {
    setCommittedText(text);
    if (typeof window !== 'undefined') {
      const url = echoShareUrl(window.location.origin, text);
      window.history.replaceState({}, '', url);
    }
  };

  const onReset = () => {
    setText('');
    setCommittedText('');
    if (typeof window !== 'undefined') {
      const url = echoShareUrl(window.location.origin, '');
      window.history.replaceState({}, '', url);
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !echo) return;
    const url = echoShareUrl(window.location.origin, committedText);
    const text = `${echo.headline} — four Arena minds reframed my text:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Echo', text, url });
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
    if (typeof window === 'undefined' || !committedText.trim()) return;
    // Echo doesn't have a prompt to send to Arena — we instead
    // route the user to /persona-roast so they can critique the
    // text as a prompt, or to /persona-battle with the text as a
    // battle topic.
    const link = `/persona-roast?prompt=${encodeURIComponent(committedText)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  return (
    <div className={`pecho-page${pageVisible ? ' pecho-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pecho-main${reduceMotion ? '' : ' pecho-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pecho-title"
      >
        <section className="pecho-hero">
          <p className="pecho-hero__eyebrow">
            <Quote aria-hidden="true" /> Persona Echo
          </p>
          <h1 id="pecho-title" className="pecho-hero__title">
            <span>Four minds.</span>
            <span className="pecho-hero__title-accent">One text.</span>
            <span>Four takes.</span>
          </h1>
          <p className="pecho-hero__lede">
            Drop in any text — a sentence, a paragraph, an argument, a
            story. Four Arena minds reframe it from their angle. Same
            text in, same reframings out. Share the result.
          </p>
        </section>

        <section className="pecho-input" aria-label="Text input">
          <label className="pecho-input__label" htmlFor="pecho-text-input">
            <Mic aria-hidden="true" /> Your text
          </label>
          <textarea
            id="pecho-text-input"
            className="pecho-input__textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a sentence, a paragraph, an AI answer, anything."
            maxLength={MAX_TEXT_CHARS}
            rows={6}
            aria-label="Text to reframe"
          />
          <div className="pecho-input__meta">
            <span>
              {charCount}/{MAX_TEXT_CHARS} chars
            </span>
            <div className="pecho-input__actions">
              <button
                type="button"
                className="pecho-input__reset"
                onClick={onReset}
                disabled={!text && !committedText}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onEcho}
                disabled={!text.trim()}
                icon={<Wand2 aria-hidden="true" />}
              >
                Echo it
              </MotionButton>
            </div>
          </div>
        </section>

        {echo && (
          <section className="pecho-result" aria-label="Echo result">
            <header className="pecho-result__head">
              <p className="pecho-result__kicker">
                <Sparkles aria-hidden="true" /> {echo.kind} text
              </p>
              <h2 className="pecho-result__headline">{echo.headline}</h2>
              <p className="pecho-result__summary">{echo.summary}</p>
              <p className="pecho-result__reframing">
                <Wand2 aria-hidden="true" /> {echo.reframing}
              </p>
            </header>

            <ol className="pecho-result__list">
              {echo.angles.map((angle) => {
                const persona = findPersona(angle.personaId);
                if (!persona) return null;
                return (
                  <li
                    key={angle.personaId}
                    className="pecho-angle"
                    style={{
                      ['--pecho-persona-color' as string]: persona.color,
                      ['--pecho-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pecho-angle__head">
                      <span className="pecho-angle__dot" aria-hidden="true" />
                      <div>
                        <p className="pecho-angle__name">{angle.angle}</p>
                        <p className="pecho-angle__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pecho-angle__temp">
                        T{persona.temperature.toFixed(1)}
                      </span>
                    </header>
                    <p className="pecho-angle__take">{angle.take}</p>
                    <p className="pecho-angle__followup">
                      <CornerDownRight aria-hidden="true" /> Try this: {angle.followup}
                    </p>
                  </li>
                );
              })}
            </ol>

            <div className="pecho-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Swords aria-hidden="true" />}
              >
                Roast this in Arena
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share echo'}
              </MotionButton>
              <a
                href="/persona-library"
                className="pecho-result__link"
              >
                Or try a curated prompt <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}