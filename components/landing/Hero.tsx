'use client'

import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useRef } from 'react'
import { ChatAnimation } from './ChatAnimation'

/* ── Spring profiles ── */
const smoothSpring = { type: 'spring' as const, stiffness: 100, damping: 20, mass: 1 }
const snappySpring = { type: 'spring' as const, stiffness: 400, damping: 15, mass: 1 }

/* ── Stagger orchestration ── */
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
    const offsetX = event.clientX - (rect.left + rect.width / 2)
    const offsetY = event.clientY - (rect.top + rect.height / 2)
    rawX.set(offsetX * 0.18)
    rawY.set(offsetY * 0.18)
  }

  function reset() {
    rawX.set(0)
    rawY.set(0)
  }

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
        rounded-full px-8 py-4 text-sm font-medium tracking-wide
        transition-colors cursor-pointer
        ${
          isPrimary
            ? 'bg-white text-[#0a0a0f] shadow-[0_0_60px_rgba(255,255,255,0.12),0_0_120px_rgba(139,92,246,0.08)]'
            : 'border border-white/[0.12] text-text-secondary hover:text-text-primary hover:border-white/[0.24] backdrop-blur-sm'
        }
      `}
    >
      {isPrimary && (
        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-accent-blue/20 via-accent-purple/20 to-accent-cyan/20 opacity-0 transition-opacity duration-500 hover:opacity-100" />
      )}
      <span className="relative z-10">{children}</span>
      {isPrimary && (
        <span className="relative z-10">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="transition-transform duration-300 group-hover:translate-x-0.5"
          >
            <path
              d="M3.333 8h9.334M8.667 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </motion.a>
  )
}

/* ── Floating ambient orbs ── */
function AmbientOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Primary blue orb — top left */}
      <motion.div
        className="absolute -top-[20%] -left-[10%] w-[600px] h-[600px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.04) 50%, transparent 70%)',
        }}
        animate={{
          x: [0, 40, -20, 0],
          y: [0, -30, 20, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />

      {/* Purple orb — center right */}
      <motion.div
        className="absolute top-[10%] -right-[5%] w-[500px] h-[500px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.03) 50%, transparent 70%)',
        }}
        animate={{
          x: [0, -30, 15, 0],
          y: [0, 40, -20, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />

      {/* Cyan accent — bottom center */}
      <motion.div
        className="absolute -bottom-[15%] left-[30%] w-[400px] h-[400px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(6,182,212,0.1) 0%, rgba(6,182,212,0.02) 50%, transparent 70%)',
        }}
        animate={{
          x: [0, 25, -35, 0],
          y: [0, -20, 30, 0],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
      />

      {/* Subtle mesh overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(139,92,246,0.06), transparent)',
        }}
      />
    </div>
  )
}

/* ── Hero section ── */
export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden grain isolate">
      <AmbientOrbs />

      {/* Subtle top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-purple/40 to-transparent" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-16 flex flex-col items-center text-center"
      >
        {/* Micro label */}
        <motion.div variants={fadeUp} className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-text-secondary backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse" />
            AI-Powered Personal Assistant
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={fadeUp}
          className="font-sans text-[clamp(2.75rem,7.5vw,6.5rem)] font-bold leading-[0.92] tracking-[-0.04em] [text-wrap:balance]"
        >
          Your life,{' '}
          <span className="gradient-text-premium">
            orchestrated
          </span>
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
          Habits, tasks, documents, spending, goals — unified under one
          AI that knows your rhythm and speaks your language.
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

        {/* Chat showcase — floating below */}
        <motion.div
          variants={fadeUp}
          className="relative mt-20 w-full max-w-lg"
        >
          {/* Glow behind chat card */}
          <div className="absolute -inset-12 bg-accent-purple/[0.06] rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute -inset-8 bg-accent-blue/[0.04] rounded-full blur-[60px] pointer-events-none" />

          <div className="relative">
            <ChatAnimation />
          </div>

          {/* Fade-out bottom edge */}
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
