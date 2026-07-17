import { motion, useReducedMotion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import { reveal, item } from '../../lib/motionFX'

/** Blur-in reveal on scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: 'div' | 'section' | 'li' | 'span'
}) {
  const reduce = useReducedMotion()
  const M = motion[as] as typeof motion.div
  if (reduce) return <M className={className}>{children}</M>
  return (
    <M
      className={className}
      variants={reveal}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay }}
    >
      {children}
    </M>
  )
}

/** Stagger container — wrap a list of <StaggerItem>. */
export function Stagger({
  children,
  className,
  fast = false,
}: {
  children: ReactNode
  className?: string
  fast?: boolean
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: fast ? 0.045 : 0.08, delayChildren: 0.04 } } } as Variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  )
}

/** Eyebrow label — mono telemetry voice with a sweep underline. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`eyebrow ${className ?? ''}`}>
      <motion.span
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ display: 'inline-block', width: 18, height: 1, background: 'currentColor', marginRight: 12, verticalAlign: 'middle', transformOrigin: 'left' }}
      />
      {children}
    </span>
  )
}