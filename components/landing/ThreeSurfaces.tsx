'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

const surfaces = [
  {
    label: 'Inside Claude',
    caption: 'Ask. Get a widget.',
    src: '/landing/claude-widget-review.png',
    alt: 'Sathi review widget inside Claude',
    width: 1600,
    height: 1000,
    mobile: false,
  },
  {
    label: 'Web dashboard',
    caption: 'Glance at everything.',
    src: '/landing/dashboard.png',
    alt: 'Sathi web dashboard',
    width: 1600,
    height: 1000,
    mobile: false,
  },
  {
    label: 'iOS app',
    caption: 'Log on the go.',
    src: '/landing/mobile-rituals.png',
    alt: 'Sathi iOS rituals screen',
    width: 400,
    height: 867,
    mobile: true,
  },
]

export function ThreeSurfaces() {
  return (
    <section className="py-[15vh] px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            THREE SURFACES
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            One brain. <span className="text-neon">Everywhere you are.</span>
          </h2>
          <p className="mt-5 text-text-secondary max-w-2xl mx-auto text-[15px] leading-relaxed [text-wrap:pretty]">
            The same <code className="font-mono text-neon">pa_memory_items</code> row you saved from Claude shows up on
            the dashboard and in the mobile app. Add a transaction from SMS; it&apos;s there in Claude a second later.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid gap-3 md:grid-cols-3"
        >
          {surfaces.map((surface) => (
            <motion.div
              key={surface.label}
              variants={item}
              whileHover={{ y: -4, scale: 1.01 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-white/[0.04] bg-white/[0.01] p-4 transition-colors duration-500 hover:border-white/[0.08] hover:bg-white/[0.025]"
            >
              <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.015]">
                {surface.mobile ? (
                  <div className="my-5 w-full max-w-[180px] overflow-hidden rounded-[2rem] border border-white/[0.08] bg-bg-primary">
                    <Image
                      src={surface.src}
                      alt={surface.alt}
                      width={surface.width}
                      height={surface.height}
                      className="h-auto w-full"
                    />
                  </div>
                ) : (
                  <Image
                    src={surface.src}
                    alt={surface.alt}
                    width={surface.width}
                    height={surface.height}
                    className="h-auto w-full"
                  />
                )}
              </div>
              <div className="mt-5">
                <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-text-primary">{surface.label}</h3>
                <p className="mt-1 text-[12px] text-text-muted">{surface.caption}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
