'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ChatAnimation } from './ChatAnimation'

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-accent-blue/8 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-accent-purple/6 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-16 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left — copy */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
            Your AI{' '}
            <span className="gradient-text">Personal Assistant</span>
          </h1>
          <p className="mt-6 text-lg text-text-secondary max-w-lg leading-relaxed">
            Track habits, manage tasks, store documents, monitor spending, set goals —
            and ask Claude anything about your life.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="px-7 py-3 rounded-xl bg-accent-blue hover:bg-accent-blue/90 text-white font-medium transition-all glow-blue"
            >
              Get Started
            </Link>
            <a
              href="#features"
              className="px-7 py-3 rounded-xl border border-white/10 text-text-secondary hover:text-text-primary hover:border-white/20 transition-all"
            >
              Learn More
            </a>
          </div>
        </motion.div>

        {/* Right — chat animation */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative"
        >
          {/* Glow behind chat */}
          <div className="absolute -inset-8 bg-accent-purple/10 rounded-full blur-[80px] pointer-events-none" />
          <ChatAnimation />
        </motion.div>
      </div>
    </section>
  )
}
