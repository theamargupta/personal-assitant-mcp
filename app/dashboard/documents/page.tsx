'use client'

import { useEffect, useState, useCallback, type ChangeEvent, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

interface Doc {
  id: string
  name: string
  description: string | null
  doc_type: 'pdf' | 'image' | 'other'
  mime_type: string
  file_size: number
  storage_path: string
  tags: string[]
  created_at: string
}

interface UploadForm {
  name: string
  description: string
  doc_type: 'pdf' | 'image' | 'other'
  tags: string
}

const typeIcons: Record<string, string> = { pdf: '📄', image: '🖼️', other: '📁' }
const filterTabs = ['All', 'PDFs', 'Images'] as const
const inputClass = 'w-full px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function detectDocType(mimeType: string): UploadForm['doc_type'] {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<string>('All')
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadForm, setUploadForm] = useState<UploadForm>({ name: '', description: '', doc_type: 'other', tags: '' })
  const [deleteDocTarget, setDeleteDocTarget] = useState<Doc | null>(null)
  const [toast, setToast] = useState('')

  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2000)
  }, [])

  const loadDocs = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    let query = supabase
      .from('wallet_documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (tab === 'PDFs') query = query.eq('doc_type', 'pdf')
    if (tab === 'Images') query = query.eq('doc_type', 'image')

    const { data } = await query
    setDocs((data ?? []) as Doc[])
    setLoading(false)
  }, [tab])

  useEffect(() => { loadDocs() }, [loadDocs])

  async function downloadDoc(doc: Doc) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.storage_path, 3600)
    if (error) {
      showToast(error.message)
      return
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setUploadFile(file)
    if (!file) return

    const docType = detectDocType(file.type)
    setUploadForm((current) => ({
      ...current,
      name: current.name || file.name,
      doc_type: docType,
    }))
  }

  async function uploadDocument(e: FormEvent) {
    e.preventDefault()
    if (!uploadFile) {
      showToast('Choose a file first')
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUploading(true)
    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${user.id}/${crypto.randomUUID()}_${safeName}`
    const tags = uploadForm.tags ? uploadForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : []

    const { data: docRow, error: insertError } = await supabase
      .from('wallet_documents')
      .insert({
        user_id: user.id,
        name: uploadForm.name.trim() || uploadFile.name,
        description: uploadForm.description.trim() || null,
        doc_type: uploadForm.doc_type,
        mime_type: uploadFile.type || 'application/octet-stream',
        file_size: uploadFile.size,
        storage_path: storagePath,
        tags,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !docRow) {
      setUploading(false)
      showToast(insertError?.message ?? 'Could not create document')
      return
    }

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, uploadFile, { contentType: uploadFile.type || 'application/octet-stream' })

    if (uploadError) {
      await supabase.from('wallet_documents').delete().eq('id', docRow.id).eq('user_id', user.id)
      setUploading(false)
      showToast(uploadError.message)
      return
    }

    const { error: readyError } = await supabase
      .from('wallet_documents')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', docRow.id)
      .eq('user_id', user.id)

    setUploading(false)
    if (readyError) {
      showToast(readyError.message)
      return
    }

    setShowUpload(false)
    setUploadFile(null)
    setUploadForm({ name: '', description: '', doc_type: 'other', tags: '' })
    await loadDocs()
    showToast('Document uploaded!')
  }

  async function deleteDocument() {
    if (!deleteDocTarget) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: storageError } = await supabase.storage.from('documents').remove([deleteDocTarget.storage_path])
    if (storageError) {
      showToast(storageError.message)
      return
    }

    const { error: chunksError } = await supabase
      .from('wallet_document_chunks')
      .delete()
      .eq('document_id', deleteDocTarget.id)
      .eq('user_id', user.id)

    if (chunksError) {
      showToast(chunksError.message)
      return
    }

    const { error: docError } = await supabase
      .from('wallet_documents')
      .delete()
      .eq('id', deleteDocTarget.id)
      .eq('user_id', user.id)

    if (docError) {
      showToast(docError.message)
      return
    }

    setDeleteDocTarget(null)
    await loadDocs()
    showToast('Document deleted')
  }

  const filtered = docs.filter((doc) =>
    doc.name.toLowerCase().includes(search.toLowerCase()) ||
    doc.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-[22px] font-bold text-text-primary tracking-[-0.02em]">Documents</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20"
            />
            <svg className="absolute left-3 top-[19px] text-text-muted" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="5" /><path d="M10 10l3 3" />
            </svg>
            <p className="text-xs text-text-muted mt-2">For content search, ask Claude</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all"
          >
            Upload
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {filterTabs.map((filter) => (
          <button
            key={filter}
            onClick={() => setTab(filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === filter ? 'bg-neon/[0.1] text-neon' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <p className="text-text-muted">No documents found. Upload one to start.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-white/[0.12] transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{typeIcons[doc.doc_type] ?? '📁'}</span>
                <button
                  onClick={() => setDeleteDocTarget(doc)}
                  className="h-8 w-8 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label={`Delete ${doc.name}`}
                >
                  🗑
                </button>
              </div>
              <h3 className="font-medium text-text-primary text-sm mb-1 truncate">{doc.name}</h3>
              {doc.description && <p className="text-xs text-text-muted mb-2 truncate">{doc.description}</p>}
              <div className="flex flex-wrap gap-1 mb-3">
                {doc.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-text-muted">{tag}</span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">{formatSize(doc.file_size)}</span>
                <button
                  onClick={() => downloadDoc(doc)}
                  className="text-xs text-neon hover:text-neon-muted opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Download
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowUpload(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-4">Upload Document</h2>
              <form onSubmit={uploadDocument} className="space-y-3">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  required
                  className="w-full text-[14px] text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-neon file:px-3 file:py-2 file:text-sm file:font-semibold file:text-bg-primary hover:file:bg-neon-muted"
                />
                <input type="text" placeholder="Name" value={uploadForm.name} onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })} required className={inputClass} />
                <textarea placeholder="Description (optional)" value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
                <input type="text" value={uploadForm.doc_type} readOnly className={`${inputClass} capitalize`} />
                <input type="text" placeholder="Tags (comma-separated)" value={uploadForm.tags} onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })} className={inputClass} />
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={uploading} className="flex-1 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all disabled:opacity-60">
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                  <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all">Cancel</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteDocTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteDocTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-2">Delete this document?</h2>
              <p className="text-sm text-text-muted mb-5">{deleteDocTarget.name}</p>
              <div className="flex gap-2">
                <button onClick={deleteDocument} className="flex-1 py-2 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] text-sm transition-all">Delete</button>
                <button onClick={() => setDeleteDocTarget(null)} className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-bg-surface border border-white/[0.06] text-text-primary px-4 py-2.5 rounded-xl text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
