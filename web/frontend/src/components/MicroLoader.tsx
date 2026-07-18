import { useEffect, useRef } from 'react';
import { getWordPoints } from '../hooks/useCalligraphyCanvas';
import { prefersReducedMotion } from '../lib/motion';

type LoaderPhase = 'draw' | 'hold' | 'fade';

const WORDS = ['thinking', 'loading', 'working', 'finding'] as const;

type MicroLoaderProps = {
  /** Accessible status text. Also rendered as the visible text when
   *  prefers-reduced-motion is on (the canvas animation is replaced
   *  with this static label so vestibular users still see a status). */
  label?: string;
  /** When false, the loader does not auto-cycle words. Useful for
   *  contexts where one specific message is appropriate ('Analyzing…'
   *  for example). Defaults to true. */
  cycleWords?: boolean;
};

export default function MicroLoader({
  label = 'Loading',
  cycleWords = true,
}: MicroLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const phaseRef = useRef<LoaderPhase>('draw');
  const drawProgressRef = useRef(0);
  const fadeAlphaRef = useRef(1);
  const holdTimerRef = useRef(0);
  const frameRef = useRef(0);
  const wordIndexRef = useRef(0);
  const reducedMotion = prefersReducedMotion();

  const loadWord = (word: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pointsRef.current = getWordPoints(word, canvas, 26);
    phaseRef.current = 'draw';
    drawProgressRef.current = 0;
    fadeAlphaRef.current = 1;
    holdTimerRef.current = 0;
  };

  useEffect(() => {
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let wordReady = false;

    const fontTimeout = setTimeout(() => {
      if (!wordReady) {
        loadWord(WORDS[wordIndexRef.current]);
        wordReady = true;
      }
    }, 800);

    document.fonts.ready.then(() => {
      clearTimeout(fontTimeout);
      if (!wordReady) {
        loadWord(WORDS[wordIndexRef.current]);
        wordReady = true;
      }
    });

    const render = () => {
      frameRef.current += 1;
      const points = pointsRef.current;
      const totalPoints = points.length;

      if (phaseRef.current === 'draw') {
        drawProgressRef.current += totalPoints / 28;
        if (drawProgressRef.current >= totalPoints) {
          drawProgressRef.current = totalPoints;
          phaseRef.current = 'hold';
        }
      } else if (phaseRef.current === 'hold') {
        holdTimerRef.current += 1;
        if (holdTimerRef.current > 40) {
          holdTimerRef.current = 0;
          phaseRef.current = 'fade';
        }
      } else {
        fadeAlphaRef.current -= 0.035;
        if (fadeAlphaRef.current <= 0) {
          fadeAlphaRef.current = 0;
          if (cycleWords) {
            wordIndexRef.current = (wordIndexRef.current + 1) % WORDS.length;
            loadWord(WORDS[wordIndexRef.current]);
          } else {
            return;
          }
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const count = Math.min(totalPoints, Math.floor(drawProgressRef.current));
      for (let i = 0; i < count; i += 1) {
        const point = points[i];
        const isLeading = i > count - 14 && phaseRef.current === 'draw';
        const twinkle = Math.sin(frameRef.current * 0.06 + i * 0.18) * 0.22 + 0.78;

        let alpha: number;
        let dotRadius: number;

        if (isLeading) {
          const leadAmount = (i - (count - 14)) / 14;
          alpha = leadAmount * fadeAlphaRef.current;
          dotRadius = 0.9 + leadAmount * 0.7;
        } else {
          alpha = twinkle * fadeAlphaRef.current * 0.72;
          dotRadius = 0.9;
        }

        ctx.beginPath();
        ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(196, 149, 106, ${alpha})`;
        ctx.fill();
      }

      animationFrameRef.current = window.requestAnimationFrame(render);
    };

    animationFrameRef.current = window.requestAnimationFrame(render);

    return () => {
      clearTimeout(fontTimeout);
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [reducedMotion, cycleWords]);

  if (reducedMotion) {
    return (
      <div
        className="micro-loader micro-loader--static"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="micro-loader__panel">
          <span className="micro-loader__pulse" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="micro-loader__label">{label}…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="micro-loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="micro-loader__panel">
        <canvas
          ref={canvasRef}
          className="micro-loader__canvas"
          width={160}
          height={72}
          aria-hidden
        />
        <span className="micro-loader__sr-only">{label}…</span>
      </div>
    </div>
  );
}
