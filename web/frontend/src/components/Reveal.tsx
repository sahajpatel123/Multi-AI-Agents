import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { prefersReducedMotion } from '../lib/motion';

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  /** Element tag to render. Defaults to `div`. */
  as?: ElementType;
  children?: ReactNode;
  /** IntersectionObserver threshold. Default 0.14 (matches home). */
  threshold?: number;
}

/**
 * One-shot scroll reveal. Adds `.arena-reveal` and flips `.is-visible` when
 * the node enters the viewport. Under reduced motion, starts visible.
 */
export function Reveal({
  as: Tag = 'div',
  className = '',
  children,
  threshold = 0.14,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setVisible(true);
          io.unobserve(entry.target);
        }
      },
      { threshold },
    );

    io.observe(node);
    return () => io.disconnect();
  }, [threshold, visible]);

  const classes = ['arena-reveal', visible ? 'is-visible' : '', className]
    .filter(Boolean)
    .join(' ');

  return createElement(
    Tag,
    {
      ...rest,
      ref,
      className: classes,
    },
    children,
  );
}
