# PA MCP — Personal Assistant MCP Server

## Overview

A Personal Assistant MCP (Model Context Protocol) Server that provides Claude and other AI assistants with structured tools for managing habits and tasks. Deployed on Vercel at `pa-mcp.devfrend.com`.

**Version:** 0.1.0
**Jira Epic:** [PA-1](https://theamarguptatech.atlassian.net/browse/PA-1) (In Progress)

## Tech Stack

- **Framework:** Next.js 16.2.3 + React 19.2.4 + TypeScript
- **Database:** Supabase (PostgreSQL) with SSR adapter
- **MCP:** Model Context Protocol SDK v1.29.0
- **Validation:** Zod 4.3.6
- **Auth:** OAuth 2.0 with PKCE (S256)
- **Timezone:** All timestamps use IST (Asia/Kolkata)

## Project Structure

```
app/
  page.tsx                          # Landing page
  layout.tsx                        # Root layout
  api/
    mcp/route.ts                    # Main MCP endpoint (OAuth-protected)
    health/route.ts                 # Health check
  oauth/
    authorize/route.ts              # OAuth authorization
    token/route.ts                  # Token exchange
    register/route.ts               # Dynamic client registration
    revoke/route.ts                 # Token revocation
  .well-known/
    oauth-authorization-server/route.ts
    oauth-protected-resource/api/mcp/route.ts
lib/
  mcp/
    server.ts                       # MCP server factory (stateless, per-request)
    oauth.ts                        # OAuth 2.0 implementation (~510 lines)
    tools/
      habits.ts                     # 5 habit tools (~373 lines)
      tasks.ts                      # 4 task tools (~235 lines)
      documents.ts                  # 5 document wallet tools
      finance.ts                    # 4 finance tools
      goals.ts                      # 6 goal tools (create, list, update, progress, review, milestone)
  finance/
    auth.ts                         # Supabase Auth bearer token verification
    categories.ts                   # Category CRUD + preset seeding
    transactions.ts                 # Transaction CRUD + summary queries
  supabase/
    server.ts                       # Server-side Supabase client (SSR)
    service-role.ts                 # Service role client for backend ops
types/
  index.ts                          # TypeScript types + IST helpers
supabase/
  migrations/
    001_habits_and_tasks.sql        # habits, habit_logs, tasks tables
    002_mcp_oauth.sql               # mcp_oauth_clients, authorization_codes, tokens
    003_document_wallet.sql         # documents, document_chunks tables
    004_finance_tracking.sql        # spending_categories, transactions tables
    005_goals.sql                   # goals, goal_milestones tables
lib/
  goals/
    goals.ts                        # Goal CRUD + progress computation from linked data
    review.ts                       # Cross-module aggregation: habits + tasks + finance + goals → review
app/api/finance/
    transactions/route.ts           # POST + GET transactions
    transactions/[id]/route.ts      # PATCH + DELETE transaction
    categories/route.ts             # GET + POST categories
    categories/[id]/route.ts        # DELETE category
```

## MCP Tools

### Habit Tools (5)

| Tool | Description |
|------|-------------|
| `create_habit` | Create habit with name, frequency (daily/weekly/monthly), description, color, reminder_time |
| `log_habit_completion` | Log daily completion with notes; unique constraint per (habit_id, logged_date) |
| `get_habit_streak` | Current streak, best streak, last logged date |
| `get_habit_analytics` | N-day completion %, day-by-day breakdown, streaks |
| `update_habit` | Modify properties or archive |

### Task Tools (4)

| Tool | Description |
|------|-------------|
| `create_task` | Title, description, due date, priority (low/medium/high), tags |
| `list_tasks` | Filter by status/priority/due date range; pagination |
| `update_task_status` | Status transitions with notes |
| `complete_task` | Mark completed with overdue detection, time-to-completion calc |

### Document Wallet Tools (5)

| Tool | Description |
|------|-------------|
| `upload_document` | Upload PDF/image, extract text, chunk + embed for search |
| `list_documents` | List documents with filters by type and tags |
| `get_document` | Get document details + signed download URL (1hr expiry) |
| `search_documents` | Semantic search across all document content |
| `delete_document` | Permanently delete document, chunks, and stored file |

### Finance Tools (4)

| Tool | Description |
|------|-------------|
| `get_spending_summary` | Total spent in date range, broken down by category |
| `list_transactions` | List transactions with filters (category, date range, merchant) |
| `add_transaction` | Manual entry via Claude chat |
| `get_uncategorized` | Show transactions pending categorization |

### Goal Tools (6)

| Tool | Description |
|------|-------------|
| `create_goal` | Create outcome (auto-tracked) or milestone (manual) goals |
| `list_goals` | List goals with live progress, filter by status/type |
| `update_goal` | Update goal properties or toggle milestone completion |
| `get_goal_progress` | Detailed progress for a goal including milestones |
| `get_review` | Comprehensive period review: habits + tasks + finance + goals + highlights |
| `add_milestone` | Add sub-steps to milestone-type goals |

## Database Schema

### Core Tables
- **habits** — name, frequency, color, reminder_time, archived, user_id
- **habit_logs** — habit_id, logged_date, notes (unique on habit_id + logged_date)
- **tasks** — title, description, status (pending/in_progress/completed), priority (low/medium/high), due_date, tags[], completed_at

### Document Wallet Tables
- **wallet_documents** — name, description, doc_type, mime_type, file_size, storage_path, tags, extracted_text
- **wallet_document_chunks** — document_id, chunk_index, content, token_count, embedding (vector 1536)

### Finance Tables
- **spending_categories** — name, icon, is_preset, user_id (presets auto-seeded)
- **transactions** — amount, merchant, source_app, category_id, note, transaction_date, raw_sms, is_auto_detected

### Goal Tables
- **goals** — title, goal_type (outcome/milestone), metric_type, target_value, is_recurring, recurrence, start_date, end_date, status
- **goal_milestones** — goal_id, title, sort_order, completed, completed_at

### OAuth Tables
- **mcp_oauth_clients** — client registration data
- **mcp_oauth_authorization_codes** — authorization code flow
- **mcp_oauth_tokens** — access/refresh tokens (SHA-256 hashed)

All tables have Row Level Security (RLS) policies enforcing user isolation.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/mcp` | MCP server info |
| POST | `/api/mcp` | MCP tool invocations (bearer token required) |
| GET/POST | `/oauth/authorize` | Authorization endpoint |
| POST | `/oauth/token` | Token exchange (authorization_code, refresh_token) |
| POST | `/oauth/register` | Dynamic client registration |
| POST | `/oauth/revoke` | Token revocation |

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

## Key Design Decisions

- **Stateless MCP server** — new instance per request (required for Vercel serverless)
- **OAuth 2.0 + PKCE** — secure token exchange for AI assistants (Claude.ai, ChatGPT, etc.)
- **Token hashing** — all OAuth tokens SHA-256 hashed before DB storage
- **IST timezone** — all datetime ops use `Asia/Kolkata`
- **Zod schemas** — type-safe validation for all MCP tool parameters
- **Supabase service-role** — server-side operations; anon key for client ops

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=         # Supabase service role key (private)
OPENAI_API_KEY=                    # OpenAI API key (for document embeddings)
```

## Development

```bash
npm install
npm run dev        # Start dev server
npm run build      # Production build
npm run lint       # ESLint
```

## Current Status

### Done
- MCP server core + tool registration
- Full OAuth 2.0 with PKCE
- Database schema + migrations
- Habit tools (5/5)
- Task tools (4/4)
- Document Wallet tools (5/5)
- Finance tools (4/4)
- Goal tools (6/6) — outcome goals (auto-tracked from habits/tasks/finance), milestone goals, cross-module review
- IST helpers, Zod schemas

### Pending
- Error logging / monitoring
- Frontend dashboard UI (stretch)
