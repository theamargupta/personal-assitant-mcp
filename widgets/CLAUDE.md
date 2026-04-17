# ExtApps Widgets
- Each widget is a self-contained HTML file.
- Bundler: `scripts/gen-ext-apps-bundle.mjs` runs on `postinstall`.
- Communicate with host via `postMessage`.
- Respect dark/light via CSS `prefers-color-scheme`.
- MCP tool must register with `registerAppTool` + `_meta.ui.resourceUri` pointing to the bundled resource URL.
- No remote script loads. Keep everything inline.
