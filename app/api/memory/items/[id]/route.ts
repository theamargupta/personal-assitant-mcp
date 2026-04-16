import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { updateMemory, deleteMemory } from '@/lib/memory/items'
import type { MemoryCategory } from '@/lib/memory/types'

export const runtime = 'nodejs'

const VALID_CATEGORIES: MemoryCategory[] = [
  'preference', 'rule', 'project', 'decision', 'context', 'snippet', 'note', 'persona',
]

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Parameters<typeof updateMemory>[0] = {
    userId: auth.userId,
    memoryId: id,
  }
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.content === 'string') patch.content = body.content
  if (typeof body.category === 'string' && VALID_CATEGORIES.includes(body.category as MemoryCategory)) {
    patch.category = body.category as MemoryCategory
  }
  if (Array.isArray(body.tags)) patch.tags = body.tags as string[]
  if (body.project !== undefined) patch.project = body.project === null ? null : String(body.project)
  if (typeof body.space === 'string') patch.spaceSlug = body.space

  try {
    const memory = await updateMemory(patch)
    return NextResponse.json({ memory })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth
  const { id } = await params

  try {
    await deleteMemory(auth.userId, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    )
  }
}
