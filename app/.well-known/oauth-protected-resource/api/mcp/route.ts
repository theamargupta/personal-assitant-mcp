import { NextRequest, NextResponse } from 'next/server'
import { buildProtectedResourceMetadata } from '@/lib/mcp/oauth'

export async function GET(request: NextRequest) {
  return NextResponse.json(buildProtectedResourceMetadata(request.nextUrl.origin))
}
