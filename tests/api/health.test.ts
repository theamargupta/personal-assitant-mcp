import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.service).toBe('pa-mcp')
    expect(body.version).toBe('0.1.0')
    expect(body.timestamp).toBeTruthy()
  })

  it('returns a valid ISO timestamp', async () => {
    const response = await GET()
    const body = await response.json()

    const parsed = new Date(body.timestamp)
    expect(parsed.toString()).not.toBe('Invalid Date')
  })
})
