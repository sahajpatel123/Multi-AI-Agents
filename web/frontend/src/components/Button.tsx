import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ButtonSpinner } from './Icons';
import { interactiveTransition } from '../lib/motion';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    disabled,
    fullWidth,
    children,
    className = '',
    type = 'button',
    style,
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

  const left = loading ? <ButtonSpinner size={14} /> : icon;
  // Inline transition collapses to `none` when prefers-reduced-motion is on,
  // so press/hover feedback never fights the user's OS setting.
  const motionStyle: CSSProperties = {
    transition: interactiveTransition(),
    ...style,
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={classes}
      style={motionStyle}
      {...rest}
    >
      {left ? <span className="arena-btn__icon">{left}</span> : null}
      <span className="arena-btn__label">{children}</span>
      {!loading && iconRight ? (
        <span className="arena-btn__icon arena-btn__icon--right">{iconRight}</span>
      ) : null}
    </button>
  );
});
