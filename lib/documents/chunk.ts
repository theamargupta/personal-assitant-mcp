const TARGET_CHUNK_SIZE = 500   // approximate tokens
const OVERLAP = 50              // overlap tokens for context continuity
const AVG_CHARS_PER_TOKEN = 4   // rough estimate for English text

export interface TextChunk {
  content: string
  index: number
  tokenCount: number
}

export function chunkText(text: string): TextChunk[] {
  if (!text.trim()) return []

  const targetChars = TARGET_CHUNK_SIZE * AVG_CHARS_PER_TOKEN
  const overlapChars = OVERLAP * AVG_CHARS_PER_TOKEN

  // Split by paragraphs first, then by sentences if paragraphs are too large
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim())

  const chunks: TextChunk[] = []
  let currentChunk = ''
  let chunkIndex = 0

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > targetChars && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        tokenCount: Math.ceil(currentChunk.trim().length / AVG_CHARS_PER_TOKEN),
      })
      chunkIndex++

      // Keep overlap from end of previous chunk
      const overlapText = currentChunk.slice(-overlapChars)
      currentChunk = overlapText + '\n\n' + paragraph
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph
    }
  }

  // Push remaining text
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      tokenCount: Math.ceil(currentChunk.trim().length / AVG_CHARS_PER_TOKEN),
    })
  }

  // Handle single large paragraphs that exceed target size
  const result: TextChunk[] = []
  let reIndex = 0
  for (const chunk of chunks) {
    if (chunk.content.length > targetChars * 2) {
      // Split by sentences
      const sentences = chunk.content.match(/[^.!?]+[.!?]+/g) || [chunk.content]
      let subChunk = ''
      for (const sentence of sentences) {
        if (subChunk.length + sentence.length > targetChars && subChunk.length > 0) {
          result.push({
            content: subChunk.trim(),
            index: reIndex,
            tokenCount: Math.ceil(subChunk.trim().length / AVG_CHARS_PER_TOKEN),
          })
          reIndex++
          subChunk = subChunk.slice(-overlapChars) + sentence
        } else {
          subChunk += sentence
        }
      }
      if (subChunk.trim()) {
        result.push({
          content: subChunk.trim(),
          index: reIndex,
          tokenCount: Math.ceil(subChunk.trim().length / AVG_CHARS_PER_TOKEN),
        })
        reIndex++
      }
    } else {
      result.push({ ...chunk, index: reIndex })
      reIndex++
    }
  }

  return result
}
