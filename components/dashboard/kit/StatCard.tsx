'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

type Accent = 'neon' | 'blue' | 'orange' | 'red' | 'violet' | 'muted'

const accentClasses: Record<Accent, string> = {
  neon: 'bg-neon text-neon',
  blue: 'bg-blue-400 text-blue-300',
  orange: 'bg-orange-400 text-orange-300',
  red: 'bg-red-400 text-red-300',
  violet: 'bg-fuchsia-300 text-fuchsia-200',
  muted: 'bg-white/25 text-text-muted',
}

export function StatCard({
  label,
  value,
  hint,
  accent = 'muted',
  icon,
  trend,
}: {
  label: string
  value: string | number
  hint?: string
  accent?: Accent
  icon?: ReactNode
  trend?: { direction: 'up' | 'down' | 'flat'; value: string }
}) {
  const trendClass = trend?.direction === 'up'
    ? 'text-neon'
    : trend?.direction === 'down'
      ? 'text-red-300'
      : 'text-text-muted'

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/[0.04] bg-white/[0.01] p-5 transition-colors duration-300 hover:border-white/[0.08] hover:bg-white/[0.025]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${accentClasses[accent].split(' ')[0]}`} />
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted">{label}</p>
        </div>
        {icon && <span className={`shrink-0 ${accentClasses[accent].split(' ')[1]}`}>{icon}</span>}
      </div>
      <p className="mt-4 text-[32px] font-bold leading-none tracking-[-0.02em] text-text-primary">{value}</p>
      <div className="mt-3 flex min-h-4 items-center justify-between gap-3 text-xs">
        {hint && <p className="truncate text-text-muted">{hint}</p>}
        {trend && <p className={`ml-auto whitespace-nowrap font-medium ${trendClass}`}>{trend.value}</p>}
      </div>
    </motion.div>
  )
}
