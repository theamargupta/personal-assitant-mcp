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

const prompts = [
  {
    said: 'mera April review do',
    happened: (
      <>
        Pulled 5 modules into one <code className="font-mono text-neon">get_review</code> widget
      </>
    ),
  },
  {
    said: 'aaj ka din kaisa raha',
    happened: "Today's tasks + habit logs + spending summary",
  },
  {
    said: 'upwork proposals 2/day tailored log kar do',
    happened: 'Logged a habit completion',
  },
  {
    said: 'coffee pe ₹200 lag gaye',
    happened: 'Transaction auto-created under Food',
  },
  {
    said: 'Sathi mobile app not refreshing — high priority task bana',
    happened: (
      <>
        Task created with tag <code className="font-mono text-neon">high</code>
      </>
    ),
  },
  {
    said: 'jitne bhi sathi rules hain dikha',
    happened: 'Returned all rule-category memories',
  },
]

export function HinglishGallery() {
  return (
    <section className="py-[15vh] px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            HINGLISH, FIRST-CLASS
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            Talk like you <span className="text-neon">actually talk.</span>
          </h2>
          <p className="mt-5 text-text-secondary max-w-2xl mx-auto text-[15px] leading-relaxed [text-wrap:pretty]">
            No translator, no prompt engineering. Sathi&apos;s Zod schemas + tool descriptions are tuned for mixed code-switching.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
        >
          {prompts.map((prompt) => (
            <motion.div
              key={prompt.said}
              variants={item}
              className="rounded-2xl border border-white/[0.04] bg-white/[0.01] p-6 transition-colors duration-500 hover:border-white/[0.08] hover:bg-white/[0.02]"
            >
              <div className="rounded-2xl rounded-bl-sm border border-white/[0.06] bg-white/[0.025] px-4 py-3">
                <p className="font-mono text-[13px] leading-relaxed text-text-primary">{prompt.said}</p>
              </div>
              <div className="mt-5 flex gap-3 text-[13px] leading-relaxed text-text-muted">
                <span className="font-mono text-neon">→</span>
                <p>{prompt.happened}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
