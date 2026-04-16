'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Dashboard', href: '/dashboard' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-bg-primary/80 backdrop-blur-2xl border-b border-white/[0.04]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-[72px] flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-neon flex items-center justify-center">
            <span className="text-[11px] font-bold text-bg-primary leading-none">PA</span>
          </div>
          <span className="text-[15px] font-semibold text-text-primary tracking-[-0.01em]">
            PA MCP
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:block">
          <Link
            href="/signup"
            className="
              inline-flex items-center gap-1.5
              rounded-full px-5 py-2 text-[13px] font-medium
              bg-neon text-bg-primary
              hover:bg-neon-muted
              transition-colors duration-300
            "
          >
            Get Started
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden relative w-10 h-10 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          <div className="relative w-5 h-3.5 flex flex-col justify-between">
            <span className={`block h-px w-full bg-current transition-all duration-300 origin-center ${mobileOpen ? 'translate-y-[6.5px] rotate-45' : ''}`} />
            <span className={`block h-px w-full bg-current transition-all duration-300 ${mobileOpen ? 'opacity-0 scale-x-0' : ''}`} />
            <span className={`block h-px w-full bg-current transition-all duration-300 origin-center ${mobileOpen ? '-translate-y-[6.5px] -rotate-45' : ''}`} />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden overflow-hidden bg-bg-primary/95 backdrop-blur-2xl border-b border-white/[0.04]"
          >
            <div className="px-6 pt-2 pb-6 space-y-1">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                >
                  <a
                    href={link.href}
                    className="block py-3 text-[15px] text-text-secondary hover:text-text-primary transition-colors border-b border-white/[0.03]"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="pt-3"
              >
                <Link
                  href="/signup"
                  className="block text-center py-3 rounded-full text-[14px] font-medium bg-neon text-bg-primary hover:bg-neon-muted transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  Get Started
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith('/')
  const Component = isInternal ? Link : 'a'

  return (
    <Component
      href={href}
      className="relative px-3.5 py-2 text-[13px] text-text-secondary hover:text-text-primary transition-colors duration-300 group"
    >
      {children}
      <span className="absolute bottom-1 left-3.5 right-3.5 h-px bg-neon/60 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
    </Component>
  )
}
