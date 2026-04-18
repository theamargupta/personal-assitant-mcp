import { describe, it, expect } from 'vitest'
import { isAuthError } from '@/lib/finance/auth'
import { NextResponse } from 'next/server'

// We test isAuthError directly; authenticateRequest requires real Supabase

describe('isAuthError', () => {
  it('returns true for NextResponse instances', () => {
    const response = NextResponse.json({ error: 'test' }, { status: 401 })
    expect(isAuthError(response)).toBe(true)
  })

  it('returns false for userId objects', () => {
    const result = { userId: 'test-user-id' }
    expect(isAuthError(result)).toBe(false)
  })

  it('returns false for objects with userId property', () => {
    expect(isAuthError({ userId: '123' })).toBe(false)
    expect(isAuthError({ userId: 'abc-def' })).toBe(false)
  })
})
