/**
 * Shared motion helpers — keep polish restrained and accessible.
 *
 * Interaction tokens below feed both CSS (via documented values) and
 * framer-motion components so hover/tap feel consistent across the app.
 *
 * Design intent: buttons and interactive surfaces should feel *alive* —
 * a soft spring lift on hover, a snappy press, a smooth settle on leave —
 * without becoming bouncy or distracting. Reduced-motion always wins.
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

/**
 * Soft spring overshoot for hover settle (matches --ease-spring-soft).
 * Slight bounce that reads as tactile without cartoon physics.
 */
export const MOTION_EASE_SPRING_SOFT = [0.34, 1.4, 0.64, 1] as const;

/** CSS cubic-bezier string for MOTION_EASE_OUT. */
export const MOTION_EASE_OUT_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** CSS cubic-bezier string for MOTION_EASE_BTN. */
export const MOTION_EASE_BTN_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** CSS cubic-bezier string for MOTION_EASE_SPRING_SOFT. */
export const MOTION_EASE_SPRING_SOFT_CSS = 'cubic-bezier(0.34, 1.4, 0.64, 1)';

/** Canonical micro-interaction durations (ms) — mirrored in index.css tokens. */
export const MOTION_MS = {
  /** Hover settle / color crossfade */
  hover: 240,
  /** Press / tap feedback — snappier than hover for tactile punch */
  press: 95,
  /** Shadow and lift settle */
  lift: 280,
  /** Icon / chip micro */
  micro: 170,
  /** Sheen sweep across primary CTAs */
  sheen: 720,
} as const;

/**
 * Spring physics for framer-motion CTAs.
 * Tuned for desktop pointer + touch: responsive without jiggle.
 */
export const MOTION_SPRING = {
  /** Hover lift — soft, slightly under-damped for a living feel */
  hover: { type: 'spring' as const, stiffness: 420, damping: 28, mass: 0.55 },
  /** Tap press — stiffer, settles fast */
  tap: { type: 'spring' as const, stiffness: 620, damping: 34, mass: 0.45 },
  /** Soft toolbar / icon-row springs */
  soft: { type: 'spring' as const, stiffness: 380, damping: 30, mass: 0.5 },
} as const;

/**
 * Framer-motion presets for primary CTAs.
 * Hover: soft lift + tiny scale with spring. Tap: press into the surface.
 */
export const INTERACTION = {
  hover: {
    y: -3,
    scale: 1.02,
    transition: MOTION_SPRING.hover,
  },
  tap: {
    y: 0,
    scale: 0.97,
    transition: MOTION_SPRING.tap,
  },
  /** Softer hover for dense toolbars / icon rows */
  hoverSoft: {
    y: -1.5,
    scale: 1.012,
    transition: MOTION_SPRING.soft,
  },
  tapSoft: {
    scale: 0.98,
    transition: MOTION_SPRING.tap,
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
 * Uses a spring-soft ease on transform-adjacent properties for a less static settle.
 * Collapses to `none` under reduced motion.
 */
export function interactiveTransition(ms = MOTION_MS.hover): string {
  if (prefersReducedMotion()) return 'none';
  // Split timings: color settles a hair faster than transform/shadow so the
  // lift feels continuous rather than everything snapping in lockstep.
  return [
    `background ${ms}ms ${MOTION_EASE_BTN_CSS}`,
    `color ${ms}ms ${MOTION_EASE_BTN_CSS}`,
    `border-color ${ms}ms ${MOTION_EASE_BTN_CSS}`,
    `opacity ${ms}ms ${MOTION_EASE_BTN_CSS}`,
    `filter ${ms}ms ${MOTION_EASE_BTN_CSS}`,
    `transform ${MOTION_MS.lift}ms ${MOTION_EASE_SPRING_SOFT_CSS}`,
    `box-shadow ${MOTION_MS.lift}ms ${MOTION_EASE_OUT_CSS}`,
  ].join(', ');
}

/** Scroll behavior for in-page anchors — instant when reduced motion is preferred. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
