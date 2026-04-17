---
description: Scaffold a new ExtApps widget
---

# Add Widget

Use `$ARGUMENTS` as the widget name and purpose.

1. Create a self-contained HTML file under `widgets/`.
2. Keep scripts and styles inline; do not load remote scripts.
3. Communicate all host state through `postMessage`.
4. Respect `prefers-color-scheme` for dark and light modes.
5. Update `scripts/gen-ext-apps-bundle.mjs` if the widget bundle reference list needs the new file.
6. Register the matching MCP tool with `registerAppTool`.
7. Set `_meta.ui.resourceUri` to the bundled widget resource URL.
8. Add focused tests or a manual verification note for the tool/widget contract.
