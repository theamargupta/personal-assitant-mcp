import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor() {}
    async getText() { return { text: 'PDF text' } }
    async destroy() {}
  },
}))

vi.mock('tesseract.js', () => ({
  default: {
    createWorker: vi.fn().mockResolvedValue({
      recognize: vi.fn().mockResolvedValue({ data: { text: 'OCR text' } }),
      terminate: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

import { extractText } from '@/lib/documents/extract'

const originalDOMMatrix = globalThis.DOMMatrix

describe('extractText DOMMatrix support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.DOMMatrix = originalDOMMatrix
  })

  it('sets a DOMMatrix stub on globalThis for PDF extraction', async () => {
    delete (globalThis as { DOMMatrix?: unknown }).DOMMatrix

    await extractText(Buffer.from('pdf'), 'application/pdf')

    expect(globalThis.DOMMatrix).toBeDefined()
    const matrix = new globalThis.DOMMatrix()
    expect(matrix.a).toBe(1)
    expect(matrix.b).toBe(0)
    expect(matrix.c).toBe(0)
    expect(matrix.d).toBe(1)
    expect(matrix.e).toBe(0)
    expect(matrix.f).toBe(0)
    expect(matrix.is2D).toBe(true)
    expect(matrix.isIdentity).toBe(true)
  })

  it('provides static DOMMatrix construction helpers', async () => {
    delete (globalThis as { DOMMatrix?: unknown }).DOMMatrix

    await extractText(Buffer.from('pdf'), 'application/pdf')

    expect(globalThis.DOMMatrix.fromFloat32Array(new Float32Array())).toBeInstanceOf(globalThis.DOMMatrix)
    expect(globalThis.DOMMatrix.fromFloat64Array(new Float64Array())).toBeInstanceOf(globalThis.DOMMatrix)
    expect(globalThis.DOMMatrix.fromMatrix()).toBeInstanceOf(globalThis.DOMMatrix)
  })

  it('does not overwrite an existing DOMMatrix implementation', async () => {
    class CustomDOMMatrix {
      custom = true
    }
    globalThis.DOMMatrix = CustomDOMMatrix as typeof DOMMatrix

    await extractText(Buffer.from('pdf'), 'application/pdf')

    expect(globalThis.DOMMatrix).toBe(CustomDOMMatrix)
  })
})
