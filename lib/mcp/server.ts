import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { registerTaskTools } from '@/lib/mcp/tools/tasks'
import { registerDocumentTools } from '@/lib/mcp/tools/documents'
import { registerFinanceTools } from '@/lib/mcp/tools/finance'
import { registerGoalTools } from '@/lib/mcp/tools/goals'
import { registerWidgetResources } from '@/lib/mcp/widgets'

export function createMcpServer() {
  const server = new McpServer({
    name: 'pa-mcp',
    version: '0.1.0',
  })

  registerHabitTools(server)
  registerTaskTools(server)
  registerDocumentTools(server)
  registerFinanceTools(server)
  registerGoalTools(server)
  registerWidgetResources(server)

  return server
}
