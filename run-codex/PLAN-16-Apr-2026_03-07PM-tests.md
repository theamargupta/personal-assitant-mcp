# Plan: Fix Test Suite — Catch Real Bugs, Not Just Wiring

## Objective
Rewrite and expand the MCP tool test suite so it catches data transformation bugs like the two we just found (category display + analytics date range). The current tests are too mock-heavy — they verify wiring but not logic.

## What Went Wrong

### Bug 1: `list_transactions` category display
- **The test mock** returned `spending_categories: [{ name: 'Food', icon: '🍕' }]` (ARRAY)
- **The real Supabase** returns `spending_categories: { name: 'Food', icon: '🍕' }` (OBJECT) for FK joins
- **The code** used `[0]` accessor — matched the mock but not reality
- **Fix needed:** Mock must return the SAME shape as Supabase. FK joins return objects, not arrays.

### Bug 2: `get_habit_analytics` day range
- **The test** only checked "returns error when habit not found" — never tested day range output
- **The bug** was an off-by-one + UTC/IST boundary issue
- **Fix needed:** Test must assert today's IST date is included in the `day_by_day` array

## Current State

- Vitest 4.1.4 already configured with `vitest.config.ts`
- Setup file at `tests/setup.ts` with mock builder
- 35 test files exist across `tests/` directory
- Tests mock `createServiceRoleClient` at module level

## Strategy: Two Tiers of Tests

### Tier 1: Logic Tests (rewrite existing)
Test the actual data transformation code with realistic mock shapes. These catch serialization bugs, off-by-one errors, boundary conditions.

**Key rule: Mock shapes MUST match real Supabase response shapes exactly.**

### Tier 2: Integration-style Tool Tests (new)
For each MCP tool, test the full handler with a mock that returns realistic data, then assert the OUTPUT shape and values — not just "it didn't crash."

## Files to Modify

| Action | File |
|--------|------|
| REWRITE | `tests/mcp/tools/finance.test.ts` — fix mock shapes, add category display assertion |
| REWRITE | `tests/mcp/tools/habits.test.ts` — add analytics day range test, streak boundary tests |
| REWRITE | `tests/mcp/tools/tasks.test.ts` — add overdue detection, time-to-completion tests |
| REWRITE | `tests/mcp/tools/goals.test.ts` — add milestone progress calculation tests |
| MODIFY | `tests/mcp/tools/documents-handler.test.ts` — verify document status transitions |
| MODIFY | `tests/setup.ts` — improve mock builder to support FK join object shapes |
| CREATE | `tests/mcp/tools/review.test.ts` — test cross-module review aggregation |
| CREATE | `tests/types.ist.test.ts` — test IST helpers with timezone edge cases |

## Detailed Instructions

### 1. Fix `tests/setup.ts` — Better Mock Builder

Add a helper to create mocks with correct FK join shapes:

```typescript
// Add to existing setup.ts

/**
 * Create a mock that returns data matching Supabase FK join shape.
 * FK joins on single foreign keys return OBJECTS, not arrays.
 * Only array if it's a one-to-many relationship.
 */
export function createFKJoinMock(data: unknown[]) {
  // This helper reminds test authors that FK joins are objects
  return data
}
```

### 2. Rewrite `tests/mcp/tools/finance.test.ts`

The `listTransactions` mock MUST return spending_categories as an OBJECT (not array) since `category_id` is a single FK:

```typescript
// WRONG (current):
spending_categories: [{ name: 'Food', icon: '🍕' }]

// CORRECT (real Supabase shape):
spending_categories: { name: 'Food', icon: '🍕' }
```

**New tests to add:**

a) `list_transactions returns correct category name from FK join` — Mock returns `spending_categories: { name: 'Food', icon: '🍕' }` (object). Assert output `category` equals `'Food'`, NOT `'Uncategorized'`.

b) `list_transactions handles null category` — Mock returns `spending_categories: null`. Assert output `category` equals `'Uncategorized'`.

c) `list_transactions handles array shape gracefully` — Since we added Array.isArray fallback, test with array shape too. Assert both work.

d) `add_transaction maps category name correctly in response` — Assert the response includes the correct category name.

e) `get_spending_summary computes totals correctly` — Mock returns multiple categories. Assert total is sum of all. Assert each category has correct amount and percentage math.

f) `get_uncategorized returns only null-category transactions` — Mock returns mixed. Assert only uncategorized ones appear.

### 3. Rewrite `tests/mcp/tools/habits.test.ts`

**Critical new tests:**

a) `get_habit_analytics includes today in day_by_day array` — This is THE test that catches Bug 2.
   - Mock the habit lookup to succeed
   - Mock habit_logs to return a few dates including today's IST date
   - Call handler with `{ habit_id: 'h-1', days: 30 }`
   - Parse the response JSON
   - Assert `day_by_day` array has exactly 30 entries
   - Assert the LAST entry's `date` equals today's IST date (`todayISTDate()`)
   - Assert the FIRST entry's `date` equals 29 days ago
   - Assert today's entry has `completed: true` if it was in the logs

   **How to mock this properly:**
   The handler calls `supabase.from('habits').select(...).eq(...).eq(...).single()` first (habit lookup), then `supabase.from('habit_logs').select(...).eq(...).gte(...).order(...)` (log query), then `calculateCurrentStreak` and `calculateBestStreak` (which also call `supabase.from('habit_logs')...`).
   
   Use `mockClient.from.mockImplementation((table) => ...)` to return different chains based on table name. For `habits` table return a chain whose `.single()` resolves to the habit. For `habit_logs` table return a chain that resolves to the log entries.

b) `get_habit_analytics day_by_day range spans exactly N days` — Test with days=7. Assert 7 entries, first is 6 days ago, last is today.

c) `calculateCurrentStreak counts consecutive days correctly` — Test with:
   - [today, yesterday, day-before] → streak = 3
   - [yesterday, day-before] → streak = 2 (today not logged yet, start from yesterday)
   - [3 days ago, 2 days ago] → streak = 0 (gap before yesterday)
   - [] → streak = 0

d) `calculateBestStreak finds longest run` — Test with gaps in logs.

e) `completionPercentage calculates correctly` — 15 logs in 30 days = 50%

f) `log_habit_completion detects duplicate gracefully` — Error code 23505

g) `log_habit_completion uses IST date when no date provided` — Assert the inserted `logged_date` matches IST today, not UTC today (matters when IST is past midnight but UTC is still previous day)

### 4. Rewrite `tests/mcp/tools/tasks.test.ts`

**New tests:**

a) `complete_task calculates days_to_complete` — Create task with created_at 5 days ago. Complete it. Assert `days_to_complete` is approximately 5.

b) `complete_task detects overdue` — Create task with due_date in the past. Complete it. Assert `was_overdue: true`.

c) `complete_task not overdue when on time` — due_date is tomorrow. Assert `was_overdue: false`.

d) `list_tasks filters by status correctly` — Mock returns mixed statuses. Assert filter works.

e) `update_task_status transitions correctly` — pending → in_progress → completed.

### 5. Rewrite `tests/mcp/tools/goals.test.ts`

**New tests:**

a) `create_goal with milestone type auto-creates milestones from description` — If milestones are provided, assert they're created with correct sort_order.

b) `get_goal_progress computes milestone percentage` — 2/5 milestones completed = 40%.

c) `get_goal_progress computes outcome progress from linked data` — Mock habit logs / transaction sums. Assert progress percentage is derived from real data, not just time elapsed.

d) `add_milestone increments sort_order correctly` — Existing milestones have sort_order 1,2. New one should get 3.

e) `update_goal status transitions` — active → completed, active → failed.

### 6. Create `tests/mcp/tools/review.test.ts`

a) `get_review aggregates all modules` — Mock data for habits, tasks, finance, goals. Assert response includes all sections.

b) `get_review handles empty modules` — No data in some modules. Assert no crash, those sections show zeros.

c) `get_review date range uses IST boundaries` — Assert the review period boundaries use IST, not UTC.

### 7. Create `tests/types.ist.test.ts`

a) `todayISTDate returns YYYY-MM-DD in IST` — Run test and assert format.

b) `todayISTDate at UTC midnight returns correct IST date` — At 00:00 UTC (05:30 IST), should return the IST date (which is ahead of UTC).

c) `toIST formats correctly` — Pass a known UTC date, assert IST formatted string.

## Technical Constraints

1. **Framework:** Vitest 4.1.4, globals: true, environment: 'node'
2. **Imports:** Use `import { describe, it, expect, vi, beforeEach } from 'vitest'`
3. **Mocking:** Use `vi.mock()` at module level, `vi.fn()` for individual functions
4. **Setup:** `tests/setup.ts` is already configured as setupFile
5. **Path aliases:** `@/` maps to project root (configured in vitest.config.ts)
6. **IST helpers:** Import `todayISTDate` and `toIST` from `@/types`
7. **Do NOT use real Supabase** — all tests use mocks
8. **Every test must assert actual output VALUES, not just structure** — `expect(parsed.category).toBe('Food')` not just `expect(parsed).toHaveProperty('category')`

## DO NOTs

- Do NOT delete existing test files that are not in the modify list (e.g., `tests/api/`, `tests/documents/`, `tests/finance/`, `tests/supabase/`)
- Do NOT change any source code in `lib/` or `app/` — only modify files in `tests/`
- Do NOT add new dependencies — use only vitest (already installed)
- Do NOT use real database connections or network calls
- Do NOT skip the FK join shape fix — this is the #1 priority

## Part 2: Dashboard CRUD Tests

The dashboard pages have been updated with full CRUD operations. Add Vitest tests (using jsdom environment) that test the core logic functions extracted from each page. Since dashboard pages are `'use client'` React components and hard to unit test directly, focus on testing:

1. **Data transformation logic** — any helper functions or computed values
2. **Supabase query shapes** — verify the right queries are called with right params

### Install jsdom for component environment (if not installed)
Check if `@testing-library/react` is in package.json. If not, do NOT install it. Instead, test only the logic portions.

### New test files to create:

#### `tests/dashboard/habits-crud.test.ts`
Test the habits page CRUD logic:
a) `create habit inserts with correct fields` — Mock supabase.from('habits').insert(). Assert called with { user_id, name, frequency, color, description, reminder_time }
b) `archive habit sets archived=true` — Assert update called with { archived: true }
c) `log today inserts with correct date` — Assert habit_logs insert has today's date
d) `streak calculation with consecutive dates` — Test the streak counting logic
e) `30-day completion percentage math` — 15 out of 30 = 50%

#### `tests/dashboard/tasks-crud.test.ts`
a) `create task includes all fields` — Assert insert called with title, description, priority, due_date, tags array
b) `cycle status follows correct order` — pending→in_progress→completed→pending
c) `complete task sets completed_at` — Assert update includes completed_at timestamp
d) `delete task calls delete with correct id` — Assert delete().eq('id', taskId)

#### `tests/dashboard/finance-crud.test.ts`
a) `add expense includes all fields` — Assert insert with amount, merchant, category_id, note, transaction_date
b) `delete transaction calls correct endpoint` — Assert delete().eq('id', txId)
c) `category grouping math` — Given 3 transactions in 2 categories, assert group totals and percentages
d) `uncategorized filter shows null category_id transactions` — Assert query includes .is('category_id', null)

#### `tests/dashboard/documents-crud.test.ts`
a) `upload creates document record with pending status` — Assert insert includes { status: 'pending', storage_path, user_id }
b) `upload calls storage.upload with correct path` — Assert supabase.storage.from('documents').upload(path, file)
c) `delete removes storage file, chunks, and document` — Assert 3 delete calls in correct order
d) `download creates signed URL with 1hr expiry` — Assert createSignedUrl called with 3600

#### `tests/dashboard/goals-crud.test.ts`
a) `create goal inserts with correct type` — outcome vs milestone
b) `add milestone inserts with incremented sort_order` — If 2 exist, new one gets 3
c) `toggle milestone flips completed boolean` — Assert update called with !current
d) `delete goal removes milestones first then goal` — Assert delete order
e) `milestone progress = completed/total * 100` — 3/5 = 60%

### For all dashboard tests:
- Mock `@/lib/supabase/client` with `createClient` returning a mock Supabase browser client
- Mock `supabase.auth.getUser()` to return `{ data: { user: { id: 'test-user' } } }`
- Use the same mock chain pattern from `tests/setup.ts`
- Do NOT render React components — only test the logic functions
- If a function is inline in the component and can't be imported, extract the LOGIC into a testable assertion about the mock calls

## Verification

After implementation, run:
```bash
npx vitest run 2>&1
```
All tests must pass. Zero failures.

Then run:
```bash
npx vitest run --coverage 2>&1
```
Coverage should show lib/mcp/tools/ files at 80%+ line coverage.
