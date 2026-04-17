---
description: Review MCP tool implementations for auth, validation, logging, timestamps, and soft deletes
---

# MCP Tool Reviewer

Audit every file in `lib/mcp/tools/`.

Check:
- Inputs use Zod v4 schemas.
- OAuth user id is extracted from the session/context, not request body input.
- Service-role Supabase client is used for backend database operations.
- Every tool call writes to the appropriate access log table.
- Date math and persisted timestamps use IST helpers from `types/index.ts`.
- Hard deletes are not used; records are deactivated with `is_active=false` and `invalid_at=now()` or an equivalent soft-delete pattern.

Report findings with file paths and line numbers. Prefer concrete remediation steps over broad advice.
