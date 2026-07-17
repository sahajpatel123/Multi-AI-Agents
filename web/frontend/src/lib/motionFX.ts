/**
 * Arena — "Control Room" motion FX presets (framer-motion).
 * All presets collapse gracefully under prefers-reduced-motion
 * (framer-motion handles via useReducedMotion inside components).
 */
import type { Variants } from 'framer-motion'

export const EASE_SOFT = [0.22, 1, 0.36, 1] as const
export const EASE_EXC = [0.16, 1, 0.3, 1] as const
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const

type SpringCfg = { type: 'spring'; stiffness: number; damping: number; mass: number }
const spring = (stiffness = 180, damping = 22, mass = 0.9): SpringCfg => ({
  type: 'spring', stiffness, damping, mass,
})

export const reveal: Variants = {
  hidden: { opacity: 0, y: 22, filter: 'blur(10px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, ease: EASE_EXC } },
}

export const revealLeft: Variants = {
  hidden: { opacity: 0, x: -28, filter: 'blur(6px)' },
  visible: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE_EXC } },
}

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
}

export const staggerFast: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045 } },
}

export const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_EXC } },
}

export const irisIn: Variants = {
  hidden: { clipPath: 'circle(0% at 50% 50%)', opacity: 0, scale: 1.04 },
  visible: { clipPath: 'circle(75% at 50% 50%)', opacity: 1, scale: 1, transition: { duration: 0.85, ease: EASE_EXC } },
}

export const tap = { whileHover: { scale: 1.025 }, whileTap: { scale: 0.975 } }

export const magneticSpring = (stiffness = 220, damping = 18): SpringCfg =>
  spring(stiffness, damping, 0.6)

export const odometer: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_EXC } },
}

export const float: Variants = {
  hidden: { y: 0 },
  visible: { y: [-6, 6, -6], transition: { duration: 7, ease: 'easeInOut', repeat: Infinity } },
}

export const pageFade: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_EXC } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25, ease: EASE_SOFT } },
}

export const cardTilt = {
  whileHover: { y: -6, transition: { type: 'spring', stiffness: 260, damping: 20 } },
}