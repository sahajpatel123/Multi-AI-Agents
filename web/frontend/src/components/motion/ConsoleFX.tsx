import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** Monospace score odometer that ticks digits up to `value`. */
export function ScoreOdometer({
  value,
  duration = 900,
  className,
  suffix = '',
}: {
  value: number
  duration?: number
  className?: string
  suffix?: string
}) {
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(0)
  const raf = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (reduce) { setDisplay(value); return }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(value * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, duration, reduce])

  return (
    <span className={`mono ${className ?? ''}`}>
      {display.toString().padStart(2, '0')}
      {suffix}
    </span>
  )
}

/** Renders text token-by-token (typewriter). */
export function TypeStream({
  text,
  speed = 18,
  className,
  onDone,
}: {
  text: string
  speed?: number
  className?: string
  onDone?: () => void
}) {
  const reduce = useReducedMotion()
  const [out, setOut] = useState(reduce ? text : '')

  useEffect(() => {
    if (reduce) { setOut(text); onDone?.(); return }
    let i = 0
    const id = window.setInterval(() => {
      i += 2
      setOut(text.slice(0, i))
      if (i >= text.length) { window.clearInterval(id); onDone?.() }
    }, speed)
    return () => window.clearInterval(id)
  }, [text, speed, reduce, onDone])

  return (
    <span className={className}>
      {out}
      <motion.span
        aria-hidden
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        style={{ display: out.length < text.length ? 'inline' : 'none', marginLeft: 1, opacity: 0.7 }}
      >
        ▍
      </motion.span>
    </span>
  )
}

/** Monitor screen wrapper — bezel, scanlines, signal light. */
export function Monitor({
  children,
  signal = '#7DD3C0',
  active = true,
  className,
  label,
  style,
}: {
  children?: ReactNode
  signal?: string
  active?: boolean
  className?: string
  label?: string
  style?: CSSProperties
}) {
  const reduce = useReducedMotion()
  return (
    <div
      className={`console-frame console-frame--bezel scanlines ${className ?? ''}`}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 10, right: 12, zIndex: 3,
          width: 7, height: 7, borderRadius: '50%',
          background: active ? signal : '#2C3540',
          boxShadow: active ? `0 0 8px 1px ${signal}77` : 'none',
          opacity: active ? 1 : 0.4,
          animation: reduce ? 'none' : 'signalSweep 2.4s ease-in-out infinite',
        }}
      />
      {label && (
        <div aria-hidden className="mono" style={{ position:'absolute', top:10, left:12, zIndex:3, fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', color: 'var(--ink-3)' }}>
          {label}
        </div>
      )}
      {!reduce && active && (
        <motion.div
          aria-hidden
          initial={{ y: '-110%' }}
          animate={{ y: '110%' }}
          transition={{ duration: 3.2, ease: 'linear', repeat: Infinity }}
          style={{
            position:'absolute', left:0, right:0, height: 90, zIndex: 2,
            backgroundImage: 'linear-gradient(180deg, transparent 0%, rgba(125,211,192,0.06) 50%, transparent 100%)',
            pointerEvents:'none',
          }}
        />
      )}
      <div style={{ position:'relative', zIndex: 1, padding: label ? '30px 16px 16px' : '16px' }}>
        {children}
      </div>
    </div>
  )
}