import { describe, it, expect } from 'vitest'
import { buildStoragePath } from '@/lib/documents/storage'

describe('buildStoragePath', () => {
  it('creates path with userId and fileName', () => {
    const before = Date.now()
    const result = buildStoragePath('user-123', 'test-file.pdf')
    const after = Date.now()

    expect(result).toMatch(/^user-123\/\d+-test-file\.pdf$/)

    // Verify timestamp is in valid range
    const timestamp = parseInt(result.split('/')[1].split('-')[0])
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })

  it('preserves special characters in filename', () => {
    const result = buildStoragePath('user-456', 'my document (1).pdf')
    expect(result).toContain('user-456/')
    expect(result).toContain('my document (1).pdf')
  })

  it('handles different user IDs', () => {
    const r1 = buildStoragePath('user-a', 'file.pdf')
    const r2 = buildStoragePath('user-b', 'file.pdf')
    expect(r1).toMatch(/^user-a\//)
    expect(r2).toMatch(/^user-b\//)
  })
})

// Storage functions that depend on supabase are tested via integration
// but we can test that they properly re-export
describe('storage module exports', () => {
  it('exports all expected functions', async () => {
    const storage = await import('@/lib/documents/storage')
    expect(typeof storage.buildStoragePath).toBe('function')
    expect(typeof storage.createSignedUploadUrl).toBe('function')
    expect(typeof storage.getSignedUrl).toBe('function')
    expect(typeof storage.downloadFile).toBe('function')
    expect(typeof storage.deleteFile).toBe('function')
  })
})
