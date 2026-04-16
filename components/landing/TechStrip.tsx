'use client'

import { motion } from 'framer-motion'

const badges = [
  { label: 'MCP Protocol' },
  { label: 'Supabase PostgreSQL' },
  { label: 'OAuth 2.0 + PKCE' },
  { label: 'End-to-End Auth' },
  { label: 'IST Timezone Native' },
  { label: 'Next.js 16' },
  { label: 'Zod Validation' },
  { label: 'Vector Search' },
]

function MarqueeRow({ direction = 'left' }: { direction?: 'left' | 'right' }) {
  const items = [...badges, ...badges]

  return (
    <div className="relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-bg-primary to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-bg-primary to-transparent z-10 pointer-events-none" />

      <motion.div
        className="flex gap-3 w-max"
        animate={{ x: direction === 'left' ? ['0%', '-50%'] : ['-50%', '0%'] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      >
        {items.map((b, i) => (
          <div
            key={`${b.label}-${i}`}
            className="flex-shrink-0 px-4 py-2 rounded-full border border-white/[0.04] bg-white/[0.01] text-[12px] text-text-muted font-medium tracking-wide whitespace-nowrap"
          >
            {b.label}
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export function TechStrip() {
  return (
    <section className="py-12 border-y border-white/[0.03] space-y-3 overflow-hidden">
      <MarqueeRow direction="left" />
      <MarqueeRow direction="right" />
    </section>
  )
}
