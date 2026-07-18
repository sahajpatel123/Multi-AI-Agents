import type { ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/motion';

export type EmptyStateVariant = 'default' | 'error' | 'card' | 'filter' | 'compact';

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** Decorative icon or illustration (hidden from AT by default wrapper). */
  icon?: ReactNode;
  /** Primary / secondary action buttons. */
  actions?: ReactNode;
  variant?: EmptyStateVariant;
  /** When true, use role=alert (errors). Default status for empty/filter. */
  alert?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * Shared empty / error / filter-zero chrome for production lists & gates.
 * Composes with existing `.arena-btn` actions — does not invent a second button system.
 */
export function EmptyState({
  title,
  description,
  icon,
  actions,
  variant = 'default',
  alert = false,
  className = '',
  children,
}: EmptyStateProps) {
  const reduceMotion = prefersReducedMotion();
  const classes = [
    'arena-empty-state',
    `arena-empty-state--${variant}`,
    reduceMotion ? 'arena-empty-state--static' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const showDefaultMark = !icon && variant !== 'compact';
  const showMinds =
    variant !== 'compact' && variant !== 'error' && !alert;

  return (
    <div
      className={classes}
      role={alert || variant === 'error' ? 'alert' : 'status'}
      aria-live={alert || variant === 'error' ? 'assertive' : 'polite'}
    >
      {icon ? (
        <div className="arena-empty-state__icon" aria-hidden>
          {icon}
        </div>
      ) : showDefaultMark ? (
        <div className="arena-empty-state__mark" aria-hidden>
          <span className="arena-empty-state__mark-glow" />
          <span className="arena-empty-state__mark-glyph">
            {variant === 'error' ? '!' : variant === 'filter' ? '⌀' : '·'}
          </span>
        </div>
      ) : null}
      <h2 className="arena-empty-state__title">{title}</h2>
      {description ? (
        <p className="arena-empty-state__description">{description}</p>
      ) : null}
      {showMinds ? (
        <div className="arena-empty-state__minds" aria-hidden="true">
          <span className="arena-empty-state__minds-label">Four minds ready</span>
          <div className="arena-empty-state__minds-dots">
            <span className="arena-empty-state__minds-dot" />
            <span className="arena-empty-state__minds-dot" />
            <span className="arena-empty-state__minds-dot" />
            <span className="arena-empty-state__minds-dot" />
          </div>
        </div>
      ) : null}
      {children}
      {actions ? <div className="arena-empty-state__actions">{actions}</div> : null}
    </div>
  );
}

export default EmptyState;
