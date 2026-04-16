'use client'

import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useRef } from 'react'
import { ChatAnimation } from './ChatAnimation'

const snappySpring = { type: 'spring' as const, stiffness: 400, damping: 15, mass: 1 }

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.3 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 32, filter: 'blur(10px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

/* ── Magnetic button ── */
function MagneticButton({
  children,
  href,
  variant = 'primary',
}: {
  children: React.ReactNode
  href: string
  variant?: 'primary' | 'secondary'
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, snappySpring)
  const y = useSpring(rawY, snappySpring)

  function handleMouseMove(event: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    rawX.set((event.clientX - (rect.left + rect.width / 2)) * 0.18)
    rawY.set((event.clientY - (rect.top + rect.height / 2)) * 0.18)
  }

  function reset() { rawX.set(0); rawY.set(0) }

  const isPrimary = variant === 'primary'

  return (
    <motion.a
      ref={ref}
      href={href}
      onMouseMove={handleMouseMove}
      onMouseLeave={reset}
      onBlur={reset}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={snappySpring}
      style={{ x, y }}
      className={`
        relative inline-flex items-center justify-center gap-2
        rounded-full px-8 py-4 text-sm font-medium tracking-wide cursor-pointer
        transition-colors duration-300
        ${isPrimary
          ? 'bg-neon text-bg-primary shadow-[0_0_50px_rgba(200,255,0,0.12)]'
          : 'border border-white/[0.1] text-text-secondary hover:text-text-primary hover:border-white/[0.2]'
        }
      `}
    >
      <span className="relative z-10">{children}</span>
      {isPrimary && (
        <span className="relative z-10">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3.333 8h9.334M8.667 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </motion.a>
  )
}

/* ── Ambient glow — monochrome with neon hint ── */
function AmbientOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Neon orb — top center, very subtle */}
      <motion.div
        className="absolute -top-[25%] left-[20%] w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(200,255,0,0.06) 0%, rgba(200,255,0,0.01) 50%, transparent 70%)',
        }}
        animate={{ x: [0, 30, -15, 0], y: [0, -25, 15, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      {/* White orb — right, cold neutral */}
      <motion.div
        className="absolute top-[15%] -right-[10%] w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 60%)',
        }}
        animate={{ x: [0, -20, 10, 0], y: [0, 30, -15, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden grain isolate">
      <AmbientOrbs />

      {/* Top neon line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon/20 to-transparent" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-16 flex flex-col items-center text-center"
      >
        {/* Micro label */}
        <motion.div variants={fadeUp} className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse" />
            25 Tools &middot; 5 Modules &middot; One MCP Server
          </span>
        </motion.div>

        {/* Headline — monochrome with neon accent word */}
        <motion.h1
          variants={fadeUp}
          className="font-sans text-[clamp(2.75rem,7.5vw,6.5rem)] font-bold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]"
        >
          Your life,{' '}
          <span className="text-neon">orchestrated</span>
          <br />
          <span className="text-text-secondary font-medium text-[0.55em] leading-[1.3] tracking-[-0.02em]">
            by intelligence
          </span>
        </motion.h1>

        {/* Supporting copy */}
        <motion.p
          variants={fadeUp}
          className="mt-8 max-w-xl text-[clamp(1rem,1.2vw,1.125rem)] leading-[1.7] text-text-secondary [text-wrap:pretty]"
        >
          Track habits, manage tasks, store documents, monitor spending, hit goals —
          all through Claude. Just talk. In Hindi, English, or whatever feels natural.
        </motion.p>

        {/* CTAs */}
        <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <MagneticButton href="/signup" variant="primary">
            Get Started
          </MagneticButton>
          <MagneticButton href="#features" variant="secondary">
            See How It Works
          </MagneticButton>
        </motion.div>

        {/* Chat showcase */}
        <motion.div variants={fadeUp} className="relative mt-20 w-full max-w-lg">
          <div className="absolute -inset-12 bg-neon/[0.03] rounded-full blur-[80px] pointer-events-none" />
          <div className="relative">
            <ChatAnimation />
          </div>
          <div className="absolute -bottom-8 left-0 right-0 h-24 bg-gradient-to-t from-bg-primary to-transparent pointer-events-none" />
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] text-text-muted">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-text-muted/60 to-transparent" />
        </motion.div>
      </motion.div>
    </section>
  )
}
