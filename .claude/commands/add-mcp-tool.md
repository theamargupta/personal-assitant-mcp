---
description: Scaffold a new MCP tool
---

# Add MCP Tool

Use `$ARGUMENTS` as the requested tool name and description.

1. Identify the correct domain file under `lib/mcp/tools/`:
   - habits
   - tasks
   - documents
   - finance
   - goals
   - memory
2. Add the tool implementation in that domain file using existing local patterns.
3. Register the tool in `lib/mcp/server.ts`.
4. Validate all input with Zod v4 schemas.
5. Extract the user id from the OAuth session/context, never from the request body.
6. Use IST timestamp helpers from `types/index.ts` for date creation, formatting, and date math.
7. Use the service-role Supabase client for backend database operations.
8. Log every tool call to the appropriate access log table:
   - memory access log for memory tools
   - finance access log for finance tools
   - general MCP access log for other domains, if available
9. Never hard delete records. Use soft-delete fields such as `is_active=false` and `invalid_at`.
10. Add or update focused tests for the new behavior.
