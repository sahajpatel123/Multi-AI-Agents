import { useEffect, useRef } from 'react';
import { getWordPoints } from '../hooks/useCalligraphyCanvas';

type LoaderPhase = 'draw' | 'hold' | 'fade';

const WORDS = ['thinking', 'loading', 'working', 'finding'] as const;

export default function MicroLoader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const phaseRef = useRef<LoaderPhase>('draw');
  const drawProgressRef = useRef(0);
  const fadeAlphaRef = useRef(1);
  const holdTimerRef = useRef(0);
  const frameRef = useRef(0);
  const wordIndexRef = useRef(0);

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
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 0',
      }}
    >
      <canvas
        ref={canvasRef}
        width={160}
        height={72}
        style={{ width: 160, height: 72, display: 'block', background: 'transparent' }}
      />
    </div>
  );
}
