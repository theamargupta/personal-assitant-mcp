'use client'

import { useEffect, useState, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'

type TaskType = 'personal' | 'project'

interface Task {
  id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  tags: string[]
  task_type: TaskType
  project: string | null
  parent_task_id: string | null
  position: number | null
  created_at: string
  completed_at: string | null
}

interface TaskForm {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  due_date: string
  tags: string
  task_type: TaskType
  project: string
}

interface SubtaskProgress {
  completed: number
  total: number
  pct: number
}

const emptyTaskForm: TaskForm = { title: '', description: '', priority: 'medium', due_date: '', tags: '', task_type: 'personal', project: '' }

const DESCRIPTION_MAX = 10000

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
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, Task[]>>({})
  const [progressByParent, setProgressByParent] = useState<Record<string, SubtaskProgress>>({})
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'personal' | string>('all')
  const [projects, setProjects] = useState<string[]>([])
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

  const computeProgress = (subs: Task[]): SubtaskProgress => {
    const total = subs.length
    const completed = subs.filter(s => s.status === 'completed').length
    return { completed, total, pct: total === 0 ? 0 : Math.round((completed / total) * 100) }
  }

  const loadTasks = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .is('parent_task_id', null)
      .order('created_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    if (typeFilter === 'personal') query = query.eq('task_type', 'personal')
    else if (typeFilter !== 'all') query = query.eq('task_type', 'project').eq('project', typeFilter)

    const { data } = await query
    const rows = (data ?? []) as Task[]
    setTasks(rows)

    if (rows.length > 0) {
      const parentIds = rows.map(t => t.id)
      const { data: subRows } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .in('parent_task_id', parentIds)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })

      const grouped: Record<string, Task[]> = {}
      for (const row of (subRows ?? []) as Task[]) {
        if (!row.parent_task_id) continue
        ;(grouped[row.parent_task_id] ??= []).push(row)
      }
      setSubtasksByParent(grouped)

      const progressMap: Record<string, SubtaskProgress> = {}
      for (const t of rows) progressMap[t.id] = computeProgress(grouped[t.id] ?? [])
      setProgressByParent(progressMap)
    } else {
      setSubtasksByParent({})
      setProgressByParent({})
    }

    setLoading(false)
  }, [filter, typeFilter])

  useEffect(() => { loadTasks() }, [loadTasks])

  useEffect(() => {
    const loadProjects = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('pa_memory_items')
        .select('project')
        .eq('user_id', user.id)
        .not('project', 'is', null)
      const seen = new Set<string>()
      for (const row of (data ?? []) as Array<{ project: string | null }>) {
        if (row.project) seen.add(row.project)
      }
      setProjects([...seen].sort())
    }
    loadProjects()
  }, [])

  function toggleExpanded(taskId: string) {
    setExpandedParents(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

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
      task_type: task.task_type,
      project: task.project ?? '',
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

  async function toggleSubtaskComplete(subtask: Task) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const now = new Date().toISOString()
    const next = subtask.status === 'completed' ? 'pending' : 'completed'
    const updates: Record<string, unknown> = {
      status: next,
      updated_at: now,
      completed_at: next === 'completed' ? now : null,
    }

    const { error } = await supabase.from('tasks').update(updates).eq('id', subtask.id).eq('user_id', user.id)
    if (error) {
      showToast(error.message)
      return
    }

    await loadTasks()
    if (next === 'completed' && subtask.parent_task_id) {
      const siblings = subtasksByParent[subtask.parent_task_id] ?? []
      const willAllBeDone = siblings.every(s => s.id === subtask.id ? true : s.status === 'completed')
      if (willAllBeDone && siblings.length > 0) {
        showToast('All subtasks done — close the parent?')
      }
    }
  }

  async function addSubtask(parent: Task) {
    const title = (subtaskDrafts[parent.id] ?? '').trim()
    if (!title) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const siblings = subtasksByParent[parent.id] ?? []
    const maxPos = siblings.reduce((acc, s) => {
      const p = s.position ?? -1
      return p > acc ? p : acc
    }, -1)

    const { error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title,
      status: 'pending',
      priority: 'medium',
      tags: [],
      task_type: parent.task_type,
      project: parent.project,
      parent_task_id: parent.id,
      position: maxPos + 1,
    })

    if (error) {
      showToast(error.message)
      return
    }

    setSubtaskDrafts(prev => ({ ...prev, [parent.id]: '' }))
    await loadTasks()
  }

  function onSubtaskDraftKey(e: KeyboardEvent<HTMLInputElement>, parent: Task) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addSubtask(parent)
    }
  }

  async function deleteSubtask(subtask: Task) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('tasks').delete().eq('id', subtask.id).eq('user_id', user.id)
    if (error) {
      showToast(error.message)
      return
    }
    await loadTasks()
  }

  async function moveSubtask(parent: Task, index: number, direction: -1 | 1) {
    const list = subtasksByParent[parent.id] ?? []
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= list.length) return

    const reordered = [...list]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    for (let i = 0; i < reordered.length; i++) {
      await supabase
        .from('tasks')
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq('id', reordered[i].id)
        .eq('user_id', user.id)
    }

    await loadTasks()
  }

  async function saveTask(e: FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const isSubtaskEdit = Boolean(editingTask?.parent_task_id)
    const projectValue = taskForm.project.trim()
    if (!isSubtaskEdit && taskForm.task_type === 'project' && !projectValue) {
      showToast('Project is required when task type is "project"')
      return
    }

    const basePayload = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      priority: taskForm.priority,
      due_date: taskForm.due_date || null,
      tags: taskForm.tags ? taskForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      updated_at: new Date().toISOString(),
    }
    const payload = isSubtaskEdit
      ? basePayload
      : {
          ...basePayload,
          task_type: taskForm.task_type,
          project: taskForm.task_type === 'project' ? projectValue : null,
        }

    const { error } = editingTask
      ? await supabase.from('tasks').update(payload).eq('id', editingTask.id).eq('user_id', user.id)
      : await supabase.from('tasks').insert({ ...payload, user_id: user.id })

    if (error) {
      showToast(error.message)
      return
    }

    // Cascade task_type/project to subtasks when editing a top-level task
    if (editingTask && !editingTask.parent_task_id && 'task_type' in payload) {
      const subs = subtasksByParent[editingTask.id] ?? []
      if (subs.length > 0) {
        await supabase
          .from('tasks')
          .update({
            task_type: payload.task_type,
            project: payload.project,
            updated_at: new Date().toISOString(),
          })
          .eq('parent_task_id', editingTask.id)
          .eq('user_id', user.id)
      }
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

      <div className="flex flex-wrap gap-2 mb-3">
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

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${typeFilter === 'all' ? 'bg-neon/[0.1] text-neon' : 'text-text-muted hover:text-text-secondary'}`}
        >
          Any type
        </button>
        <button
          onClick={() => setTypeFilter('personal')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${typeFilter === 'personal' ? 'bg-neon/[0.1] text-neon' : 'text-text-muted hover:text-text-secondary'}`}
        >
          Personal
        </button>
        {projects.map((project) => (
          <button
            key={project}
            onClick={() => setTypeFilter(project)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${typeFilter === project ? 'bg-neon/[0.1] text-neon border border-neon/30' : 'text-text-muted hover:text-text-secondary border border-white/[0.06]'}`}
          >
            {project}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <p className="text-text-muted">No tasks found. Create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, i) => {
            const subs = subtasksByParent[task.id] ?? []
            const progress = progressByParent[task.id] ?? { completed: 0, total: 0, pct: 0 }
            const expanded = expandedParents.has(task.id)
            return (
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
                    <div className="flex flex-wrap gap-2 mt-2 items-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[task.priority]}`}>
                        {task.priority}
                      </span>
                      {task.task_type === 'project' && task.project && (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-neon/30 bg-neon/[0.06] text-neon">
                          {task.project}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="text-xs text-text-muted">Due: {new Date(task.due_date).toLocaleDateString('en-IN')}</span>
                      )}
                      {task.tags?.map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/[0.04] text-text-muted">{tag}</span>
                      ))}
                      {progress.total > 0 && (
                        <button
                          onClick={() => toggleExpanded(task.id)}
                          className={`text-xs px-2 py-0.5 rounded-full border transition-all ${progress.completed === progress.total ? 'border-neon/30 bg-neon/[0.08] text-neon' : 'border-white/[0.08] bg-white/[0.02] text-text-secondary hover:border-white/[0.16]'}`}
                        >
                          {expanded ? '▾' : '▸'} {progress.completed}/{progress.total}
                        </button>
                      )}
                      {progress.total === 0 && (
                        <button
                          onClick={() => toggleExpanded(task.id)}
                          className="text-xs px-2 py-0.5 rounded-full border border-dashed border-white/[0.08] text-text-muted hover:text-text-secondary hover:border-white/[0.16] transition-all"
                        >
                          + subtasks
                        </button>
                      )}
                    </div>
                    {progress.total > 0 && (
                      <div className="mt-3 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className="h-full bg-neon/60 transition-all"
                          style={{ width: `${progress.pct}%` }}
                        />
                      </div>
                    )}
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

                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 ml-2 pl-4 border-l border-white/[0.06] space-y-2">
                        {subs.map((sub, idx) => {
                          const meta: string[] = []
                          if (sub.priority !== 'medium') meta.push(sub.priority)
                          if (sub.due_date) meta.push(new Date(sub.due_date).toLocaleDateString('en-IN'))
                          return (
                            <div key={sub.id} className="flex items-center gap-2 group">
                              <button
                                onClick={() => toggleSubtaskComplete(sub)}
                                aria-label={`Toggle ${sub.title}`}
                                className={`h-5 w-5 rounded border flex-shrink-0 flex items-center justify-center transition-all ${sub.status === 'completed' ? 'bg-neon border-neon text-bg-primary' : 'border-white/[0.16] hover:border-neon/60'}`}
                              >
                                {sub.status === 'completed' && <span className="text-[10px] font-bold">✓</span>}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm truncate ${sub.status === 'completed' ? 'line-through text-text-muted' : 'text-text-secondary'}`}>
                                  {sub.title}
                                </div>
                                {meta.length > 0 && (
                                  <div className="text-[11px] text-text-muted truncate">{meta.join(' · ')}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => moveSubtask(task, idx, -1)}
                                  disabled={idx === 0}
                                  aria-label="Move up"
                                  className="h-6 w-6 rounded border border-white/[0.06] text-text-muted hover:text-text-primary hover:border-white/[0.16] disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => moveSubtask(task, idx, 1)}
                                  disabled={idx === subs.length - 1}
                                  aria-label="Move down"
                                  className="h-6 w-6 rounded border border-white/[0.06] text-text-muted hover:text-text-primary hover:border-white/[0.16] disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs"
                                >
                                  ↓
                                </button>
                                <button
                                  onClick={() => openEditModal(sub)}
                                  aria-label={`Edit ${sub.title}`}
                                  className="h-6 w-6 rounded border border-white/[0.06] text-text-muted hover:text-text-primary hover:border-white/[0.16] transition-all text-xs"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => deleteSubtask(sub)}
                                  aria-label={`Delete ${sub.title}`}
                                  className="h-6 w-6 rounded border border-red-500/[0.15] bg-red-500/[0.08] text-red-400 hover:bg-red-500/[0.15] transition-all text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          )
                        })}
                        <div className="flex items-center gap-2 pt-1">
                          <span className="h-5 w-5 rounded border border-dashed border-white/[0.1] flex-shrink-0" />
                          <input
                            type="text"
                            placeholder="Add subtask…"
                            value={subtaskDrafts[task.id] ?? ''}
                            onChange={(e) => setSubtaskDrafts(prev => ({ ...prev, [task.id]: e.target.value }))}
                            onKeyDown={(e) => onSubtaskDraftKey(e, task)}
                            className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted py-1"
                          />
                          {(subtaskDrafts[task.id] ?? '').trim().length > 0 && (
                            <button
                              onClick={() => addSubtask(task)}
                              className="text-xs px-2 py-0.5 rounded-lg bg-neon/[0.1] text-neon hover:bg-neon/[0.16] transition-all"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
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
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                {editingTask?.parent_task_id ? 'Edit Subtask' : editingTask ? 'Edit Task' : 'New Task'}
              </h2>
              {editingTask?.parent_task_id && (
                <p className="text-[11px] text-text-muted mb-3">
                  Type + project inherited from parent
                  {editingTask.task_type === 'project' && editingTask.project ? ` (${editingTask.project})` : ''}.
                </p>
              )}
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
                  placeholder="Description (optional, up to 10000 chars)"
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  rows={3}
                  maxLength={DESCRIPTION_MAX}
                  className={`${inputClass} resize-none`}
                />
                {taskForm.description.length >= 8000 && (
                  <p className="text-[11px] text-text-muted text-right">{taskForm.description.length} / {DESCRIPTION_MAX}</p>
                )}

                {!editingTask?.parent_task_id && (
                  <>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTaskForm({ ...taskForm, task_type: 'personal' })}
                        className={`flex-1 py-2 rounded-lg border text-sm transition-all ${taskForm.task_type === 'personal' ? 'bg-neon text-bg-primary border-neon' : 'border-white/[0.08] text-text-secondary hover:border-white/[0.16]'}`}
                      >
                        Personal
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskForm({ ...taskForm, task_type: 'project' })}
                        className={`flex-1 py-2 rounded-lg border text-sm transition-all ${taskForm.task_type === 'project' ? 'bg-neon text-bg-primary border-neon' : 'border-white/[0.08] text-text-secondary hover:border-white/[0.16]'}`}
                      >
                        Project
                      </button>
                    </div>

                    {taskForm.task_type === 'project' && (
                      <>
                        <input
                          type="text"
                          list="task-project-options"
                          placeholder="Project name (e.g. sathi)"
                          value={taskForm.project}
                          onChange={(e) => setTaskForm({ ...taskForm, project: e.target.value })}
                          required
                          className={inputClass}
                        />
                        <datalist id="task-project-options">
                          {projects.map((project) => <option key={project} value={project} />)}
                        </datalist>
                      </>
                    )}
                  </>
                )}
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
              <p className="text-sm text-text-muted mb-1">{deleteTaskTarget.title}</p>
              {(subtasksByParent[deleteTaskTarget.id]?.length ?? 0) > 0 && (
                <p className="text-xs text-red-400 mb-5">
                  Also deletes {subtasksByParent[deleteTaskTarget.id]?.length} subtask{subtasksByParent[deleteTaskTarget.id]?.length === 1 ? '' : 's'}.
                </p>
              )}
              {(subtasksByParent[deleteTaskTarget.id]?.length ?? 0) === 0 && <div className="mb-4" />}
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
