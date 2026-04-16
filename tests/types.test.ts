import { describe, it, expect } from 'vitest'
import { toIST, todayISTDate } from '@/types'

describe('toIST', () => {
  it('formats a date in IST locale', () => {
    const result = toIST(new Date('2025-01-15T10:30:00Z'))
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    // Should contain date components
    expect(result).toMatch(/\d{2}/)
  })

  it('defaults to current date when no argument', () => {
    const result = toIST()
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('produces consistent formatting', () => {
    const d = new Date('2025-06-15T12:00:00Z')
    const r1 = toIST(d)
    const r2 = toIST(d)
    expect(r1).toBe(r2)
  })
})

describe('todayISTDate', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayISTDate()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a valid date string', () => {
    const result = todayISTDate()
    const parsed = new Date(result)
    expect(parsed.toString()).not.toBe('Invalid Date')
  })
})
