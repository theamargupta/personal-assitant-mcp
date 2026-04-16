import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('memory-context.html widget', () => {
  const html = readFileSync(join(process.cwd(), 'widgets', 'memory-context.html'), 'utf8')

  it('should contain ExtApps bundle placeholder', () => {
    expect(html).toContain('/*__EXT_APPS_BUNDLE__*/')
  })

  it('should reference MemoryContext app name', () => {
    expect(html).toContain('"MemoryContext"')
  })

  it('should define category order', () => {
    expect(html).toContain('CATEGORY_ORDER')
    expect(html).toContain('"rule"')
    expect(html).toContain('"context"')
    expect(html).toContain('"decision"')
  })

  it('should render importance bars', () => {
    expect(html).toContain('importance-bar')
    expect(html).toContain('importance')
  })

  it('should support light theme', () => {
    expect(html).toContain('prefers-color-scheme: light')
  })
})
