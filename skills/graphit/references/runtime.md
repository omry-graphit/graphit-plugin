<!--
SIZE EXEMPTION (reference file)
Hard limit: 7,168 chars | Exempted ceiling: set by the reference-file exemption paragraph in docs/knowledge/prompt-engineering/sizing/SIZING.md, which names this file; PE-DENY-005 mirrors it and cli/test/skill-size.test.mjs enforces it. A ceiling written only in this header is not an authority.
Rationale: one co-load unit the co-load test forbids splitting; loads only on HTML-deliverable turns.
Reviewed: 2026-07-28 | Next review: 2026-10-28
-->
# Canvas Runtime: Live Data and the Entity Contract

Consult when authoring dashboard HTML and wiring its data: fetching live data, making every visible element a platform entity, painting before data arrives, and shaping resolve SQL so filter changes stay instant. Design tokens and layout CSS live in `graphit-style.md`; this file owns the data wiring.

## The live-data API

`graphit.resolve()` fetches live data from cached data sources on every page load. NEVER embed query results as static JS variables (`const data = [...]`) - that freezes a snapshot that never refreshes and breaks provenance.

The entity owns the query. A resolve call passes no `sql` and no `dataSourceId`: both are read from the entity, authored once in the attributes and never repeated in the call. The one exception declares itself - second tier, below.

```js
const result = await graphit.resolve({
  target: "#chart-container",
  maxRows: 10000
});
// Returns: { columns: string[], data: object[], rowCount: number, truncated: boolean }
```

- `target` (CSS selector or element) does two jobs: it finds the query by walking UP from that element to the nearest `[data-graphit-id]` ancestor-or-self, and shows a blur/spinner overlay while loading, removed on completion. It MUST be the entity wrapper or sit INSIDE it - a container that WRAPS the entity walks up to nothing, so the call rejects before any request is sent: the graph never loads, any spinner in it never clears, and the error reaches the browser console only. For a container holding entities, pass `sourceEntityId`.
- `params` (optional) supplies values for the `:name` placeholders in the entity's SQL.
- `targetEntityIds` (optional, `string[]`) - `data-graphit-id`s of OTHER graphs this result also renders into, so each one's details panel reflects filters (not just `target`); entity ids, never CSS selectors.
- `sourceEntityId` (optional) - names the entity that owns the query, found document-wide instead of by walking up; it is what makes a `target` that WRAPS entities legal, and there it serves only the overlay (pair with `targetEntityIds`; canonical shape in `kpi.md`).
- `maxRows` (optional) defaults to **10,000**, cap **50,000**. Aggregate well under the default; raise it only for a genuine row-level export.

MUST: every resolve feeding a rendered graph, KPI, or table carries attribution - `target` (the entity wrapper or an element inside it), or `sourceEntityId` plus `targetEntityIds` when one result feeds several graphs. Attribution records the live filtered query behind that entity's details panel; unattributed, the panel shows `data-graphit-sql` as an unrun example, so a user changing a filter sees the SQL never move. Saving a page with filters or params and zero attributed resolves returns an `unattributed_resolves` warning. Queries feeding page chrome need no attribution and no entity, but belong on the primitives - `graphit.cascade` for option lists, `graphit.dataBounds` for a column's min/max, `graphit.rank` for top-N (`filters-advanced.md`) - never hand-written entity-less SQL.

CRITICAL: use KB reference syntax (`{{metric:NAME}}`, `{{dim:NAME}}`) inside the entity's `data-graphit-sql` whenever a KB asset exists - the server expands it at query time, producing the governed trust tier. Syntax and trust tiers: `governance.md`.

Error handling: `graphit.resolve()` rejects on timeout (120s), bad SQL, or an invalid data source ID. Wrap calls in try/catch and show a user-visible error in the target element on failure. Verify the SQL returns data via the CLI before embedding it.

## The entity contract

Every visible element - chart, KPI card, table, text section - must be wrapped so the platform can see it. Unwrapped it is invisible: no click info, no @ mentions, no KB provenance. Wrapping also gives it the 3-dot menu (hover, top-right) and details panel - data source, governed SQL, KB lineage, live results. A graph you draw is as first-class as a `graphit.graph()` chart once wrapped; never rebuild a custom dashboard as native graphs to gain the menu, just add the wrapper. Each needs ALL FOUR attributes:

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
| `data-graphit-id` | Unique; lowercase letters, digits, `-` and `_`, max 80 (kebab-case preferred) | `"spend-by-source"` |
| `data-graphit-label` | Human-readable name | `"Ad Spend by Source"` |
| `data-graphit-sql` | The query this entity runs - executable, parameterized (HTML-encode `<`, `>`, `&`, `"`) | `"SELECT ... WHERE d = :day"` |
| `data-graphit-ds` | Data source name (same as the FROM table) or id | `"ORDERS_DS"` |
| `data-graphit-state` | Not an entity attribute - a SIBLING wrapper around a user-changeable control, naming the state key saved views capture (`filters.md`) | `"country"` |

KB asset references are derived automatically from `{{metric:X}}` / `{{dim:X}}` in the SQL; the governance compiler resolves these and shows KB asset chips in the details panel. Missing any one attribute breaks the entity; missing the wrapper makes the element invisible to the platform.

**JavaScript may populate an entity, never create one.** Every entity - including on hidden tabs, collapsed panels, and lazily-shown views - exists as static markup in the HTML you save; JavaScript fills its chart host, wires listeners, and toggles visibility. Nothing server-side runs your JavaScript, so a card built at render time (`host.innerHTML = charts.map(...)`) does not exist for governance, lineage, the KB graph, `list-entities`, or a later `get-entity`. A save whose `data-graphit-id`s are reachable only by running your JavaScript is REFUSED and the error names them. A dynamic **query** is supported - the attribute carries the canonical template; a dynamic **entity** is not.

- **Declare statically, execute lazily.** A hidden card must not resolve on load - resolve a tab's entities when it first becomes visible, or a 3-tab dashboard turns 8 concurrent queries into 22 on first paint.
- **One source of truth.** A JS config array may keep rendering behavior (type, colors, height) but must never restate the chart list.
- **Never write `data-graphit-id=` in script** (selectors included) - the gate reads it as a phantom entity and refuses the save; match via `el.dataset.graphitId`.

**SQL must be complete and executable.** This attribute is the query that runs, and the platform runs it again when a user opens the details panel. NEVER abbreviate, truncate, or leave an ellipsis (`FROM ...`, `SELECT ...`, three dots). Use the real DS table name and only columns that exist in the DS - never an invented summary column, a CTE alias, a JS variable name, or prose. If the query uses a CTE, store the full WITH query. Where the query is filtered, store the parameterized template with its `:name` placeholders - never a frozen variant with one date range baked in, which is the drift this contract removes. The panel's **Current query** is the server's record of what actually ran; never copy that resolved SQL back into this attribute.

- **Wrong:** `data-graphit-sql="SELECT INSTALL_TIME, ROIAP_D0 FROM UA_DS"` when the DS has no `ROIAP_D0` column (the chart computes it via CASE) - the details panel errors.
- **Right:** `data-graphit-sql="SELECT INSTALL_TIME, SUM(CASE WHEN SENIORITY=0 THEN TOTAL_IAP END)/NULLIF(SUM(COST),0) AS ROIAP_D0 FROM UA_DS GROUP BY 1"` - the same derivation the chart runs.

A filtered entity uses `graphit.bind(el, { params, deps, render })` (`filters.md`); it reads SQL and data source from the entity like a resolve.

**The second tier: a composed query declares itself.** When the SELECT list is built from the user's choices there is no one stored statement. That is legal, and it declares - the call marks itself and names its owner (a `target` does not attribute a declared call); the owner stays a full entity, its `data-graphit-sql` a representative statement, and adds `data-graphit-vocab`, a COMMA-separated closure of the governed names that SQL may touch:

```html
<div data-graphit-id="explorer" data-graphit-label="Metric Explorer" data-graphit-ds="UA_DS"
     data-graphit-sql="SELECT day, {{metric:ROAS}} AS roas FROM UA_DS GROUP BY 1"
     data-graphit-vocab="metric:REV*,metric:ROAS,dim:COUNTRY"></div>
```
```js
graphit.resolve({ sql: buildSql(picked), dataSourceId: "UA_DS", runtimeComposed: true, sourceEntityId: "explorer" });
```

`metric:NAME` / `dim:NAME`, UPPER_SNAKE_CASE, one optional trailing `*` per family; a space instead of a comma is one malformed entry. Declare the family, not today's SQL - but every name must exist (an unknown name, a wildcard matching nothing, or a bare `metric:*` refuses), and wildcards alone add no lineage. Undeclared inline SQL is invisible to lineage and governance; a save that ADDS one is refused, and existing ones are not a defect to fix - move a query onto its entity only when asked (`migration.md`).

**Label equals the visible title.** `data-graphit-label` MUST match the card's visible heading exactly - users find their chart by that label in @ mention dropdowns and entity panels, and a mismatch means they cannot find it.

**Editing one existing entity.** Edit surgically: `graphit dashboard list-entities <id>` lists every entity (id, label, KB refs, data source) to find the right `data-graphit-id`; `graphit dashboard get-entity <id> <entityId>` returns just that entity's inner HTML - the exact fragment `graphit dashboard update-entity <id> <entityId>` accepts - which you change and write back. Use full-page `get-html` / `update-html` only when restructuring the layout.

**Name every version.** Always pass `--label "<what changed>"` on every `update-html` / `update-entity` (e.g. `--label "Added revenue KPI row"`) - it names the version in the dashboard's history so edits stay traceable. Keep it short; no secrets or SQL dumps.

## First-paint loading state

The HTML paints before the SDK connects, so the SDK's own spinner cannot cover the first moments. Bake a pure-CSS overlay into the HTML so every chart spins from the first frame; the SDK adopts it and removes it when that element's `graphit.resolve()` settles (success or error).

Add once to the page `<style>`:

```css
@keyframes gh-spin{to{transform:rotate(360deg)}}
.gh-loading{position:relative;min-height:120px}
.gh-loading-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:9998;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);background:color-mix(in srgb,var(--graphit-surface-raised,#fff) 50%,transparent);border-radius:inherit}
.gh-loading-spin{animation:gh-spin .7s linear infinite}
```

Add the overlay inside EVERY element passed as `target:` to `graphit.resolve()` - and ONLY those. A static text or title section with no resolve call would spin forever.

```html
<div id="spend-chart" class="gh-loading">
  <div class="gh-loading-overlay"><svg class="gh-loading-spin" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--graphit-border,#e5e5e5)" stroke-width="2.5"/><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--graphit-accent,#4DB6AC)" stroke-width="2.5" stroke-linecap="round"/></svg></div>
</div>
```

The class names are a contract with the SDK (`gh-loading`, `gh-loading-overlay`, `gh-loading-spin`, `gh-spin`) - keep them exactly as shown or the SDK cannot adopt and remove the overlay. NEVER write text placeholders ("Loading", "Fetching data") - they never animate and make slow loads look stuck.

## Cache-friendly resolve SQL

A resolve query following these shapes serves from a semantic cache in roughly 10ms on filter changes instead of a full DuckDB recompute (5 to 37s on wide data sources). Write resolve SQL this way by default.

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
- Ratio metrics (`SUM(a)/NULLIF(SUM(b),0)`) - compute client-side or use two resolves; to show one as a percent, multiply by 100 in SQL (the format does not scale - `chart-patterns.md`).
- `CURRENT_DATE`-relative predicates.
- Top-N with the aggregate only in ORDER BY.

**Fresh anchors.** When a query needs a data-driven anchor - latest install date, a "days since" reference, a MAX(date) - never fetch it once at page load into a JS variable and reuse it across refreshes. A long-open tab silently goes stale and every maturity gate or rolling window computed against it drifts. Re-resolve the anchor inside each refresh cycle, or derive it in a subquery.

## Rate-limit budget

`graphit.resolve()` is rate-limited per user per dashboard: 360 requests a minute, 180 of them cold executions (a cache hit is not one). Design for that budget:

- **Single refresh function.** Put all queries in ONE `Promise.all` inside one `refresh()` so they share a time window. NEVER scatter `graphit.resolve()` across independent event handlers or timeouts - that turns one user action into several bursts.
- **Count queries per interaction.** 6 charts is 6 cold executions per filter change, about 30 changes a minute of budget; 12 charts is about 15. With 10 or more charts and 3 or more filters, debounce filter changes (300ms).
- **Reuse trend data for KPIs.** If you already fetch a weekly time series, derive the KPI total and its sparkline from that result in JS instead of a separate aggregate query. Anchor the extra graphs it feeds with `targetEntityIds` per the attribution rule above. Canonical KPI-row example: `kpi.md`.
- **Avoid redundant refreshes.** If a filter affects only some charts, split into targeted refresh functions (`refreshKPIs()`, `refreshCharts()`).
- **No polling.** NEVER use `setInterval(refresh, ...)`. Data sources update on their own schedule; a polling dashboard burns the entire budget.

## Helper index

You have full creative freedom: draw with `type:'custom'` or inline SVG/CSS/HTML tables. The helpers below are shortcuts, not requirements: when a documented type fits, use it; otherwise hand-roll immediately - do not deliberate.

| Helper | What it renders | Depth |
|---|---|---|
| `graphit.graph(el, {type, data, x, y, ...})` | A standard chart of the given `type` | `chart-patterns.md` (per-type config) |
| `graphit.graph(el, {type:'custom', draw})` | Bespoke SVG you draw via `(ctx)=>marks` - responsive + dark-themed for free | `chart-patterns.md` (ctx + escape contract) |
| `graphit.table(el, {data, columns?, columnFormats?})` | A styled HTML table; `columns` = row keys (select + order) | `table.md` |
| `graphit.kpi(el, {value, compareValue?, sparkline?, ...})` | A KPI card: delta badge, sparkline | `kpi.md` |
| `graphit.presentation(el)` | A full-screen slide deck builder | `presentations.md` |
| `graphit.filter / param / dateRange / cascade / dataBounds / rank / bind` | Headless interactivity (zero imposed markup) | `filters.md`, `filters-advanced.md` |

**Standard `graphit.graph` types (set `config.type`):** `"bar"`, `"horizontal-bar"` (alias `"hbar"`), `"line"`, `"area"`, `"donut"`, `"pie"` (alias of `donut`), `"scatter"` (alias `"bubble"`), `"stacked-bar"` (alias `"stacked"`), `"heatmap"`, `"funnel"`, `"gauge"`, `"sparkline"`, plus `"custom"`. Full per-type config (axes, dual axis, `valueFormat`, the non-scaling percent rule, the custom `ctx` contract, hand-rolled shapes) lives in `chart-patterns.md`. Saved org templates register as types too.

**Logic versus styling.** `filter`, `param`, `bind`, `dateRange`, `cascade` are headless - you own the markup. `graphit.graph` types, `table`, `kpi`, `presentation` render a fixed house style. Surface two trade-offs to the user: a control persists to saved views ONLY when registered with `graphit.filter` / `param` / `dateRange` (a hand-rolled `<select>` will not save), and a standard chart type cannot be deeply restyled - for a custom look use `type:'custom'` or hand-draw SVG/CSS, still fetching via `graphit.resolve`.
