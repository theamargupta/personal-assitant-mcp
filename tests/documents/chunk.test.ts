import { describe, it, expect } from 'vitest'
import { chunkText, type TextChunk } from '@/lib/documents/chunk'

describe('chunkText', () => {
  it('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  it('returns single chunk for short text', () => {
    const result = chunkText('Hello, this is a short text.')
    expect(result).toHaveLength(1)
    expect(result[0].index).toBe(0)
    expect(result[0].content).toBe('Hello, this is a short text.')
    expect(result[0].tokenCount).toBeGreaterThan(0)
  })

  it('calculates token count as ceil(length / 4)', () => {
    const text = 'abcd' // 4 chars = 1 token
    const result = chunkText(text)
    expect(result[0].tokenCount).toBe(1)
  })

  it('splits text by paragraphs', () => {
    const paragraphs = Array(10).fill('A'.repeat(300)).join('\n\n')
    const result = chunkText(paragraphs)
    expect(result.length).toBeGreaterThan(1)
  })

  it('maintains sequential indices', () => {
    const paragraphs = Array(10).fill('B'.repeat(300)).join('\n\n')
    const result = chunkText(paragraphs)
    for (let i = 0; i < result.length; i++) {
      expect(result[i].index).toBe(i)
    }
  })

  it('handles single large paragraph by splitting on sentences', () => {
    // Create a very large single paragraph (no paragraph breaks)
    const sentences = Array(100).fill('This is a sentence that is reasonably long.').join(' ')
    const result = chunkText(sentences)
    expect(result.length).toBeGreaterThan(1)
  })

  it('each chunk has content, index, and tokenCount', () => {
    const text = 'Hello world.\n\nAnother paragraph.'
    const result = chunkText(text)
    for (const chunk of result) {
      expect(chunk).toHaveProperty('content')
      expect(chunk).toHaveProperty('index')
      expect(chunk).toHaveProperty('tokenCount')
      expect(typeof chunk.content).toBe('string')
      expect(typeof chunk.index).toBe('number')
      expect(typeof chunk.tokenCount).toBe('number')
    }
  })

  it('preserves all text content across chunks', () => {
    const paragraphs = ['First paragraph.', 'Second paragraph.', 'Third paragraph.']
    const text = paragraphs.join('\n\n')
    const result = chunkText(text)
    // Each paragraph should appear in at least one chunk
    for (const p of paragraphs) {
      const found = result.some(chunk => chunk.content.includes(p))
      expect(found).toBe(true)
    }
  })

  it('handles text with multiple blank lines', () => {
    const text = 'First.\n\n\n\nSecond.\n\n\n\n\nThird.'
    const result = chunkText(text)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].content).toContain('First.')
  })

  it('trims chunk content', () => {
    const text = '  Hello world.  '
    const result = chunkText(text)
    expect(result[0].content).toBe('Hello world.')
  })
})
