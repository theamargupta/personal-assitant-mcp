---
description: Check timestamp usage for IST compliance
---

# IST Timestamp Check

Report only. Do not modify files.

1. Search `lib/` and `app/api/` for:
   - `new Date()`
   - `new Date(`
   - `Date.now()`
   - `toISOString()`
2. For each match, verify whether it flows through IST helpers in `types/index.ts`.
3. Flag matches that perform date math, persistence, or response timestamp formatting without IST helpers.
4. Include file paths and line numbers.
5. Summarize whether the remaining uses are acceptable or need changes.
