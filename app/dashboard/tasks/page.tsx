'use client'

import { useEffect, useState, useCallback, type FormEvent } from 'react'
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
  completed_at: string | null
}

interface TaskForm {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  due_date: string
  tags: string
}

const emptyTaskForm: TaskForm = { title: '', description: '', priority: 'medium', due_date: '', tags: '' }

const statusColors: Record<Task['status'], string> = {
  pending: 'bg-white/[0.04] text-text-secondary border-white/[0.06]',
  in_progress: 'bg-white/[0.04] text-text-secondary border-white/[0.06]',
  completed: 'bg-neon/[0.08] text-neon border-neon/[0.12]',
}

const priorityColors: Record<Task['priority'], string> = {
  high: 'bg-white/[0.04] text-red-400',
  medium: 'bg-white/[0.04] text-text-secondary',
  low: 'bg-white/[0.04] text-text-muted',
}

const statusCycle: Record<Task['status'], Task['status']> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'pending',
}

const filters = ['all', 'pending', 'in_progress', 'completed'] as const
const inputClass = 'w-full px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] text-text-primary text-[14px] placeholder:text-text-muted focus:outline-none focus:border-neon/30 focus:ring-1 focus:ring-neon/20'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null)
  const [toast, setToast] = useState('')

  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2000)
  }, [])

  const loadTasks = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    let query = supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)

    const { data } = await query
    setTasks((data ?? []) as Task[])
    setLoading(false)
  }, [filter])

  useEffect(() => { loadTasks() }, [loadTasks])

  function openCreateModal() {
    setEditingTask(null)
    setTaskForm(emptyTaskForm)
    setShowTaskModal(true)
  }

  function openEditModal(task: Task) {
    setEditingTask(task)
    setTaskForm({
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      due_date: task.due_date ?? '',
      tags: task.tags?.join(', ') ?? '',
    })
    setShowTaskModal(true)
  }

  async function cycleStatus(task: Task) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const newStatus = statusCycle[task.status]
    const updates: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() }
    updates.completed_at = newStatus === 'completed' ? new Date().toISOString() : null

    const { error } = await supabase.from('tasks').update(updates).eq('id', task.id).eq('user_id', user.id)
    if (error) {
      showToast(error.message)
      return
    }

    await loadTasks()
    showToast('Task status updated')
  }

  async function completeTask(task: Task) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: now, updated_at: now })
      .eq('id', task.id)
      .eq('user_id', user.id)

    if (error) {
      showToast(error.message)
      return
    }

    await loadTasks()
    showToast('Task completed')
  }

  async function saveTask(e: FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      priority: taskForm.priority,
      due_date: taskForm.due_date || null,
      tags: taskForm.tags ? taskForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      updated_at: new Date().toISOString(),
    }

    const { error } = editingTask
      ? await supabase.from('tasks').update(payload).eq('id', editingTask.id).eq('user_id', user.id)
      : await supabase.from('tasks').insert({ ...payload, user_id: user.id })

    if (error) {
      showToast(error.message)
      return
    }

    setTaskForm(emptyTaskForm)
    setEditingTask(null)
    setShowTaskModal(false)
    await loadTasks()
    showToast(editingTask ? 'Task updated' : 'Task created')
  }

  async function deleteTask() {
    if (!deleteTaskTarget) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', deleteTaskTarget.id)
      .eq('user_id', user.id)

    if (error) {
      showToast(error.message)
      return
    }

    setDeleteTaskTarget(null)
    await loadTasks()
    showToast('Task deleted')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-bold text-text-primary tracking-[-0.02em]">Tasks</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all"
        >
          New Task
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {filters.map((filterName) => (
          <button
            key={filterName}
            onClick={() => setFilter(filterName)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              filter === filterName ? 'bg-neon/[0.1] text-neon' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {filterName === 'all' ? 'All' : filterName.replace('_', ' ')}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <p className="text-text-muted">No tasks found. Create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium ${task.status === 'completed' ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                    {task.title}
                  </h3>
                  {task.description && <p className="text-xs text-text-muted mt-1 truncate">{task.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-text-muted">Due: {new Date(task.due_date).toLocaleDateString('en-IN')}</span>
                    )}
                    {task.tags?.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-text-muted">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {task.status !== 'completed' && (
                    <button
                      onClick={() => completeTask(task)}
                      aria-label={`Complete ${task.title}`}
                      className="h-8 w-8 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-bold transition-all"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    onClick={() => cycleStatus(task)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all hover:opacity-80 ${statusColors[task.status]}`}
                  >
                    {task.status.replace('_', ' ')}
                  </button>
                  <button
                    onClick={() => openEditModal(task)}
                    aria-label={`Edit ${task.title}`}
                    className="h-8 w-8 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary hover:border-white/[0.12] transition-all"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeleteTaskTarget(task)}
                    aria-label={`Delete ${task.title}`}
                    className="h-8 w-8 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] transition-all"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showTaskModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setShowTaskModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-4">{editingTask ? 'Edit Task' : 'New Task'}</h2>
              <form onSubmit={saveTask} className="space-y-3">
                <input
                  type="text"
                  placeholder="Task title"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  required
                  className={inputClass}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as TaskForm['priority'] })}
                    className={inputClass}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Tags (comma-separated)"
                  value={taskForm.tags}
                  onChange={(e) => setTaskForm({ ...taskForm, tags: e.target.value })}
                  className={inputClass}
                />
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-neon text-bg-primary hover:bg-neon-muted text-sm font-semibold transition-all">
                    {editingTask ? 'Save' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTaskModal(false)}
                    className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTaskTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteTaskTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-text-primary mb-2">Delete this task?</h2>
              <p className="text-sm text-text-muted mb-5">{deleteTaskTarget.title}</p>
              <div className="flex gap-2">
                <button
                  onClick={deleteTask}
                  className="flex-1 py-2 rounded-lg bg-red-500/[0.1] text-red-400 border border-red-500/[0.15] hover:bg-red-500/[0.2] text-sm transition-all"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteTaskTarget(null)}
                  className="px-4 py-2 rounded-lg border border-white/[0.08] text-text-secondary hover:text-text-primary text-sm transition-all"
                >
                  Cancel
                </button>
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
