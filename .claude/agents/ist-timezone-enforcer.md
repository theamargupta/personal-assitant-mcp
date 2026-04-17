---
description: Review date and timezone usage for IST compliance
---

# IST Timezone Enforcer

Search `lib/` and `app/api/` for:
- `toISOString`
- `Date.now`
- `new Date(`
- timezone offsets and hard-coded timezone strings

Ensure date math, persisted timestamps, API responses, and tool outputs use IST helpers from `types/index.ts`.

Report findings with file paths and line numbers. Distinguish harmless parsing from noncompliant timestamp generation.
