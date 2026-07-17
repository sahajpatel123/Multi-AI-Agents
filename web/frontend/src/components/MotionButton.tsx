import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/motion';

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
 * Wraps the base `.arena-btn` styling with framer-motion hover and tap
 * feedback — a subtle lift on hover, a tactile press on tap. Both are
 * no-ops when the user prefers reduced motion so the OS setting always wins.
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
      ...rest
    },
    ref,
  ) {
    const classes = [
      'arena-btn',
      `arena-btn--${variant}`,
      `arena-btn--${size}`,
      fullWidth ? 'arena-btn--full' : '',
      loading ? 'arena-btn--loading' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // reducedMotion is computed once per render; flipping it mid-render would
    // re-mount the motion tree which is overkill for a boolean toggle.
    const reduced = prefersReducedMotion();

    return (
      <motion.button
        ref={ref}
        type={rest.type ?? 'button'}
        disabled={disabled || loading}
        className={classes}
        // when=hover and when=tap require no listener wiring; framer-motion
        // owns the event lifecycle and animates within an internal RAF loop.
        // Scale values picked to read as "press" without making the button
        // feel like it's dancing — 1.02 lift, 0.97 press.
        whileHover={reduced ? undefined : { y: -2, scale: 1.02 }}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        // 180ms matches Button.motion.test.tsx so the two components feel
        // like one design system, not two competing motion vocabularies.
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        {...rest}
      >
        {icon ? <span className="arena-btn__icon">{icon}</span> : null}
        <span className="arena-btn__label">{children}</span>
        {!loading && iconRight ? (
          <span className="arena-btn__icon arena-btn__icon--right">
            {iconRight}
          </span>
        ) : null}
      </motion.button>
    );
  },
);