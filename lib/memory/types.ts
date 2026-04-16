import { z } from 'zod'

// ── Category enum ──────────────────────────────────────────

export const MemoryCategoryEnum = z.enum([
  'preference', 'rule', 'project', 'decision',
  'context', 'snippet', 'note', 'persona',
])

export type MemoryCategory = z.infer<typeof MemoryCategoryEnum>

// ── Source enum ─────────────────────────────────────────────

export const MemorySourceEnum = z.enum(['manual', 'auto', 'consolidated'])
export type MemorySource = z.infer<typeof MemorySourceEnum>

// ── Tool input schemas ─────────────────────────────────────

export const SaveMemorySchema = z.object({
  space: z.string().min(1).default('personal').describe('Space slug (default: "personal")'),
  title: z.string().min(1).max(255).describe('Memory title'),
  content: z.string().min(1).max(10000).describe('Memory content — the knowledge to store'),
  category: MemoryCategoryEnum.default('note').describe('Category (default: note)'),
  tags: z.array(z.string()).default([]).describe('Tags for organizing'),
  project: z.string().optional().describe('Optional project scope (e.g., "memory-mcp", "apmt-pricing")'),
})

export const SearchMemorySchema = z.object({
  query: z.string().min(1).max(500).describe('Natural language search query'),
  space: z.string().optional().describe('Filter by space slug'),
  category: MemoryCategoryEnum.optional().describe('Filter by category'),
  project: z.string().optional().describe('Filter by project'),
  limit: z.number().int().min(1).max(20).default(5).describe('Max results (default: 5)'),
})

export const ListMemoriesSchema = z.object({
  space: z.string().optional().describe('Filter by space slug'),
  category: MemoryCategoryEnum.optional().describe('Filter by category'),
  project: z.string().optional().describe('Filter by project'),
  tag: z.string().optional().describe('Filter by tag'),
  limit: z.number().int().min(1).max(50).default(20).describe('Max results (default: 20)'),
  offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
})

export const GetMemorySchema = z.object({
  memory_id: z.string().uuid().describe('UUID of the memory'),
})

export const UpdateMemorySchema = z.object({
  memory_id: z.string().uuid().describe('UUID of the memory'),
  title: z.string().min(1).max(255).optional().describe('New title'),
  content: z.string().min(1).max(10000).optional().describe('New content'),
  category: MemoryCategoryEnum.optional().describe('New category'),
  tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
  project: z.string().nullable().optional().describe('New project or null to clear'),
  space: z.string().optional().describe('Move to different space (by slug)'),
})

export const DeleteMemorySchema = z.object({
  memory_id: z.string().uuid().describe('UUID of the memory to soft-delete'),
})

export const GetContextSchema = z.object({
  project: z.string().min(1).describe('Project name to get context for'),
})

export const GetRulesSchema = z.object({
  project: z.string().optional().describe('Optional project to scope rules to'),
})

export const CreateSpaceSchema = z.object({
  name: z.string().min(1).max(100).describe('Space display name'),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).describe('URL-safe slug (lowercase, hyphens only)'),
  description: z.string().max(500).optional().describe('Space description'),
  icon: z.string().max(10).default('🧠').describe('Emoji icon'),
})

// ── Database row types ─────────────────────────────────────

export interface MemorySpace {
  id: string
  user_id: string
  name: string
  slug: string
  description: string | null
  icon: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface MemoryItem {
  id: string
  space_id: string
  user_id: string
  title: string
  content: string
  category: MemoryCategory
  tags: string[]
  project: string | null
  valid_at: string
  invalid_at: string | null
  source: MemorySource
  importance: number
  parent_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Default spaces ─────────────────────────────────────────

export const DEFAULT_SPACES = [
  {
    name: 'Personal',
    slug: 'personal',
    description: 'Preferences, patterns, persona, form-fill data',
    icon: '👤',
  },
  {
    name: 'Projects',
    slug: 'projects',
    description: 'CLAUDE.md, rules, decisions, gotchas per project',
    icon: '📁',
  },
] as const
