import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('memory-consolidator.html widget', () => {
  const html = readFileSync(join(process.cwd(), 'widgets', 'memory-consolidator.html'), 'utf8')

  it('should contain ExtApps bundle placeholder', () => {
    expect(html).toContain('/*__EXT_APPS_BUNDLE__*/')
  })

  it('should reference MemoryConsolidator app name', () => {
    expect(html).toContain('"MemoryConsolidator"')
  })

  it('should handle duplicate groups', () => {
    expect(html).toContain('duplicate_groups')
    expect(html).toContain('max_similarity')
  })

  it('should handle stale memories', () => {
    expect(html).toContain('stale_memories')
  })

  it('should support light theme', () => {
    expect(html).toContain('prefers-color-scheme: light')
  })
})
