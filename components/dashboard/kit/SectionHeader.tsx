import type { ReactNode } from 'react'

export function SectionHeader({
  title,
  eyebrow,
  right,
}: {
  title: string
  eyebrow?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">{eyebrow}</p>}
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">{title}</h2>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
