import { describe, it, expect } from 'vitest'
import { SaveMemorySchema, ConsolidateMemoriesSchema } from '@/lib/memory/types'

describe('SaveMemorySchema — force param', () => {
  it('should accept force: true', () => {
    const result = SaveMemorySchema.safeParse({
      title: 'Test',
      content: 'Test content',
      force: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.force).toBe(true)
    }
  })

  it('should default force to false', () => {
    const result = SaveMemorySchema.safeParse({
      title: 'Test',
      content: 'Test content',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.force).toBe(false)
    }
  })
})

describe('ConsolidateMemoriesSchema', () => {
  it('should accept mode: duplicates', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ mode: 'duplicates' })
    expect(result.success).toBe(true)
  })

  it('should accept mode: stale', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ mode: 'stale' })
    expect(result.success).toBe(true)
  })

  it('should accept mode: both', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ mode: 'both' })
    expect(result.success).toBe(true)
  })

  it('should default mode to both', () => {
    const result = ConsolidateMemoriesSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mode).toBe('both')
    }
  })

  it('should accept optional space slug', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ space: 'personal', mode: 'stale' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.space).toBe('personal')
    }
  })

  it('should reject invalid mode', () => {
    const result = ConsolidateMemoriesSchema.safeParse({ mode: 'invalid' })
    expect(result.success).toBe(false)
  })
})
