'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
    <div className="flex flex-col h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              streaming ? 'bg-accent-purple animate-pulse' : 'bg-text-muted'
            }`}
          />
          <span className="text-base font-semibold text-text-primary">Assistant</span>
          {streaming && (
            <span className="ml-1 inline-block w-3 h-3 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="w-8 h-8 rounded-full bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] flex items-center justify-center text-text-secondary text-xs"
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              ↻
            </button>
          )}
        </div>
      </div>

      {/* Provider toggle */}
      <div className="flex items-center justify-between gap-3 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          Model
        </span>
        <div className="flex items-center gap-2">
          {(['claude', 'openai'] as const).map((p) => {
            const active = provider === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => !streaming && setProviderPersist(p)}
                disabled={streaming}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  active
                    ? 'border-accent-purple/55 bg-accent-purple/15 text-text-primary'
                    : 'border-white/[0.06] bg-white/[0.03] text-text-secondary hover:text-text-primary'
                } ${streaming ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {p === 'claude' ? 'Claude' : 'ChatGPT'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="pt-12 space-y-2">
            <h2 className="text-2xl font-bold text-text-primary tracking-[-0.01em]">
              What&apos;s on your mind?
            </h2>
            <p className="text-sm text-text-muted leading-relaxed">
              Capture tasks, habits, expenses, goals — naturally.
            </p>
            <div className="mt-6 space-y-2">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s}
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: 0.08 + i * 0.06 }}
                  onClick={() => handleSend(s)}
                  className="w-full text-left p-4 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05] text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </AnimatePresence>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/[0.12] text-sm text-red-300">
            <span>⚠</span>
            <span className="flex-1">{error}</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex items-end gap-2 py-3 border-t border-white/[0.04]">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canSend) handleSend(input)
            }
          }}
          placeholder="Message the assistant…"
          rows={1}
          disabled={streaming}
          className="flex-1 min-h-[44px] max-h-[160px] resize-none rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-purple/55"
        />
        <button
          type="button"
          onClick={() => canSend && handleSend(input)}
          disabled={!canSend}
          className={`w-11 h-11 rounded-full flex items-center justify-center text-base transition-all ${
            canSend
              ? 'bg-accent-purple text-white hover:bg-accent-purple/90'
              : 'bg-white/[0.03] border border-white/[0.06] text-text-muted'
          }`}
          aria-label="Send message"
        >
          ↑
        </button>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const hasTools = !isUser && (message.toolCalls?.length || 0) > 0
  const hasText = !isUser ? message.content.length > 0 : true

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-2"
    >
      {hasTools && (
        <div className="space-y-1.5 flex flex-col items-start">
          {message.toolCalls!.map((tc) => (
            <ToolChip key={tc.id} call={tc} />
          ))}
        </div>
      )}

      {hasText && (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[88%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
              isUser
                ? 'bg-accent-purple text-white rounded-br-sm font-medium'
                : 'bg-white/[0.04] border border-white/[0.06] text-text-primary rounded-bl-sm'
            }`}
          >
            {isUser ? message.content : message.content || ' '}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function ToolChip({ call }: { call: ToolCall }) {
  const label = call.summary || humanizeTool(call.name)
  const isError = call.status === 'error'
  const isRunning = call.status === 'running'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium border max-w-[88%] ${
        isError
          ? 'border-red-500/45 bg-red-500/10 text-red-300'
          : 'border-accent-purple/35 bg-accent-purple/10 text-text-primary'
      }`}
    >
      {isRunning ? (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : isError ? (
        <span>⚠</span>
      ) : (
        <span>✓</span>
      )}
      <span className="truncate">{label}</span>
    </motion.div>
  )
}

function humanizeTool(name: string) {
  return name.replace(/_/g, ' ')
}
