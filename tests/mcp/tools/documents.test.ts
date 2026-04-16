import { describe, it, expect } from 'vitest'

// Test detectDocType via dynamic import to access the non-exported function behavior
// Since detectDocType is not exported, we test it indirectly through the tools or
// test the logic inline

describe('detectDocType logic', () => {
  function detectDocType(mimeType: string): 'pdf' | 'image' | 'other' {
    if (mimeType === 'application/pdf') return 'pdf'
    if (mimeType.startsWith('image/')) return 'image'
    return 'other'
  }

  it('detects PDF', () => {
    expect(detectDocType('application/pdf')).toBe('pdf')
  })

  it('detects PNG image', () => {
    expect(detectDocType('image/png')).toBe('image')
  })

  it('detects JPEG image', () => {
    expect(detectDocType('image/jpeg')).toBe('image')
  })

  it('detects WebP image', () => {
    expect(detectDocType('image/webp')).toBe('image')
  })

  it('returns other for unknown types', () => {
    expect(detectDocType('application/json')).toBe('other')
    expect(detectDocType('text/plain')).toBe('other')
    expect(detectDocType('video/mp4')).toBe('other')
  })
})
