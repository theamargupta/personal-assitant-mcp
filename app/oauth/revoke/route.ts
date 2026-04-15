import { NextRequest, NextResponse } from 'next/server'
import { revokeOAuthToken } from '@/lib/mcp/oauth'

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const token = form?.get('token')

  if (typeof token === 'string' && token) {
    await revokeOAuthToken(token)
  }

  // RFC 7009: always return 200
  return new NextResponse(null, { status: 200 })
}
