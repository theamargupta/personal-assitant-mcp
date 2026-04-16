'use client'

import { motion } from 'framer-motion'

const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    title: 'Habit Tracking',
    desc: 'Streaks, analytics, completion percentages. Build consistency that compounds.',
    accent: 'from-orange-400 to-rose-500',
    glow: 'rgba(251,146,60,0.12)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
    title: 'Task Management',
    desc: 'Priority-based workflows. Create, track, and close — all through conversation.',
    accent: 'from-emerald-400 to-green-500',
    glow: 'rgba(52,211,153,0.12)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: 'Document Wallet',
    desc: 'Upload bills, certificates. Semantic search. Ask Claude about any document.',
    accent: 'from-blue-400 to-cyan-500',
    glow: 'rgba(96,165,250,0.12)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
    title: 'Finance Tracking',
    desc: 'Auto-detect UPI payments. Categorize spending. Know where your money goes.',
    accent: 'from-amber-400 to-yellow-500',
    glow: 'rgba(251,191,36,0.12)',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    title: 'Goals & Reviews',
    desc: 'Set outcome goals. Track milestones. Get comprehensive life reviews on demand.',
    accent: 'from-violet-400 to-purple-500',
    glow: 'rgba(167,139,250,0.12)',
  },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

export function Features() {
  return (
    <section id="features" className="py-[15vh] px-6 relative">
      {/* Background accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-accent-purple/[0.04] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-16"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            Modules
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            Everything you need.{' '}
            <span className="gradient-text-premium">One assistant.</span>
          </h2>
          <p className="mt-5 text-text-secondary max-w-lg mx-auto text-[15px] leading-relaxed [text-wrap:pretty]">
            Five modules, one MCP server. Claude connects them all into a seamless personal assistant.
          </p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid md:grid-cols-3 gap-4"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={item}
              className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-500 hover:border-white/[0.12] hover:bg-white/[0.04]"
            >
              {/* Hover glow */}
              <div
                className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: `radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${f.glow}, transparent 70%)`,
                }}
              />

              <div className="relative z-10">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.accent} flex items-center justify-center text-white mb-5 shadow-lg`}
                  style={{ boxShadow: `0 8px 24px ${f.glow}` }}
                >
                  {f.icon}
                </div>

                <h3 className="text-[15px] font-semibold text-text-primary mb-2 tracking-[-0.01em]">
                  {f.title}
                </h3>
                <p className="text-[13px] text-text-secondary leading-[1.6]">
                  {f.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
