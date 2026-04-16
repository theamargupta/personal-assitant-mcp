'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect } from 'react'

interface SummaryCardProps {
  icon: string
  label: string
  value: number
  prefix?: string
  suffix?: string
  trend?: string
  trendUp?: boolean
}

function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const mv = useMotionValue(0)
  const display = useTransform(mv, (v) => `${prefix}${Math.round(v).toLocaleString('en-IN')}${suffix}`)

  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.2, ease: 'easeOut' })
    return controls.stop
  }, [mv, value])

  return <motion.span>{display}</motion.span>
}

export function SummaryCard({ icon, label, value, prefix, suffix, trend, trendUp }: SummaryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 relative"
    >
      {trend && (
        <span className={`absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full ${
          trendUp ? 'bg-neon/[0.08] text-neon border border-neon/[0.12]' : 'bg-red-500/[0.06] text-red-400 border border-red-500/[0.1]'
        }`}>
          {trend}
        </span>
      )}
      <span className="text-2xl">{icon}</span>
      <p className="text-xs text-text-secondary mt-3 mb-1">{label}</p>
      <p className="text-2xl font-bold text-text-primary">
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
      </p>
    </motion.div>
  )
}
