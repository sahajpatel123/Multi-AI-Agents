import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';
import { ButtonSpinner } from './Icons';
import { INTERACTION, MOTION_SPRING, prefersReducedMotion } from '../lib/motion';

export type MotionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type MotionButtonSize = 'sm' | 'md' | 'lg';

export interface MotionButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: MotionButtonVariant;
  size?: MotionButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

/**
 * Motion-augmented button.
 *
 * Wraps the base `.arena-btn` styling with framer-motion spring hover and tap
 * feedback — a living lift on hover, a tactile press on tap, and a soft settle
 * on leave. Both are no-ops when the user prefers reduced motion so the OS
 * setting always wins.
 *
 * Static styling and accessibility are unchanged from a normal <button>; the
 * motion layer is purely additive. Use this wherever a primary call-to-action
 * sits on its own — for stacks of buttons, prefer the plain Button so a dozen
 * hover scales don't fight for attention.
 */
export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(
  function MotionButton(
    {
      variant = 'primary',
      size = 'md',
      icon,
      iconRight,
      loading = false,
      fullWidth,
      disabled,
      children,
      className = '',
      type = 'button',
      ...rest
    },
    ref,
  ) {
    const busy = Boolean(loading);
    const isDisabled = Boolean(disabled || loading);
    const reduced = prefersReducedMotion();
    // No lift/press while disabled or busy — motion would read as interactive.
    const allowMotion = !reduced && !isDisabled;

    const classes = [
      'arena-btn',
      'motion-btn',
      `arena-btn--${variant}`,
      `arena-btn--${size}`,
      fullWidth ? 'arena-btn--full' : '',
      loading ? 'arena-btn--loading' : '',
      reduced ? 'motion-btn--static' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const left = loading ? <ButtonSpinner size={14} /> : icon;

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={classes}
        aria-busy={busy || undefined}
        whileHover={allowMotion ? INTERACTION.hover : undefined}
        whileTap={allowMotion ? INTERACTION.tap : undefined}
        // Default spring for any residual layout motion; hover/tap own their springs.
        transition={allowMotion ? MOTION_SPRING.hover : { duration: 0 }}
        {...rest}
      >
        {/* Sheen layer — pure CSS, disabled under reduced-motion via stylesheet */}
        <span className="arena-btn__sheen" aria-hidden="true" />
        {left ? <span className="arena-btn__icon">{left}</span> : null}
        <span className="arena-btn__label">{children}</span>
        {!loading && iconRight ? (
          <span className="arena-btn__icon arena-btn__icon--right">{iconRight}</span>
        ) : null}
      </motion.button>
    );
  },
);
