'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

const DEFAULT_PROMPT = "aaj ka din kaisa raha"

export function AskSathiBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState('')

  function go(prompt: string) {
    const q = prompt.trim() || DEFAULT_PROMPT
    router.push(`/dashboard/chat?q=${encodeURIComponent(q)}`)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    go(value)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`group flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] p-1.5 shadow-[0_16px_60px_rgba(0,0,0,0.22)] transition-colors duration-300 focus-within:border-neon/25 hover:border-white/[0.1] ${compact ? 'w-full md:max-w-md' : 'w-full'}`}
    >
      <button
        type="button"
        onClick={() => go(value)}
        aria-label="Use voice"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.04] text-text-secondary transition-colors group-hover:text-neon"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" strokeLinecap="round" />
        </svg>
      </button>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={`Ask Sathi anything - try '${DEFAULT_PROMPT}'`}
        className="min-w-0 flex-1 bg-transparent px-1 text-sm text-text-primary outline-none placeholder:text-text-muted"
      />
      <button
        type="submit"
        aria-label="Ask Sathi"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neon text-bg-primary transition-transform duration-200 hover:scale-105"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  )
}
