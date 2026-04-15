'use client'

import { motion } from 'framer-motion'

const steps = [
  {
    num: '01',
    icon: '🔗',
    title: 'Connect',
    desc: 'Add PA MCP to Claude Desktop or claude.ai. One-click OAuth setup.',
  },
  {
    num: '02',
    icon: '📊',
    title: 'Track',
    desc: 'Habits, tasks, documents, spending — everything flows in automatically.',
  },
  {
    num: '03',
    icon: '💬',
    title: 'Ask',
    desc: 'Kitna kharch hua? My streak? April review do — Claude knows everything.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold">
            How it <span className="gradient-text">works</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-accent-blue via-accent-purple to-accent-cyan" />

          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative text-center"
            >
              {/* Number circle */}
              <div className="w-14 h-14 mx-auto rounded-full glass flex items-center justify-center text-xl mb-6 relative z-10 bg-bg-primary">
                {s.icon}
              </div>
              <div className="glass rounded-2xl p-6">
                <span className="text-xs font-mono text-accent-blue mb-2 block">{s.num}</span>
                <h3 className="text-lg font-semibold text-text-primary mb-2">{s.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
