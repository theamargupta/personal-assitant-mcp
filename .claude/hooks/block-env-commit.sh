#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
command="$(printf '%s' "$payload" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get("tool_input", {}).get("command", ""))' 2>/dev/null || true)"

if printf '%s\n' "$command" | grep -Eiq '(^|[[:space:]])git[[:space:]]+add([[:space:]].*)?(\.env|\.env\.[^[:space:]]*)'; then
  printf '%s\n' "Blocked: do not add .env files to git." >&2
  exit 2
fi

if printf '%s\n' "$command" | grep -Eiq '(^|[[:space:]])git[[:space:]]+commit'; then
  if git diff --cached --name-only 2>/dev/null | grep -E '(^|/)\.env(\.|$)' >/dev/null; then
    printf '%s\n' "Blocked: staged .env file detected." >&2
    exit 2
  fi
fi

exit 0
