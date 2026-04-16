import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { listMemories, saveMemory } from '@/lib/memory/items'
import type { MemoryCategory } from '@/lib/memory/types'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const params = request.nextUrl.searchParams

  try {
    const memories = await listMemories({
      userId: auth.userId,
      spaceSlug: params.get('space') || undefined,
      category: params.get('category') || undefined,
      project: params.get('project') || undefined,
      tag: params.get('tag') || undefined,
      limit: Math.min(Number(params.get('limit')) || 30, 100),
      offset: Number(params.get('offset')) || 0,
    })

    return NextResponse.json({ memories })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list memories' },
      { status: 500 }
    )
  }
}

const VALID_CATEGORIES: MemoryCategory[] = [
  'preference', 'rule', 'project', 'decision', 'context', 'snippet', 'note', 'persona',
]

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!title || !content) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 })
  }

  const rawCategory = (body.category as string) || 'note'
  const category: MemoryCategory = VALID_CATEGORIES.includes(rawCategory as MemoryCategory)
    ? (rawCategory as MemoryCategory)
    : 'note'

  try {
    const result = await saveMemory({
      userId: auth.userId,
      spaceSlug: (body.space as string) || 'personal',
      title,
      content,
      category,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
      project: body.project ? String(body.project) : undefined,
      importance: body.importance ? Number(body.importance) : undefined,
      force: body.force === true,
    })

    return NextResponse.json(result, { status: result.status === 'saved' ? 201 : 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save memory' },
      { status: 500 }
    )
  }
}
