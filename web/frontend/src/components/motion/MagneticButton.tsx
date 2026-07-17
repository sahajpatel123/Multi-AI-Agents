import { motion, useReducedMotion } from 'framer-motion'
import { useRef, type ReactNode, type MouseEvent } from 'react'

/** Button with a magnetic-follow cursor and press ripple. */
export function MagneticButton({
  children,
  className,
  strength = 14,
  onClick,
  as = 'button',
  ...rest
}: {
  children: ReactNode
  className?: string
  strength?: number
  onClick?: (e: MouseEvent<HTMLElement>) => void
  as?: 'button' | 'a'
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()

  const handleMove = (e: MouseEvent<HTMLElement>) => {
    if (reduce || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = e.clientX - (r.left + r.width / 2)
    const y = e.clientY - (r.top + r.height / 2)
    ref.current.style.transform = `translate(${(x / r.width) * strength}px, ${(y / r.height) * strength}px)`
  }
  const reset = () => {
    if (ref.current) ref.current.style.transform = 'translate(0,0)'
  }

  const Tag = as === 'a' ? motion.a : motion.button

  return (
    <Tag
      ref={ref as never}
      className={className}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      whileTap={{ scale: 0.965 }}
      transition={{ type: 'spring', stiffness: 240, damping: 18, mass: 0.6 }}
      {...rest}
    >
      {children}
    </Tag>
  )
}