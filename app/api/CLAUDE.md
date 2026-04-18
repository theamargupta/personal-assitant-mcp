# API Conventions

## MCP (`api/mcp/route.ts`)
- POST only. Bearer token required. STATELESS — new MCP server per request.
- Extract user id from OAuth session.
- Log every tool call to the relevant access log table (memory vs. finance vs. general).

## REST (`api/finance/*`, `api/documents/*`, etc.)
- Zod v4 body validation.
- Supabase SSR client for user context; service-role for backend-only operations.
- Response: `{ success, data }` / `{ success, error }`.
- IST timestamps.
