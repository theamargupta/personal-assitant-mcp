import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  copy,
  action,
}: {
  icon?: ReactNode
  title: string
  copy: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.01] px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-text-secondary">
        {icon ?? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-text-muted">{copy}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
