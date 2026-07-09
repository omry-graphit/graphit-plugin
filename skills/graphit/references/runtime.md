<!--
SIZE EXEMPTION (reference file)
Hard limit: 7,168 chars | Exempted ceiling: 14,600 chars
Current: ~14,584 chars - intentionally over the base reference limit.
Rationale: the consolidated build-time data + entity contract (live-data API, data-graphit-* entity contract, first-paint state, helper index, canonical example, version-naming discipline) - one co-load unit the co-load test forbids splitting. Loads only on HTML-deliverable turns (just-in-time, not every turn), so cache cost is bounded.
Reviewed: 2026-07-09
Next review: 2026-10-09
-->
# Canvas Runtime: Live Data and the Entity Contract

Consult when authoring the dashboard HTML and wiring its data: how the iframe fetches live data, how every visible element becomes a platform entity, how the page paints before data arrives, and how to shape resolve SQL so filter changes stay instant. Design-system tokens and layout CSS live in `graphit-style.md`; this file owns the data wiring.

## The live-data API

The iframe provides `graphit.resolve()` to fetch live data from cached data sources on every page load. This is how the HTML gets its data. NEVER embed query results as static JS variables (`const data = [...]`) - that freezes a snapshot that never refreshes and breaks provenance.

```js
const result = await graphit.resolve({
  sql: "SELECT region, SUM(revenue) AS rev FROM ORDERS_DS GROUP BY region",
  dataSourceId: "ORDERS_DS",
  target: "#chart-container",
  maxRows: 10000
});
// Returns: { columns: string[], data: object[], rowCount: number, truncated: boolean }
```

- `dataSourceId` is the data source name (the same table you SELECT FROM); its id or a unique id-prefix also works.
- `target` (optional, a CSS selector or element) shows a blur and spinner overlay while loading and removes it on completion.
- `targetEntityIds` (optional, `string[]`) - `data-graphit-id`s of OTHER graphs this result also renders into, so each one's details panel reflects filters (not just `target`); entity ids, never CSS selectors.
- `sourceEntityId` (optional) - the graph that owns a `target`-less resolve feeding several graphs (pair with `targetEntityIds`).
- `maxRows` (optional) defaults to **10,000**, capped at **50,000**. Aggregate to a chartable grain well under the default; raise it only for a genuine row-level export, never above the cap.
- `result.data` is an array of row objects you render however you want.

CRITICAL: use KB reference syntax (`{{metric:NAME}}`, `{{dim:NAME}}`) inside the resolve `sql` whenever a KB asset exists - the server expands it at query time, which produces the governed trust tier. See `governance.md` for the syntax and trust tiers.

Error handling: `graphit.resolve()` rejects on timeout (120s), bad SQL, or an invalid data source ID. Wrap calls in try/catch and show a user-visible error in the target element on failure. Verify the SQL returns data via the CLI before embedding it.

## The entity contract

Every visible element - chart, KPI card, table, text section - must be wrapped so the platform can see it. Without `data-graphit-*` attributes the element is invisible: no click info, no @ mentions, no KB provenance. Wrapping also gives the element its 3-dot menu (hover, top-right) and details panel - data source, governed SQL, KB lineage, live results. A graph you draw and a standard `graphit.graph()` chart are equally first-class once wrapped; never rebuild a custom dashboard as native graphs to gain the menu or data sources - just add the wrapper. Each wrapped element needs ALL FOUR attributes:

```html
<div data-graphit-id="revenue-trend"
     data-graphit-label="Revenue Trend"
     data-graphit-sql="SELECT {{dim:REGION}} AS region, {{metric:REVENUE}} AS revenue FROM ORDERS_DS GROUP BY region"
     data-graphit-ds="ORDERS_DS">
  <!-- chart, KPI, or table content here -->
</div>
```

| Attribute | Format | Example |
|-----------|--------|---------|
| `data-graphit-id` | Unique kebab-case | `"spend-by-source"` |
| `data-graphit-label` | Human-readable name | `"Ad Spend by Source"` |
| `data-graphit-sql` | Executable SQL (HTML-encode the characters `<`, `>`, `&`, `"`) | `"SELECT ..."` |
| `data-graphit-ds` | Data source name (same as the FROM table) or id | `"ORDERS_DS"` |

KB asset references are derived automatically from `{{metric:X}}` / `{{dim:X}}` templates in the SQL; the governance compiler resolves these and shows KB asset chips in the entity details panel. Missing any one attribute breaks the entity; missing the wrapper entirely makes the element invisible to the platform.

**SQL must be complete and executable.** The platform runs `data-graphit-sql` against the data source when a user opens the entity's details panel. Write the full query from the `graphit.resolve()` call. NEVER abbreviate, truncate, or use placeholders (`FROM ...`, `SELECT ...`, three dots). Use the real DS table name and only columns that exist in the DS - never an invented summary column, a CTE alias, a JS variable name, or prose. If the resolve call uses a CTE, store the full WITH query. If JS builds the SQL dynamically, store one representative executable variant (for example, the default date range).

- **Wrong:** `data-graphit-sql="SELECT INSTALL_TIME, ROIAP_D0 FROM UA_DS"` when the DS has no `ROIAP_D0` column (the chart computes it via CASE) - the details panel errors.
- **Right:** `data-graphit-sql="SELECT INSTALL_TIME, SUM(CASE WHEN SENIORITY=0 THEN TOTAL_IAP END)/NULLIF(SUM(COST),0) AS ROIAP_D0 FROM UA_DS GROUP BY 1"` - the same derivation the chart runs.

**Label equals the visible title.** The `data-graphit-label` MUST match the card's visible heading exactly. Users find their chart by that label in @ mention dropdowns and entity panels - a mismatch means they cannot find it.

**Editing one existing entity.** Edit a single element surgically rather than rewriting the page: `graphit dashboard list-entities <id>` lists every entity (id, label, KB refs, data source) to find the right `data-graphit-id`; `graphit dashboard get-entity <id> <entityId>` returns just that entity's inner HTML - the exact fragment `graphit dashboard update-entity <id> <entityId>` accepts - which you change and write back. Reach for full-page `get-html` / `update-html` only when restructuring the whole layout.

**Name every version.** Always pass `--label "<what changed>"` on every `update-html` / `update-entity` (e.g. `--label "Added revenue KPI row"`) - it names the version in the dashboard's history so edits stay traceable. Keep it short; no secrets or SQL dumps.

## First-paint loading state

The dashboard HTML paints before the SDK connects (iframe load plus handshake), so the SDK's own spinner cannot cover the first moments. Bake a pure-CSS overlay into the HTML so every chart shows a spinner from the first frame; the SDK adopts that overlay and removes it when the element's `graphit.resolve()` settles (success or error).

Add once to the page `<style>`:

```css
@keyframes gh-spin{to{transform:rotate(360deg)}}
.gh-loading{position:relative;min-height:120px}
.gh-loading-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:9998;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);background:color-mix(in srgb,var(--graphit-surface-raised,#fff) 50%,transparent);border-radius:inherit}
.gh-loading-spin{animation:gh-spin .7s linear infinite}
```

Add the overlay inside EVERY element passed as `target:` to `graphit.resolve()` - and ONLY those elements. A static text or title section with no resolve call would spin forever.

```html
<div id="spend-chart" class="gh-loading">
  <div class="gh-loading-overlay"><svg class="gh-loading-spin" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--graphit-border,#e5e5e5)" stroke-width="2.5"/><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--graphit-accent,#4DB6AC)" stroke-width="2.5" stroke-linecap="round"/></svg></div>
</div>
```

The class names are a contract with the SDK (`gh-loading`, `gh-loading-overlay`, `gh-loading-spin`, `gh-spin`) - keep them exactly as shown or the SDK cannot adopt and remove the overlay. NEVER write text placeholders ("Loading", "Fetching data") - they never animate and make slow loads look stuck.

## Cache-friendly resolve SQL

A resolve query that follows these shapes serves from a semantic cache in roughly 10ms on filter changes instead of a full DuckDB recompute (5 to 37 seconds on wide data sources). Write resolve SQL in this style by default.

**Shapes that hit the cache:**

- Single table (no JOIN or UNION).
- WHERE as a flat AND of `column = literal`, `column IN (...)`, `column BETWEEN ... AND ...` conjuncts.
- Bare aggregates only: `SUM(col)`, `COUNT(*)`, `MIN(col)`, `MAX(col)`. No wrapping functions (`ROUND(SUM(x))`), no aggregate arithmetic (`SUM(a)/NULLIF(SUM(b),0)`), no `AVG`.
- Literal dates (`>= '2026-01-01'`), never `CURRENT_DATE` expressions.
- GROUP BY column names or ordinals; ORDER BY and LIMIT allowed (outer query only).
- CTEs are fine when the CTE body follows the same rules.
- Top-N rank queries: project the sort metric in SELECT (`SELECT dim, SUM(metric) AS rv ... ORDER BY rv DESC LIMIT N`), not only in ORDER BY.

**Shapes that skip the cache** (they still run correctly, just slower):

- `COUNT(DISTINCT x)`, window functions, HAVING, QUALIFY.
- `OR` or `NOT` in WHERE.
- Ratio metrics (`SUM(a)/NULLIF(SUM(b),0)`) - compute client-side or use two resolves. To display a ratio as a percent, multiply by 100 in SQL (`* 100.0 ... AS x_pct`): the `"percent"` format only appends `%`, it does not scale, so a 0-to-1 ratio would otherwise show as `0.42%`, not `42%`.
- `CURRENT_DATE`-relative predicates.
- Top-N with the aggregate only in ORDER BY (`... GROUP BY dim ORDER BY SUM(metric) DESC LIMIT N` with no decomposable aggregate in SELECT).

## Rate-limit budget

`graphit.resolve()` is rate-limited to 120 requests per minute per user per dashboard. Each call counts as one request. Design for that budget:

- **Single refresh function.** Put all queries in ONE `Promise.all` inside one `refresh()` function so they share the same time window. NEVER scatter `graphit.resolve()` across independent event handlers or timeouts - that turns one user action into several bursts.
- **Count queries per interaction.** 6 charts is 6 requests per filter change, about 20 changes per minute of budget; 12 charts is about 10 changes per minute. With 10 or more charts and 3 or more filters, debounce filter changes (300ms) so rapid clicks do not each trigger a full refresh.
- **Reuse trend data for KPIs.** If you already fetch a weekly time series, derive the KPI total and its sparkline from that result in JS instead of running a separate aggregate query - one query serves both. When one result serves several graphs like this, anchor every graph it feeds with `targetEntityIds` (keep `target` on the primary) so each graph's details panel shows the live filtered query, not stale base SQL. Canonical KPI-row example: `kpi.md`.
- **Avoid redundant refreshes.** If a filter affects only some charts, split into targeted refresh functions (`refreshKPIs()`, `refreshCharts()`) so unchanged sections do not re-query.
- **No polling.** NEVER use `setInterval(refresh, ...)`. Data sources update on their own schedule; a polling dashboard burns the entire budget.

If you hit the limit, the API returns a "Too many requests" error with a retry-after hint.

## Helper index

You have full creative freedom: draw with `type:'custom'` or inline SVG/CSS/HTML tables for full control. The helpers below are shortcuts, not requirements: when a documented type fits, use it; otherwise hand-roll immediately - do not deliberate.

| Helper | What it renders | Depth |
|---|---|---|
| `graphit.graph(el, {type, data, x, y, ...})` | A standard chart of the given `type` | `chart-patterns.md` (per-type config) |
| `graphit.graph(el, {type:'custom', draw})` | Bespoke SVG you draw via `(ctx)=>marks` - responsive + dark-themed for free | `chart-patterns.md` (ctx + escape contract) |
| `graphit.table(el, {data, columns?, columnFormats?})` | A styled HTML table; `columns` = row keys (select + order) | `table.md` |
| `graphit.kpi(el, {value, compareValue?, sparkline?, ...})` | A KPI card: delta badge, sparkline | `kpi.md` |
| `graphit.presentation(el)` | A full-screen slide deck builder | `presentations.md` |
| `graphit.filter / param / dateRange / cascade / bind` | Headless interactivity (zero imposed markup) | `filters.md`, `filters-advanced.md` |

**Standard `graphit.graph` types (set `config.type`):** `"bar"`, `"horizontal-bar"` (alias `"hbar"`), `"line"`, `"area"`, `"donut"`, `"pie"` (alias of `donut`), `"scatter"` (alias `"bubble"`), `"stacked-bar"` (alias `"stacked"`), `"heatmap"`, `"funnel"`, `"gauge"`, `"sparkline"`, plus `"custom"` (bespoke `draw`). The full per-type config (axes, dual axis, `valueFormat`, the non-scaling percent rule, the custom `ctx` contract, and hand-rolled shapes) lives in `chart-patterns.md`. Saved org templates register as types too.

**Logic versus styling.** `filter`, `param`, `bind`, `dateRange`, `cascade` are headless logic with zero imposed styling - you own the markup. A standard `graphit.graph` type, `table`, `kpi`, `presentation` render a fixed house style. Two trade-offs to surface to the user: a control persists to saved views ONLY when registered with `graphit.filter` / `param` / `dateRange` (a hand-rolled `<select>` will not save), and a standard chart type cannot be deeply restyled - for a custom look use `graphit.graph(el, {type:'custom', draw})` (see `chart-patterns.md`) or hand-draw SVG/CSS, still fetching data via `graphit.resolve`.

## Canonical entity with live data

```html
<div data-graphit-id="spend-by-source"
     data-graphit-label="Ad Spend by Source"
     data-graphit-sql="SELECT {{dim:MEDIA_SOURCE_DIMENSION}} AS source, {{metric:TOTAL_AD_SPEND}} AS spend FROM MARKETING_UA_DS GROUP BY source ORDER BY spend DESC"
     data-graphit-ds="MARKETING_UA_DS">
  <div id="spend-chart" class="gh-loading">
    <!-- gh-loading-overlay spinner from the First-paint section -->
  </div>
</div>
<script>
(async function() {
  var r = await graphit.resolve({
    sql: "SELECT MEDIA_SOURCE, SUM(APPSFLYER_COST) AS spend FROM MARKETING_UA_DS GROUP BY MEDIA_SOURCE ORDER BY spend DESC",
    dataSourceId: "MARKETING_UA_DS",
    target: "#spend-chart"
  });
  graphit.graph("#spend-chart", {
    type: "bar", data: r.data, x: "MEDIA_SOURCE", y: "spend",
    title: "Ad Spend by Source", valueFormat: "currency"
  });
})();
</script>
```
