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
    <footer className="pt-24 pb-8 px-6">
      <div className="max-w-5xl mx-auto">
        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to{' '}
            <span className="gradient-text">take control?</span>
          </h2>
          <Link
            href="/signup"
            className="inline-block px-8 py-3.5 rounded-xl bg-accent-blue hover:bg-accent-blue/90 text-white font-medium transition-all glow-blue text-lg"
          >
            Get Started Free
          </Link>
        </motion.div>

        {/* Links */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 pb-12 border-b border-white/10">
          {footerLinks.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-text-primary mb-3">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-text-muted hover:text-text-secondary transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Copyright */}
        <div className="pt-6 text-center">
          <p className="text-xs text-text-muted">&copy; 2026 devfrend. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
