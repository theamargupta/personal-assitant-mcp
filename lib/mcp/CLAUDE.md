# MCP Server
- `server.ts` factory returns a fresh server per request.
- Tools registered from `tools/{habits,tasks,documents,finance,goals,memory}.ts`.
- Memory tools with widgets use `registerAppTool({ _meta: { ui: { resourceUri } } })`.
- All inputs validated via Zod v4.
- Never hard delete.
