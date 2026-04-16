import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('memory-search.html widget', () => {
  const html = readFileSync(join(process.cwd(), 'widgets', 'memory-search.html'), 'utf8')

  it('should contain ExtApps bundle placeholder', () => {
    expect(html).toContain('/*__EXT_APPS_BUNDLE__*/')
  })

  it('should reference MemorySearch app name', () => {
    expect(html).toContain('"MemorySearch"')
  })

  it('should handle duplicates_found status', () => {
    expect(html).toContain('duplicates_found')
    expect(html).toContain('pending_memory')
  })

  it('should render score breakdown', () => {
    expect(html).toContain('semantic_score')
    expect(html).toContain('keyword_score')
    expect(html).toContain('final_score')
  })

  it('should render stale hints', () => {
    expect(html).toContain('stale_hint')
    expect(html).toContain('stale-banner')
  })

  it('should support light theme', () => {
    expect(html).toContain('prefers-color-scheme: light')
  })
})
