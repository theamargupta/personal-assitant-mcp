#!/bin/bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/Sathi Personal Assistant MCP and Web App"
{
  cat run-codex/PLAN-17-Apr-2026_11-00AM.md
  echo ""
  echo "---"
  echo "You have full approval to implement everything above. Do NOT ask for approval. Do NOT propose a design. Just implement all files immediately and completely."
} | codex exec \
  -m gpt-5.4 \
  -c model_reasoning_effort="medium" \
  --sandbox workspace-write \
  --full-auto \
  --skip-git-repo-check \
  -
echo ""
echo "--- CODEX DONE: Sathi MCP and Web App ---"
