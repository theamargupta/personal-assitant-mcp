import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayISTDate, toIST } from '@/types'

afterEach(() => {
  vi.useRealTimers()
})

describe('IST date helpers', () => {
  it('todayISTDate returns YYYY-MM-DD in IST', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T06:30:00.000Z'))

    const result = todayISTDate()

    expect(result).toBe('2026-04-16')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('todayISTDate at UTC midnight returns correct IST date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T18:45:00.000Z'))

    expect(todayISTDate()).toBe('2026-04-16')
  })

  it('toIST formats a known UTC date in IST', () => {
    const result = toIST(new Date('2026-04-16T06:30:00.000Z'))

    expect(result).toBe('16/04/2026, 12:00:00')
  })
})
