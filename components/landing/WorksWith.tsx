'use client'

import { motion } from 'framer-motion'

const clients = [
  {
    name: 'Claude',
    desc: 'Anthropic',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.304 3.541l-5.357 16.918H8.842L14.2 3.541h3.104zm-7.459 0L4.488 20.459H1.384L6.742 3.541h3.103z" />
      </svg>
    ),
  },
  {
    name: 'ChatGPT',
    desc: 'OpenAI',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.594.564 6.028 6.028 0 005.17 2.07 6.045 6.045 0 001.392 5.9a5.985 5.985 0 00.516 4.91 6.046 6.046 0 006.51 2.9A6.065 6.065 0 0012.085 15a6.028 6.028 0 006.424-1.505 6.045 6.045 0 003.773-3.674zM12.084 14.4a4.44 4.44 0 01-2.848-1.028l.142-.08 4.73-2.731a.769.769 0 00.388-.67V5.577l2 1.154v5.54a4.482 4.482 0 01-4.412 4.129z" />
      </svg>
    ),
  },
  {
    name: 'Cursor',
    desc: 'AI Code Editor',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: 'Any MCP Client',
    desc: 'Open Protocol',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 000 20M12 2a14.5 14.5 0 010 20M2 12h20" />
      </svg>
    ),
  },
]

export function WorksWith() {
  return (
    <section className="py-12 px-6 border-y border-white/[0.03]">
      <div className="max-w-4xl mx-auto">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-[11px] uppercase tracking-[0.25em] text-text-muted mb-8"
        >
          Works with any MCP-compatible AI
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap justify-center gap-3"
        >
          {clients.map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-3 px-5 py-3 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300"
            >
              <span className="text-text-muted">{c.icon}</span>
              <div>
                <span className="text-[13px] font-medium text-text-primary block leading-tight">{c.name}</span>
                <span className="text-[10px] text-text-muted">{c.desc}</span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
