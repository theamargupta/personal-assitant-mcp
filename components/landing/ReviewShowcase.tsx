'use client'

import { motion } from 'framer-motion'

function ProgressBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted font-mono">{value}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.04]">
        <motion.div
          className="h-full rounded-full bg-neon"
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

function SpendBar({ label, amount, pct }: { label: string; amount: string; pct: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted font-mono">{amount}</span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.04]">
        <motion.div
          className="h-full rounded-full bg-white/40"
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

function ProgressRing({ label, pct, isHighlight }: { label: string; pct: number; isHighlight?: boolean }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = isHighlight ? '#c8ff00' : '#737373'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="64" height="64" className="-rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
          <motion.circle
            cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            whileInView={{ strokeDashoffset: offset }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold text-text-primary">
          {pct}%
        </span>
      </div>
      <span className="text-[11px] text-text-muted text-center leading-tight max-w-[80px]">{label}</span>
    </div>
  )
}

export function ReviewShowcase() {
  return (
    <section className="py-[15vh] px-6 relative grain isolate">
      <div className="max-w-4xl mx-auto relative">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            Life Review
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            One question.{' '}
            <span className="text-neon">Complete picture.</span>
          </h2>
        </motion.div>

        {/* Review card */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
        >
          {/* Top neon line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-neon/20 to-transparent" />

          <div className="p-8">
            {/* Header */}
            <div className="flex items-center gap-2 pb-5 border-b border-white/[0.04] mb-6">
              <div className="w-2 h-2 rounded-full bg-neon" />
              <span className="text-[11px] text-text-muted font-medium uppercase tracking-[0.15em]">Claude Review</span>
            </div>

            {/* User message */}
            <div className="flex justify-end mb-8">
              <div className="rounded-2xl rounded-br-sm border border-white/[0.08] bg-white/[0.04] px-5 py-3">
                <p className="text-[14px] text-text-primary">mera April review do</p>
              </div>
            </div>

            {/* Response */}
            <div className="space-y-5">
              <p className="text-[14px] text-text-primary font-medium">
                April kaafi productive raha! Here&apos;s your complete review:
              </p>

              <div className="grid md:grid-cols-2 gap-3">
                {/* Habits */}
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5 space-y-3.5">
                  <h4 className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em]">Habit Streaks</h4>
                  <ProgressBar label="Workout" value={21} max={30} />
                  <ProgressBar label="Reading" value={18} max={30} />
                </div>

                {/* Tasks */}
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5">
                  <h4 className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em] mb-3.5">Tasks</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-neon/[0.08] text-neon border border-neon/[0.12]">12 completed</span>
                    <span className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/[0.04] text-text-secondary border border-white/[0.06]">3 pending</span>
                    <span className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/[0.04] text-text-muted border border-white/[0.06]">1 overdue</span>
                  </div>
                </div>

                {/* Spending */}
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5 space-y-3.5">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em]">Spending</h4>
                    <span className="text-[12px] font-mono text-text-muted">&#8377;32,450</span>
                  </div>
                  <SpendBar label="Food" amount="&#8377;8,200" pct={25} />
                  <SpendBar label="Transport" amount="&#8377;4,100" pct={13} />
                  <SpendBar label="Shopping" amount="&#8377;6,000" pct={18} />
                </div>

                {/* Goals */}
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5">
                  <h4 className="text-[11px] font-semibold text-neon uppercase tracking-[0.15em] mb-4">Goals</h4>
                  <div className="flex justify-around">
                    <ProgressRing label="Save &#8377;20k" pct={65} />
                    <ProgressRing label="Learn React Native" pct={40} />
                    <ProgressRing label="Run 5k" pct={100} isHighlight />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
