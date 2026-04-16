'use client'

import { motion } from 'framer-motion'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
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

/* ── Mini UI mocks for each module ── */

function HabitMock() {
  const habits = [
    { name: 'Workout', streak: 21, pct: 70 },
    { name: 'Reading', streak: 18, pct: 60 },
    { name: 'Meditation', streak: 9, pct: 30 },
  ]
  return (
    <div className="space-y-2.5">
      {habits.map((h) => (
        <div key={h.name} className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-text-secondary">{h.name}</span>
              <span className="text-neon font-mono">{h.streak}d</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.04]">
              <div className="h-full rounded-full bg-neon/60" style={{ width: `${h.pct}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskMock() {
  const tasks = [
    { title: 'Ship MCP v2', priority: 'high', status: 'in_progress' },
    { title: 'Update docs', priority: 'medium', status: 'pending' },
    { title: 'Fix OAuth bug', priority: 'high', status: 'completed' },
    { title: 'Review PR #42', priority: 'low', status: 'pending' },
  ]
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t.title} className="flex items-center gap-2.5 text-[11px]">
          <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${
            t.status === 'completed'
              ? 'bg-neon/20 border-neon/30 text-neon'
              : t.status === 'in_progress'
              ? 'bg-white/[0.06] border-white/[0.12] text-text-secondary'
              : 'border-white/[0.06]'
          }`}>
            {t.status === 'completed' && (
              <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 8l4 4 6-7" /></svg>
            )}
          </div>
          <span className={`flex-1 ${t.status === 'completed' ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
            {t.title}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider ${
            t.priority === 'high' ? 'text-neon/80' : t.priority === 'medium' ? 'text-text-secondary' : 'text-text-muted'
          }`}>
            {t.priority}
          </span>
        </div>
      ))}
    </div>
  )
}

function DocumentMock() {
  const docs = [
    { name: 'PAN Card.pdf', type: 'ID', size: '420 KB' },
    { name: 'Rent Agreement.pdf', type: 'Legal', size: '1.2 MB' },
    { name: 'March Payslip.pdf', type: 'Finance', size: '180 KB' },
  ]
  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <div key={d.name} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.01] border border-white/[0.03]">
          <div className="w-8 h-8 rounded-md bg-white/[0.04] flex items-center justify-center text-text-muted flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-text-secondary truncate">{d.name}</p>
            <p className="text-[9px] text-text-muted">{d.type} &middot; {d.size}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function FinanceMock() {
  const cats = [
    { name: 'Food', amount: '₹8,200', pct: 35 },
    { name: 'Transport', amount: '₹4,100', pct: 18 },
    { name: 'Shopping', amount: '₹6,000', pct: 25 },
    { name: 'Bills', amount: '₹5,150', pct: 22 },
  ]
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-[22px] font-bold text-text-primary">₹32,450</span>
        <span className="text-[10px] text-text-muted">April 2026</span>
      </div>
      <div className="space-y-2">
        {cats.map((c) => (
          <div key={c.name} className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-text-muted">{c.name}</span>
              <span className="text-text-secondary font-mono">{c.amount}</span>
            </div>
            <div className="h-0.5 rounded-full bg-white/[0.04]">
              <div className="h-full rounded-full bg-white/20" style={{ width: `${c.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GoalMock() {
  const goals = [
    { title: 'Save ₹1L', pct: 65, type: 'outcome' },
    { title: 'Run 5k', pct: 100, type: 'outcome' },
    { title: 'Launch Side Project', pct: 40, type: 'milestone' },
  ]
  return (
    <div className="space-y-3">
      {goals.map((g) => (
        <div key={g.title} className="flex items-center gap-3">
          <div className="relative w-9 h-9 flex-shrink-0">
            <svg width="36" height="36" className="-rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="14" fill="none"
                stroke={g.pct === 100 ? '#c8ff00' : '#737373'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 14}
                strokeDashoffset={2 * Math.PI * 14 * (1 - g.pct / 100)}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-text-primary">
              {g.pct}%
            </span>
          </div>
          <div>
            <p className="text-[11px] text-text-secondary">{g.title}</p>
            <p className="text-[9px] text-text-muted capitalize">{g.type}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function BentoShowcase() {
  return (
    <section id="features" className="py-[15vh] px-6">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            25 Tools &middot; 5 Modules
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            Everything in{' '}
            <span className="text-neon">one place</span>
          </h2>
          <p className="mt-5 text-text-secondary max-w-lg mx-auto text-[15px] leading-relaxed [text-wrap:pretty]">
            Five modules that talk to each other. Ask Claude anything — it sees the full picture.
          </p>
        </motion.div>

        {/* Bento grid */}
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="grid md:grid-cols-3 gap-3"
        >
          {/* Habits — large */}
          <motion.div variants={item} className="md:col-span-2 rounded-2xl border border-white/[0.04] bg-white/[0.01] p-6 hover:bg-white/[0.02] hover:border-white/[0.06] transition-all duration-500">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-neon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              </span>
              <h3 className="text-[13px] font-semibold text-text-primary tracking-[-0.01em]">Habit Tracking</h3>
            </div>
            <p className="text-[12px] text-text-muted mb-5">Streaks, analytics, daily logging. 5 tools — create, log, streak, analytics, update.</p>
            <HabitMock />
          </motion.div>

          {/* Finance — tall */}
          <motion.div variants={item} className="md:row-span-2 rounded-2xl border border-white/[0.04] bg-white/[0.01] p-6 hover:bg-white/[0.02] hover:border-white/[0.06] transition-all duration-500">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-neon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
              </span>
              <h3 className="text-[13px] font-semibold text-text-primary tracking-[-0.01em]">Finance Tracking</h3>
            </div>
            <p className="text-[12px] text-text-muted mb-5">Auto-detect UPI, categorize, summaries. Works with SMS forwarding from your phone.</p>
            <FinanceMock />
          </motion.div>

          {/* Tasks */}
          <motion.div variants={item} className="rounded-2xl border border-white/[0.04] bg-white/[0.01] p-6 hover:bg-white/[0.02] hover:border-white/[0.06] transition-all duration-500">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-neon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
              </span>
              <h3 className="text-[13px] font-semibold text-text-primary tracking-[-0.01em]">Task Management</h3>
            </div>
            <p className="text-[12px] text-text-muted mb-5">Priority-based. Status transitions. Overdue detection.</p>
            <TaskMock />
          </motion.div>

          {/* Documents */}
          <motion.div variants={item} className="rounded-2xl border border-white/[0.04] bg-white/[0.01] p-6 hover:bg-white/[0.02] hover:border-white/[0.06] transition-all duration-500">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-neon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
              </span>
              <h3 className="text-[13px] font-semibold text-text-primary tracking-[-0.01em]">Document Wallet</h3>
            </div>
            <p className="text-[12px] text-text-muted mb-5">Upload, extract, semantic search. Ask Claude about your documents.</p>
            <DocumentMock />
          </motion.div>

          {/* Goals — wide */}
          <motion.div variants={item} className="md:col-span-2 rounded-2xl border border-white/[0.04] bg-white/[0.01] p-6 hover:bg-white/[0.02] hover:border-white/[0.06] transition-all duration-500">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-neon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
              </span>
              <h3 className="text-[13px] font-semibold text-text-primary tracking-[-0.01em]">Goals & Reviews</h3>
            </div>
            <p className="text-[12px] text-text-muted mb-5">
              Outcome goals auto-track from habits, tasks, and finance.
              Milestone goals for manual tracking. Cross-module life reviews on demand.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <GoalMock />
              <div className="flex items-center justify-center rounded-xl border border-neon/[0.08] bg-neon/[0.02] p-4">
                <p className="text-[12px] text-center text-text-secondary leading-relaxed">
                  <span className="text-neon font-medium">&ldquo;mera April review do&rdquo;</span>
                  <br />
                  <span className="text-text-muted text-[11px]">Pulls data from all 5 modules into one answer</span>
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
