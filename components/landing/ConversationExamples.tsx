'use client'

import { motion } from 'framer-motion'

const conversations = [
  {
    module: 'Habits',
    user: 'aaj workout ho gaya, 45 min gym',
    claude: 'Logged! 🏋️ Workout streak: 22 days. Your best was 28 — you\'re close.',
    tag: 'log_habit_completion',
  },
  {
    module: 'Finance',
    user: 'kitna kharch hua is hafte?',
    claude: 'This week: ₹4,850. Food ₹2,100, Transport ₹1,200, Shopping ₹1,550. You\'re 12% under your April average.',
    tag: 'get_spending_summary',
  },
  {
    module: 'Documents',
    user: 'mera PAN card number kya hai?',
    claude: 'From your uploaded PAN card (PAN_Card.pdf): ABCDE1234F. Document uploaded on March 15.',
    tag: 'search_documents',
  },
  {
    module: 'Goals',
    user: 'savings goal ka status?',
    claude: 'Save ₹1L goal: 65% done (₹65,000 saved). At current rate, you\'ll hit it by June 12.',
    tag: 'get_goal_progress',
  },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
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

export function ConversationExamples() {
  return (
    <section className="py-[15vh] px-6 relative grain isolate">
      {/* Subtle glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-neon/[0.02] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            Natural Language
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            Talk naturally.{' '}
            <span className="text-neon">In any language.</span>
          </h2>
          <p className="mt-5 text-text-secondary max-w-lg mx-auto text-[15px] leading-relaxed [text-wrap:pretty]">
            Hindi, English, Hinglish — Claude understands context, not just keywords. Ask the way you think.
          </p>
        </motion.div>

        {/* Conversation cards */}
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="grid md:grid-cols-2 gap-3"
        >
          {conversations.map((c) => (
            <motion.div
              key={c.module}
              variants={item}
              className="rounded-2xl border border-white/[0.04] bg-white/[0.01] p-5 hover:border-white/[0.06] transition-all duration-500"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-muted">{c.module}</span>
                <span className="text-[9px] font-mono text-neon/50 bg-neon/[0.04] px-2 py-0.5 rounded-full">
                  {c.tag}
                </span>
              </div>

              {/* User message */}
              <div className="flex justify-end mb-3">
                <div className="rounded-2xl rounded-br-sm border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 max-w-[85%]">
                  <p className="text-[13px] text-text-primary">{c.user}</p>
                </div>
              </div>

              {/* Claude response */}
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-neon/[0.06] bg-neon/[0.01] px-4 py-2.5 max-w-[90%]">
                  <p className="text-[13px] text-text-secondary leading-[1.6]">{c.claude}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
