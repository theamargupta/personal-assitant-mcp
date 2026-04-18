'use client'

import { motion } from 'framer-motion'

export function ProgressBar({
  value,
  label,
  className = '',
}: {
  value: number
  label?: string
  className?: string
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)))

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        {label && <span className="truncate text-text-muted">{label}</span>}
        <span className="ml-auto font-mono text-text-secondary">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full bg-neon"
        />
      </div>
    </div>
  )
}
