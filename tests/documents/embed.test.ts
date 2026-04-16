import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock OpenAI
vi.mock('openai', () => ({
  default: class {
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [
          { embedding: [0.1, 0.2, 0.3] },
          { embedding: [0.4, 0.5, 0.6] },
        ],
      }),
    }
  },
}))

import { generateEmbeddings, generateEmbedding } from '@/lib/documents/embed'

describe('generateEmbeddings', () => {
  it('returns empty array for empty input', async () => {
    const result = await generateEmbeddings([])
    expect(result).toEqual([])
  })

  it('returns embeddings for text array', async () => {
    const result = await generateEmbeddings(['hello', 'world'])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual([0.1, 0.2, 0.3])
    expect(result[1]).toEqual([0.4, 0.5, 0.6])
  })
})

describe('generateEmbedding', () => {
  it('returns single embedding vector', async () => {
    const result = await generateEmbedding('hello')
    expect(result).toEqual([0.1, 0.2, 0.3])
  })
})
