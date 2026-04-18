'use client'

import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'

const MCP_URL = 'https://sathi.devfrend.com/api/mcp'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
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

function StepCard({
  number,
  eyebrow,
  title,
  children,
}: {
  number: string
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <motion.div
      variants={item}
      className="relative rounded-2xl border border-white/[0.04] bg-white/[0.01] p-6 transition-colors duration-500 hover:border-white/[0.08] hover:bg-white/[0.02]"
    >
      <span className="absolute right-5 top-5 font-mono text-[12px] text-neon/50">{number}</span>
      <p className="pr-10 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">{eyebrow}</p>
      <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.02em] text-text-primary">{title}</h3>
      <div className="mt-5 text-[13px] leading-relaxed text-text-secondary">{children}</div>
    </motion.div>
  )
}

export function ConnectSteps() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(MCP_URL).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <section className="py-[15vh] px-6 relative grain isolate">
      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-10"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted mb-4 block">
            CONNECT IN 60 SECONDS
          </span>
          <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1] [text-wrap:balance]">
            Add Sathi to <span className="text-neon">wherever you already are.</span>
          </h2>
          <p className="mt-5 text-text-secondary max-w-2xl mx-auto text-[15px] leading-relaxed [text-wrap:pretty]">
            One MCP URL. Four places to paste it. OAuth handles the rest.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-8 flex max-w-3xl flex-col gap-3 rounded-2xl border border-neon/[0.12] bg-neon/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <code className="overflow-x-auto whitespace-nowrap font-mono text-[13px] text-text-primary sm:text-[15px]">
            {MCP_URL}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-white/[0.08] px-4 py-2 text-[12px] font-medium text-text-primary transition-colors duration-300 hover:border-neon/30 hover:text-neon"
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
        >
          <StepCard number="01" eyebrow="FOR CLAUDE.AI PRO/TEAM" title="Custom connector">
            <p>Settings → Connectors → Add custom connector → paste URL → Sign in</p>
          </StepCard>

          <StepCard number="02" eyebrow="FOR CHATGPT PLUS" title="MCP server">
            <p>Settings → Beta features → MCP → Add → paste URL → Authorize</p>
          </StepCard>

          <StepCard number="03" eyebrow="FOR LOCAL MCP CLIENTS" title="JSON config">
            <pre className="overflow-x-auto rounded-xl border border-white/[0.04] bg-bg-primary/80 p-4 text-[12px] leading-relaxed text-text-secondary">
              <code>{`{
  "mcpServers": {
    "sathi": {
      "url": "https://sathi.devfrend.com/api/mcp"
    }
  }
}`}</code>
            </pre>
          </StepCard>

          <StepCard number="04" eyebrow="BROWSER" title="Sign up at sathi.devfrend.com">
            <p>Supabase auth — email or Google. Full UI for everything your MCP tools can do.</p>
            <a
              href="/signup"
              className="mt-5 inline-flex rounded-full bg-neon px-5 py-2.5 text-[12px] font-medium text-bg-primary transition-transform duration-300 hover:scale-[1.02]"
            >
              Open dashboard
            </a>
          </StepCard>

          <StepCard number="05" eyebrow="MOBILE" title="Play Store beta — coming soon">
            <p>Android-first and Hinglish-first. Play Store beta and APK access for SMS-to-transaction, notify, log, forget.</p>
            <button
              type="button"
              disabled
              className="mt-5 inline-flex cursor-not-allowed rounded-full border border-white/[0.06] px-5 py-2.5 text-[12px] font-medium text-text-muted"
            >
              Coming soon
            </button>
          </StepCard>
        </motion.div>
      </div>
    </section>
  )
}
