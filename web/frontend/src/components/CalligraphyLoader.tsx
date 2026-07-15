import { useEffect, useRef, useState } from 'react';
import { getWordPoints } from '../hooks/useCalligraphyCanvas';
import {
  formatElapsedSeconds,
  getStageKey,
  pipelineStatusText,
  STAGE_KEYS,
  STAGE_STATUS,
  STAGE_WORDS,
  stageProgressIndex,
  type StageKey,
} from '../lib/agentPipelineStages';
import { prefersReducedMotion } from '../lib/motion';

type LoaderPhase = 'draw' | 'hold' | 'fade';

export function CalligraphyLoader({
  stage,
  width: widthProp,
  height: heightProp,
}: {
  stage?: string;
  width?: number;
  height?: number;
}) {
  const reducedMotion = prefersReducedMotion();
  const [dims, setDims] = useState(() => {
    if (typeof window === 'undefined') return { w: 320, h: 200 };
    const w = Math.min(600, Math.max(260, window.innerWidth - 40));
    const h = Math.round((200 / 320) * w);
    return { w, h };
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const ro = () => {
      const w = Math.min(600, Math.max(260, window.innerWidth - 40));
      const h = Math.round((200 / 320) * w);
      setDims({ w, h });
    };
    ro();
    window.addEventListener('resize', ro);
    return () => window.removeEventListener('resize', ro);
  }, [reducedMotion]);

  useEffect(() => {
    setElapsedSeconds(0);
    const intervalId = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const width = widthProp ?? dims.w;
  const height = heightProp ?? dims.h;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const animationFrameRef = useRef<number | null>(null);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const phaseRef = useRef<LoaderPhase>('draw');
  const drawProgressRef = useRef(0);
  const fadeAlphaRef = useRef(1);
  const holdTimerRef = useRef(0);
  const frameRef = useRef(0);
  const wordIndexRef = useRef(0);
  const currentStageKeyRef = useRef<StageKey>('planner');
  const stageCycleTimerRef = useRef<number | null>(null);

  const syncStatus = (stageKey: StageKey) => {
    if (statusRef.current) {
      if (prefersReducedMotion()) {
        statusRef.current.textContent = STAGE_STATUS[stageKey];
        statusRef.current.style.opacity = '1';
      } else {
        statusRef.current.style.opacity = '0';
        window.setTimeout(() => {
          if (!statusRef.current) return;
          statusRef.current.textContent = STAGE_STATUS[stageKey];
          statusRef.current.style.opacity = '1';
        }, 120);
      }
    }

    dotRefs.current.forEach((dot, idx) => {
      if (!dot) return;
      if (idx < STAGE_KEYS.indexOf(stageKey)) {
        dot.style.background = '#C4956A';
        dot.style.transform = 'scale(1)';
      } else if (idx === STAGE_KEYS.indexOf(stageKey)) {
        dot.style.background = '#C4956A';
        dot.style.transform = prefersReducedMotion() ? 'scale(1)' : 'scale(1.5)';
      } else {
        dot.style.background = '#DDD4C4';
        dot.style.transform = 'scale(1)';
      }
    });
  };

  const loadStageWord = (stageKey: StageKey) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const word = STAGE_WORDS[stageKey];
    const fontSize = word.length > 6 ? 52 : 62;
    pointsRef.current = getWordPoints(word, canvas, fontSize);
    phaseRef.current = 'draw';
    drawProgressRef.current = 0;
    fadeAlphaRef.current = 1;
    holdTimerRef.current = 0;
    currentStageKeyRef.current = stageKey;
    syncStatus(stageKey);
  };

  useEffect(() => {
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    dotRefs.current = dotRefs.current.slice(0, STAGE_KEYS.length);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let wordReady = false;
    const initialStageKey = getStageKey(stage) || STAGE_KEYS[wordIndexRef.current];

    const fontTimeout = setTimeout(() => {
      if (!wordReady) {
        loadStageWord(initialStageKey);
        wordReady = true;
      }
    }, 800);

    document.fonts.ready.then(() => {
      clearTimeout(fontTimeout);
      if (!wordReady) {
        loadStageWord(initialStageKey);
        wordReady = true;
      }
    });

    const render = () => {
      frameRef.current += 1;
      const points = pointsRef.current;
      const totalPoints = points.length;

      if (phaseRef.current === 'draw') {
        drawProgressRef.current += totalPoints / 52;
        if (drawProgressRef.current >= totalPoints) {
          drawProgressRef.current = totalPoints;
          phaseRef.current = 'hold';
        }
      } else if (phaseRef.current === 'hold') {
        holdTimerRef.current += 1;
        if (holdTimerRef.current > 58) {
          holdTimerRef.current = 0;
          phaseRef.current = 'fade';
        }
      } else {
        fadeAlphaRef.current -= 0.022;
        if (fadeAlphaRef.current <= 0) {
          fadeAlphaRef.current = 0;
          const forcedStage = getStageKey(stage);
          if (forcedStage) {
            loadStageWord(forcedStage);
          } else {
            wordIndexRef.current = (wordIndexRef.current + 1) % STAGE_KEYS.length;
            loadStageWord(STAGE_KEYS[wordIndexRef.current]);
          }
        }
      }

      ctx.clearRect(0, 0, width, height);

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
          dotRadius = 1.2 + leadAmount * 1.2;
        } else {
          alpha = twinkle * fadeAlphaRef.current * 0.72;
          dotRadius = 1.1;
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
      if (stageCycleTimerRef.current != null) {
        window.clearTimeout(stageCycleTimerRef.current);
      }
    };
  }, [height, reducedMotion, stage, width]);

  useEffect(() => {
    if (reducedMotion) return;
    const nextStageKey = getStageKey(stage);
    if (!nextStageKey || nextStageKey === currentStageKeyRef.current) return;
    loadStageWord(nextStageKey);
  }, [reducedMotion, stage]);

  const activeIndex = stageProgressIndex(stage);
  const statusText = pipelineStatusText(stage);
  const stageWord = STAGE_WORDS[getStageKey(stage) || 'planner'];

  if (reducedMotion) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0' }}
      >
        <p
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 'clamp(28px, 6vw, 42px)',
            color: '#C4956A',
            letterSpacing: '0.04em',
            margin: 0,
            textTransform: 'lowercase',
          }}
        >
          {stageWord}
        </p>
        <div
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 13,
            color: '#8C7355',
            letterSpacing: '0.05em',
            textAlign: 'center',
            marginTop: 22,
          }}
        >
          {statusText}
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 11,
            color: '#C4A882',
            marginTop: 7,
            textAlign: 'center',
            letterSpacing: '0.08em',
          }}
        >
          {formatElapsedSeconds(elapsedSeconds)} elapsed
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STAGE_KEYS.length}
          aria-valuenow={activeIndex + 1}
          aria-label={`Research pipeline stage ${activeIndex + 1} of ${STAGE_KEYS.length}`}
          style={{ display: 'flex', gap: 7, marginTop: 20, alignItems: 'center' }}
        >
          {STAGE_KEYS.map((stageKey, idx) => (
            <span
              key={stageKey}
              title={STAGE_STATUS[stageKey]}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: idx <= activeIndex ? '#C4956A' : '#DDD4C4',
                display: 'block',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusText}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width, height, display: 'block', background: 'transparent' }}
        aria-hidden
      />
      <div
        ref={statusRef}
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: 13,
          color: '#8C7355',
          letterSpacing: '0.05em',
          textAlign: 'center',
          marginTop: 22,
          transition: 'opacity 0.4s ease',
          opacity: 1,
        }}
      >
        {STAGE_STATUS[currentStageKeyRef.current]}
      </div>
      <div
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 11,
          color: '#C4A882',
          marginTop: 7,
          textAlign: 'center',
          letterSpacing: '0.08em',
        }}
      >
        {formatElapsedSeconds(elapsedSeconds)} elapsed
      </div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STAGE_KEYS.length}
        aria-valuenow={activeIndex + 1}
        aria-label={`Research pipeline stage ${activeIndex + 1} of ${STAGE_KEYS.length}`}
        style={{ display: 'flex', gap: 7, marginTop: 20, alignItems: 'center' }}
      >
        {STAGE_KEYS.map((stageKey, idx) => (
          <span
            key={stageKey}
            ref={(node) => {
              dotRefs.current[idx] = node;
            }}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: idx === 0 ? '#C4956A' : '#DDD4C4',
              transform: idx === 0 ? 'scale(1.5)' : 'scale(1)',
              transition: 'background 0.5s ease, transform 0.3s ease',
              display: 'block',
            }}
          />
        ))}
      </div>
    </div>
  );
}
