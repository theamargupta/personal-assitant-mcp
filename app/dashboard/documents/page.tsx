'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

interface Doc {
  id: string
  name: string
  description: string | null
  doc_type: string
  mime_type: string
  file_size: number
  storage_path: string
  tags: string[]
  created_at: string
}

const typeIcons: Record<string, string> = { pdf: '📄', image: '🖼️', other: '📁' }
const filterTabs = ['All', 'PDFs', 'Images'] as const

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<string>('All')
  const [loading, setLoading] = useState(true)

  const loadDocs = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let query = supabase
      .from('wallet_documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (tab === 'PDFs') query = query.eq('doc_type', 'pdf')
    if (tab === 'Images') query = query.eq('doc_type', 'image')

    const { data } = await query
    setDocs(data ?? [])
    setLoading(false)
  }, [tab])

  useEffect(() => { loadDocs() }, [loadDocs])

  async function downloadDoc(doc: Doc) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const filtered = docs.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Documents</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="5" /><path d="M10 10l3 3" />
            </svg>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {filterTabs.map(f => (
          <button
            key={f}
            onClick={() => setTab(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === f ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-text-muted">No documents found. Upload via Claude!</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass rounded-2xl p-5 hover:border-white/20 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{typeIcons[d.doc_type] ?? '📁'}</span>
              </div>
              <h3 className="font-medium text-text-primary text-sm mb-1 truncate">{d.name}</h3>
              {d.description && <p className="text-xs text-text-muted mb-2 truncate">{d.description}</p>}
              <div className="flex flex-wrap gap-1 mb-3">
                {d.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-text-muted">{tag}</span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">{formatSize(d.file_size)}</span>
                <button
                  onClick={() => downloadDoc(d)}
                  className="text-xs text-accent-blue hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Download
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
