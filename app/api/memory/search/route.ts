import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { searchMemories } from '@/lib/memory/items'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const params = request.nextUrl.searchParams
  const query = params.get('q') || ''
  if (!query.trim()) {
    return NextResponse.json({ error: 'query `q` is required' }, { status: 400 })
  }

  try {
    const results = await searchMemories({
      userId: auth.userId,
      query,
      spaceSlug: params.get('space') || undefined,
      category: params.get('category') || undefined,
      project: params.get('project') || undefined,
      limit: Math.min(Number(params.get('limit')) || 8, 20),
    })

    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}
