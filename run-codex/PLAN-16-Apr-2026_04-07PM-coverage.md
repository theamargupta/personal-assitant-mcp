# Plan: Raise Branch Coverage to 90%+ Across All Files

## Objective
Fill the remaining branch coverage gaps in the test suite. Current overall: 86% branches. Target: 90%+ on every file.

## Current Gaps (from coverage report)

| File | Branches | Uncovered Lines | What's Missing |
|------|----------|-----------------|----------------|
| `lib/mcp/tools/documents.ts` | 74% | 11-12,144,329,340 | detectDocType branches, chunk insert error path, storage delete error, delete doc error |
| `app/api/mcp/route.ts` | 60% | 51-82 | OAuth verify catch block, MCP transport error catch, body parse error |
| `app/api/finance/transactions/route.ts` | 78% | 26-34,46-52 | POST body parse error, GET error catch |
| `app/api/finance/transactions/[id]/route.ts` | 70% | 25,36-45 | PATCH "not found" 404 vs 400 branch, DELETE error catch |
| `app/api/finance/categories/route.ts` | 79% | 14-22,38 | POST body parse error, GET empty result |
| `app/api/finance/categories/[id]/route.ts` | 83% | 18 | DELETE preset category guard |
| `lib/mcp/oauth.ts` | 83% | 369,413,461-463 | Token refresh edge cases, PKCE verification failure, expired token |
| `lib/goals/goals.ts` | 83% | 242-267,284,292 | Outcome progress: habit_completion, tasks_completed, spending_limit metric types, metric_ref_id null guards |
| `lib/documents/chunk.ts` | 85% | 42,56,71 | Edge cases: empty text, very short text, single-chunk text |

## Files to Create/Modify

| Action | File |
|--------|------|
| REWRITE | `tests/mcp/tools/documents.test.ts` — cover all 6 tools with error branches |
| MODIFY | `tests/api/mcp.test.ts` — add OAuth failure, transport error, body parse error tests |
| MODIFY | `tests/api/finance-routes.test.ts` — add POST/GET error branches |
| MODIFY | `tests/api/finance-routes-errors.test.ts` — add PATCH 404 vs 400, DELETE error |
| MODIFY | `tests/mcp/oauth.test.ts` — add token refresh, PKCE failure, expiry tests |
| MODIFY | `tests/goals/goals.test.ts` — add outcome progress for all 4 metric types |
| MODIFY | `tests/documents/chunk.test.ts` — add empty/short text edge cases |
| CREATE | `tests/api/finance-categories-errors.test.ts` — POST error, DELETE preset guard |
| MODIFY | `tests/mcp/tools/goals.test.ts` — add MCP tool-level progress tests |

## Existing Test Setup Patterns

All tests use the same pattern from `tests/setup.ts`:
```typescript
import { vi } from 'vitest'
// Mock environment variables already set in setup.ts
// Mock createServiceRoleClient already set in setup.ts
```

For API route tests, the pattern is:
```typescript
// Mock the underlying lib functions, then call the route handler directly
vi.mock('@/lib/finance/transactions', () => ({
  createTransaction: vi.fn(),
  listTransactions: vi.fn(),
}))
vi.mock('@/lib/finance/auth', () => ({
  authenticateRequest: vi.fn(),
  isAuthError: vi.fn(),
}))
// Then import the route handlers and call them with mock NextRequest
```

## Detailed Instructions

### 1. REWRITE `tests/mcp/tools/documents.test.ts`

The current `documents.test.ts` or `documents-handler.test.ts` has minimal coverage. Write comprehensive tests for all 6 document tools.

**Mock setup:**
```typescript
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockClient),
}))
vi.mock('@/lib/documents/storage', () => ({
  buildStoragePath: vi.fn().mockReturnValue('user-1/test-doc.pdf'),
  createSignedUploadUrl: vi.fn().mockResolvedValue('https://storage.test/upload?token=abc'),
  getSignedUrl: vi.fn().mockResolvedValue('https://storage.test/download?token=xyz'),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/documents/chunk', () => ({
  chunkText: vi.fn().mockReturnValue([
    { index: 0, content: 'chunk one', tokenCount: 10 },
    { index: 1, content: 'chunk two', tokenCount: 12 },
  ]),
}))
vi.mock('@/lib/documents/embed', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}))
```

**Tests needed:**

a) `detectDocType` branches (lines 9-13):
   - `'application/pdf'` → `'pdf'`
   - `'image/png'` → `'image'`
   - `'image/jpeg'` → `'image'`
   - `'text/plain'` → `'other'`

Note: `detectDocType` is a private function. Test it indirectly by calling `upload_document` with different mime_types and checking the `doc_type` passed to the insert mock.

b) `upload_document`:
   - Success: assert response has document_id, upload_url, storage_path
   - DB insert error: mock `.single()` returning error → assert isError response
   - Unauthorized: no userId → throws

c) `confirm_upload`:
   - Success with chunks: mock pending doc found, assert status updated to 'ready', chunks inserted
   - Document not found (wrong id or already confirmed): assert error message
   - Update error on status change (line 122): mock update returning error
   - Chunk insert error (line 143-144): mock chunk insert error → assert it logs but doesn't fail (non-fatal). chunksCreated should be 0.
   - Empty chunks: mock chunkText returning [] → assert chunksCreated = 0

d) `list_documents`:
   - Success with doc_type filter
   - Success with tag filter
   - Error from query: mock query error → assert isError
   - Empty result

e) `get_document`:
   - Success: assert download_url and has_extracted_text
   - Not found: assert error

f) `search_documents`:
   - Success: assert similarity is rounded to 3 decimal places
   - RPC error: assert isError
   - Empty results

g) `delete_document`:
   - Success: assert deleted=true response
   - Not found: assert error
   - Storage delete fails but non-fatal (line 328-329): mock deleteFile to reject. Assert document is still deleted from DB (catch makes it non-fatal).
   - DB delete error (line 339-340): mock delete returning error → assert isError

### 2. MODIFY `tests/api/mcp.test.ts`

Add tests for uncovered branches in `app/api/mcp/route.ts`:

**Setup:**
```typescript
vi.mock('@/lib/mcp/oauth', () => ({
  buildResourceMetadataUrl: vi.fn().mockReturnValue('https://test/.well-known/oauth-protected-resource/api/mcp'),
  parseBearerToken: vi.fn(),
  verifyOAuthAccessToken: vi.fn(),
}))
vi.mock('@/lib/mcp/server', () => ({
  createMcpServer: vi.fn(),
}))
```

**Tests:**

a) `POST without Authorization header` (line 27-36): parseBearerToken returns null → assert 401 with WWW-Authenticate header

b) `POST with invalid token` (line 46-59): verifyOAuthAccessToken throws Error → assert 401 with error message in body and WWW-Authenticate header

c) `POST with non-Error throw` (line 51): verifyOAuthAccessToken throws a string → assert 401 with "Invalid token." fallback

d) `POST transport error` (line 79-84): mock createMcpServer or transport.handleRequest to throw → assert 500

e) `POST body parse error` (line 66): mock request.clone().json() to throw → assert the code handles it (it uses `.catch(() => null)`)

f) `GET returns server info` — assert 200 with name, version, protocol

g) `HEAD returns 200` — assert empty body

h) `DELETE returns 204` — assert no body

### 3. MODIFY `tests/api/finance-routes.test.ts`

Add error branch tests for `app/api/finance/transactions/route.ts`:

a) `POST with invalid body` — createTransaction throws → assert 400

b) `POST unauthorized` — authenticateRequest returns auth error → isAuthError returns true → assert auth error response returned directly

c) `GET with error` — listTransactions throws → assert 400

d) `GET unauthorized` — same pattern as POST

### 4. MODIFY or CREATE `tests/api/finance-routes-errors.test.ts`

Add tests for `app/api/finance/transactions/[id]/route.ts`:

a) `PATCH not found` — updateTransaction throws "Transaction not found" → assert 404 status (not 400)

b) `PATCH other error` — updateTransaction throws other message → assert 400

c) `PATCH unauthorized` — assert auth error

d) `DELETE error` — deleteTransaction throws → assert 400

e) `DELETE unauthorized` — assert auth error

### 5. CREATE `tests/api/finance-categories-errors.test.ts`

Tests for `app/api/finance/categories/route.ts` and `[id]/route.ts`:

a) `POST categories error` — insert fails → assert error response

b) `GET categories empty` — no categories → assert empty array

c) `DELETE preset category guard` — category has `is_preset: true` → assert refusal (if the code checks this) or verify the delete goes through (read the actual code to determine behavior)

### 6. MODIFY `tests/mcp/oauth.test.ts`

Read the existing oauth tests first. Add:

a) `verifyOAuthAccessToken with expired token` — token exists in DB but past expiry → assert throws

b) `verifyOAuthAccessToken with revoked token` — token marked revoked → assert throws

c) `token refresh with invalid refresh token` — hash doesn't match → assert error

d) `PKCE S256 challenge verification failure` — code_verifier doesn't match code_challenge → assert error

e) `token refresh success` — valid refresh token → assert new access token returned

### 7. MODIFY `tests/goals/goals.test.ts`

Add tests for `computeGoalProgress` covering all 4 metric types:

a) `milestone progress: 2/5 completed = 40%` — mock milestones data

b) `milestone progress: 0 milestones = 0%` — empty milestones

c) `outcome progress: habit_streak` — mock habit_logs with consecutive dates. Assert currentValue = streak length.

d) `outcome progress: habit_streak with null metric_ref_id` — assert currentValue = 0 (guard at line 217)

e) `outcome progress: habit_completion` — mock 15 logs in 30-day period. Assert currentValue = 50% completion.

f) `outcome progress: tasks_completed` — mock 8 completed tasks in range. Assert currentValue = 8.

g) `outcome progress: spending_limit` — mock transactions totaling ₹15000, target ₹20000. Assert progressPct = 25% (inverse: 1 - 15000/20000 = 25%).

h) `outcome progress: spending_limit with metric_ref_id (category filter)` — assert query includes .eq('category_id', ref_id)

i) `outcome progress: unknown metric_type` — currentValue stays 0, progressPct = 0

j) `goal not found` — assert throws

### 8. MODIFY `tests/documents/chunk.test.ts`

a) `empty text` — chunkText('') → assert returns empty array or single empty chunk

b) `very short text (under one chunk)` — chunkText('hello') → assert 1 chunk

c) `text exactly at chunk boundary` — test with text exactly at the token limit

d) `multi-chunk text` — verify chunk indices are sequential (0, 1, 2...)

## Technical Constraints

1. **Vitest 4.1.4**, globals: true, environment: 'node'
2. `tests/setup.ts` already mocks env vars and createServiceRoleClient
3. Path alias `@/` = project root
4. For API route tests: construct `NextRequest` with `new NextRequest('http://localhost/api/...', { method, headers, body })`
5. Import route handlers directly: `import { POST, GET } from '@/app/api/finance/transactions/route'`
6. For [id] routes, pass params as second arg: `handler(request, { params: Promise.resolve({ id: 'test-id' }) })`
7. All tests must use mocks — NO real DB, NO real network
8. Every test must assert actual values in the response, not just status codes

## DO NOTs

- Do NOT delete or remove any existing passing tests
- Do NOT modify source code — only `tests/` directory
- Do NOT add dependencies — vitest is enough
- Do NOT create snapshot tests — use explicit assertions
- Do NOT test landing page components (out of scope)
- Do NOT use real Supabase or network calls

## Verification

```bash
npx vitest run 2>&1
```
ALL tests must pass.

```bash
npx vitest run --coverage 2>&1
```
Target: every file in the coverage report should show 85%+ branch coverage. The overall branch coverage should be above 90%.
