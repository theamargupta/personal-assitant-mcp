'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
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

const screens = [
  {
    label: 'Today',
    caption: 'Rituals, streaks, and check-ins.',
    src: '/landing/mobile-rituals.png',
    alt: 'Sathi mobile rituals screen',
  },
  {
    label: 'Tasks',
    caption: 'Priorities and follow-ups.',
    src: '/landing/mobile-tasks.png',
    alt: 'Sathi mobile tasks screen',
  },
  {
    label: 'Money',
    caption: 'SMS-to-transaction tracking.',
    src: '/landing/mobile-money.png',
    alt: 'Sathi mobile money screen',
  },
]

export function MobileShowcase() {
  return (
    <section className="py-[15vh] px-6 relative grain isolate">
      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            MOBILE
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            Voice-first. <span className="text-neon">Hinglish-first.</span>
          </h2>
          <p className="mt-5 text-text-secondary max-w-2xl mx-auto text-[15px] leading-relaxed [text-wrap:pretty]">
            Tap the mic. Say &quot;aaj coffee pe ₹200 lag gaye&quot; — it logs, categorizes, and shows up on your web dashboard instantly.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-8 md:grid-cols-3"
        >
          {screens.map((screen) => (
            <motion.div key={screen.label} variants={item} className="group">
              <div className="relative">
                <div className="absolute -inset-5 rounded-[2.75rem] bg-neon/[0.02] blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative overflow-hidden rounded-[2.25rem] border border-white/[0.06] bg-white/[0.01]">
                  <Image
                    src={screen.src}
                    alt={screen.alt}
                    width={400}
                    height={867}
                    className="h-auto w-full"
                  />
                </div>
              </div>
              <div className="mt-5 text-center">
                <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-text-primary">{screen.label}</h3>
                <p className="mt-1 text-[12px] text-text-muted">{screen.caption}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
