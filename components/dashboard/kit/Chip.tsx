import type { ReactNode } from 'react'

type ChipVariant =
  | 'priority-high'
  | 'priority-medium'
  | 'priority-low'
  | 'status-pending'
  | 'status-in-progress'
  | 'status-completed'
  | 'tag'

const variantClasses: Record<ChipVariant, string> = {
  'priority-high': 'border-red-400/20 bg-red-500/[0.08] text-red-300',
  'priority-medium': 'border-amber-300/20 bg-amber-400/[0.08] text-amber-200',
  'priority-low': 'border-white/[0.06] bg-white/[0.03] text-text-muted',
  'status-pending': 'border-white/[0.06] bg-white/[0.03] text-text-secondary',
  'status-in-progress': 'border-blue-300/20 bg-blue-400/[0.08] text-blue-200',
  'status-completed': 'border-neon/20 bg-neon/[0.08] text-neon',
  tag: 'border-white/[0.05] bg-white/[0.025] text-text-muted',
}

export function Chip({
  children,
  variant = 'tag',
  className = '',
}: {
  children: ReactNode
  variant?: ChipVariant
  className?: string
}) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none ${variantClasses[variant]} ${className}`}>
      <span className="truncate">{children}</span>
    </span>
  )
}
