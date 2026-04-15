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
