import { CSSProperties, useEffect, useRef, useState } from 'react';
import { AGENTS } from '../types';

interface AgentDotProps {
  agentId: string;
  size?: number;
  flashKey?: number;
  className?: string;
  style?: CSSProperties;
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
}: AgentDotProps) {
  const agent = AGENTS[agentId];
  const [isFlashing, setIsFlashing] = useState(false);
  const previousFlashKey = useRef(flashKey);

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

  const animation = isFlashing
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
        backgroundColor: agent.color,
        transformOrigin: 'center',
        animation,
        ...style,
      }}
    />
  );
}
