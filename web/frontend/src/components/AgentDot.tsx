import { CSSProperties, useEffect, useRef, useState } from 'react';
import { AGENTS } from '../types';
import { prefersReducedMotion } from '../lib/motion';

interface AgentDotProps {
  agentId: string;
  size?: number;
  flashKey?: number;
  className?: string;
  style?: CSSProperties;
  color?: string;
  /** When true (or when prefers-reduced-motion is on), skip the
   *  breathe and flash animations entirely. Useful for static surfaces
   *  like history lists where a constant-pulse dot would be noise. */
  disableAnimation?: boolean;
}

const BREATHE_ANIMATIONS: Record<string, string> = {
  agent_1: 'breathe-1 2.4s ease-in-out infinite',
  agent_2: 'breathe-2 2.8s ease-in-out infinite',
  agent_3: 'breathe-3 3.2s ease-in-out infinite',
  agent_4: 'breathe-4 2s ease-in-out infinite',
};

const FLASH_ANIMATIONS: Record<string, string> = {
  agent_1: 'dot-flash-1 400ms ease-out',
  agent_2: 'dot-flash-2 400ms ease-out',
  agent_3: 'dot-flash-3 400ms ease-out',
  agent_4: 'dot-flash-4 400ms ease-out',
};

export function AgentDot({
  agentId,
  size = 10,
  flashKey = 0,
  className,
  style,
  color,
  disableAnimation = false,
}: AgentDotProps) {
  const agent = AGENTS[agentId];
  const [isFlashing, setIsFlashing] = useState(false);
  const previousFlashKey = useRef(flashKey);
  // Per-instance cache so we don't re-query matchMedia every render —
  // it's stable for the session and the call is cheap but not free.
  const reducedMotionRef = useRef<boolean | null>(null);
  if (reducedMotionRef.current === null) {
    reducedMotionRef.current = prefersReducedMotion();
  }
  const reducedMotion = reducedMotionRef.current;

  useEffect(() => {
    if (flashKey === 0 || flashKey === previousFlashKey.current) return;

    previousFlashKey.current = flashKey;
    setIsFlashing(false);

    let frameId = 0;
    const timeoutId = window.setTimeout(() => setIsFlashing(false), 400);
    frameId = window.requestAnimationFrame(() => {
      setIsFlashing(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [flashKey]);

  if (!agent) return null;

  // disableAnimation is the explicit prop; prefers-reduced-motion is
  // the implicit OS-level opt-out. Either suppresses animations. We
  // don't gate the flash on flashKey — a flash with no animation is
  // just a static dot, which is still a meaningful UX beat.
  const animate = !disableAnimation && !reducedMotion;
  const animation = !animate
    ? 'none'
    : isFlashing
    ? `${FLASH_ANIMATIONS[agentId]}, ${BREATHE_ANIMATIONS[agentId]}`
    : BREATHE_ANIMATIONS[agentId];

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        display: 'inline-block',
        borderRadius: '999px',
        backgroundColor: color || agent.color,
        transformOrigin: 'center',
        animation,
        ...style,
      }}
    />
  );
}
