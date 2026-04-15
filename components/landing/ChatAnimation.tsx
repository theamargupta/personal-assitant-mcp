'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'

const userMessage = 'mera April review do'

const claudeLines = [
  'April kaafi productive raha! Here\'s your review:',
  '',
  '🏋️ Workout streak: 21 days strong',
  '📋 Tasks: 12 completed, 3 pending',
  '💰 Spending: ₹32,450 — Food ₹8.2k, Transport ₹4.1k',
  '🎯 Goals: 2 hit, 1 at 65%',
  '',
  'Biggest spend: ₹5,000 at Croma',
]

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-accent-blue"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  )
}

export function ChatAnimation() {
  const [phase, setPhase] = useState<'idle' | 'user' | 'typing' | 'response'>('idle')
  const [visibleLines, setVisibleLines] = useState(0)

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []
    timers.push(setTimeout(() => setPhase('user'), 500))
    timers.push(setTimeout(() => setPhase('typing'), 1800))
    timers.push(setTimeout(() => setPhase('response'), 3200))
    return () => timers.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    if (phase !== 'response') return
    if (visibleLines >= claudeLines.length) return
    const t = setTimeout(() => setVisibleLines((v) => v + 1), 120)
    return () => clearTimeout(t)
  }, [phase, visibleLines])

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="glass rounded-2xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 pb-3 border-b border-white/10">
          <div className="w-2.5 h-2.5 rounded-full bg-accent-blue" />
          <span className="text-xs text-text-secondary font-medium">Claude + PA MCP</span>
        </div>

        {/* User message */}
        <AnimatePresence>
          {(phase === 'user' || phase === 'typing' || phase === 'response') && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end"
            >
              <div className="bg-accent-blue/20 border border-accent-blue/30 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                <p className="text-sm text-text-primary">{userMessage}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {phase === 'typing' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
                <TypingDots />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Claude response */}
        <AnimatePresence>
          {phase === 'response' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="glass rounded-2xl rounded-bl-md px-4 py-3 max-w-[90%] glow-purple/30">
                <div className="space-y-0.5">
                  {claudeLines.slice(0, visibleLines).map((line, i) => (
                    <motion.p
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`text-sm ${
                        i === 0 ? 'text-text-primary font-medium' : 'text-text-secondary'
                      } ${line === '' ? 'h-2' : ''}`}
                    >
                      {line}
                    </motion.p>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
