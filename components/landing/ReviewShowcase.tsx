'use client'

import { motion } from 'framer-motion'

function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted">{value}/{max} days</span>
      </div>
      <div className="h-2 rounded-full bg-white/5">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

function SpendBar({ icon, label, amount, pct }: { icon: string; label: string; amount: string; pct: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">{icon} {label}</span>
        <span className="text-text-muted">{amount}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5">
        <motion.div
          className="h-full rounded-full bg-accent-cyan"
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

function ProgressRing({ label, pct, color }: { label: string; pct: number; color: string }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
        <motion.circle
          cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          whileInView={{ strokeDashoffset: offset }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <span className="text-xs text-text-secondary text-center">{label}</span>
      <span className="text-sm font-semibold text-text-primary">{pct}%</span>
    </div>
  )
}

export function ReviewShowcase() {
  return (
    <section className="py-24 px-6 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-accent-purple/8 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold">
            One question.{' '}
            <span className="gradient-text">Complete life review.</span>
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass rounded-2xl p-8"
        >
          {/* Mock conversation header */}
          <div className="flex items-center gap-2 pb-4 border-b border-white/10 mb-6">
            <div className="w-2.5 h-2.5 rounded-full bg-accent-purple" />
            <span className="text-xs text-text-secondary font-medium">Claude Review</span>
          </div>

          {/* User asks */}
          <div className="flex justify-end mb-6">
            <div className="bg-accent-blue/20 border border-accent-blue/30 rounded-2xl rounded-br-md px-4 py-2.5">
              <p className="text-sm">mera April review do</p>
            </div>
          </div>

          {/* Claude response with data viz */}
          <div className="space-y-6">
            <p className="text-sm text-text-primary font-medium">April kaafi productive raha! Here&apos;s your complete review:</p>

            {/* Habit streaks */}
            <div className="glass rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-semibold text-accent-blue uppercase tracking-wider">Habit Streaks</h4>
              <ProgressBar label="🏋️ Workout" value={21} max={30} color="bg-orange-500" />
              <ProgressBar label="📚 Reading" value={18} max={30} color="bg-blue-500" />
            </div>

            {/* Tasks */}
            <div className="glass rounded-xl p-4">
              <h4 className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-3">Tasks</h4>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-full text-xs bg-green-500/20 text-green-400 border border-green-500/20">12 done</span>
                <span className="px-3 py-1 rounded-full text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/20">3 pending</span>
                <span className="px-3 py-1 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/20">1 overdue</span>
              </div>
            </div>

            {/* Spending */}
            <div className="glass rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-semibold text-accent-blue uppercase tracking-wider">Spending — ₹32,450</h4>
              </div>
              <SpendBar icon="🍔" label="Food" amount="₹8,200" pct={25} />
              <SpendBar icon="🚗" label="Transport" amount="₹4,100" pct={13} />
              <SpendBar icon="🛍️" label="Shopping" amount="₹6,000" pct={18} />
            </div>

            {/* Goals */}
            <div className="glass rounded-xl p-4">
              <h4 className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-4">Goals</h4>
              <div className="flex justify-around">
                <ProgressRing label="Save ₹20k" pct={65} color="#3b82f6" />
                <ProgressRing label="Learn React Native" pct={40} color="#8b5cf6" />
                <ProgressRing label="Run 5k" pct={100} color="#06b6d4" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
