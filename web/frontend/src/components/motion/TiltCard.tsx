import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** 3D tilt on hover for cards. */
export function TiltCard({
  children,
  className,
  max = 8,
  style,
}: {
  children: ReactNode
  className?: string
  max?: number
  style?: CSSProperties
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      className={className}
      style={{ transformStyle: 'preserve-3d', ...style }}
      whileHover={{ rotateX: -max * 0.4, rotateY: max, y: -6 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    >
      {children}
    </motion.div>
  )
}

/** Animated counter — counts from 0 → value on view. */
export function Counter({ value, suffix = '', duration = 1100, className }: { value: number; suffix?: string; duration?: number; className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return <span className={className}>{value.toLocaleString()}{suffix}</span>
  return (
    <motion.span className={className} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
      <RafCounter value={value} duration={duration} />
      {suffix}
    </motion.span>
  )
}

function RafCounter({ value, duration }: { value: number; duration: number }) {
  const [n, setN] = useState(0)
  const raf = useRef<number | undefined>(undefined)
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setN(Math.round(value * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, duration])
  return <>{n.toLocaleString()}</>
}