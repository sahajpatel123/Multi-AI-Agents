import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';
import { INTERACTION, MOTION_SPRING, prefersReducedMotion } from '../lib/motion';

export interface PressableProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  /** Smaller hover/press envelope for dense controls (toggles, chips). */
  soft?: boolean;
  children?: ReactNode;
}

/**
 * Motion-only button wrapper for Prism / custom-styled CTAs.
 *
 * Unlike MotionButton, this does not apply `.arena-btn` styling — it only adds
 * spring hover/tap on top of whatever classes the caller provides. Use for
 * Verdict Prism surfaces (pricing, docs, personas) where visual language is
 * owned by route CSS.
 */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  function Pressable(
    { soft = false, disabled, className = '', type = 'button', children, ...rest },
    ref,
  ) {
    const reduced = prefersReducedMotion();
    const allowMotion = !reduced && !disabled;
    const hover = soft ? INTERACTION.hoverSoft : INTERACTION.hover;
    const tap = soft ? INTERACTION.tapSoft : INTERACTION.tap;

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled}
        className={className}
        whileHover={allowMotion ? hover : undefined}
        whileTap={allowMotion ? tap : undefined}
        transition={allowMotion ? MOTION_SPRING.hover : { duration: 0 }}
        {...rest}
      >
        {children}
      </motion.button>
    );
  },
);
