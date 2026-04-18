'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
}

const item = {
  hidden: { opacity: 0, y: 18, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

export function DashboardHero({
  title,
  subtitle,
  eyebrow,
  right,
}: {
  title: string
  subtitle?: string
  eyebrow?: string
  right?: ReactNode
}) {
  return (
    <motion.section
      variants={container}
      initial="hidden"
      animate="show"
      className="relative overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.01] px-5 py-6 sm:px-7 sm:py-8"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/30 to-transparent" />
      <div className="absolute -right-20 -top-28 h-64 w-64 rounded-full bg-neon/[0.035] blur-[80px]" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow && (
            <motion.p variants={item} className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted">
              {eyebrow}
            </motion.p>
          )}
          <motion.h1
            variants={item}
            className="mt-3 text-[clamp(2rem,5vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.04em] text-text-primary [text-wrap:balance]"
          >
            {title}
          </motion.h1>
          {subtitle && (
            <motion.p variants={item} className="mt-4 max-w-2xl text-sm leading-6 text-text-secondary sm:text-[15px]">
              {subtitle}
            </motion.p>
          )}
        </div>
        {right && <motion.div variants={item} className="shrink-0">{right}</motion.div>}
      </div>
    </motion.section>
  )
}
