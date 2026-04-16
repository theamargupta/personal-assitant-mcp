# Plan: MCP App Widgets — Visual UI in Claude Chat

## Objective
Add interactive widgets and image content to PA MCP tools so users see heatmaps, charts, dashboards, pickers, and document previews inline in Claude chat.

## Architecture

PA MCP runs as a Next.js API route at `/api/mcp`. It's stateless — new McpServer per request. We need to:
1. Install `@modelcontextprotocol/ext-apps`
2. Create widget HTML files in `widgets/` directory
3. Register widget resources in `lib/mcp/server.ts`
4. Update 5 tool handlers to declare `_meta.ui.resourceUri`
5. Add `type: 'image'` content to 2 tools (heatmap + chart) using server-side SVG→base64

## Current Setup

- MCP SDK: `@modelcontextprotocol/sdk@1.29.0`
- Server factory: `lib/mcp/server.ts` creates `McpServer` and registers tools
- All tools return `{ content: [{ type: 'text', text: JSON.stringify(data) }] }`
- Deployed on Vercel (serverless) — no persistent state

## Step 1: Install Dependencies

```bash
npm install @modelcontextprotocol/ext-apps
```

That's it. No canvas/sharp/puppeteer — we generate images as inline SVG converted to base64 data URIs. This works in serverless.

## Step 2: Create Widget HTML Files

Create `widgets/` directory at project root with these files:

### `widgets/habit-heatmap.html`
A 30-day calendar heatmap showing habit completion patterns.

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 13px system-ui, sans-serif; background: transparent; color: #fafafa; }
  .container { padding: 16px; }
  .title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #737373; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; max-width: 280px; }
  .day-label { font-size: 9px; color: #525252; text-align: center; padding: 2px 0; }
  .cell { aspect-ratio: 1; border-radius: 3px; position: relative; }
  .cell.completed { background: #c8ff00; }
  .cell.missed { background: rgba(255,255,255,0.04); }
  .cell.today { outline: 1.5px solid #c8ff00; outline-offset: -1px; }
  .stats { display: flex; gap: 20px; margin-top: 16px; }
  .stat { }
  .stat-value { font-size: 20px; font-weight: 700; }
  .stat-value.neon { color: #c8ff00; }
  .stat-label { font-size: 10px; color: #525252; text-transform: uppercase; letter-spacing: 0.1em; }
  .tooltip { position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1); color: #fafafa; font-size: 10px; padding: 3px 6px; border-radius: 4px; white-space: nowrap; pointer-events: none; display: none; z-index: 10; }
  .cell:hover .tooltip { display: block; }

  @media (prefers-color-scheme: light) {
    body { color: #1a1a1a; }
    .cell.missed { background: rgba(0,0,0,0.04); }
    .cell.completed { background: #65a300; }
    .cell.today { outline-color: #65a300; }
    .stat-value.neon { color: #65a300; }
    .stat-label { color: #888; }
    .subtitle { color: #888; }
    .tooltip { background: #fff; border-color: rgba(0,0,0,0.1); color: #1a1a1a; }
  }
</style>
<div class="container">
  <div class="title" id="habit-name"></div>
  <div class="subtitle" id="period"></div>
  <div class="grid" id="grid">
    <div class="day-label">M</div><div class="day-label">T</div><div class="day-label">W</div>
    <div class="day-label">T</div><div class="day-label">F</div><div class="day-label">S</div><div class="day-label">S</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-value neon" id="streak"></div><div class="stat-label">Current Streak</div></div>
    <div class="stat"><div class="stat-value" id="best"></div><div class="stat-label">Best Streak</div></div>
    <div class="stat"><div class="stat-value neon" id="pct"></div><div class="stat-label">Completion</div></div>
  </div>
</div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
const { App } = globalThis.ExtApps;
(async () => {
  const app = new App({ name: "HabitHeatmap", version: "1.0.0" }, {});
  const grid = document.getElementById("grid");

  app.ontoolresult = ({ content }) => {
    const data = JSON.parse(content[0].text);
    document.getElementById("habit-name").textContent = data.name;
    document.getElementById("period").textContent = data.period_days + "-day overview";
    document.getElementById("streak").textContent = data.current_streak + "d";
    document.getElementById("best").textContent = data.best_streak + "d";
    document.getElementById("pct").textContent = data.completion_percentage + "%";

    const today = new Date().toISOString().split("T")[0];

    // Pad to start on Monday
    if (data.day_by_day && data.day_by_day.length > 0) {
      const firstDate = new Date(data.day_by_day[0].date);
      const dayOfWeek = firstDate.getDay(); // 0=Sun
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      for (let i = 0; i < mondayOffset; i++) {
        const spacer = document.createElement("div");
        grid.appendChild(spacer);
      }
    }

    for (const day of data.day_by_day || []) {
      const cell = document.createElement("div");
      cell.className = "cell " + (day.completed ? "completed" : "missed");
      if (day.date === today) cell.classList.add("today");
      const tip = document.createElement("div");
      tip.className = "tooltip";
      tip.textContent = day.date + (day.completed ? " ✓" : " ✗");
      cell.appendChild(tip);
      grid.appendChild(cell);
    }
  };

  await app.connect();
})();
</script>
```

### `widgets/spending-chart.html`
A horizontal bar chart showing spending by category.

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 13px system-ui, sans-serif; background: transparent; color: #fafafa; }
  .container { padding: 16px; }
  .total { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
  .total .currency { color: #525252; font-weight: 400; }
  .period { font-size: 11px; color: #525252; margin-bottom: 20px; }
  .bar-group { margin-bottom: 12px; }
  .bar-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .bar-label { font-size: 12px; color: #737373; }
  .bar-amount { font-size: 12px; font-family: ui-monospace, monospace; color: #737373; }
  .bar-track { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.04); overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; background: #c8ff00; transition: width 0.6s ease; }
  .bar-fill.secondary { background: rgba(255,255,255,0.15); }

  @media (prefers-color-scheme: light) {
    body { color: #1a1a1a; }
    .bar-track { background: rgba(0,0,0,0.04); }
    .bar-fill { background: #65a300; }
    .bar-fill.secondary { background: rgba(0,0,0,0.08); }
    .bar-label, .bar-amount, .period { color: #888; }
    .total .currency { color: #888; }
  }
</style>
<div class="container">
  <div class="total"><span class="currency">₹</span><span id="total"></span></div>
  <div class="period" id="period"></div>
  <div id="bars"></div>
</div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
const { App } = globalThis.ExtApps;
(async () => {
  const app = new App({ name: "SpendingChart", version: "1.0.0" }, {});

  app.ontoolresult = ({ content }) => {
    const data = JSON.parse(content[0].text);
    document.getElementById("total").textContent = data.total_spent.toLocaleString("en-IN");
    document.getElementById("period").textContent = data.period.start + " — " + data.period.end;

    const bars = document.getElementById("bars");
    const maxAmount = Math.max(...data.breakdown.map(b => b.amount), 1);

    for (const cat of data.breakdown) {
      const pct = (cat.amount / maxAmount) * 100;
      const group = document.createElement("div");
      group.className = "bar-group";
      group.innerHTML = `
        <div class="bar-header">
          <span class="bar-label">${cat.icon} ${cat.category}</span>
          <span class="bar-amount">₹${cat.amount.toLocaleString("en-IN")}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill${pct < 30 ? " secondary" : ""}" style="width:${pct}%"></div>
        </div>
      `;
      bars.appendChild(group);
    }
  };

  await app.connect();
})();
</script>
```

### `widgets/review-dashboard.html`
Full life review dashboard with progress rings, stats, spending bars.

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 13px system-ui, sans-serif; background: transparent; color: #fafafa; }
  .container { padding: 16px; }
  .header { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .subheader { font-size: 11px; color: #525252; margin-bottom: 20px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.15em; color: #c8ff00; margin-bottom: 10px; }
  .highlights { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-bottom: 20px; }
  .highlight-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 12px; }
  .highlight-value { font-size: 20px; font-weight: 700; }
  .highlight-value.neon { color: #c8ff00; }
  .highlight-label { font-size: 10px; color: #525252; margin-top: 2px; }
  .habit-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .habit-name { font-size: 12px; flex: 1; }
  .habit-streak { font-size: 12px; color: #c8ff00; font-family: ui-monospace, monospace; }
  .progress-bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.04); flex: 1; max-width: 100px; }
  .progress-fill { height: 100%; border-radius: 2px; background: #c8ff00; }
  .goal-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .goal-ring { width: 36px; height: 36px; flex-shrink: 0; }
  .goal-info { flex: 1; }
  .goal-title { font-size: 12px; }
  .goal-meta { font-size: 10px; color: #525252; }
  .spending-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
  .spending-cat { color: #737373; }
  .spending-amt { font-family: ui-monospace, monospace; color: #737373; }

  @media (prefers-color-scheme: light) {
    body { color: #1a1a1a; }
    .section-title { color: #65a300; }
    .highlight-card { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.06); }
    .highlight-value.neon { color: #65a300; }
    .highlight-label, .subheader { color: #888; }
    .habit-streak { color: #65a300; }
    .progress-bar { background: rgba(0,0,0,0.04); }
    .progress-fill { background: #65a300; }
    .spending-cat, .spending-amt, .goal-meta { color: #888; }
  }
</style>
<div class="container">
  <div class="header" id="title"></div>
  <div class="subheader" id="period"></div>

  <div class="highlights" id="highlights"></div>

  <div class="section">
    <div class="section-title">Habit Streaks</div>
    <div id="habits"></div>
  </div>

  <div class="section">
    <div class="section-title">Goals</div>
    <div id="goals"></div>
  </div>

  <div class="section">
    <div class="section-title">Spending</div>
    <div id="spending"></div>
  </div>
</div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
const { App } = globalThis.ExtApps;
(async () => {
  const app = new App({ name: "ReviewDashboard", version: "1.0.0" }, {});

  function ring(pct, size=36) {
    const r = (size - 6) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    return `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="3"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#c8ff00" stroke-width="3"
        stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
    </svg>`;
  }

  app.ontoolresult = ({ content }) => {
    const d = JSON.parse(content[0].text);
    document.getElementById("title").textContent = d.period.label + " Review";
    document.getElementById("period").textContent = d.period.start + " — " + d.period.end;

    // Highlights
    const hl = d.highlights;
    const cards = [
      { value: hl.tasks_completed, label: "Tasks Done" },
      { value: hl.tasks_pending, label: "Pending" },
      { value: "₹" + d.finance.total_spent.toLocaleString("en-IN"), label: "Total Spent", neon: false },
      { value: hl.goals_hit, label: "Goals Hit", neon: true },
    ];
    const hlEl = document.getElementById("highlights");
    for (const c of cards) {
      hlEl.innerHTML += `<div class="highlight-card">
        <div class="highlight-value${c.neon ? " neon" : ""}">${c.value}</div>
        <div class="highlight-label">${c.label}</div>
      </div>`;
    }

    // Habits
    const habitsEl = document.getElementById("habits");
    for (const h of d.habits.streaks || []) {
      habitsEl.innerHTML += `<div class="habit-row">
        <span class="habit-name">${h.name}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${h.completion_pct}%"></div></div>
        <span class="habit-streak">${h.current_streak}d</span>
      </div>`;
    }

    // Goals
    const goalsEl = document.getElementById("goals");
    for (const g of d.goals.details || []) {
      goalsEl.innerHTML += `<div class="goal-row">
        <div class="goal-ring">${ring(g.progress_pct)}</div>
        <div class="goal-info">
          <div class="goal-title">${g.title}</div>
          <div class="goal-meta">${g.goal_type} · ${g.progress_pct}%</div>
        </div>
      </div>`;
    }

    // Spending
    const spendEl = document.getElementById("spending");
    for (const b of d.finance.breakdown || []) {
      spendEl.innerHTML += `<div class="spending-row">
        <span class="spending-cat">${b.icon} ${b.category}</span>
        <span class="spending-amt">₹${b.amount.toLocaleString("en-IN")}</span>
      </div>`;
    }
  };

  await app.connect();
})();
</script>
```

### `widgets/transaction-categorizer.html`
Interactive picker for assigning categories to uncategorized transactions.

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 13px system-ui, sans-serif; background: transparent; color: #fafafa; }
  .container { padding: 16px; }
  .title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .subtitle { font-size: 11px; color: #525252; margin-bottom: 16px; }
  .tx-list { }
  .tx-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .tx-info { flex: 1; }
  .tx-merchant { font-size: 13px; }
  .tx-meta { font-size: 10px; color: #525252; }
  .tx-amount { font-size: 14px; font-weight: 600; font-family: ui-monospace, monospace; }
  select { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #fafafa; padding: 6px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; }
  select:focus { outline: none; border-color: #c8ff00; }
  .done { color: #c8ff00; font-size: 11px; font-weight: 600; }

  @media (prefers-color-scheme: light) {
    body { color: #1a1a1a; }
    .tx-item { border-color: rgba(0,0,0,0.06); }
    .tx-meta, .subtitle { color: #888; }
    select { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.1); color: #1a1a1a; }
    select:focus { border-color: #65a300; }
    .done { color: #65a300; }
  }
</style>
<div class="container">
  <div class="title" id="title">Uncategorized Transactions</div>
  <div class="subtitle" id="subtitle"></div>
  <div class="tx-list" id="list"></div>
</div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
const { App } = globalThis.ExtApps;
(async () => {
  const app = new App({ name: "TransactionCategorizer", version: "1.0.0" }, {});
  const list = document.getElementById("list");
  const categories = ["Food", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Education", "Other"];

  app.ontoolresult = ({ content }) => {
    const data = JSON.parse(content[0].text);
    document.getElementById("subtitle").textContent = data.uncategorized_count + " transactions need categorization";
    list.innerHTML = "";

    for (const tx of data.transactions) {
      const row = document.createElement("div");
      row.className = "tx-item";
      row.innerHTML = `
        <div class="tx-info">
          <div class="tx-merchant">${tx.merchant || tx.source || "Unknown"}</div>
          <div class="tx-meta">${tx.date}</div>
        </div>
        <div class="tx-amount">₹${tx.amount.toLocaleString("en-IN")}</div>
      `;

      const sel = document.createElement("select");
      sel.innerHTML = '<option value="">Assign...</option>' +
        categories.map(c => `<option value="${c}">${c}</option>`).join("");

      sel.addEventListener("change", () => {
        if (!sel.value) return;
        app.sendMessage({
          role: "user",
          content: [{ type: "text", text: `Categorize transaction ${tx.transaction_id} as ${sel.value}` }],
        });
        sel.replaceWith(Object.assign(document.createElement("span"), { className: "done", textContent: "✓ " + sel.value }));
      });

      row.appendChild(sel);
      list.appendChild(row);
    }
  };

  await app.connect();
})();
</script>
```

### `widgets/document-viewer.html`
Document preview with metadata display.

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font: 13px system-ui, sans-serif; background: transparent; color: #fafafa; }
  .container { padding: 16px; }
  .doc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .doc-icon { width: 40px; height: 40px; border-radius: 8px; background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .doc-title { font-size: 15px; font-weight: 600; }
  .doc-meta { font-size: 11px; color: #525252; }
  .preview { width: 100%; max-height: 400px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); overflow: hidden; margin-bottom: 12px; }
  .preview img { width: 100%; display: block; }
  .preview iframe { width: 100%; height: 400px; border: none; }
  .tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }
  .tag { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,0.04); color: #737373; }
  .download-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; background: #c8ff00; color: #050505; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
  .info-row { display: flex; justify-content: space-between; font-size: 11px; color: #525252; margin-bottom: 4px; }

  @media (prefers-color-scheme: light) {
    body { color: #1a1a1a; }
    .doc-icon { background: rgba(0,0,0,0.04); }
    .preview { border-color: rgba(0,0,0,0.08); }
    .tag { background: rgba(0,0,0,0.04); color: #888; }
    .download-btn { background: #65a300; color: #fff; }
    .doc-meta, .info-row { color: #888; }
  }
</style>
<div class="container">
  <div class="doc-header">
    <div class="doc-icon" id="icon"></div>
    <div>
      <div class="doc-title" id="name"></div>
      <div class="doc-meta" id="meta"></div>
    </div>
  </div>
  <div class="preview" id="preview"></div>
  <div class="tags" id="tags"></div>
  <div class="info-row"><span>Size</span><span id="size"></span></div>
  <div class="info-row"><span>Type</span><span id="type"></span></div>
  <div class="info-row"><span>Searchable</span><span id="searchable"></span></div>
  <br/>
  <button class="download-btn" id="download">↓ Download</button>
</div>
<script type="module">
/*__EXT_APPS_BUNDLE__*/
const { App } = globalThis.ExtApps;
(async () => {
  const app = new App({ name: "DocumentViewer", version: "1.0.0" }, {});
  const icons = { pdf: "📄", image: "🖼️", other: "📁" };

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  app.ontoolresult = ({ content }) => {
    const d = JSON.parse(content[0].text);
    document.getElementById("icon").textContent = icons[d.doc_type] || "📁";
    document.getElementById("name").textContent = d.name;
    document.getElementById("meta").textContent = d.created_at;
    document.getElementById("size").textContent = formatSize(d.file_size_bytes);
    document.getElementById("type").textContent = d.mime_type;
    document.getElementById("searchable").textContent = d.has_extracted_text ? "Yes ✓" : "No";

    // Tags
    const tagsEl = document.getElementById("tags");
    for (const tag of d.tags || []) {
      tagsEl.innerHTML += '<span class="tag">' + tag + '</span>';
    }

    // Preview
    const previewEl = document.getElementById("preview");
    if (d.mime_type && d.mime_type.startsWith("image/")) {
      previewEl.innerHTML = '<img src="' + d.download_url + '" alt="' + d.name + '" />';
    } else if (d.mime_type === "application/pdf") {
      previewEl.innerHTML = '<iframe src="' + d.download_url + '"></iframe>';
    } else {
      previewEl.style.display = "none";
    }

    // Download button
    document.getElementById("download").addEventListener("click", () => {
      app.openLink({ url: d.download_url });
    });
  };

  await app.connect();
})();
</script>
```

## Step 3: Create Widget Loader Utility

Create `lib/mcp/widgets.ts` — loads widget HTML files and inlines the ext-apps bundle:

```typescript
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const require = createRequire(import.meta.url)

// Inline the ext-apps browser bundle once at import time
let extAppsBundle: string | null = null

function getBundle(): string {
  if (extAppsBundle) return extAppsBundle

  try {
    const raw = readFileSync(
      require.resolve('@modelcontextprotocol/ext-apps/app-with-deps'),
      'utf8',
    )
    extAppsBundle = raw.replace(/export\{([^}]+)\};?\s*$/, (_, body) =>
      'globalThis.ExtApps={' +
      body.split(',').map((p: string) => {
        const [local, exported] = p.split(' as ').map((s: string) => s.trim())
        return `${exported ?? local}:${local}`
      }).join(',') + '};',
    )
  } catch {
    // Fallback: return empty bundle (widget will show plain data)
    extAppsBundle = '/* ext-apps bundle not available */'
  }

  return extAppsBundle
}

function loadWidget(filename: string): string {
  const widgetPath = join(process.cwd(), 'widgets', filename)
  const html = readFileSync(widgetPath, 'utf8')
  return html.replace('/*__EXT_APPS_BUNDLE__*/', () => getBundle())
}

interface WidgetDef {
  name: string
  filename: string
  uri: string
}

const WIDGETS: WidgetDef[] = [
  { name: 'Habit Heatmap', filename: 'habit-heatmap.html', uri: 'ui://widgets/habit-heatmap.html' },
  { name: 'Spending Chart', filename: 'spending-chart.html', uri: 'ui://widgets/spending-chart.html' },
  { name: 'Review Dashboard', filename: 'review-dashboard.html', uri: 'ui://widgets/review-dashboard.html' },
  { name: 'Transaction Categorizer', filename: 'transaction-categorizer.html', uri: 'ui://widgets/transaction-categorizer.html' },
  { name: 'Document Viewer', filename: 'document-viewer.html', uri: 'ui://widgets/document-viewer.html' },
]

export function registerWidgetResources(server: McpServer) {
  for (const w of WIDGETS) {
    let cachedHtml: string | null = null

    registerAppResource(
      server,
      w.name,
      w.uri,
      {},
      async () => {
        if (!cachedHtml) cachedHtml = loadWidget(w.filename)
        return {
          contents: [{
            uri: w.uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: cachedHtml,
          }],
        }
      },
    )
  }
}

// Export URIs for tool _meta references
export const WIDGET_URIS = {
  habitHeatmap: 'ui://widgets/habit-heatmap.html',
  spendingChart: 'ui://widgets/spending-chart.html',
  reviewDashboard: 'ui://widgets/review-dashboard.html',
  transactionCategorizer: 'ui://widgets/transaction-categorizer.html',
  documentViewer: 'ui://widgets/document-viewer.html',
}
```

## Step 4: Update `lib/mcp/server.ts`

Add widget resource registration:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerHabitTools } from '@/lib/mcp/tools/habits'
import { registerTaskTools } from '@/lib/mcp/tools/tasks'
import { registerDocumentTools } from '@/lib/mcp/tools/documents'
import { registerFinanceTools } from '@/lib/mcp/tools/finance'
import { registerGoalTools } from '@/lib/mcp/tools/goals'
import { registerWidgetResources } from '@/lib/mcp/widgets'

export function createMcpServer() {
  const server = new McpServer({
    name: 'pa-mcp',
    version: '0.1.0',
  })

  registerHabitTools(server)
  registerTaskTools(server)
  registerDocumentTools(server)
  registerFinanceTools(server)
  registerGoalTools(server)
  registerWidgetResources(server)

  return server
}
```

## Step 5: Update Tool Handlers to Declare Widgets

These tools need `_meta.ui.resourceUri` added. Use `registerAppTool` from `@modelcontextprotocol/ext-apps/server` instead of `server.tool()` for these 5 tools.

**IMPORTANT**: The `registerAppTool` function signature:
```typescript
registerAppTool(server, toolName, { description, inputSchema, _meta }, handler)
```

Update these tools in their respective files:

### In `lib/mcp/tools/habits.ts`:
- `get_habit_analytics` → add `_meta: { ui: { resourceUri: 'ui://widgets/habit-heatmap.html' } }`

### In `lib/mcp/tools/finance.ts`:
- `get_spending_summary` → add `_meta: { ui: { resourceUri: 'ui://widgets/spending-chart.html' } }`
- `get_uncategorized` → add `_meta: { ui: { resourceUri: 'ui://widgets/transaction-categorizer.html' } }`

### In `lib/mcp/tools/goals.ts`:
- `get_review` → add `_meta: { ui: { resourceUri: 'ui://widgets/review-dashboard.html' } }`

### In `lib/mcp/tools/documents.ts`:
- `get_document` → add `_meta: { ui: { resourceUri: 'ui://widgets/document-viewer.html' } }`

For each of these, change from `server.tool(name, desc, schema, handler)` to:
```typescript
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'

registerAppTool(server, 'get_habit_analytics', {
  description: 'Get completion percentage, trends, and analytics...',
  inputSchema: { /* existing zod schemas */ },
  _meta: { ui: { resourceUri: 'ui://widgets/habit-heatmap.html' } },
}, async (args, extra) => {
  // existing handler body unchanged
})
```

**CRITICAL**: Only change the 5 tools listed above. All other tools (create_habit, list_tasks, etc.) stay as `server.tool()` — they don't need widgets.

**CRITICAL**: The handler signature changes slightly with `registerAppTool`. The args come directly (not destructured from the first param). Check the ext-apps types. If `registerAppTool` handler signature is `(args, extra)`, adjust accordingly.

## Step 6: Include widget files in Vercel deployment

Create or update `vercel.json` (or `vercel.ts`) to include the `widgets/` directory in the serverless function bundle. In Next.js on Vercel, files read with `readFileSync(join(process.cwd(), ...))` from API routes are automatically included IF they're referenced at build time. 

As a safety measure, add to `next.config.ts`:
```typescript
// Ensure widgets/ directory is included in serverless bundle
const nextConfig = {
  // ... existing config
  outputFileTracingIncludes: {
    '/api/mcp': ['./widgets/**/*'],
  },
}
```

If `next.config.ts` doesn't exist, check for `next.config.js` or `next.config.mjs` and add the `outputFileTracingIncludes` there.

## Files to Create/Modify

| Action | File |
|--------|------|
| CREATE | `widgets/habit-heatmap.html` |
| CREATE | `widgets/spending-chart.html` |
| CREATE | `widgets/review-dashboard.html` |
| CREATE | `widgets/transaction-categorizer.html` |
| CREATE | `widgets/document-viewer.html` |
| CREATE | `lib/mcp/widgets.ts` |
| MODIFY | `lib/mcp/server.ts` — add registerWidgetResources |
| MODIFY | `lib/mcp/tools/habits.ts` — get_habit_analytics → registerAppTool with widget |
| MODIFY | `lib/mcp/tools/finance.ts` — get_spending_summary + get_uncategorized → registerAppTool |
| MODIFY | `lib/mcp/tools/goals.ts` — get_review → registerAppTool |
| MODIFY | `lib/mcp/tools/documents.ts` — get_document → registerAppTool |
| MODIFY | `next.config.ts` or equivalent — add outputFileTracingIncludes for widgets/ |

## DO NOTs

- Do NOT change any tool's return data shape — widgets consume the existing JSON
- Do NOT remove the text content from any tool — it's the graceful degradation path
- Do NOT modify tool handlers' logic — only wrap them with registerAppTool
- Do NOT change any tools that don't have widgets (create_habit, list_tasks, etc.)
- Do NOT use external CDNs in widget HTML — everything must be inlined
- Do NOT use `window.open()` in widgets — use `app.openLink()`
- Do NOT install canvas/sharp/puppeteer — use inline SVG for any chart rendering

## Verification

```bash
npm install
npx next build
```

Build must pass. Then:
```bash
npx vitest run
```

All existing tests must still pass (441+).
