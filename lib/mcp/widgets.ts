import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { extAppsBundle } from '@/lib/mcp/generated/ext-apps-bundle'

function loadWidget(filename: string): string {
  const widgetPath = join(process.cwd(), 'widgets', filename)
  try {
    const html = readFileSync(widgetPath, 'utf8')
    console.log(`[widget] served ${filename}: ${html.length} bytes`)
    return html.replace('/*__EXT_APPS_BUNDLE__*/', () => extAppsBundle)
  } catch (err) {
    console.error(`[widget] failed to read ${widgetPath}:`, err)
    throw err
  }
}

interface WidgetDef {
  name: string
  filename: string
  uri: string
}

const WIDGETS: WidgetDef[] = [
  { name: 'Habit Heatmap', filename: 'habit-heatmap.html', uri: 'ui://widgets/habit-heatmap.html' },
  { name: 'Spending Chart', filename: 'spending-chart.html', uri: 'ui://widgets/spending-chart.html' },
  { name: 'Review Dashboard', filename: 'review-dashboard.html', uri: 'ui://widgets/review-dashboard.html' },
  { name: 'Transaction Categorizer', filename: 'transaction-categorizer.html', uri: 'ui://widgets/transaction-categorizer.html' },
  { name: 'Document Viewer', filename: 'document-viewer.html', uri: 'ui://widgets/document-viewer.html' },
  { name: 'Memory Search', filename: 'memory-search.html', uri: 'ui://widgets/memory-search.html' },
  { name: 'Memory Consolidator', filename: 'memory-consolidator.html', uri: 'ui://widgets/memory-consolidator.html' },
  { name: 'Memory Context', filename: 'memory-context.html', uri: 'ui://widgets/memory-context.html' },
]

export function registerWidgetResources(server: McpServer) {
  for (const widget of WIDGETS) {
    let cachedHtml: string | null = null

    registerAppResource(
      server,
      widget.name,
      widget.uri,
      {},
      async () => {
        cachedHtml ||= loadWidget(widget.filename)
        return {
          contents: [{
            uri: widget.uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: cachedHtml,
          }],
        }
      },
    )
  }
}

export const WIDGET_URIS = {
  habitHeatmap: 'ui://widgets/habit-heatmap.html',
  spendingChart: 'ui://widgets/spending-chart.html',
  reviewDashboard: 'ui://widgets/review-dashboard.html',
  transactionCategorizer: 'ui://widgets/transaction-categorizer.html',
  documentViewer: 'ui://widgets/document-viewer.html',
  memorySearch: 'ui://widgets/memory-search.html',
  memoryConsolidator: 'ui://widgets/memory-consolidator.html',
  memoryContext: 'ui://widgets/memory-context.html',
} as const
