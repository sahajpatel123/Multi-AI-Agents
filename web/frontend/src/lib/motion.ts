/**
 * Shared motion helpers — keep polish restrained and accessible.
 *
 * Interaction tokens below feed both CSS (via documented values) and
 * framer-motion components so hover/tap feel consistent across the app.
 */

/** True when the user (or OS) prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Duration in ms for micro-interactions. Returns 0 when reduced motion is on
 * so callers can skip timed transitions without forking every animation site.
 */
export function motionDuration(ms: number): number {
  if (ms <= 0) return 0;
  return prefersReducedMotion() ? 0 : ms;
}

/** Premium out-easing used for lifts, fades, and settle (matches --ease-out-premium). */
export const MOTION_EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Snappy button ease (matches --ease-btn). */
export const MOTION_EASE_BTN = [0.16, 1, 0.3, 1] as const;

/** CSS cubic-bezier string for MOTION_EASE_OUT. */
export const MOTION_EASE_OUT_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** CSS cubic-bezier string for MOTION_EASE_BTN. */
export const MOTION_EASE_BTN_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Canonical micro-interaction durations (ms). */
export const MOTION_MS = {
  /** Hover settle / color crossfade */
  hover: 200,
  /** Press / tap feedback */
  press: 110,
  /** Shadow and lift settle */
  lift: 220,
  /** Icon / chip micro */
  micro: 160,
} as const;

/**
 * Framer-motion presets for primary CTAs.
 * Hover: soft lift + tiny scale. Tap: press into the surface.
 */
export const INTERACTION = {
  hover: {
    y: -2,
    scale: 1.015,
    transition: { duration: MOTION_MS.hover / 1000, ease: MOTION_EASE_OUT },
  },
  tap: {
    y: 0,
    scale: 0.975,
    transition: { duration: MOTION_MS.press / 1000, ease: MOTION_EASE_BTN },
  },
  /** Softer hover for dense toolbars / icon rows */
  hoverSoft: {
    y: -1,
    scale: 1.01,
    transition: { duration: MOTION_MS.micro / 1000, ease: MOTION_EASE_OUT },
  },
  tapSoft: {
    scale: 0.98,
    transition: { duration: MOTION_MS.press / 1000, ease: MOTION_EASE_BTN },
  },
} as const;

/** CSS transition string that collapses to none under reduced motion. */
export function motionTransition(
  property = 'all',
  ms = 200,
  easing = MOTION_EASE_OUT_CSS,
): string {
  if (prefersReducedMotion()) return 'none';
  return `${property} ${ms}ms ${easing}`;
}

/**
 * Multi-property transition used by interactive controls (buttons, chips, links).
 * Collapses to `none` under reduced motion.
 */
export function interactiveTransition(ms = MOTION_MS.hover): string {
  return motionTransition(
    'background, color, border-color, opacity, transform, box-shadow, filter',
    ms,
    MOTION_EASE_BTN_CSS,
  );
}

/** Scroll behavior for in-page anchors — instant when reduced motion is preferred. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
