# Finance Tracking Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add finance tracking to PA MCP — Supabase tables for transactions and categories, REST API endpoints for the mobile app, and MCP tools so Claude can answer spending queries like "is hafte food pe kitna kharch hua?"

**Architecture:** Two new tables (`spending_categories`, `transactions`) in existing Supabase. REST endpoints under `/api/finance/*` authenticated via Supabase Auth bearer token. Four new MCP tools registered alongside existing habit/task tools. Preset categories seeded on first use.

**Tech Stack:** Next.js 16.2.3 (existing), Supabase (existing), Zod (existing)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/004_finance_tracking.sql` | `spending_categories` + `transactions` tables, RLS, indexes, preset seed |
| `lib/finance/auth.ts` | Verify Supabase Auth bearer token from mobile app requests |
| `lib/finance/categories.ts` | Category CRUD + preset seeding logic |
| `lib/finance/transactions.ts` | Transaction CRUD + summary queries |
| `app/api/finance/transactions/route.ts` | POST (create) + GET (list) transactions |
| `app/api/finance/transactions/[id]/route.ts` | PATCH (categorize) + DELETE transaction |
| `app/api/finance/categories/route.ts` | GET (list) + POST (create) categories |
| `app/api/finance/categories/[id]/route.ts` | DELETE custom category |
| `lib/mcp/tools/finance.ts` | 4 MCP tools for Claude queries |

### Modified Files
| File | Change |
|------|--------|
| `lib/mcp/server.ts` | Import and register finance tools |
| `types/index.ts` | Add Transaction, SpendingCategory types |
| `CLAUDE.md` | Add finance tracking section |

---

## Task 1: Database Migration — spending_categories + transactions

**Files:**
- Create: `supabase/migrations/004_finance_tracking.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/004_finance_tracking.sql`:

```sql
-- ============================================================
-- PA MCP: Finance Tracking tables
-- ============================================================

-- ── spending_categories ─────────────────────────────────────

CREATE TABLE spending_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '💰',
  is_preset   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_categories_user_id ON spending_categories(user_id);
CREATE UNIQUE INDEX idx_categories_unique_name ON spending_categories(user_id, name);

ALTER TABLE spending_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categories"
  ON spending_categories FOR ALL
  USING (user_id = auth.uid());

-- ── transactions ────────────────────────────────────────────

CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  merchant          TEXT,
  source_app        TEXT CHECK (source_app IN ('phonepe', 'gpay', 'paytm', 'bank', 'manual', 'other')),
  category_id       UUID REFERENCES spending_categories(id) ON DELETE SET NULL,
  note              TEXT,
  transaction_date  TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_sms           TEXT,
  is_auto_detected  BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_category ON transactions(user_id, category_id);
CREATE INDEX idx_transactions_date ON transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_uncategorized ON transactions(user_id)
  WHERE category_id IS NULL;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transactions"
  ON transactions FOR ALL
  USING (user_id = auth.uid());

-- ── preset categories seed function ─────────────────────────

CREATE OR REPLACE FUNCTION seed_preset_categories(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO spending_categories (user_id, name, icon, is_preset) VALUES
    (target_user_id, 'Food', '🍕', true),
    (target_user_id, 'Transport', '🚗', true),
    (target_user_id, 'Shopping', '🛍️', true),
    (target_user_id, 'Bills', '📄', true),
    (target_user_id, 'Entertainment', '🎬', true),
    (target_user_id, 'Health', '💊', true),
    (target_user_id, 'Education', '📚', true),
    (target_user_id, 'Groceries', '🛒', true),
    (target_user_id, 'Subscriptions', '🔄', true),
    (target_user_id, 'Other', '💰', true)
  ON CONFLICT (user_id, name) DO NOTHING;
END;
$$;

-- ── spending summary function ───────────────────────────────

CREATE OR REPLACE FUNCTION get_spending_summary(
  target_user_id UUID,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
)
RETURNS TABLE (
  category_name TEXT,
  category_icon TEXT,
  total_amount NUMERIC,
  transaction_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(sc.name, 'Uncategorized') AS category_name,
    COALESCE(sc.icon, '❓') AS category_icon,
    SUM(t.amount) AS total_amount,
    COUNT(*) AS transaction_count
  FROM transactions t
  LEFT JOIN spending_categories sc ON sc.id = t.category_id
  WHERE t.user_id = target_user_id
    AND t.transaction_date >= start_date
    AND t.transaction_date <= end_date
  GROUP BY sc.name, sc.icon
  ORDER BY total_amount DESC;
END;
$$;
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Copy the full contents of `004_finance_tracking.sql` and run in Supabase Dashboard > SQL Editor. Verify both tables and both functions exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_finance_tracking.sql
git commit -m "feat(finance): add spending_categories and transactions tables with RLS"
```

---

## Task 2: Add TypeScript Types

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Add finance types**

Append to the end of `types/index.ts`:

```typescript
// ============ FINANCE TYPES ============

export type SourceApp = 'phonepe' | 'gpay' | 'paytm' | 'bank' | 'manual' | 'other'

export interface SpendingCategory {
  id: string
  user_id: string
  name: string
  icon: string
  is_preset: boolean
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  amount: number
  merchant: string | null
  source_app: SourceApp | null
  category_id: string | null
  note: string | null
  transaction_date: string
  raw_sms: string | null
  is_auto_detected: boolean
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add types/index.ts
git commit -m "feat(finance): add SpendingCategory and Transaction types"
```

---

## Task 3: Supabase Auth Verification Helper

**Files:**
- Create: `lib/finance/auth.ts`

- [ ] **Step 1: Create auth helper**

This verifies the Supabase Auth bearer token from mobile app requests and returns the user ID.

Create `lib/finance/auth.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function authenticateRequest(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 }
    )
  }

  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    )
  }

  return { userId: data.user.id }
}

export function isAuthError(
  result: { userId: string } | NextResponse
): result is NextResponse {
  return result instanceof NextResponse
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/finance/auth.ts
git commit -m "feat(finance): add Supabase Auth bearer token verification"
```

---

## Task 4: Category CRUD Logic

**Files:**
- Create: `lib/finance/categories.ts`

- [ ] **Step 1: Create categories module**

Create `lib/finance/categories.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function ensurePresetCategories(userId: string): Promise<void> {
  const supabase = createServiceRoleClient()

  const { count } = await supabase
    .from('spending_categories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_preset', true)

  if ((count || 0) === 0) {
    await supabase.rpc('seed_preset_categories', { target_user_id: userId })
  }
}

export async function listCategories(userId: string) {
  await ensurePresetCategories(userId)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('spending_categories')
    .select('id, name, icon, is_preset, created_at')
    .eq('user_id', userId)
    .order('is_preset', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

export async function createCategory(
  userId: string,
  name: string,
  icon: string
) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('spending_categories')
    .insert({
      user_id: userId,
      name: name.trim(),
      icon,
      is_preset: false,
    })
    .select('id, name, icon, is_preset, created_at')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('Category already exists')
    throw new Error(error.message)
  }
  return data
}

export async function deleteCategory(userId: string, categoryId: string) {
  const supabase = createServiceRoleClient()

  // Prevent deleting presets
  const { data: cat } = await supabase
    .from('spending_categories')
    .select('is_preset')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .single()

  if (!cat) throw new Error('Category not found')
  if (cat.is_preset) throw new Error('Cannot delete preset categories')

  const { error } = await supabase
    .from('spending_categories')
    .delete()
    .eq('id', categoryId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/finance/categories.ts
git commit -m "feat(finance): add category CRUD with preset seeding"
```

---

## Task 5: Transaction CRUD Logic

**Files:**
- Create: `lib/finance/transactions.ts`

- [ ] **Step 1: Create transactions module**

Create `lib/finance/transactions.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SourceApp } from '@/types'

interface CreateTransactionInput {
  userId: string
  amount: number
  merchant?: string
  sourceApp?: SourceApp
  categoryId?: string
  note?: string
  transactionDate?: string
  rawSms?: string
  isAutoDetected?: boolean
}

export async function createTransaction(input: CreateTransactionInput) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: input.userId,
      amount: input.amount,
      merchant: input.merchant || null,
      source_app: input.sourceApp || null,
      category_id: input.categoryId || null,
      note: input.note || null,
      transaction_date: input.transactionDate || new Date().toISOString(),
      raw_sms: input.rawSms || null,
      is_auto_detected: input.isAutoDetected || false,
    })
    .select('id, amount, merchant, source_app, category_id, transaction_date, is_auto_detected, created_at')
    .single()

  if (error) throw new Error(error.message)
  return data
}

interface UpdateTransactionInput {
  categoryId?: string
  note?: string
  merchant?: string
  amount?: number
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  updates: UpdateTransactionInput
) {
  const supabase = createServiceRoleClient()
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (updates.categoryId !== undefined) updateData.category_id = updates.categoryId
  if (updates.note !== undefined) updateData.note = updates.note
  if (updates.merchant !== undefined) updateData.merchant = updates.merchant
  if (updates.amount !== undefined) updateData.amount = updates.amount

  const { data, error } = await supabase
    .from('transactions')
    .update(updateData)
    .eq('id', transactionId)
    .eq('user_id', userId)
    .select('id, amount, merchant, source_app, category_id, note, transaction_date, updated_at')
    .single()

  if (error || !data) throw new Error('Transaction not found')
  return data
}

export async function deleteTransaction(userId: string, transactionId: string) {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

interface ListTransactionsInput {
  userId: string
  categoryId?: string
  startDate?: string
  endDate?: string
  uncategorizedOnly?: boolean
  limit?: number
  offset?: number
}

export async function listTransactions(input: ListTransactionsInput) {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('transactions')
    .select(`
      id, amount, merchant, source_app, category_id, note,
      transaction_date, is_auto_detected, created_at,
      spending_categories(name, icon)
    `, { count: 'exact' })
    .eq('user_id', input.userId)

  if (input.categoryId) query = query.eq('category_id', input.categoryId)
  if (input.startDate) query = query.gte('transaction_date', input.startDate)
  if (input.endDate) query = query.lte('transaction_date', input.endDate)
  if (input.uncategorizedOnly) query = query.is('category_id', null)

  const limit = input.limit || 50
  const offset = input.offset || 0

  const { data, count, error } = await query
    .order('transaction_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return { transactions: data || [], total: count || 0 }
}

export async function getSpendingSummary(
  userId: string,
  startDate: string,
  endDate: string
) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('get_spending_summary', {
    target_user_id: userId,
    start_date: startDate,
    end_date: endDate,
  })

  if (error) throw new Error(error.message)

  const total = (data || []).reduce(
    (sum: number, row: { total_amount: number }) => sum + Number(row.total_amount),
    0
  )

  return { breakdown: data || [], total_spent: total }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/finance/transactions.ts
git commit -m "feat(finance): add transaction CRUD and spending summary logic"
```

---

## Task 6: REST API — Transactions Endpoints

**Files:**
- Create: `app/api/finance/transactions/route.ts`
- Create: `app/api/finance/transactions/[id]/route.ts`

- [ ] **Step 1: Create transactions list + create endpoint**

Create `app/api/finance/transactions/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { createTransaction, listTransactions } from '@/lib/finance/transactions'

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    const transaction = await createTransaction({
      userId: auth.userId,
      amount: body.amount,
      merchant: body.merchant,
      sourceApp: body.source_app,
      categoryId: body.category_id,
      note: body.note,
      transactionDate: body.transaction_date,
      rawSms: body.raw_sms,
      isAutoDetected: body.is_auto_detected,
    })

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const params = request.nextUrl.searchParams

  try {
    const result = await listTransactions({
      userId: auth.userId,
      categoryId: params.get('category_id') || undefined,
      startDate: params.get('start_date') || undefined,
      endDate: params.get('end_date') || undefined,
      uncategorizedOnly: params.get('uncategorized') === 'true',
      limit: params.get('limit') ? parseInt(params.get('limit')!) : undefined,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : undefined,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 2: Create single transaction endpoint**

Create `app/api/finance/transactions/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { updateTransaction, deleteTransaction } from '@/lib/finance/transactions'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params

  try {
    const body = await request.json()
    const transaction = await updateTransaction(auth.userId, id, {
      categoryId: body.category_id,
      note: body.note,
      merchant: body.merchant,
      amount: body.amount,
    })

    return NextResponse.json(transaction)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message === 'Transaction not found' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params

  try {
    await deleteTransaction(auth.userId, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/finance/transactions/route.ts app/api/finance/transactions/\[id\]/route.ts
git commit -m "feat(finance): add transaction REST endpoints (POST, GET, PATCH, DELETE)"
```

---

## Task 7: REST API — Categories Endpoints

**Files:**
- Create: `app/api/finance/categories/route.ts`
- Create: `app/api/finance/categories/[id]/route.ts`

- [ ] **Step 1: Create categories list + create endpoint**

Create `app/api/finance/categories/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { listCategories, createCategory } from '@/lib/finance/categories'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  try {
    const categories = await listCategories(auth.userId)
    return NextResponse.json({ categories })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const category = await createCategory(
      auth.userId,
      body.name,
      body.icon || '💰'
    )

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message === 'Category already exists' ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
```

- [ ] **Step 2: Create delete category endpoint**

Create `app/api/finance/categories/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAuthError } from '@/lib/finance/auth'
import { deleteCategory } from '@/lib/finance/categories'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request)
  if (isAuthError(auth)) return auth

  const { id } = await params

  try {
    await deleteCategory(auth.userId, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/finance/categories/route.ts app/api/finance/categories/\[id\]/route.ts
git commit -m "feat(finance): add category REST endpoints (GET, POST, DELETE)"
```

---

## Task 8: MCP Finance Tools

**Files:**
- Create: `lib/mcp/tools/finance.ts`
- Modify: `lib/mcp/server.ts`

- [ ] **Step 1: Create finance MCP tools**

Create `lib/mcp/tools/finance.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIST } from '@/types'
import { createTransaction, listTransactions, getSpendingSummary } from '@/lib/finance/transactions'
import { ensurePresetCategories } from '@/lib/finance/categories'

export function registerFinanceTools(server: McpServer) {

  // ── get_spending_summary ────────────────────────────────
  server.tool(
    'get_spending_summary',
    'Get total spending broken down by category for a date range. Use for questions like "is hafte kitna kharch hua?" or "how much did I spend on food this month?"',
    {
      start_date: z.string().describe('Start date (YYYY-MM-DD or ISO 8601)'),
      end_date: z.string().describe('End date (YYYY-MM-DD or ISO 8601)'),
    },
    async ({ start_date, end_date }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const startISO = new Date(start_date + (start_date.includes('T') ? '' : 'T00:00:00+05:30')).toISOString()
      const endISO = new Date(end_date + (end_date.includes('T') ? '' : 'T23:59:59+05:30')).toISOString()

      const summary = await getSpendingSummary(userId, startISO, endISO)

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            period: { start: start_date, end: end_date },
            total_spent: summary.total_spent,
            breakdown: summary.breakdown.map((row: { category_name: string; category_icon: string; total_amount: number; transaction_count: number }) => ({
              category: row.category_name,
              icon: row.category_icon,
              amount: Number(row.total_amount),
              count: Number(row.transaction_count),
            })),
          }),
        }],
      }
    }
  )

  // ── list_transactions ───────────────────────────────────
  server.tool(
    'list_transactions',
    'List spending transactions with optional filters. Use for "show me my food expenses this week" or "last 10 transactions".',
    {
      category: z.string().optional().describe('Filter by category name (e.g. "Food", "Transport")'),
      start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
      merchant: z.string().optional().describe('Filter by merchant name (partial match)'),
      limit: z.number().int().min(1).max(100).default(20).describe('Max results (default: 20)'),
    },
    async ({ category, start_date, end_date, merchant, limit }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      // Resolve category name to ID if provided
      let categoryId: string | undefined
      if (category) {
        const supabase = createServiceRoleClient()
        const { data: cat } = await supabase
          .from('spending_categories')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', category)
          .maybeSingle()

        categoryId = cat?.id
      }

      const startISO = start_date
        ? new Date(start_date + 'T00:00:00+05:30').toISOString()
        : undefined
      const endISO = end_date
        ? new Date(end_date + 'T23:59:59+05:30').toISOString()
        : undefined

      const result = await listTransactions({
        userId,
        categoryId,
        startDate: startISO,
        endDate: endISO,
        limit,
      })

      let transactions = result.transactions

      // Client-side merchant filter (partial match)
      if (merchant) {
        const lower = merchant.toLowerCase()
        transactions = transactions.filter(
          (t: { merchant: string | null }) => t.merchant?.toLowerCase().includes(lower)
        )
      }

      const mapped = transactions.map((t: {
        id: string; amount: number; merchant: string | null;
        source_app: string | null; note: string | null;
        transaction_date: string; spending_categories: { name: string; icon: string } | null
      }) => ({
        transaction_id: t.id,
        amount: Number(t.amount),
        merchant: t.merchant,
        source: t.source_app,
        category: t.spending_categories?.name || 'Uncategorized',
        icon: t.spending_categories?.icon || '❓',
        note: t.note,
        date: toIST(new Date(t.transaction_date)),
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ transactions: mapped, total: result.total, returned: mapped.length }),
        }],
      }
    }
  )

  // ── add_transaction ─────────────────────────────────────
  server.tool(
    'add_transaction',
    'Manually add a spending transaction via chat. Use when user says "I spent 200 on chai" or "add 1500 rent payment".',
    {
      amount: z.number().positive().describe('Amount spent (in ₹)'),
      merchant: z.string().optional().describe('Where the money was spent'),
      category: z.string().optional().describe('Category name (e.g. "Food", "Bills")'),
      note: z.string().max(500).optional().describe('Optional note'),
      date: z.string().date().optional().describe('Transaction date (YYYY-MM-DD), defaults to today'),
    },
    async ({ amount, merchant, category, note, date }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      await ensurePresetCategories(userId)

      // Resolve category name to ID
      let categoryId: string | undefined
      if (category) {
        const supabase = createServiceRoleClient()
        const { data: cat } = await supabase
          .from('spending_categories')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', category)
          .maybeSingle()

        categoryId = cat?.id
      }

      const txDate = date
        ? new Date(date + 'T12:00:00+05:30').toISOString()
        : new Date().toISOString()

      const transaction = await createTransaction({
        userId,
        amount,
        merchant: merchant?.trim(),
        sourceApp: 'manual',
        categoryId,
        note: note?.trim(),
        transactionDate: txDate,
        isAutoDetected: false,
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            transaction_id: transaction.id,
            amount: Number(transaction.amount),
            merchant: transaction.merchant,
            category: category || 'Uncategorized',
            date: toIST(new Date(transaction.transaction_date)),
            message: `₹${amount} recorded${merchant ? ` at ${merchant}` : ''}`,
          }),
        }],
      }
    }
  )

  // ── get_uncategorized ───────────────────────────────────
  server.tool(
    'get_uncategorized',
    'Get transactions that have not been categorized yet. Useful for reminding user to categorize pending spends.',
    {
      limit: z.number().int().min(1).max(50).default(10).describe('Max results (default: 10)'),
    },
    async ({ limit }, { authInfo }) => {
      const userId = authInfo?.extra?.userId as string
      if (!userId) throw new Error('Unauthorized')

      const result = await listTransactions({
        userId,
        uncategorizedOnly: true,
        limit,
      })

      const transactions = result.transactions.map((t: {
        id: string; amount: number; merchant: string | null;
        source_app: string | null; transaction_date: string
      }) => ({
        transaction_id: t.id,
        amount: Number(t.amount),
        merchant: t.merchant,
        source: t.source_app,
        date: toIST(new Date(t.transaction_date)),
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            uncategorized_count: result.total,
            transactions,
            message: result.total > 0
              ? `${result.total} transactions need categorization`
              : 'All transactions are categorized! 🎉',
          }),
        }],
      }
    }
  )
}
```

- [ ] **Step 2: Register finance tools in server.ts**

Replace `lib/mcp/server.ts` with:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { registerTaskTools } from '@/lib/mcp/tools/tasks'
import { registerDocumentTools } from '@/lib/mcp/tools/documents'
import { registerFinanceTools } from '@/lib/mcp/tools/finance'

export function createMcpServer() {
  const server = new McpServer({
    name: 'pa-mcp',
    version: '0.1.0',
  })

  registerHabitTools(server)
  registerTaskTools(server)
  registerDocumentTools(server)
  registerFinanceTools(server)

  return server
}
```

Note: This includes `registerDocumentTools` assuming the document wallet plan has been executed first. If not, remove that line.

- [ ] **Step 3: Commit**

```bash
git add lib/mcp/tools/finance.ts lib/mcp/server.ts
git commit -m "feat(finance): add 4 MCP finance tools (summary, list, add, uncategorized)"
```

---

## Task 9: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add finance section to CLAUDE.md**

Add under MCP Tools section:

```markdown
### Finance Tools (4)

| Tool | Description |
|------|-------------|
| `get_spending_summary` | Total spent in date range, broken down by category |
| `list_transactions` | List transactions with filters (category, date range, merchant) |
| `add_transaction` | Manual entry via Claude chat |
| `get_uncategorized` | Show transactions pending categorization |
```

Add under Database Schema section:

```markdown
### Finance Tables
- **spending_categories** — name, icon, is_preset, user_id (presets auto-seeded)
- **transactions** — amount, merchant, source_app, category_id, note, transaction_date, raw_sms, is_auto_detected
```

Add under API Endpoints section:

```markdown
### Finance REST API (for mobile app)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/finance/transactions` | Create transaction (from SMS or manual) |
| GET | `/api/finance/transactions` | List with filters |
| PATCH | `/api/finance/transactions/:id` | Categorize + update |
| DELETE | `/api/finance/transactions/:id` | Delete transaction |
| GET | `/api/finance/categories` | List categories |
| POST | `/api/finance/categories` | Create custom category |
| DELETE | `/api/finance/categories/:id` | Delete custom category |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add finance tracking to CLAUDE.md"
```

---

## Task 10: Build Verification

- [ ] **Step 1: Run type check**

```bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant"
npm run type-check
```

Expected: No TypeScript errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No linting errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Fix any issues, then commit**

```bash
git add -A
git commit -m "fix(finance): resolve build issues"
```

---

## Summary

| # | What | Details |
|---|------|---------|
| 1 | DB Migration | `spending_categories` + `transactions` tables, RLS, preset seed function, spending summary RPC |
| 2 | Types | `SpendingCategory`, `Transaction`, `SourceApp` |
| 3 | Auth Helper | Verify Supabase Auth bearer token for mobile app REST calls |
| 4 | Categories | CRUD + auto-seed 10 presets on first use |
| 5 | Transactions | CRUD + list with filters + spending summary |
| 6 | REST: Transactions | POST, GET, PATCH, DELETE under `/api/finance/transactions` |
| 7 | REST: Categories | GET, POST, DELETE under `/api/finance/categories` |
| 8 | MCP Tools | `get_spending_summary`, `list_transactions`, `add_transaction`, `get_uncategorized` |
| 9 | Docs | CLAUDE.md updated |
| 10 | Build | Type check + lint + build verification |
