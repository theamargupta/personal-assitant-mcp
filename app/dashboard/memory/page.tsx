'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_SPACES } from '@/lib/memory/types'
import { Card, Chip, DashboardHero, EmptyState, SectionHeader, StatCard } from '@/components/dashboard/kit'

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

  const ruleMemories = filtered.filter((memory) => memory.category === 'rule')
  const spacesWithMemories = new Set(memories.map((memory) => memory.space_id)).size

  return (
    <div className="space-y-8">
      <DashboardHero
        eyebrow="MEMORY"
        title="Your second brain"
        subtitle="Rules, context, decisions, and project notes in a grid you can scan fast."
        right={
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={activeSpace ?? ''} onChange={(e) => setActiveSpace(e.target.value || null)} className="rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-text-primary outline-none">
              {spaces.map((space) => <option key={space.slug} value={space.slug}>{space.icon} {space.name}</option>)}
            </select>
            <button type="button" onClick={() => setShowCreateModal(true)} className="rounded-full bg-neon px-5 py-3 text-sm font-semibold text-bg-primary">+ Save memory</button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Memories" value={memories.length} hint="current view" accent="neon" />
        <StatCard label="Spaces" value={spacesWithMemories || spaces.length} hint="available vaults" accent="blue" />
        <StatCard label="Rules" value={memories.filter((memory) => memory.category === 'rule').length} hint="pinned behavior" accent="orange" />
      </div>

      <Card className="p-4">
        <div className="space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories, projects, snippets"
            className="w-full rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-neon/30 focus:outline-none"
          />
          <div className="flex gap-1.5 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button type="button" key={cat} onClick={() => setActiveCategory(cat)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-medium capitalize transition-all ${activeCategory === cat ? 'border-neon/20 bg-neon/[0.08] text-neon' : 'border-white/[0.05] text-text-muted hover:text-text-primary'}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {ruleMemories.length > 0 && (
        <section>
          <SectionHeader eyebrow="PINNED" title="Rules" />
          <div className="flex gap-3 overflow-x-auto pb-1">
            {ruleMemories.slice(0, 6).map((memory) => (
              <Card key={memory.id} className="min-w-[260px] p-4">
                <Chip variant="status-completed">rule</Chip>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-text-secondary">{memory.content}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader eyebrow="MEMORY GRID" title="Saved context" />
        {filtered.length === 0 ? (
          <EmptyState title="No memories yet" copy="Save one preference, rule, or decision and it will show up here." action={<button type="button" onClick={() => setShowCreateModal(true)} className="rounded-full bg-neon px-4 py-2 text-xs font-semibold text-bg-primary">Save memory</button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((memory) => (
                <motion.div key={memory.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card hoverable className="group h-full p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-text-primary">{memory.title}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Chip variant={memory.category === 'rule' ? 'status-completed' : 'tag'}>{memory.category}</Chip>
                          {memory.project && <Chip variant="status-in-progress">{memory.project}</Chip>}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        <button type="button" onClick={() => openEdit(memory)} className="h-8 w-8 rounded-full border border-white/[0.06] text-text-muted hover:text-text-primary">✎</button>
                        <button type="button" onClick={() => void handleDelete(memory.id)} className="h-8 w-8 rounded-full border border-red-500/[0.15] bg-red-500/[0.08] text-red-400">×</button>
                      </div>
                    </div>
                    <p className="line-clamp-3 text-xs leading-6 text-text-secondary">{memory.content}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {memory.tags.slice(0, 4).map((tag) => <Chip key={tag} variant="tag">#{tag}</Chip>)}
                    </div>
                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
                        <span>Importance</span>
                        <span>{memory.importance}/10</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.04]"><div className="h-full rounded-full bg-neon" style={{ width: `${Math.min(100, memory.importance * 10)}%` }} /></div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

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
