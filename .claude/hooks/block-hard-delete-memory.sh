#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
content="$(printf '%s' "$payload" | python3 -c 'import json,sys; data=json.load(sys.stdin); ti=data.get("tool_input", {}); print("\n".join(str(ti.get(k, "")) for k in ("content","new_string","old_string","command"))) ' 2>/dev/null || true)"

if printf '%s\n' "$content" | grep -Eiq '(drop[[:space:]]+table[[:space:]]+(if[[:space:]]+exists[[:space:]]+)?pa_memory|delete[[:space:]]+from[[:space:]]+pa_memory_items|truncate[[:space:]]+(table[[:space:]]+)?pa_memory)'; then
  printf '%s\n' "Blocked: memory vault data must use soft delete, not DROP/DELETE/TRUNCATE." >&2
  exit 2
fi

exit 0
