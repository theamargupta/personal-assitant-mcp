import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { toIST } from '@/types'
import {
  saveMemory,
  searchMemories,
  listMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  getContext,
  getRules,
} from '@/lib/memory/items'
import { createSpace, listSpaces } from '@/lib/memory/spaces'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { MemoryCategoryEnum } from '@/lib/memory/types'

function logAccess(userId: string, action: string, toolName: string, query?: string, memoryIds?: string[]) {
  const supabase = createServiceRoleClient()
  void (async () => {
    try {
      await supabase.from('pa_memory_access_log').insert({
        user_id: userId,
        action,
        tool_name: toolName,
        query: query || null,
        memory_ids: memoryIds || null,
      })
    } catch {
      /* best-effort logging */
    }
  })()
}

export function registerMemoryTools(server: McpServer) {

  // ── save_memory ──────────────────────────────────────────

  server.tool(
    'save_memory',
    'Store a new memory with content, category, tags, and optional project scope.',
    {
      space: z.string().min(1).default('personal').describe('Space slug (default: "personal")'),
      title: z.string().min(1).max(255).describe('Memory title'),
      content: z.string().min(1).max(10000).describe('Memory content — the knowledge to store'),
      category: MemoryCategoryEnum.default('note').describe('Category (default: note)'),
      tags: z.array(z.string()).default([]).describe('Tags for organizing'),
      project: z.string().optional().describe('Optional project scope'),
    },
    async ({ space, title, content, category, tags, project }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const memory = await saveMemory({
          userId,
          spaceSlug: space,
          title,
          content,
          category,
          tags,
          project,
        })

        logAccess(userId, 'save', 'save_memory', title, [memory.id])

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              memory_id: memory.id,
              title: memory.title,
              category: memory.category,
              space,
              project: memory.project,
              created_at: toIST(new Date(memory.created_at)),
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── search_memory ────────────────────────────────────────

  server.tool(
    'search_memory',
    'Semantic search across all memories using natural language query. Uses AI-powered vector similarity.',
    {
      query: z.string().min(1).max(500).describe('Natural language search query'),
      space: z.string().optional().describe('Filter by space slug'),
      category: MemoryCategoryEnum.optional().describe('Optional category filter'),
      project: z.string().optional().describe('Optional project filter'),
      limit: z.number().int().min(1).max(20).default(5).describe('Max results (default: 5)'),
    },
    async ({ query, space, category, project, limit }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const results = await searchMemories({
          userId,
          query,
          spaceSlug: space,
          category,
          project,
          limit,
        })

        logAccess(userId, 'search', 'search_memory', query, results.map(r => r.id))

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              results: results.map((r) => ({
                id: r.id,
                title: r.title,
                content: r.content,
                category: r.category,
                tags: r.tags,
                project: r.project,
                space: r.space_slug,
                similarity: Math.round(r.similarity * 1000) / 1000,
              })),
              count: results.length,
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── list_memories ────────────────────────────────────────

  server.tool(
    'list_memories',
    'Browse memories by category, tags, project, or date range.',
    {
      space: z.string().optional().describe('Filter by space slug'),
      category: MemoryCategoryEnum.optional().describe('Filter by category'),
      project: z.string().optional().describe('Filter by project'),
      tag: z.string().optional().describe('Filter by tag'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results (default: 20)'),
      offset: z.number().int().min(0).default(0).describe('Offset for pagination'),
    },
    async ({ space, category, project, tag, limit, offset }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const memories = await listMemories({
          userId,
          spaceSlug: space,
          category,
          project,
          tag,
          limit,
          offset,
        })

        logAccess(userId, 'list', 'list_memories')

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              memories: memories.map((m) => ({
                id: m.id,
                title: m.title,
                content: m.content,
                category: m.category,
                tags: m.tags,
                project: m.project,
                updated_at: toIST(new Date(m.updated_at)),
              })),
              count: memories.length,
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── get_memory ───────────────────────────────────────────

  server.tool(
    'get_memory',
    'Retrieve a specific memory by ID.',
    {
      memory_id: z.string().uuid().describe('UUID of the memory'),
    },
    async ({ memory_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const memory = await getMemory(userId, memory_id)
      if (!memory) {
        return { content: [{ type: 'text' as const, text: 'Error: Memory not found' }], isError: true }
      }

      logAccess(userId, 'get', 'get_memory', undefined, [memory_id])

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id: memory.id,
            title: memory.title,
            content: memory.content,
            category: memory.category,
            tags: memory.tags,
            project: memory.project,
            valid_at: toIST(new Date(memory.valid_at)),
            source: memory.source,
            importance: memory.importance,
            created_at: toIST(new Date(memory.created_at)),
            updated_at: toIST(new Date(memory.updated_at)),
          }),
        }],
      }
    }
  )

  // ── update_memory ────────────────────────────────────────

  server.tool(
    'update_memory',
    'Modify title, content, tags, or category of an existing memory. PATCH semantics — omitted fields are left unchanged.',
    {
      memory_id: z.string().uuid().describe('UUID of the memory'),
      title: z.string().min(1).max(255).optional().describe('New title'),
      content: z.string().min(1).max(10000).optional().describe('New content'),
      category: MemoryCategoryEnum.optional().describe('New category'),
      tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
      project: z.string().nullable().optional().describe('New project or null to clear'),
      space: z.string().optional().describe('Move to different space (by slug)'),
    },
    async ({ memory_id, title, content, category, tags, project, space }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const updated = await updateMemory({
          userId,
          memoryId: memory_id,
          title,
          content,
          category,
          tags,
          project,
          spaceSlug: space,
        })

        logAccess(userId, 'update', 'update_memory', undefined, [memory_id])

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              memory_id: updated.id,
              title: updated.title,
              category: updated.category,
              updated_at: toIST(new Date(updated.updated_at)),
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── delete_memory ────────────────────────────────────────

  server.tool(
    'delete_memory',
    'Remove a memory (soft delete — sets is_active=false and invalid_at=now).',
    {
      memory_id: z.string().uuid().describe('UUID of the memory to delete'),
    },
    async ({ memory_id }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        await deleteMemory(userId, memory_id)
        logAccess(userId, 'delete', 'delete_memory', undefined, [memory_id])

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ deleted: true, memory_id }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── get_context ──────────────────────────────────────────

  server.tool(
    'get_context',
    'Fetch all memories for a specific project — instant project onboarding.',
    {
      project: z.string().min(1).describe('Project name to get context for'),
    },
    async ({ project }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const memories = await getContext(userId, project)
      logAccess(userId, 'get_context', 'get_context', project, memories.map(m => m.id))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            project,
            memories: memories.map((m) => ({
              id: m.id,
              title: m.title,
              content: m.content,
              category: m.category,
              tags: m.tags,
            })),
            count: memories.length,
          }),
        }],
      }
    }
  )

  // ── get_rules ────────────────────────────────────────────

  server.tool(
    'get_rules',
    'Fetch all rule-category memories — shortcut for .claude.md style rules. Optionally filter by project.',
    {
      project: z.string().optional().describe('Optional project to scope rules to'),
    },
    async ({ project }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const rules = await getRules(userId, project)
      logAccess(userId, 'get_rules', 'get_rules', project)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            rules: rules.map((r) => ({
              id: r.id,
              title: r.title,
              content: r.content,
              project: r.project,
              tags: r.tags,
            })),
            count: rules.length,
          }),
        }],
      }
    }
  )

  // ── create_space ─────────────────────────────────────────

  server.tool(
    'create_space',
    'Create a new memory space (vault) for organizing memories.',
    {
      name: z.string().min(1).max(100).describe('Space display name'),
      slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).describe('URL-safe slug (lowercase, hyphens only)'),
      description: z.string().max(500).optional().describe('Space description'),
      icon: z.string().max(10).default('🧠').describe('Emoji icon'),
    },
    async ({ name, slug, description, icon }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      try {
        const space = await createSpace(userId, name, slug, description, icon)
        logAccess(userId, 'create_space', 'create_space', name)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              space_id: space.id,
              name: space.name,
              slug: space.slug,
              icon: space.icon,
              created_at: toIST(new Date(space.created_at)),
            }),
          }],
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
      }
    }
  )

  // ── list_spaces ──────────────────────────────────────────

  server.tool(
    'list_spaces',
    'List all memory spaces for the authenticated user.',
    {},
    async (_params, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const spaces = await listSpaces(userId)
      logAccess(userId, 'list_spaces', 'list_spaces')

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            spaces: spaces.map((s) => ({
              id: s.id,
              name: s.name,
              slug: s.slug,
              description: s.description,
              icon: s.icon,
            })),
            count: spaces.length,
          }),
        }],
      }
    }
  )
}
