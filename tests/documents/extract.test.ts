import { describe, it, expect, vi } from 'vitest'

// Mock the dynamic imports before importing the module
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    text: string
    constructor() { this.text = 'Extracted PDF text' }
    async getText() { return { text: this.text } }
    async destroy() {}
  },
}))

vi.mock('tesseract.js', () => ({
  default: {
    createWorker: vi.fn().mockResolvedValue({
      recognize: vi.fn().mockResolvedValue({ data: { text: 'Extracted OCR text' } }),
      terminate: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

import { extractText } from '@/lib/documents/extract'

describe('extractText', () => {
  it('returns empty string for unsupported mime types', async () => {
    const buffer = Buffer.from('test')
    const result = await extractText(buffer, 'text/plain')
    expect(result).toBe('')
  })

  it('returns empty string for unknown mime types', async () => {
    const buffer = Buffer.from('test')
    const result = await extractText(buffer, 'application/octet-stream')
    expect(result).toBe('')
  })

  it('calls PDF extraction for application/pdf', async () => {
    const buffer = Buffer.from('fake pdf content')
    const result = await extractText(buffer, 'application/pdf')
    expect(result).toBe('Extracted PDF text')
  })

  it('calls image extraction for image/* mime types', async () => {
    const buffer = Buffer.from('fake image data')
    const result = await extractText(buffer, 'image/png')
    expect(result).toBe('Extracted OCR text')
  })

  it('handles image/jpeg mime type', async () => {
    const buffer = Buffer.from('fake jpeg data')
    const result = await extractText(buffer, 'image/jpeg')
    expect(result).toBe('Extracted OCR text')
  })

  it('handles image/webp mime type', async () => {
    const buffer = Buffer.from('fake webp data')
    const result = await extractText(buffer, 'image/webp')
    expect(result).toBe('Extracted OCR text')
  })
})
