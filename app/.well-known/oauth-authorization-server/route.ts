import { NextRequest, NextResponse } from 'next/server'
import { buildOAuthMetadata } from '@/lib/mcp/oauth'

export async function GET(request: NextRequest) {
  return NextResponse.json(buildOAuthMetadata(request.nextUrl.origin))
}
