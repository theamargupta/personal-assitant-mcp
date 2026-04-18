'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', icon: '🏠', label: 'Overview' },
  { href: '/dashboard/chat', icon: '💬', label: 'Chat' },
  { href: '/dashboard/habits', icon: '🔥', label: 'Habits' },
  { href: '/dashboard/tasks', icon: '✅', label: 'Tasks' },
  { href: '/dashboard/finance', icon: '💰', label: 'Finance' },
  { href: '/dashboard/documents', icon: '📄', label: 'Documents' },
  { href: '/dashboard/goals', icon: '🎯', label: 'Goals' },
  { href: '/dashboard/memory', icon: '🧠', label: 'Memory' },
  { href: '/dashboard/profile', icon: '👤', label: 'Profile' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const nav = (
    <>
      {/* Logo */}
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neon shadow-[0_0_32px_rgba(200,255,0,0.12)]">
            <span className="text-[11px] font-bold text-bg-primary leading-none">S</span>
          </div>
          <div>
            <span className="block text-[15px] font-semibold text-text-primary">Sathi</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-text-muted">MCP OS</span>
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-3">
        <p className="mb-3 px-3 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">Dashboard</p>
        <div className="space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`group flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-all ${
              isActive(item.href)
                ? 'border border-neon/[0.16] bg-neon/[0.08] text-neon shadow-[0_0_34px_rgba(200,255,0,0.06)]'
                : 'border border-transparent text-text-secondary hover:border-white/[0.04] hover:bg-white/[0.025] hover:text-text-primary'
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.025] text-base transition-colors group-hover:bg-white/[0.05]">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
        </div>
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-full border border-white/[0.04] bg-white/[0.01] px-3 py-2.5 text-sm text-text-muted transition-all hover:border-red-400/15 hover:bg-red-500/[0.06] hover:text-red-300"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.025]">🚪</span>
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed bottom-4 left-4 top-4 z-40 hidden w-64 flex-col rounded-2xl border border-white/[0.04] bg-white/[0.015] backdrop-blur-xl lg:flex">
        {nav}
      </aside>

      {/* Mobile hamburger */}
      <button
        className="fixed left-4 top-4 z-50 rounded-full border border-white/[0.06] bg-white/[0.03] p-2 backdrop-blur lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation"
      >
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-primary">
          {mobileOpen ? (
            <path d="M4 4l12 12M4 16L16 4" />
          ) : (
            <path d="M3 5h14M3 10h14M3 15h14" />
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed bottom-3 left-3 top-3 z-50 flex w-72 flex-col rounded-2xl border border-white/[0.06] bg-bg-primary lg:hidden">
            {nav}
          </aside>
        </>
      )}
    </>
  )
}
