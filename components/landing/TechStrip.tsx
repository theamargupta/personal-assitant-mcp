'use client'

import { motion } from 'framer-motion'

const badges = [
  { icon: '🔌', label: 'MCP Protocol' },
  { icon: '🐘', label: 'Supabase PostgreSQL' },
  { icon: '🔐', label: 'OAuth 2.0 + PKCE' },
  { icon: '🛡️', label: 'End-to-End Auth' },
  { icon: '🕐', label: 'IST Timezone Native' },
  { icon: '⚡', label: 'Next.js 16' },
]

export function TechStrip() {
  return (
    <section className="py-12 px-6 border-y border-white/5">
      <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-4">
        {badges.map((b, i) => (
          <motion.div
            key={b.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.02] text-sm text-text-secondary"
          >
            <span>{b.icon}</span>
            <span>{b.label}</span>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
