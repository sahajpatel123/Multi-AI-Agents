import { useEffect, useRef, type CSSProperties } from 'react';
import { getWordPoints } from '../hooks/useCalligraphyCanvas';
import { prefersReducedMotion } from '../lib/motion';

type LoaderPhase = 'draw' | 'hold' | 'fade';

const WORDS = ['thinking', 'loading', 'working', 'finding'] as const;

type MicroLoaderProps = {
  /** Accessible status text (and reduced-motion label). */
  label?: string;
};

export default function MicroLoader({ label = 'Loading' }: MicroLoaderProps) {
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
          wordIndexRef.current = (wordIndexRef.current + 1) % WORDS.length;
          loadWord(WORDS[wordIndexRef.current]);
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
  }, [reducedMotion]);

  const shellStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 0',
  };

  if (reducedMotion) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" style={shellStyle}>
        <span
          style={{
            fontSize: 13,
            color: '#C4956A',
            fontStyle: 'italic',
            fontFamily: 'Georgia, Times New Roman, serif',
          }}
        >
          {label}…
        </span>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={label} style={shellStyle}>
      <canvas
        ref={canvasRef}
        width={160}
        height={72}
        style={{ width: 160, height: 72, display: 'block', background: 'transparent' }}
      />
    </div>
  );
}
