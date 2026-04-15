'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', icon: '🏠', label: 'Overview' },
  { href: '/dashboard/habits', icon: '🔥', label: 'Habits' },
  { href: '/dashboard/tasks', icon: '✅', label: 'Tasks' },
  { href: '/dashboard/finance', icon: '💰', label: 'Finance' },
  { href: '/dashboard/documents', icon: '📄', label: 'Documents' },
  { href: '/dashboard/goals', icon: '🎯', label: 'Goals' },
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
      <div className="px-6 py-5 border-b border-white/10">
        <Link href="/" className="text-lg font-bold gradient-text">PA MCP</Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              isActive(item.href)
                ? 'bg-accent-blue/10 text-accent-blue border-l-2 border-accent-blue'
                : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col glass border-r border-white/10 z-40">
        {nav}
      </aside>

      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 glass rounded-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
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
          <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
          <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-64 flex flex-col bg-bg-primary border-r border-white/10 z-50">
            {nav}
          </aside>
        </>
      )}
    </>
  )
}
