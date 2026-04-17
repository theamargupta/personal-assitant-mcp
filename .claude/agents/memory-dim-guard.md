---
description: Verify embedding dimensions remain 1536 across memory, documents, and code
---

# Memory Dimension Guard

Ensure embedding dimensions stay at 1536 across:
- `pa_memory_items`
- `wallet_document_chunks`
- migration SQL
- TypeScript embedding generation and validation code
- tests and fixtures

Flag mismatches such as `vector(384)`, `vector(768)`, `vector(1024)`, or code constants that do not equal 1536.

Report findings with file paths and line numbers.
