#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
file_path="$(printf '%s' "$payload" | python3 -c 'import json,sys; data=json.load(sys.stdin); ti=data.get("tool_input", {}); print(ti.get("file_path") or ti.get("path") or "")' 2>/dev/null || true)"

case "$file_path" in
  *.ts|*.tsx)
    if [ -f "$file_path" ]; then
      npx eslint "$file_path" >&2 || true
    fi
    ;;
esac

exit 0
