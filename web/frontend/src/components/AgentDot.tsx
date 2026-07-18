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

const AGENT_INDEX: Record<string, number> = {
  agent_1: 1,
  agent_2: 2,
  agent_3: 3,
  agent_4: 4,
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
  const reducedMotion = prefersReducedMotion();

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

  const fill = color || agent.color;
  // disableAnimation is the explicit prop; prefers-reduced-motion is
  // the implicit OS-level opt-out. Either suppresses animations.
  const animate = !disableAnimation && !reducedMotion;
  const animation = !animate
    ? 'none'
    : isFlashing
      ? `${FLASH_ANIMATIONS[agentId] || 'dot-flash-1 400ms ease-out'}, ${BREATHE_ANIMATIONS[agentId] || 'breathe-1 2.4s ease-in-out infinite'}`
      : BREATHE_ANIMATIONS[agentId] || 'breathe-1 2.4s ease-in-out infinite';

  const idx = AGENT_INDEX[agentId] || 0;
  const classes = [
    'agent-dot',
    idx ? `agent-dot--${idx}` : '',
    animate ? 'agent-dot--live' : 'agent-dot--static',
    isFlashing && animate ? 'agent-dot--flashing' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      aria-hidden="true"
      className={classes}
      title={agent.name}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        // CSS custom property so the soft ring tracks the fill color
        ['--agent-dot-color' as string]: fill,
        backgroundColor: fill,
        animation,
        ...style,
      }}
    />
  );
}
