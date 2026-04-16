'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

const footerLinks = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Pricing', href: '#' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '#' },
      { label: 'GitHub', href: '#' },
      { label: 'API', href: '/api/health' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { label: 'Twitter/X', href: '#' },
      { label: 'Discord', href: '#' },
      { label: 'devfrend.com', href: 'https://devfrend.com' },
    ],
  },
]

export function FooterCTA() {
  return (
    <footer className="relative pt-[15vh] pb-8 px-6">
      <div className="max-w-5xl mx-auto">
        {/* CTA block */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative text-center mb-24"
        >
          {/* Subtle neon glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[200px] bg-neon/[0.03] rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10">
            <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] mb-6 [text-wrap:balance]">
              Ready to{' '}
              <span className="text-neon">take control?</span>
            </h2>
            <p className="text-text-secondary text-[15px] mb-8 max-w-md mx-auto [text-wrap:pretty]">
              Start tracking your habits, tasks, and spending. Let Claude handle the rest.
            </p>
            <Link
              href="/signup"
              className="
                inline-flex items-center gap-2
                px-8 py-4 rounded-full text-[14px] font-medium
                bg-neon text-bg-primary
                shadow-[0_0_50px_rgba(200,255,0,0.1)]
                hover:shadow-[0_0_80px_rgba(200,255,0,0.15)]
                hover:bg-neon-muted
                transition-all duration-500
              "
            >
              Get Started Free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3.333 8h9.334M8.667 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </motion.div>

        {/* Separator */}
        <div className="h-px bg-white/[0.04] mb-12" />

        {/* Footer links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand column */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-6 w-6 rounded-md bg-neon flex items-center justify-center">
                <span className="text-[9px] font-bold text-bg-primary leading-none">S</span>
              </div>
              <span className="text-[13px] font-semibold text-text-primary">Sathi</span>
            </div>
            <p className="text-[12px] text-text-muted leading-relaxed max-w-[180px]">
              Your AI-powered personal assistant, built on the Model Context Protocol.
            </p>
          </div>

          {footerLinks.map((col) => (
            <div key={col.title}>
              <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-[0.15em] mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[13px] text-text-muted hover:text-text-secondary transition-colors duration-300">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/[0.03]">
          <p className="text-[11px] text-text-muted">&copy; 2026 devfrend. All rights reserved.</p>
          <div className="flex gap-5">
            <a href="#" className="text-[11px] text-text-muted hover:text-text-secondary transition-colors">Privacy</a>
            <a href="#" className="text-[11px] text-text-muted hover:text-text-secondary transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
