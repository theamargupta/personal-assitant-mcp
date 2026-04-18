'use client'

import { useEffect, useState, useCallback, type ChangeEvent, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { Card, Chip, DashboardHero, EmptyState, SectionHeader, StatCard } from '@/components/dashboard/kit'

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
  status?: string
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const totalSize = docs.reduce((sum, doc) => sum + doc.file_size, 0)
  const pending = docs.filter((doc) => doc.status && doc.status !== 'ready').length

  return (
    <div className="space-y-8">
      <DashboardHero
        eyebrow="DOCUMENTS"
        title="Your wallet"
        subtitle="IDs, PDFs, screenshots, and tagged files laid out like a real document tray."
        right={<button onClick={() => setShowUpload(true)} className="rounded-full bg-neon px-5 py-3 text-sm font-semibold text-bg-primary transition-transform hover:scale-[1.02]">+ Upload</button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Documents" value={docs.length} hint="in wallet" accent="neon" />
        <StatCard label="Pending Extract" value={pending} hint="processing" accent={pending > 0 ? 'orange' : 'muted'} />
        <StatCard label="Total Size" value={formatSize(totalSize)} hint="stored files" accent="blue" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search documents or tags"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-white/[0.06] bg-white/[0.02] py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
            />
            <svg className="absolute left-4 top-3 text-text-muted" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="5" /><path d="M10 10l3 3" />
            </svg>
          </div>
          <div className="flex flex-wrap gap-2">
            {filterTabs.map((filter) => (
              <button key={filter} onClick={() => setTab(filter)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${tab === filter ? 'border-neon/20 bg-neon/[0.08] text-neon' : 'border-white/[0.05] text-text-muted hover:text-text-primary'}`}>
                {filter}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <section>
        <SectionHeader eyebrow="DOCUMENT GRID" title="Files" />
        {filtered.length === 0 ? (
          <EmptyState title="No documents found" copy="Upload a file or change the search/filter to widen the tray." action={<button onClick={() => setShowUpload(true)} className="rounded-full bg-neon px-4 py-2 text-xs font-semibold text-bg-primary">Upload</button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((doc, i) => (
              <motion.div key={doc.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card hoverable className="group p-5">
                  <div className="mb-5 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.02] text-2xl">{typeIcons[doc.doc_type] ?? '📁'}</div>
                    <Chip variant={doc.status === 'pending' ? 'status-pending' : 'status-completed'}>{doc.status ?? 'ready'}</Chip>
                  </div>
                  <h3 className="truncate text-sm font-semibold text-text-primary">{doc.name}</h3>
                  {doc.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">{doc.description}</p>}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {doc.tags.slice(0, 4).map((tag) => <Chip key={tag} variant="tag">#{tag}</Chip>)}
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-white/[0.04] pt-4">
                    <span className="text-xs text-text-muted">{formatSize(doc.file_size)}</span>
                    <div className="flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <button onClick={() => downloadDoc(doc)} className="rounded-full border border-white/[0.06] px-3 py-1.5 text-xs text-text-secondary hover:text-neon">Download</button>
                      <button onClick={() => setDeleteDocTarget(doc)} className="rounded-full border border-red-500/[0.15] bg-red-500/[0.08] px-3 py-1.5 text-xs text-red-300">Delete</button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </section>

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
