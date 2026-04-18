#!/bin/bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/Sathi/Sathi Personal Assistant MCP and Web App"
{
  cat run-codex/PLAN-18-Apr-2026_05-33PM.md
  echo ""
  echo "---"
  echo "You have full approval to implement everything above. Do NOT ask for approval. Do NOT propose a design. Just implement all files immediately and completely."
} | codex exec \
  -m gpt-5.4 \
  -c model_reasoning_effort="high" \
  --sandbox workspace-write \
  --full-auto \
  --skip-git-repo-check \
  -
echo ""
echo "--- CODEX DONE: Sathi landing page rewrite ---"
