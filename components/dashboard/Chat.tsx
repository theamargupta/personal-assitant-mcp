'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, SendHorizontal, Sparkles } from 'lucide-react'
import {
  streamChat,
  type ChatMessage,
  type ChatProvider,
  type ToolCall,
} from '@/lib/chat/client'

const PROVIDER_STORAGE_KEY = 'sathi_chat_provider'

const SUGGESTIONS = [
  'Add ₹200 for coffee',
  'Remind me to ship PR tomorrow',
  'Log my meditation',
  'How much did I spend this week?',
]

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [provider, setProvider] = useState<ChatProvider>('claude')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const v = localStorage.getItem(PROVIDER_STORAGE_KEY)
    if (v === 'claude' || v === 'openai') setProvider(v)
  }, [])

  useLayoutEffect(() => {
    if (messages.length === 0) return
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [messages, streaming])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const setProviderPersist = (p: ChatProvider) => {
    setProvider(p)
    localStorage.setItem(PROVIDER_STORAGE_KEY, p)
  }

  const canSend = !streaming && input.trim().length > 0

  const handleSend = async (text: string) => {
    if (streaming) return
    const trimmed = text.trim()
    if (!trimmed) return

    setError(null)
    setInput('')

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }
    const assistantId = `a-${Date.now() + 1}`
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
    }

    const baseMessages = [...messages, userMsg]
    setMessages([...baseMessages, assistantMsg])

    const history = baseMessages.map((m) => ({ role: m.role, content: m.content }))

    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)

    try {
      for await (const event of streamChat({ messages: history, signal: controller.signal, provider })) {
        if (event.type === 'text_delta') {
          setMessages((curr) =>
            curr.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + event.text } : m
            )
          )
        } else if (event.type === 'tool_use_start') {
          const tc: ToolCall = { id: event.id, name: event.name, status: 'running' }
          setMessages((curr) =>
            curr.map((m) =>
              m.id === assistantId ? { ...m, toolCalls: [...(m.toolCalls || []), tc] } : m
            )
          )
        } else if (event.type === 'tool_use_done') {
          setMessages((curr) =>
            curr.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    toolCalls: (m.toolCalls || []).map((t) =>
                      t.id === event.id
                        ? { ...t, summary: event.summary, error: event.error, status: event.error ? 'error' : 'done' }
                        : t
                    ),
                  }
                : m
            )
          )
        } else if (event.type === 'error') {
          setError(event.message)
          break
        } else if (event.type === 'done') {
          break
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Chat failed')
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const handleClear = () => {
    if (abortRef.current) abortRef.current.abort()
    setMessages([])
    setError(null)
    setStreaming(false)
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col lg:max-w-[42rem]">
      {/* Chat shell — reads as a dedicated conversation surface */}
      <div className="flex min-h-[calc(100dvh-6.25rem)] flex-1 flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] via-bg-primary/80 to-bg-primary shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_80px_rgba(0,0,0,0.45)] lg:min-h-0">
        {/* Thread header */}
        <header className="flex shrink-0 flex-col gap-3 border-b border-white/[0.06] px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-neon/25 to-neon/5 shadow-[0_0_28px_rgba(200,255,0,0.15)] ring-1 ring-inset ring-white/[0.1]">
              <Sparkles className="h-5 w-5 text-neon" strokeWidth={1.6} aria-hidden />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-text-primary">Chat</h1>
              <p className="text-[11px] text-text-muted">
                {streaming ? 'Sathi is replying…' : 'Message Sathi like any chat app'}
              </p>
            </div>
            {streaming && (
              <span
                className="ml-1 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-neon border-t-transparent md:ml-0"
                aria-hidden
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-full border border-white/[0.08] bg-black/20 p-0.5"
              role="group"
              aria-label="Model provider"
            >
              {(['claude', 'openai'] as const).map((p) => {
                const active = provider === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => !streaming && setProviderPersist(p)}
                    disabled={streaming}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? 'bg-white/[0.1] text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-secondary'
                    } ${streaming ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {p === 'claude' ? 'Claude' : 'ChatGPT'}
                  </button>
                )
              })}
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-xs font-medium text-text-secondary transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-text-primary"
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Clear
              </button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="chat-thread-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col px-1 pt-4">
              <div className="mb-6 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-text-muted">
                  New conversation
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-text-primary">
                  What&apos;s on your mind?
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
                  Tasks, habits, money, goals — type naturally. Enter sends; Shift+Enter for a new line.
                </p>
              </div>
              <div className="space-y-2">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button
                    key={s}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: 0.05 + i * 0.05 }}
                    onClick={() => handleSend(s)}
                    className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5 text-left text-sm text-text-secondary transition-colors hover:border-neon/20 hover:bg-white/[0.05] hover:text-text-primary"
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              <div className="flex flex-col gap-6">
                {messages.map((m, i) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isStreamingTail={streaming && m.role === 'assistant' && i === messages.length - 1}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-500/35 bg-red-500/[0.12] p-3 text-sm text-red-200">
              <span className="mt-0.5 shrink-0" aria-hidden>
                ⚠
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">{error}</span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-white/[0.06] bg-bg-primary/90 p-3 md:p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-1.5 pl-3 shadow-inner shadow-black/20 focus-within:border-neon/35 focus-within:ring-1 focus-within:ring-neon/20">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (canSend) void handleSend(input)
                }
              }}
              placeholder="Message Sathi…"
              rows={1}
              disabled={streaming}
              className="max-h-[160px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => canSend && void handleSend(input)}
              disabled={!canSend}
              className={`mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                canSend
                  ? 'bg-neon text-zinc-950 shadow-[0_0_24px_rgba(200,255,0,0.25)] hover:brightness-110'
                  : 'bg-white/[0.04] text-text-muted'
              }`}
              aria-label="Send message"
            >
              <SendHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>
          <p className="mt-2 px-1 text-center text-[10px] text-text-muted">
            AI can make mistakes. Double-check important actions.
          </p>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  isStreamingTail,
}: {
  message: ChatMessage
  isStreamingTail: boolean
}) {
  const isUser = message.role === 'user'
  const hasTools = !isUser && (message.toolCalls?.length || 0) > 0
  const hasText = !isUser ? message.content.length > 0 : true
  const showTyping = !isUser && isStreamingTail && !hasText && !hasTools

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-end gap-1"
      >
        <span className="pr-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">You</span>
        <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-neon px-3.5 py-2.5 text-sm font-medium leading-relaxed text-zinc-950 shadow-[0_8px_32px_rgba(200,255,0,0.12)]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex gap-3"
    >
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-neon/20 to-white/[0.04] text-[11px] font-bold text-neon ring-1 ring-inset ring-white/[0.08]"
        aria-hidden
      >
        S
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Sathi</span>

        {hasTools && (
          <div className="flex flex-col items-start gap-1.5">
            {message.toolCalls!.map((tc) => (
              <ToolChip key={tc.id} call={tc} />
            ))}
          </div>
        )}

        {(hasText || showTyping) && (
          <div
            className={`max-w-[min(100%,28rem)] rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.06] px-3.5 py-2.5 text-sm leading-relaxed text-text-primary shadow-sm ${
              showTyping ? 'text-text-muted' : ''
            }`}
          >
            {showTyping ? (
              <span className="inline-flex items-center gap-1" aria-label="Sathi is typing">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted" />
                </span>
              </span>
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function ToolChip({ call }: { call: ToolCall }) {
  const label = call.summary || humanizeTool(call.name)
  const isError = call.status === 'error'
  const isRunning = call.status === 'running'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-medium ${
        isError
          ? 'border-red-500/40 bg-red-500/[0.12] text-red-200'
          : 'border-neon/25 bg-neon/[0.08] text-text-primary'
      }`}
    >
      {isRunning ? (
        <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : isError ? (
        <span className="shrink-0" aria-hidden>
          ⚠
        </span>
      ) : (
        <span className="shrink-0 text-neon" aria-hidden>
          ✓
        </span>
      )}
      <span className="truncate">{label}</span>
    </motion.div>
  )
}

function humanizeTool(name: string) {
  return name.replace(/_/g, ' ')
}
