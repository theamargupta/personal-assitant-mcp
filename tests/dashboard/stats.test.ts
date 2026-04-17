import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentStreakFromLogs,
  istMonthStartISO,
  istWeekRange,
  maxCurrentStreak,
} from '@/types'

afterEach(() => {
  vi.useRealTimers()
})

describe('istWeekRange (Mon → Sun IST)', () => {
  it('returns Mon..Sun for a Friday', () => {
    expect(istWeekRange('2026-04-17')).toEqual({ startDate: '2026-04-13', endDate: '2026-04-19' })
  })

  it('returns Mon..Sun for a Monday (same day start)', () => {
    expect(istWeekRange('2026-04-13')).toEqual({ startDate: '2026-04-13', endDate: '2026-04-19' })
  })

  it('returns Mon..Sun for a Sunday (Sunday closes the week)', () => {
    expect(istWeekRange('2026-04-19')).toEqual({ startDate: '2026-04-13', endDate: '2026-04-19' })
  })

  it('follows todayISTDate when called with no arg at UTC 23:00 on Apr 16 (IST Apr 17)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-16T23:00:00.000Z'))
    expect(istWeekRange()).toEqual({ startDate: '2026-04-13', endDate: '2026-04-19' })
  })
})

describe('istMonthStartISO', () => {
  it('returns UTC ISO for 00:00 IST on 1st of current month', () => {
    // 00:00 IST on Apr 1 2026 = 18:30 UTC on Mar 31 2026
    expect(istMonthStartISO('2026-04-17')).toBe('2026-03-31T18:30:00.000Z')
  })

  it('picks the right month when called at UTC 23:00 Apr 30 (IST May 1)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-30T23:00:00.000Z'))
    expect(istMonthStartISO()).toBe('2026-04-30T18:30:00.000Z')
  })
})

describe('currentStreakFromLogs', () => {
  it('returns 0 for empty logs', () => {
    expect(currentStreakFromLogs([], '2026-04-17')).toBe(0)
  })

  it('returns 1 when only today is logged', () => {
    expect(currentStreakFromLogs(['2026-04-17'], '2026-04-17')).toBe(1)
  })

  it('continues from yesterday when today not yet logged', () => {
    expect(currentStreakFromLogs(['2026-04-16', '2026-04-15'], '2026-04-17')).toBe(2)
  })

  it('resets when both today and yesterday missing', () => {
    expect(currentStreakFromLogs(['2026-04-14', '2026-04-13'], '2026-04-17')).toBe(0)
  })

  it('counts a 5-day run ending today', () => {
    expect(currentStreakFromLogs(
      ['2026-04-17', '2026-04-16', '2026-04-15', '2026-04-14', '2026-04-13'],
      '2026-04-17',
    )).toBe(5)
  })
})

describe('maxCurrentStreak across habits', () => {
  const habits = [
    { id: 'h1', archived: false },
    { id: 'h2', archived: false },
    { id: 'h3', archived: true }, // [TEST] habit — must be ignored
  ]

  it('returns max across non-archived habits', () => {
    const logs = new Map<string, Set<string>>([
      ['h1', new Set(['2026-04-17'])], // streak 1
      ['h2', new Set(['2026-04-17', '2026-04-16', '2026-04-15'])], // streak 3
    ])
    expect(maxCurrentStreak(habits, logs, '2026-04-17')).toBe(3)
  })

  it('ignores archived habit even if it has the longest streak', () => {
    const logs = new Map<string, Set<string>>([
      ['h1', new Set(['2026-04-17'])],
      ['h3', new Set(['2026-04-17', '2026-04-16', '2026-04-15', '2026-04-14', '2026-04-13'])],
    ])
    expect(maxCurrentStreak(habits, logs, '2026-04-17')).toBe(1)
  })

  it('returns 0 for user with no habit logs at all', () => {
    expect(maxCurrentStreak(habits, new Map(), '2026-04-17')).toBe(0)
  })

  it('does NOT merge dates across different habits (each streak is per-habit)', () => {
    // Without per-habit isolation, the merged set would be 4 consecutive days.
    // With per-habit isolation, the longest single-habit streak is 2.
    const logs = new Map<string, Set<string>>([
      ['h1', new Set(['2026-04-17', '2026-04-16'])],
      ['h2', new Set(['2026-04-15', '2026-04-14'])],
    ])
    expect(maxCurrentStreak(habits, logs, '2026-04-17')).toBe(2)
  })
})
