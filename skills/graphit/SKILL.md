---
name: graphit
description: >
  Build HTML dashboards with Graphit. KB-aware queries, entity wrapping, cached data sources.
  Triggers on: "dashboard", "graphit", "KB", "metric", "data source", "build a dashboard",
  "explore the KB", "query data", "custom dashboard".
  Do NOT activate for: editing platform-native dashboard widgets, non-HTML output formats,
  general data analysis without a dashboard deliverable.
---

# Graphit CLI

Build custom HTML dashboards from real data using the Graphit CLI.

## Session Start

Run `graphit --version` at the start of every session to confirm the CLI is installed.
If the output includes an "Update available" banner, tell the user to update before proceeding and explain that outdated versions may be missing commands or bug fixes.

## Error Recovery

When any `graphit` command fails with an unexpected error (unknown command, unrecognized flag, non-zero exit with unclear message), suggest `npm update -g @graphit/cli` before investigating further. Outdated CLI versions are the most common cause of unexpected errors.
Do NOT suggest updating for normal operational failures (expired auth, bad SQL syntax, network timeout, entity not found).

## After Setup

After `graphit setup` completes successfully, offer to add a Graphit section to the project's CLAUDE.md (or AGENTS.md for Codex) so future sessions know Graphit is available without activating the skill. Suggested snippet:

```
## Graphit
Use `/graphit` to build custom HTML dashboards from real data.
Run `graphit ds list` to see cached data sources before querying.
Run `graphit kb list` to explore available metrics and dimensions.
```

## HARD CONSTRAINTS (violating these produces a broken dashboard)

### 1. ZERO external resources
The dashboard renders in a sandboxed iframe with a strict CSP. External requests are BLOCKED.
Your HTML must NEVER contain:
- `<script src="...">` - no Chart.js, D3.js, Alpine.js, ANY external JS
- `<link href="...">` - no Tailwind CDN, Google Fonts, ANY external CSS
- `<img src="https://...">` - no external images

If you use ANY `src=` or `href=` pointing to a URL, the dashboard will be blank.
All CSS in `<style>`, all JS in `<script>`, all fonts from system stack. The iframe has a built-in runtime (`graphit.chart`, `graphit.table`, `graphit.kpi`) for standard visualizations - use it instead of importing libraries.

### 2. ALWAYS query through data sources
NEVER query the warehouse directly when a cached data source covers the table. Data sources return in ~100ms. Warehouse queries take ~10s and cost Snowflake credits.

**Before writing ANY query:**
1. Run `graphit ds list` to see what data sources exist
2. If a DS covers your table, use `graphit query "SQL" --ds <id>` (DuckDB syntax)
3. Only use `graphit query "SQL" --warehouse --connection <id>` if NO data source exists and the user approves

**Wrong:** Jumping straight to `graphit query "SELECT SUM(cost) FROM marketing_ua" --warehouse` when a data source already caches that table.
**Right:** `graphit ds list` first, find the DS ID, then `graphit query "SELECT SUM(cost) FROM marketing_ua" --ds ds_abc123`.

### 3. EVERY element must have entity wrapping
Without `data-graphit-*` attributes, elements are invisible to the platform - no click info, no mentions, no KB provenance. Every chart, KPI card, table, and text section needs ALL FOUR attributes:

```html
<div data-graphit-id="revenue-trend"
     data-graphit-label="Revenue Trend"
     data-graphit-kb="metric:REVENUE,dimension:REGION,table:ORDERS"
     data-graphit-sql="SELECT region, SUM(revenue) FROM orders GROUP BY region">
  <!-- chart/KPI/table content here -->
</div>
```

| Attribute | Format | Example |
|-----------|--------|---------|
| `data-graphit-id` | Unique kebab-case | `"spend-by-source"` |
| `data-graphit-label` | Human-readable name | `"Ad Spend by Source"` |
| `data-graphit-kb` | `type:NAME` comma-separated | `"metric:CPI,dimension:MEDIA_SOURCE,table:MARKETING_UA"` |
| `data-graphit-sql` | SQL query (HTML-encode `<>&"`) | `"SELECT ..."` |

KB types: `metric`, `dimension`, `table`, `rule`. Names are UPPER_SNAKE_CASE matching the KB exactly.
Missing any attribute = broken entity. Missing wrapping entirely = invisible to the platform.

**Label = visible title.** The `data-graphit-label` MUST match the card's visible heading exactly. Users see the label in @ mention dropdowns and entity panels - if it doesn't match the title on screen, they can't find their chart.

### 4. ALWAYS use graphit.resolve() for live data
NEVER embed query results as static JS variables. The dashboard iframe provides `graphit.resolve()` which fetches live data from cached data sources on every page load.

**Wrong:** Running queries at build time, embedding results as `const data = [{...}, ...]` in the HTML.
**Right:** Using `graphit.resolve({sql, dataSourceId})` in a `<script>` block so data refreshes automatically.

---

## Workflow

1. **Ask the user** what dashboard they want. Don't start querying until you know what they need.
2. **Explore KB** to understand available metrics, dimensions, tables, and rules.
3. **Find a data source** (`graphit ds list`) - prefer cached data sources (~100ms) over live warehouse (~10s).
4. **Query data to validate** - run queries via the CLI to verify SQL and preview results. Show the user what you found.
5. **Build HTML** - write `graphit.resolve()` calls for live data + `graphit.chart/table/kpi` for rendering. All CSS in `<style>`, all JS in `<script>`. Write to a local `.html` file.
6. **Save** with `graphit dashboard update-html <id> --file <path>`.
7. Give the user the dashboard URL so they can open it.

## Commands

| Command | Description |
|---------|-------------|
| `graphit kb list <type>` | List metrics, dimensions, tables, rules, domains, synonyms |
| `graphit kb get <type> <name>` | Full entity details by name |
| `graphit kb search <query>` | Search across all KB types |
| `graphit kb explore metric <name>` | Metric -> tables -> dimensions graph |
| `graphit ds list` | List cached data sources (use these for fast queries) |
| `graphit query "<sql>" --ds <id>` | Query cached data source (~100ms) |
| `graphit query "<sql>" --warehouse --connection <id>` | Query live Snowflake (~10s) |
| `graphit dashboard create --name "..."` | Create dashboard (returns ID) |
| `graphit dashboard get-html <id>` | Get current HTML content of a dashboard |
| `graphit dashboard update-html <id> --file <path>` | Upload HTML to dashboard |
| `graphit dashboard list` | List existing dashboards |
| `graphit metadata schemas --connection <id>` | List Snowflake schemas |
| `graphit connector list` | List active connections |

## Presenting Results to the User

The user CANNOT see raw CLI output clearly. You MUST format and present every result - never silently consume tool output and move on.

**After every query**, show the data:
```
Queried **MARKETING_UA** (ds_abc123, 6 rows):

| Channel     | Spend    | Installs | CPI   |
|-------------|----------|----------|-------|
| Facebook    | $42,100  | 12,400   | $3.40 |
| Google UAC  | $38,500  | 9,800    | $3.93 |
| TikTok      | $21,300  | 8,200    | $2.60 |
```
```

**After KB exploration**, summarize what you found:
```
Found **12 metrics** and **8 dimensions** on table MARKETING_UA:
- **Metrics:** TOTAL_SPEND, CPI, ROAS_D7, ROAS_D30, INSTALLS, ...
- **Dimensions:** MEDIA_SOURCE, CAMPAIGN_NAME, COUNTRY, PLATFORM, ...
- **Rules:** EXCLUDE_ORGANIC (filters organic installs from paid metrics)
```

**Formatting rules:**
- **Bold** metric names, table names, and key numbers
- Use **markdown tables** for any tabular data (query results, entity lists, comparisons)
- Format numbers: commas for thousands (`12,400`), `$` for currency, `%` for rates
- After KB or data source discovery, list what's available before asking what to build
- Show the SQL you ran (in a code block) so the user can validate the logic
- When a query returns nulls or zero rows, explain what you checked and what went wrong
- Narrate your progress between steps: "Found 3 data sources. Using **Marketing UA DS** (ds_abc123) which covers spend, installs, and ROAS columns."

**Never do these:**
- Run 3 queries silently then jump to building HTML
- Say "I found the data" without showing what the data looks like
- Present raw JSON output without formatting
- Skip showing KB exploration results before proposing a dashboard

---

## graphit.resolve() - Live Data API

The iframe provides `graphit.resolve()` to fetch live data from cached data sources. This is how your HTML gets its data - never embed static query results.

```js
const result = await graphit.resolve({
  sql: "SELECT region, SUM(revenue) as rev FROM orders GROUP BY region",
  dataSourceId: "ds_abc123",
  target: "#chart-container",  // optional: shows loading spinner on element
  maxRows: 10000               // optional: default 10K, max 10K
});
// Returns: { columns: string[], data: object[], rowCount: number, truncated: boolean }
```

The `dataSourceId` is the ID from `graphit ds list`. The `target` parameter (CSS selector or element) shows a blur + spinner overlay while loading and removes it on completion. `result.data` is an array of row objects you can render however you want.

**Error handling:** `graphit.resolve()` rejects on timeout (60s), bad SQL, or invalid data source ID. Wrap calls in try/catch and show a user-visible error message in the target element on failure. Verify SQL returns data via the CLI before embedding it in HTML.

### Rendering

You have full creative freedom for how to present data. Build charts with inline SVG, CSS, HTML tables, creative layouts - whatever fits the dashboard best.

The iframe also provides optional convenience helpers if you want quick standard charts:

| Helper | Usage |
|---|---|
| `graphit.chart(el, {type, data, x, y, ...})` | Bar, line, area, donut, scatter, stacked-bar, heatmap, funnel, gauge, sparkline |
| `graphit.table(el, {data, columns?, ...})` | Styled HTML table |
| `graphit.kpi(el, {value, label?, format?})` | KPI card with optional delta |

These are shortcuts, not requirements. Use them when a standard chart is all you need. Hand-roll when you want full control over the visualization.

`graphit.chart` types: `"bar"`, `"horizontal-bar"` (alias `"hbar"` - use when category labels are long), `"line"`, `"area"`, `"donut"` (alias `"pie"`), `"scatter"` (alias `"bubble"`), `"stacked-bar"` (alias `"stacked"`), `"heatmap"`, `"funnel"`, `"gauge"`, `"sparkline"`. Config: `x` (category field), `y` (value field), `series` (group-by field), `title`, `height` (140-900px), `valueFormat` (`"currency"` | `"percent"` | `"number"`), `colors` (array). Scatter adds: `size` (bubble radius field), `label` (tooltip field). Gauge adds: `min`, `max`, `format`. Sparkline adds: `width`, `showValue`.

`graphit.kpi` config: `value`, `label`, `format` (`"currency"` | `"percent"` | `"number"`), `compareValue`, `compareLabel`.

### Canonical pattern - entity with live data

```html
<div data-graphit-id="spend-by-source"
     data-graphit-label="Ad Spend by Source"
     data-graphit-kb="metric:CPI,dimension:MEDIA_SOURCE,table:MARKETING_UA"
     data-graphit-sql="SELECT MEDIA_SOURCE, SUM(APPSFLYER_COST) as spend FROM MARKETING_UA GROUP BY MEDIA_SOURCE ORDER BY spend DESC">
  <div id="spend-chart"></div>
</div>
<script>
(async function() {
  var r = await graphit.resolve({
    sql: "SELECT MEDIA_SOURCE, SUM(APPSFLYER_COST) as spend FROM MARKETING_UA GROUP BY MEDIA_SOURCE ORDER BY spend DESC",
    dataSourceId: "ds_abc123",
    target: "#spend-chart"
  });
  graphit.chart("#spend-chart", {
    type: "bar", data: r.data, x: "MEDIA_SOURCE", y: "spend",
    title: "Ad Spend by Source", valueFormat: "currency"
  });
})();
</script>
```

---

## Reference Files

Detailed knowledge lives in `references/`. Consult the relevant file when you need depth beyond the quick references above.

| File | Consult when |
|------|-------------|
| `dashboard-planning.md` | Building a multi-chart dashboard. Covers framing the question, picking archetype, mandatory rules, metric contracts, anti-patterns. |
| `chart-selection.md` | Choosing chart types. Full dimension/measure defaults, perception ranking, cardinality guards, hard caps. |
| `kb-exploration.md` | Starting a build. KB-first discovery, metric vs dimension, naming conventions, reuse patterns, formula syntax. |
| `sql-reference.md` | Writing queries. DuckDB/Snowflake translation, formatting standards, gap-filling, JSON access, data source routing. |
| `domain-lenses.md` | Data matches a business domain. Marketing, finance, product/growth, ops, sales - signals, key metrics, must-have charts, anti-patterns. |
| `graphit-style.md` | Building the HTML. Design principles, typography scale, color system with usage rules, layout patterns (page structure, KPI cards, data tables). |
| `chart-patterns.md` | Custom chart implementations. Inline SVG/CSS code for: scatter/bubble, heatmap, funnel, gauge, sparkline, stacked bar, and the shared tooltip pattern. |
