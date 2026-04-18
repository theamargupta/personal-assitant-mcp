import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  hoverable = false,
}: {
  children: ReactNode
  className?: string
  hoverable?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.04] bg-white/[0.01] shadow-[0_18px_70px_rgba(0,0,0,0.18)] ${
        hoverable ? 'transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.08] hover:bg-white/[0.025]' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}
