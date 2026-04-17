#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
file_path="$(printf '%s' "$payload" | python3 -c 'import json,sys; data=json.load(sys.stdin); ti=data.get("tool_input", {}); print(ti.get("file_path") or ti.get("path") or "")' 2>/dev/null || true)"

case "$(basename "$file_path")" in
  tailwind.config.*)
    printf '%s\n' "Blocked: do not create or edit tailwind.config.* in this project." >&2
    exit 2
    ;;
esac

exit 0
