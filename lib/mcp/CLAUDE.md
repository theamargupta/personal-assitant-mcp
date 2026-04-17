# MCP Server
- `server.ts` factory returns a fresh server per request.
- Tools registered from `tools/{habits,tasks,documents,finance,goals,memory}.ts`.
- Memory tools with widgets use `registerAppTool({ _meta: { ui: { resourceUri } } })`.
- All inputs validated via Zod v4.
- Never hard delete.
- `get_task` in `tools/tasks.ts` composes `getRules` + `searchMemories` from `lib/memory/items.ts` for project-typed tasks — re-use those helpers instead of re-querying `pa_memory_items` directly.
