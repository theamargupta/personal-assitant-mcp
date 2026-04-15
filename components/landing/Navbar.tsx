'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-bg-primary/80 backdrop-blur-xl border-b border-white/10'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold gradient-text">
          PA MCP
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-text-secondary hover:text-text-primary transition-colors text-sm">
            Features
          </a>
          <a href="#how-it-works" className="text-text-secondary hover:text-text-primary transition-colors text-sm">
            How It Works
          </a>
          <Link href="/dashboard" className="text-text-secondary hover:text-text-primary transition-colors text-sm">
            Dashboard
          </Link>
        </div>

        {/* CTA */}
        <div className="hidden md:block">
          <Link
            href="/signup"
            className="px-5 py-2 rounded-lg bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-medium transition-all glow-blue"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-text-secondary"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileOpen ? (
              <path d="M6 6l12 12M6 18L18 6" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-bg-primary/95 backdrop-blur-xl border-b border-white/10 px-6 pb-4">
          <a href="#features" className="block py-2 text-text-secondary hover:text-text-primary text-sm" onClick={() => setMobileOpen(false)}>
            Features
          </a>
          <a href="#how-it-works" className="block py-2 text-text-secondary hover:text-text-primary text-sm" onClick={() => setMobileOpen(false)}>
            How It Works
          </a>
          <Link href="/dashboard" className="block py-2 text-text-secondary hover:text-text-primary text-sm" onClick={() => setMobileOpen(false)}>
            Dashboard
          </Link>
          <Link
            href="/signup"
            className="mt-2 block text-center px-5 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium"
            onClick={() => setMobileOpen(false)}
          >
            Get Started
          </Link>
        </div>
      )}
    </nav>
  )
}
