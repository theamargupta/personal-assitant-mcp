'use client'

import { motion } from 'framer-motion'

const steps = [
  {
    num: '01',
    title: 'Connect',
    desc: 'Add Sathi to Claude Desktop or claude.ai. One-click OAuth — you\'re in.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Track',
    desc: 'Habits, tasks, documents, spending — everything flows in through natural conversation.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Ask',
    desc: 'Kitna kharch hua? My streak? April review do — Claude knows everything about your life.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
]

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-[15vh] px-6 relative">
      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-20"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            Setup
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            Three steps to{' '}
            <span className="text-neon">clarity</span>
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Vertical timeline */}
          <div className="absolute left-[27px] top-0 bottom-0 w-px bg-gradient-to-b from-neon/30 via-white/[0.06] to-transparent hidden md:block" />

          <div className="space-y-16">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.5 }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-8 items-start"
              >
                {/* Step indicator */}
                <div className="relative flex-shrink-0">
                  <div className="w-[54px] h-[54px] rounded-xl border border-white/[0.06] bg-bg-primary flex items-center justify-center text-text-muted">
                    {s.icon}
                  </div>
                  <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-[0.5px] w-[3px] h-[3px] rounded-full bg-neon hidden md:block" />
                </div>

                <div className="pt-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[11px] font-mono text-neon/60 tracking-wider">{s.num}</span>
                    <h3 className="text-[18px] font-semibold text-text-primary tracking-[-0.01em]">{s.title}</h3>
                  </div>
                  <p className="text-[14px] text-text-secondary leading-[1.7] max-w-md [text-wrap:pretty]">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
