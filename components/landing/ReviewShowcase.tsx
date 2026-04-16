'use client'

import { motion } from 'framer-motion'

/* ── Sub-components ── */

function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted font-mono">{value}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.04]">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

function SpendBar({ label, amount, pct, color }: { label: string; amount: string; pct: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted font-mono">{amount}</span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.04]">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

function ProgressRing({ label, pct, color }: { label: string; pct: number; color: string }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

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

/* ── Main component ── */

export function ReviewShowcase() {
  return (
    <section className="py-[15vh] px-6 relative grain isolate">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-accent-purple/[0.05] rounded-full blur-[120px] pointer-events-none" />

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
            <span className="gradient-text-premium">Complete picture.</span>
          </h2>
        </motion.div>

        {/* Review card */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
        >
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-purple/30 to-transparent" />

          <div className="p-8">
            {/* Conversation header */}
            <div className="flex items-center gap-2 pb-5 border-b border-white/[0.06] mb-6">
              <div className="w-2 h-2 rounded-full bg-accent-purple" />
              <span className="text-[11px] text-text-muted font-medium uppercase tracking-[0.15em]">
                Claude Review
              </span>
            </div>

            {/* User message */}
            <div className="flex justify-end mb-8">
              <div className="rounded-2xl rounded-br-sm border border-white/[0.08] bg-white/[0.04] px-5 py-3">
                <p className="text-[14px] text-text-primary">mera April review do</p>
              </div>
            </div>

            {/* Claude response */}
            <div className="space-y-5">
              <p className="text-[14px] text-text-primary font-medium">
                April kaafi productive raha! Here&apos;s your complete review:
              </p>

              {/* Data cards grid */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Habit streaks */}
                <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5 space-y-3.5">
                  <h4 className="text-[11px] font-semibold text-accent-blue uppercase tracking-[0.15em]">
                    Habit Streaks
                  </h4>
                  <ProgressBar label="Workout" value={21} max={30} color="bg-gradient-to-r from-orange-500 to-amber-400" />
                  <ProgressBar label="Reading" value={18} max={30} color="bg-gradient-to-r from-blue-500 to-cyan-400" />
                </div>

                {/* Tasks */}
                <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
                  <h4 className="text-[11px] font-semibold text-accent-blue uppercase tracking-[0.15em] mb-3.5">
                    Tasks
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/[0.12]">
                      12 completed
                    </span>
                    <span className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-amber-500/[0.08] text-amber-400 border border-amber-500/[0.12]">
                      3 pending
                    </span>
                    <span className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-red-500/[0.08] text-red-400 border border-red-500/[0.12]">
                      1 overdue
                    </span>
                  </div>
                </div>

                {/* Spending */}
                <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5 space-y-3.5">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[11px] font-semibold text-accent-blue uppercase tracking-[0.15em]">
                      Spending
                    </h4>
                    <span className="text-[12px] font-mono text-text-muted">&#8377;32,450</span>
                  </div>
                  <SpendBar label="Food" amount="&#8377;8,200" pct={25} color="bg-gradient-to-r from-cyan-500 to-blue-400" />
                  <SpendBar label="Transport" amount="&#8377;4,100" pct={13} color="bg-gradient-to-r from-violet-500 to-purple-400" />
                  <SpendBar label="Shopping" amount="&#8377;6,000" pct={18} color="bg-gradient-to-r from-pink-500 to-rose-400" />
                </div>

                {/* Goals */}
                <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-5">
                  <h4 className="text-[11px] font-semibold text-accent-blue uppercase tracking-[0.15em] mb-4">
                    Goals
                  </h4>
                  <div className="flex justify-around">
                    <ProgressRing label="Save &#8377;20k" pct={65} color="#3b82f6" />
                    <ProgressRing label="Learn React Native" pct={40} color="#8b5cf6" />
                    <ProgressRing label="Run 5k" pct={100} color="#06b6d4" />
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
