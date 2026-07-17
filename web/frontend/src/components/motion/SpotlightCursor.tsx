import { motion, useMotionValue, useReducedMotion } from 'framer-motion'
import { useEffect } from 'react'

/** Ambient cursor spotlight that trails the mouse. Decorative, fixed, ignores touch. */
export function SpotlightCursor() {
  const x = useMotionValue(-1000)
  const y = useMotionValue(-1000)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (reduce) return
    const fine = window.matchMedia('(pointer: fine)').matches
    if (!fine) return
    const move = (e: MouseEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)
    }
    window.addEventListener('mousemove', move, { passive: true })
    return () => window.removeEventListener('mousemove', move)
  }, [reduce, x, y])

  if (reduce) return null
  return (
    <motion.div
      aria-hidden
      style={{
        position: 'fixed', left: 0, top: 0, width: 520, height: 520,
        marginLeft: -260, marginTop: -260, translateX: x, translateY: y,
        backgroundImage: 'radial-gradient(circle, rgba(125,211,192,0.10) 0%, transparent 60%)',
        pointerEvents: 'none', zIndex: 1, mixBlendMode: 'screen',
      }}
      transition={{ type: 'spring', stiffness: 60, damping: 20, mass: 0.8 }}
    />
  )
}