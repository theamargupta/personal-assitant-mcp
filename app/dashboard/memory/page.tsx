'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_SPACES } from '@/lib/memory/types'

interface MemorySpace {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
}

interface MemoryItem {
  id: string
  space_id: string
  title: string
  content: string
  category: string
  tags: string[]
  project: string | null
  importance: number
  created_at: string
  updated_at: string
}

const CATEGORIES = ['all', 'preference', 'rule', 'project', 'decision', 'context', 'snippet', 'note', 'persona'] as const

export default function MemoryPage() {
  const [spaces, setSpaces] = useState<MemorySpace[]>([])
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSpace, setActiveSpace] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null)

  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formCategory, setFormCategory] = useState<string>('note')
  const [formTags, setFormTags] = useState('')
  const [formProject, setFormProject] = useState('')
  const [formSpace, setFormSpace] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    let { data: spacesData } = await supabase
      .from('pa_memory_spaces')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (!spacesData?.length) {
      await supabase.from('pa_memory_spaces').insert(
        DEFAULT_SPACES.map((s) => ({
          user_id: user.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          icon: s.icon,
        }))
      )
      const refetch = await supabase
        .from('pa_memory_spaces')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      spacesData = refetch.data
    }

    const spacesList = (spacesData ?? []) as MemorySpace[]
    setSpaces(spacesList)

    let nextActive = activeSpace
    if (!nextActive && spacesList.length > 0) {
      nextActive = spacesList[0].slug
      setActiveSpace(nextActive)
    }

    let query = supabase
      .from('pa_memory_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('invalid_at', null)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (nextActive) {
      const space = spacesList.find(s => s.slug === nextActive)
      if (space) query = query.eq('space_id', space.id)
    }
    if (activeCategory !== 'all') {
      query = query.eq('category', activeCategory)
    }

    const { data: memoriesData } = await query
    setMemories((memoriesData ?? []) as MemoryItem[])
    setLoading(false)
  }, [activeSpace, activeCategory])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData() }, [loadData])

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const tags = formTags.split(',').map(t => t.trim()).filter(Boolean)
    const spaceSlug = formSpace || activeSpace || 'personal'
    const space = spaces.find(s => s.slug === spaceSlug)

    if (editingMemory) {
      await supabase
        .from('pa_memory_items')
        .update({
          title: formTitle.trim(),
          content: formContent.trim(),
          category: formCategory,
          tags,
          project: formProject.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMemory.id)
    } else {
      await supabase
        .from('pa_memory_items')
        .insert({
          space_id: space?.id,
          user_id: user.id,
          title: formTitle.trim(),
          content: formContent.trim(),
          category: formCategory,
          tags,
          project: formProject.trim() || null,
        })
    }

    resetForm()
    setSaving(false)
    void loadData()
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    await supabase
      .from('pa_memory_items')
      .update({ is_active: false, invalid_at: new Date().toISOString() })
      .eq('id', id)
    void loadData()
  }

  const openEdit = (memory: MemoryItem) => {
    setEditingMemory(memory)
    setFormTitle(memory.title)
    setFormContent(memory.content)
    setFormCategory(memory.category)
    setFormTags(memory.tags.join(', '))
    setFormProject(memory.project || '')
    setShowCreateModal(true)
  }

  const resetForm = () => {
    setShowCreateModal(false)
    setEditingMemory(null)
    setFormTitle('')
    setFormContent('')
    setFormCategory('note')
    setFormTags('')
    setFormProject('')
    setFormSpace('')
  }

  const filtered = searchQuery
    ? memories.filter(m =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.project?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : memories

  if (loading) {
    return (
      <div className="max-w-4xl animate-pulse space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/[0.06]" />
        <div className="h-64 rounded-2xl bg-white/[0.06]" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Memory Vaults</h1>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-neon/[0.15] px-3 py-1.5 text-xs font-medium text-neon transition-all hover:bg-neon/[0.25]"
        >
          + New Memory
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {spaces.map((space) => (
          <button
            type="button"
            key={space.slug}
            onClick={() => setActiveSpace(space.slug)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeSpace === space.slug
                ? 'bg-neon/[0.1] text-neon'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <span>{space.icon}</span>
            {space.name}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            type="button"
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-md px-2 py-1 text-[10px] font-medium capitalize transition-all ${
              activeCategory === cat
                ? 'bg-white/[0.1] text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories..."
          className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] p-12 text-center">
          <p className="text-sm text-text-muted">No memories yet.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((memory) => (
              <motion.div
                key={memory.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-white/[0.1]"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-text-primary">{memory.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-text-muted capitalize">
                        {memory.category}
                      </span>
                      {memory.project && (
                        <span className="rounded-md bg-neon/[0.08] px-1.5 py-0.5 text-[10px] text-neon">
                          {memory.project}
                        </span>
                      )}
                      {memory.tags.map((tag) => (
                        <span key={tag} className="text-[10px] text-text-muted">#{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEdit(memory)}
                      className="rounded-md p-1 text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(memory.id)}
                      className="rounded-md p-1 text-text-muted hover:bg-red-500/[0.1] hover:text-red-400"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-text-secondary">
                  {memory.content}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) resetForm() }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0f0f14] p-6"
            >
              <h2 className="mb-4 text-sm font-semibold text-text-primary">
                {editingMemory ? 'Edit Memory' : 'New Memory'}
              </h2>

              <div className="space-y-3">
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
                />

                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Content — the knowledge to store"
                  rows={5}
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
                />

                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary focus:border-neon/30 focus:outline-none"
                  >
                    {CATEGORIES.filter(c => c !== 'all').map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {!editingMemory && (
                    <select
                      value={formSpace}
                      onChange={(e) => setFormSpace(e.target.value)}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary focus:border-neon/30 focus:outline-none"
                    >
                      {spaces.map((s) => (
                        <option key={s.slug} value={s.slug}>{s.icon} {s.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <input
                  type="text"
                  value={formProject}
                  onChange={(e) => setFormProject(e.target.value)}
                  placeholder="Project (optional)"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
                />

                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="Tags (comma separated)"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !formTitle.trim() || !formContent.trim()}
                  className="rounded-lg bg-neon/[0.15] px-4 py-1.5 text-xs font-medium text-neon transition-all hover:bg-neon/[0.25] disabled:opacity-40"
                >
                  {saving ? 'Saving...' : editingMemory ? 'Update' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
