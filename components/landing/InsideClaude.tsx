'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

const cards = [
  {
    title: 'Live widgets',
    caption: (
      <>
        <code className="font-mono text-neon">get_review</code> returns an interactive dashboard, not a JSON blob.
      </>
    ),
  },
  {
    title: 'Two-way data flow',
    caption: 'Every tool call reads and writes the same Postgres that powers the web + mobile apps.',
  },
  {
    title: 'OAuth 2.0 + PKCE',
    caption: 'Secure token exchange — your data, your account.',
  },
]

export function InsideClaude() {
  return (
    <section className="py-[15vh] px-6 relative grain isolate">
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            INSIDE CLAUDE
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            Widgets, <span className="text-neon">not just text.</span>
          </h2>
          <p className="mt-5 text-text-secondary max-w-2xl mx-auto text-[15px] leading-relaxed [text-wrap:pretty]">
            Sathi registers ExtApps widgets with the MCP protocol. Claude renders your dashboard,
            habit streaks, and goal rings inline — no app-switching, no tabs, no copy-paste.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto max-w-5xl"
        >
          <div className="absolute -inset-12 rounded-full bg-neon/[0.03] blur-[100px] pointer-events-none" />
          <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.01] shadow-2xl">
            <Image
              src="/landing/claude-widget-bento.png"
              alt="Sathi MCP widgets rendered inside Claude"
              width={1600}
              height={1000}
              className="w-full h-auto"
            />
          </div>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
          className="mt-8 grid gap-3 md:grid-cols-3"
        >
          {cards.map((card) => (
            <motion.div
              key={card.title}
              variants={item}
              className="rounded-2xl border border-white/[0.04] bg-white/[0.01] p-6"
            >
              <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-text-primary">{card.title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-text-muted">{card.caption}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
