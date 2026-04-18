export async function extractText(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'application/pdf') {
    return extractFromPdf(fileBuffer)
  }

  if (mimeType.startsWith('image/')) {
    return extractFromImage(fileBuffer)
  }

  return ''
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  // pdfjs-dist (used by pdf-parse) expects DOMMatrix in global scope.
  // We only extract text (no rendering), so a minimal stub is sufficient.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrixStub {
      a=1;b=0;c=0;d=1;e=0;f=0;
      is2D = true; isIdentity = true;
      static fromFloat32Array() { return new DOMMatrixStub() }
      static fromFloat64Array() { return new DOMMatrixStub() }
      static fromMatrix() { return new DOMMatrixStub() }
    } as unknown as typeof DOMMatrix
  }

  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  await parser.destroy()
  return result.text.trim()
}

async function extractFromImage(buffer: Buffer): Promise<string> {
  const Tesseract = (await import('tesseract.js')).default
  const worker = await Tesseract.createWorker('eng')
  const { data } = await worker.recognize(buffer)
  await worker.terminate()
  return data.text.trim()
}
