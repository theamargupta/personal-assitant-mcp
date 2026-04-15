'use client'

import { motion } from 'framer-motion'

const features = [
  {
    icon: '🔥',
    title: 'Habit Tracking',
    desc: 'Streaks, analytics, completion percentages. Never break the chain.',
    color: 'from-orange-500/20 to-red-500/20',
  },
  {
    icon: '✅',
    title: 'Task Management',
    desc: 'Priority-based workflows. Create, track, and complete tasks.',
    color: 'from-green-500/20 to-emerald-500/20',
  },
  {
    icon: '📄',
    title: 'Document Wallet',
    desc: 'Upload bills, certificates. Search by content. Ask questions.',
    color: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    icon: '💰',
    title: 'Finance Tracking',
    desc: 'Auto-detect UPI payments. Categorize. Ask Claude your spending.',
    color: 'from-yellow-500/20 to-amber-500/20',
  },
  {
    icon: '🎯',
    title: 'Goals & Reviews',
    desc: 'Set outcome goals. Track progress. Get comprehensive life reviews.',
    color: 'from-purple-500/20 to-violet-500/20',
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold">
            Everything you need.{' '}
            <span className="gradient-text">One assistant.</span>
          </h2>
          <p className="mt-4 text-text-secondary max-w-xl mx-auto">
            Five modules, one MCP. Claude connects them all into a seamless personal assistant.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
              className="glass rounded-2xl p-6 group hover:border-white/20 transition-all cursor-default"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-2xl mb-4`}>
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">{f.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
