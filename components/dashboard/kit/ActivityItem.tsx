'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

type Dot = 'neon' | 'blue' | 'orange' | 'red' | 'muted'

const dotClasses: Record<Dot, string> = {
  neon: 'bg-neon',
  blue: 'bg-blue-400',
  orange: 'bg-orange-400',
  red: 'bg-red-400',
  muted: 'bg-white/25',
}

export function ActivityItem({
  icon,
  title,
  meta,
  time,
  dot = 'muted',
}: {
  icon?: ReactNode
  title: string
  meta?: string
  time?: string
  dot?: Dot
}) {
  return (
    <motion.div
      whileHover={{ x: 3 }}
      className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors duration-200 hover:border-white/[0.04] hover:bg-white/[0.02]"
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClasses[dot]}`} />
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.02] text-text-secondary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        {meta && <p className="mt-0.5 truncate text-xs text-text-muted">{meta}</p>}
      </div>
      {time && <p className="shrink-0 text-xs text-text-muted">{time}</p>}
    </motion.div>
  )
}
