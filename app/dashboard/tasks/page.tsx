'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

interface Task {
  id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  tags: string[]
  created_at: string
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20',
  in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
  completed: 'bg-green-500/20 text-green-400 border-green-500/20',
}

const priorityColors: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-green-500/20 text-green-400',
}

const statusCycle: Record<string, string> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
}

const filters = ['all', 'pending', 'in_progress', 'completed'] as const

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', due_date: '', tags: '' })

  const loadTasks = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let query = supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)

    const { data } = await query
    setTasks(data ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => { loadTasks() }, [loadTasks])

  async function cycleStatus(task: Task) {
    const supabase = createClient()
    const newStatus = statusCycle[task.status]
    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() }
    if (newStatus === 'completed') updates.completed_at = new Date().toISOString()
    else updates.completed_at = null

    await supabase.from('tasks').update(updates).eq('id', task.id)
    loadTasks()
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('tasks').insert({
      user_id: user.id,
      title: newTask.title,
      description: newTask.description || null,
      priority: newTask.priority,
      due_date: newTask.due_date || null,
      tags: newTask.tags ? newTask.tags.split(',').map(t => t.trim()) : [],
    })

    setNewTask({ title: '', description: '', priority: 'medium', due_date: '', tags: '' })
    setShowNew(false)
    loadTasks()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <button
          onClick={() => setShowNew(true)}
          className="px-4 py-2 rounded-lg bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-medium transition-all"
        >
          New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              filter === f ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-text-muted">No tasks found. Create one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass rounded-xl p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium ${t.status === 'completed' ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                    {t.title}
                  </h3>
                  {t.description && <p className="text-xs text-text-muted mt-1 truncate">{t.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[t.priority]}`}>
                      {t.priority}
                    </span>
                    {t.due_date && (
                      <span className="text-xs text-text-muted">Due: {new Date(t.due_date).toLocaleDateString('en-IN')}</span>
                    )}
                    {t.tags?.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-text-muted">{tag}</span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => cycleStatus(t)}
                  className={`ml-3 text-xs px-2.5 py-1 rounded-full border transition-all hover:opacity-80 ${statusColors[t.status]}`}
                >
                  {t.status.replace('_', ' ')}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* New task modal */}
      <AnimatePresence>
        {showNew && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowNew(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold mb-4">New Task</h2>
              <form onSubmit={createTask} className="space-y-3">
                <input
                  type="text"
                  placeholder="Task title"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50 resize-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                    className="px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Tags (comma-separated)"
                  value={newTask.tags}
                  onChange={(e) => setNewTask({ ...newTask, tags: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#1f2937] border border-white/10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                />
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium">
                    Create
                  </button>
                  <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg border border-white/10 text-text-secondary text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
