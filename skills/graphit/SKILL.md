---
skill_version: "0.1.37"
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

Run `graphit plugin status` at the start of every Graphit session and whenever the user asks about Graphit updates, plugin health, or stale instructions. This command is the source of truth for CLI, plugin-bundle, skill, ref, hook, and legacy copied-file version health; do not invent a manual version check.
If it reports action needed, tell the user the exact remediation it prints before proceeding.

## Install / Update Model

The Graphit plugin bundle is the default and source of truth for Claude Code and Codex. It contains the CLI, skills, refs, hooks, status script, and manifests. Claude Code/Codex users should update Graphit through their assistant plugin manager, not by running copied-skill setup.

`graphit setup` is only for legacy/fallback copied-file installs, mainly Cursor or environments without plugin support. If `graphit plugin status` reports Claude Code/Codex copied snapshots, tell the user to remove them with `graphit setup --remove-legacy-copies` after confirming the plugin is installed. Use `graphit setup --legacy-copy` only when the plugin path is unavailable.

## CLI Health Gate

ALWAYS run `graphit plugin status` before diagnosing, retrying, or inventing a workaround when Graphit CLI behavior looks wrong. This includes unknown commands, unrecognized flags, missing commands described in this skill, stale-looking output, copied-skill warnings, non-zero exits with unclear messages, or the user saying Graphit/CLI/plugin/skill is not working.
If `graphit plugin status` reports action needed, stop and tell the user the exact remediation first. Do not continue with stale instructions unless the user explicitly asks you to proceed anyway.
Do NOT suggest updating for normal operational failures (expired auth, bad SQL syntax, network timeout, entity not found).

## Permission Errors

The CLI enforces the same permission model as the platform. Three error codes to know:

- **403 "This feature requires an Analyst seat"** - viewer-seat users are blocked from all CLI commands except `graphit auth` and `graphit me`. The CLI is an analyst tool; viewers use the platform UI.
- **404 "not found"** - returned for dashboards the user cannot access (private dashboards owned by others, team dashboards the user is not on). The API intentionally does not distinguish "does not exist" from "you cannot access it" to prevent ID enumeration.
- **423 "Shared dashboard requires an active editing session"** - shared dashboard mutations require the user to enter Edit mode on the platform first (see constraint #4 below).

Connector create/delete are restricted to org admins (owner/admin role). Non-admin analysts get 403 on these commands.

## Legacy Setup

After an intentional legacy copied-file setup completes successfully, offer to add a Graphit section to the project instructions so future sessions know Graphit is available. Do not suggest legacy copied setup for Claude Code or Codex when the Graphit plugin is available. Suggested snippet:

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
All CSS in `<style>`, all JS in `<script>`, all fonts from system stack. The iframe has a built-in runtime (`graphit.chart`, `graphit.table`, `graphit.kpi`, `graphit.presentation`) for standard visualizations - use it instead of importing libraries.

### 2. ALWAYS query through data sources
NEVER query the warehouse directly when a cached data source covers the table. Data sources return in ~100ms. Warehouse queries take ~10s and cost Snowflake credits.

**Before writing ANY query:**
1. Run `graphit ds list` to see what data sources exist
2. If a DS covers your table, use `graphit query "SQL" --ds <id>` (DuckDB syntax)
3. Only use `graphit query "SQL" --warehouse --connection <id>` if NO data source exists and the user approves

**Wrong:** Jumping straight to `graphit query "SELECT SUM(cost) FROM marketing_ua" --warehouse` when a data source already caches that table.
**Right:** `graphit ds list` first, find the DS ID, then `graphit query "SELECT SUM(cost) FROM marketing_ua_ds" --ds ds_abc123`.

**Use the data source name in SQL** (e.g. `FROM MARKETING_UA_DS`), not the raw source table. The DS is a KB table - governance rules target it directly, and users recognize DS names from the platform.

### 3. EVERY element must have entity wrapping
Without `data-graphit-*` attributes, elements are invisible to the platform - no click info, no mentions, no KB provenance. Every chart, KPI card, table, and text section needs ALL FOUR attributes:

```html
<div data-graphit-id="revenue-trend"
     data-graphit-label="Revenue Trend"
     data-graphit-sql="SELECT {{dim:REGION}} AS region, {{metric:REVENUE}} AS revenue FROM orders GROUP BY region"
     data-graphit-ds="ds_abc123">
  <!-- chart/KPI/table content here -->
</div>
```

| Attribute | Format | Example |
|-----------|--------|---------|
| `data-graphit-id` | Unique kebab-case | `"spend-by-source"` |
| `data-graphit-label` | Human-readable name | `"Ad Spend by Source"` |
| `data-graphit-sql` | Executable SQL (HTML-encode `<>&"`) | `"SELECT ..."` |
| `data-graphit-ds` | Data source ID from `graphit ds list` | `"ds_abc123"` |

KB asset references are derived automatically from `{{metric:X}}` / `{{dim:X}}` templates in your SQL. The platform's governance compiler resolves these and displays KB asset chips in the entity details panel.
Missing any attribute = broken entity. Missing wrapping entirely = invisible to the platform.

**SQL must be complete and executable.** The platform runs `data-graphit-sql` against the data source when a user opens the entity's details panel. Write the full query from the `graphit.resolve()` call - never abbreviate, truncate, or use placeholders (`FROM ...`, `SELECT ...`, ellipsis). It MUST use the real DS table name and only columns that exist in the DS - never invented summary columns, CTE aliases, JS variable names, or prose. If the chart's resolve call uses a CTE, put the full WITH query. If JS builds SQL dynamically, store one representative executable variant (e.g. the default date range).

**Wrong:** `data-graphit-sql="SELECT INSTALL_TIME, ROIAP_D0, ROIAP_D3 FROM UA_DS"` when the DS has no ROIAP_D0 column (the chart computes it via CASE) - the details panel errors.
**Right:** `data-graphit-sql="SELECT INSTALL_TIME, SUM(CASE WHEN SENIORITY=0 THEN TOTAL_IAP END)/NULLIF(SUM(COST),0) AS ROIAP_D0 FROM UA_DS GROUP BY 1"` - same derivation the chart runs.

**Label = visible title.** The `data-graphit-label` MUST match the card's visible heading exactly. Users see the label in @ mention dropdowns and entity panels - if it doesn't match the title on screen, they can't find their chart.

### 4. Shared dashboards require Edit mode on the platform
Dashboards shared with teams are protected by an editing session lock. The CLI cannot acquire editing sessions - mutations (`dashboard update-html`, `dashboard update-entity`) on a shared dashboard will fail with **423: "Shared dashboard requires an active editing session"**.

**When you see a 423 from a dashboard command:**
1. Tell the user to open the dashboard on the Graphit platform and click the **Edit** button in the header
2. Once they're in edit mode (draft active), CLI mutations will work because the session is held
3. When done, the user publishes or discards from the platform UI
4. Private dashboards (not shared with any team) are unaffected - the CLI can mutate them directly

**Note:** another team member may already hold the editing session. Only one editor at a time. The user can check who's editing on the platform.

### 5. ALWAYS use graphit.resolve() for live data
NEVER embed query results as static JS variables. The dashboard iframe provides `graphit.resolve()` which fetches live data from cached data sources on every page load.

**Wrong:** Running queries at build time, embedding results as `const data = [{...}, ...]` in the HTML.
**Right:** Using `graphit.resolve({sql, dataSourceId})` in a `<script>` block so data refreshes automatically.

---

## How to Work (governs both workflows below)

You are a colleague building WITH the user, not a batch job that explores in silence and returns a finished product. Two habits make the difference: **short iterations** and **narration**.

**Short iterations.** Do one thing, show it, let the user react, then do the next: explore the KB and report what you found; validate one query and show the rows; build one section and show it. Each small step is a cheap chance for the user to redirect before you have built in the wrong direction. The opposite - exploring silently, deciding by yourself whether the data will work, then dropping a finished 600-line dashboard (or a bulk KB write) on the user - forces them to either accept a wrong result or send you back to the start.

**Always narrate.** The user cannot see your command output: the KB you listed, the SQL you ran, the rows that came back are invisible unless you surface them. So after each step, say what you found, what it means, and what you are about to do next. The one exception: if the user says "just build it" or "go", drop the running commentary and work straight through. Match the user's mode.

The difference in practice:
- **Weak (solo):** silently list the KB, silently run several queries, then save a complete dashboard and announce "Done - here's your dashboard."
- **Strong (collaborative):** "Found a **Marketing UA** data source with `{{metric:CPI}}` and `{{metric:ROAS}}` already defined. Starting with a spend-vs-installs trend - querying now." Then, after showing the rows: "Spend tracks installs except in March. Want that as the first graph, or should I look at ROAS first?"

The numbered steps in each workflow run *inside* this loop, not instead of it.

## Workflow: Dashboard Build

1. **Understand.** Ask what the dashboard should answer. Don't query until you know the goal - one clarifying question beats a wrong dashboard.
2. **Scope to the domain, then work down: domain -> data source -> assets.** Start narrow, not broad. Ask the user which business domain this dashboard is about (or infer it and confirm) - that scopes everything that follows. Then `graphit kb explore domain <NAME>` to see that domain's data sources and the metrics and dimensions defined on them. Reach for broad `graphit kb search` only as a fallback - when the domain is unclear or a concept spans domains. See `kb-discovery.md` and `kb-traversal.md`. Then tell the user what you found - the data source, the metrics and dimensions you'll use (by name), and the graphs you plan - before building.
3. **Understand the business question.** Before touching SQL, apply `domain-lenses.md` to classify the user's goal. Match column names and user intent against the five lens detection signals (Marketing, Finance, Product/Growth, Operational, Sales). Once the lens is identified: check its canonical metrics and clarification questions. Ask at most ONE clarifying question using collaborative phrasing - state your assumption and offer to redirect ("I'll compute ROAS as gross revenue over spend - redirect me if you need margin-adjusted"). Map the user's goal to specific metric and dimension concepts the dashboard needs - name them. Show the user: "This dashboard needs: ROAS_D7, CPI, LTV_CAC_RATIO (metrics) and MEDIA_SOURCE, CAMPAIGN_NAME (dimensions). Let me check if these exist in the KB." This concept list feeds the next step.
4. **KB-readiness gate (BLOCKING).** Check the KB against the specific concepts from step 3 - not a vague "does the KB have stuff?" but "does the KB have the ROAS, CPI, and LTV:CAC that this marketing dashboard needs?" Show a compact gap table: which concepts exist in the KB (with their formula) and which are missing. If the KB covers the needed concepts, proceed to step 5. If the KB is missing key metrics or dimensions, STOP - do not build a dashboard on raw ad-hoc SQL. Tell the user what is missing, propose creating the assets, then route to the **KB Build / Onboarding** workflow below to define the semantic layer first. Return here only after the KB has the assets the dashboard needs. A dashboard built on ad-hoc SQL instead of `{{metric:NAME}}` / `{{dim:NAME}}` references bypasses governance, breaks provenance, and produces untrustworthy results.
5. **Pick the data source, and handle gaps.** Use the cached data source in that domain (~100ms, preferred over live warehouse at ~10s); use its name in SQL (`FROM MARKETING_UA_DS`). If that data source is missing something you need, first look for a connection to another data source you can join (`graphit kb list relationships`); only if the data genuinely does not exist yet, propose building a new data source rather than forcing a bad query.
6. **Validate each query, and show the result.** Write SQL with `{{metric:NAME}}` / `{{dim:NAME}}` reference syntax for KB assets, run it with `--verbose`, and for EVERY query show the user a compact result: the reference-syntax query, a small markdown table of rows, the row count, and the trust tier. If a query returns zero rows or nulls, say so and diagnose (wrong table? filter too narrow?).
7. **Get approval, then build.** Once the user is happy with the data and plan, assemble the HTML: `graphit.resolve()` for live data, `graphit.chart/table/kpi` for rendering, every entity wrapped (see HARD CONSTRAINTS), all CSS in `<style>`, all JS in `<script>`. For a large dashboard, add entities incrementally - build one, show it, add the next - rather than generating everything at once. Write to a local `.html` file.
8. **Save - prefer entity updates - then hand off.** New dashboard: `graphit dashboard update-html <id> --file <path>`. Changing an existing one: prefer `graphit dashboard update-entity <id> <entity_id>`, which updates a single entity without regenerating (and destroying) the rest. If the response contains `entity_sql_warnings`, an entity's `data-graphit-sql` is missing, matches no data source, or fails the DS schema - fix the flagged entities and save again before reporting done. Confirm the save succeeded, then give the user the dashboard URL.

## Workflow: KB Build / Onboarding

When the user wants to build or populate their KB (from files, schema descriptions, or scratch). Consult `kb-structure.md` for the full graph model and structural Q&A, `kb-traversal.md` for tool selection, `kb-actions.md` for the CLI command matrix, `kb-discovery.md` for when to propose asset creation, and `parameterized-metrics.md` for template metrics.

**Step 1: Audit current KB state.** Before proposing anything, traverse the existing KB:

1. `graphit kb list domains` - get all domains (with asset counts)
2. For each domain: `graphit kb explore domain <NAME>` - returns all tables and assets in that domain in one traversal (see `kb-traversal.md` depth guidelines)
3. `graphit kb list synonyms` and `graphit kb list relationships` - global assets not scoped to domains

Present a tree summary of what already exists, following the Domain > Table > Topic > Asset hierarchy from `kb-structure.md`.

**Step 2: Analyze input.** Read the user's files, schema, or description. Classify every concept by asset type. Use `kb-structure.md` for asset type definitions (what is a metric vs dimension vs rule). Use `kb-discovery.md` for signals (aggregation = metric, derived grouping = dimension, business constraint = rule, colloquial term = synonym).

**Step 3: Present a tree-structured plan.** Show what will be created, organized by the KB hierarchy. Mark existing assets with (exists) so the user sees what's new vs what's already there:

```
KB Plan:

MARKETING (domain) (exists)
  MARKETING_UA (table) (exists)
    ACQUISITION (topic) (exists)
      - TOTAL_SPEND (metric) = SUM(APPSFLYER_COST) **NEW**
      - CPI (metric) (exists)
      - MEDIA_SOURCE (dimension) (exists)
      - CAMPAIGN_NAME (dimension) **NEW**
    ATTRIBUTION (topic) **NEW**
      - ROAS_D7 (metric) = SUM(revenue_d7) / NULLIF(SUM(cost), 0) **NEW**
      - ATTRIBUTION_WINDOW (dimension) **NEW**
    Rules:
      - EXCLUDE_ORGANIC (rule) (exists)
      - ACTIVE_CAMPAIGNS_ONLY (rule) = "WHERE status = 'active'" **NEW**
  MARKETING_UA_6MO (table) (exists)
    (reference TOTAL_SPEND, CPI from MARKETING_UA via secondary_tables)

PRODUCT (domain) **NEW**
  EVENTS (table) (exists)
    RETENTION (topic) **NEW**
      - DAU (metric) = COUNT(DISTINCT user_id) **NEW**
      - RETENTION_D7 (metric) **NEW**

Global:
  - Synonyms: GMV -> TOTAL_REVENUE (metric) **NEW**
  - Relationships: MARKETING_UA.USER_ID -> EVENTS.USER_ID **NEW**

Summary: 5 new metrics, 2 new dimensions, 1 new rule, 1 new domain, 2 new topics, 1 synonym, 1 relationship
```

For metrics with natural variant axes (D7/D30/D90, gross/net), propose parameterized templates instead of standalone metrics (see `parameterized-metrics.md`).

**Step 4: Wait for user approval.** Do not create anything until the user confirms the plan.

**Step 5: Execute top-down.** Create in dependency order (see `kb-actions.md` for full CLI command reference):
1. Domains (`graphit kb create domain --name X`)
2. Topics (`graphit kb create topic --name X`)
3. Metrics and dimensions (`graphit kb create metric ... --topics "A,B" --default-dimensions "D1,D2"`, `graphit kb create dimension ... --topics "A,B"` - dimension types are auto-inferred from table schema)
4. Rules (`graphit kb create rule`)
5. Synonyms (`graphit kb create synonym --term X --canonical Y --type metric`)
6. Relationships (`graphit kb create relationship`)
7. Attachments: assign domains to tables (`graphit kb update table X --domain Y`), add secondary_tables for cross-table references (`graphit kb update metric X --secondary-tables "T1,T2"`)

**After each metric/dimension/rule create**, the response includes a `validation` section with sample results from real data. Present these to the user:
- **Metric**: show the sample query and the result table (value column, grouped by default dimensions if any). Example: "CPI = 12.4 for US, 8.7 for UK".
- **Dimension**: show the top values and their row counts. Flag any warnings (high NULL rate, single-valued).
- **Rule**: show how many rows matched. Warn if zero.
- **Skipped**: mention why (template, mid-refresh DS, no connections) - don't hide it.
- **Failed (422)**: the create was blocked. Show the error and the failing SQL. Fix the formula and retry.

For bulk creation (10+ assets), use `--skip-validate` to avoid per-asset latency, then verify the batch at the end via Step 6.

**Step 6: Verify.** Re-traverse: `graphit kb explore domain <NAME>` for each domain. Show the user the final tree and confirm counts match the plan.

## Commands

| Command | Description |
|---------|-------------|
| `graphit kb list <type>` | List entities: metric, dimension, table, rule, domain, synonym, template, relationship, topic |
| `graphit kb get <type> <name>` | Full entity details by name |
| `graphit kb search <query>` | Search across all KB types (optional `--type` filter) |
| `graphit kb explore metric <name>` | Metric -> tables -> dimensions graph |
| `graphit kb explore domain <name>` | Domain -> tables -> assets full tree (preferred starting point) |
| `graphit kb create metric --name X --sql "..." --table T` | Create a metric (optional `--default-dimensions "D1,D2"`). Validates formula against real data before creation; blocks on failure (422). Use `--skip-validate` to bypass. |
| `graphit kb create dimension --name X --expr "..." --table T` | Create a dimension (type auto-inferred from schema; override with `--type` / `--output-type`). Validates expression against real data; shows cardinality + NULL rate. Use `--skip-validate` to bypass. |
| `graphit kb create rule --name X --sql "..." --table T` | Create a rule. Validates as WHERE clause against real data; warns if zero rows match. Use `--skip-validate` to bypass. |
| `graphit kb create synonym --term X --canonical Y --type metric` | Create a synonym (type: metric, column, table) |
| `graphit kb create domain --name X` | Create a domain (optional `--color "#hex"`) |
| `graphit kb create relationship --name X --primary-table T --primary-column C --related-table T2 --related-column C2` | Create a JOIN relationship |
| `graphit kb create topic --name X` | Create a topic (business-concept tag) |
| `graphit kb create template --name X --file template.html` | Save a reusable chart template (--file or --render-code) |
| `graphit kb update metric NAME --topics "A,B"` | Attach topics to a metric (also works on dimension, rule) |
| `graphit kb update metric NAME --default-dimensions "D1,D2"` | Set default grouping dimensions for a metric |
| `graphit kb update metric NAME --secondary-tables "T1,T2"` | Reference metric onto additional tables (also dimension, rule) |
| `graphit kb update metric NAME --parameters '<json>'` | Set parameterized metric template (JSON array, or `--parameters-file`) |
| `graphit kb update table NAME --domain DOMAIN` | Assign domain to table (cascades to all assets on table) |
| `graphit kb update domain NAME --color "#hex"` | Update domain color |
| `graphit kb update synonym TERM --canonical Y` | Update synonym target |
| `graphit kb update relationship NAME --primary-column C` | Update relationship columns |
| `graphit kb update topic NAME --description "..."` | Update topic description |
| `graphit kb update template NAME --file template.html` | Update template render code |
| `graphit kb update <type> <name> --description "..."` | Update description (all types) |
| `graphit kb delete <type> <name> --yes` | Delete any entity (all types supported) |
| `graphit ds list` | List cached data sources (use these for fast queries) |
| `graphit ds create --name "..." --sql "..."` | Create DS, poll until ready, auto-scan schema, print verification link |
| `graphit ds create --name "..." --sql "..." --skip-scan` | Create DS without auto-scan |
| `graphit ds verify <id>` | Scan schema and print verification link for an unverified DS |
| `graphit ds refresh --all` | Refresh all data sources, wait for completion with live status |
| `graphit ds refresh --all --skip-empty` | Refresh non-empty data sources only |
| `graphit ds refresh --all --no-wait` | Trigger all refreshes without waiting |
| `graphit ds refresh <id> [id2...]` | Refresh one or more data sources by ID |
| `graphit query "<sql>" --ds <id>` | Query cached data source (~100ms) |
| `graphit query "<sql>" --ds <id> --override-rules RULE1 RULE2` | Query with governance rule overrides |
| `graphit query "<sql>" --ds <id> --verbose` | Show expanded SQL and trust tier |
| `graphit query "<sql>" --warehouse --connection <id>` | Query live Snowflake (~10s) |
| `graphit governance status` | Show governance mode and conformance stats |
| `graphit governance set <mode>` | Set governance mode (observe/warn/strict) |
| `graphit governance audit` | View recent governance audit events |
| `graphit ds update <id> --governed-mode on\|off` | Enable/disable governed mode on a data source |
| `graphit ds update <id> --max-rows N` | Set max rows cap on a data source |
| `graphit dashboard create --name "..."` | Create dashboard (returns ID) |
| `graphit dashboard get-html <id>` | Get current HTML content of a dashboard |
| `graphit dashboard update-html <id> --file <path>` | Upload HTML to dashboard (full page replace) |
| `graphit dashboard update-entity <id> <entity_id> --file <path>` | Update a single entity's inner HTML (optional `--title`, `--stdin`) |
| `graphit dashboard list` | List dashboards with sharing metadata (permission, visibility, teams, is_locked) |
| `graphit dashboard list --view mine` | Only dashboards you own |
| `graphit dashboard list --view shared` | Only dashboards shared with you |
| `graphit dashboard list --team <id>` | Only dashboards shared with a specific team |
| `graphit team list` | List teams you belong to (org admins see all) |
| `graphit dashboard export <id>` | Export dashboard as PNG (default) or PDF (`--format pdf`, `--output <path>`). Presentations export as multi-page PDF (one slide per page) automatically. For custom multi-page layouts, add `data-graphit-page="N"` (0-indexed) to each section element. |
| `graphit metadata schemas --connection <id>` | List Snowflake schemas |
| `graphit metadata tables --schema <name> --connection <id>` | List tables in a Snowflake schema |
| `graphit connector list` | List active connections |
| `graphit connector add snowflake-keypair --account X --user Y --key <path> --warehouse W` | Add Snowflake keypair connection (admin only). OAuth and GitHub connections are configured via the web app. |
| `graphit connector test <id>` | Test a connection |
| `graphit connector remove <id> --yes` | Remove a connection (admin only) |
| `graphit auth login` | Authenticate with Graphit |
| `graphit auth status` | Show current auth status |
| `graphit auth logout` | Clear stored credentials |
| `graphit plugin status` | Check plugin bundle, CLI, skill, refs, hooks, copied legacy files, and update health |
| `graphit setup` | Legacy copied-file fallback for Cursor/non-plugin environments |
| `graphit setup --remove-legacy-copies` | Remove old Claude Code/Codex copied snapshots so the plugin bundle is source of truth |

## Presenting Results to the User

The user CANNOT see raw CLI JSON output. You are the rendering layer - format and present every result using markdown. Per-command templates are in the reference file for each domain: `sql-reference.md` (query + DS results), `kb-traversal.md` (KB list/get/search/explore), `governance.md` (governance status + errors), `dashboard-planning.md` (dashboard + connector lists).

**Core rules:** Ground every result in the KB - list referenced metrics/dimensions/tables, show both the `{{metric:X}}` query and resolved SQL, always use `--verbose`. Bold every KB asset/table/DS name. Markdown tables for tabular data. SQL in ```sql code blocks. Format numbers (commas, $, %). Governance provenance footer after every query. For ad-hoc queries, suggest the KB reference equivalent. Never silently consume output.

---

## Query Governance and Reference Syntax

The platform enforces server-side query governance. Use KB reference syntax for governed queries:

| Syntax | Expands To | Example |
|--------|-----------|---------|
| `{{metric:NAME}}` | Metric calculation (aggregation) | `{{metric:CPI}}` |
| `{{metric:NAME(K=V)}}` | Parameterized metric | `{{metric:ARPU(DAY=7)}}` |
| `{{metric_raw:NAME}}` | Raw expression (no aggregate) | `{{metric_raw:REVENUE}}` |
| `{{dim:NAME}}` | Dimension expression | `{{dim:INSTALL_MONTH}}` |

**Parameterized metrics:** Some metrics (ARPU, ROAS, RETENTION) contain `${PARAM:X}` tokens and require explicit parameter values. Run `graphit kb list metric` - the `params` column shows required parameter names. Use `{{metric:ARPU(DAY=7)}}` to resolve `${PARAM:DAY}` to `7`. Omitting required parameters returns a clear error with the exact syntax to use. Pre-baked variants (ARPU_D7, ROAS_D30) have the value hardcoded and need no parameters.

```bash
# Governed query using reference syntax
graphit query "SELECT {{dim:INSTALL_MONTH}}, {{metric:CPI}} as cpi FROM MARKETING_UA_DS GROUP BY 1" --ds ds_abc123

# Parameterized metric
graphit query "SELECT {{dim:INSTALL_MONTH}}, {{metric:ARPU(DAY=7)}} as arpu FROM MARKETING_UA_DS GROUP BY 1" --ds ds_abc123

# Verbose shows expanded SQL and trust tier
graphit query "SELECT {{metric:CPI}} as cpi FROM MARKETING_UA_DS" --ds ds_abc123 --verbose
```

Queries using reference syntax produce **governed** trust tier. Inline formulas produce **ad-hoc** tier, which may be blocked in strict mode. Use `--override-rules RULE_NAME` to bypass specific enforceable rules when the user explicitly requests it.

Trust tiers: **governed** (used KB references), **verified** (raw SQL matches KB definitions), **ad-hoc** (inline formulas). Badges appear on dashboard graphs and canvas entities.

Use reference syntax in `graphit.resolve()` calls too - the server expands them at query time:

```js
graphit.resolve({
  sql: "SELECT {{dim:INSTALL_MONTH}}, {{metric:ARPU(DAY=7)}} as arpu FROM MARKETING_UA_DS GROUP BY 1",
  dataSourceId: "ds_abc123",
  target: "#arpu-chart"
});
```

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

**Error handling:** `graphit.resolve()` rejects on timeout (120s), bad SQL, or invalid data source ID. Wrap calls in try/catch and show a user-visible error message in the target element on failure. Verify SQL returns data via the CLI before embedding it in HTML.

**Rate limit:** 120 requests per minute per user per dashboard. Each `graphit.resolve()` call counts as one request. A dashboard with 6 KPIs/charts that refreshes on every filter change uses 6 requests per interaction - budget for ~20 filter changes per minute. If you hit the limit, the API returns a "Too many requests" error with a retry-after hint. Design dashboards to batch all queries in a single `Promise.all` so they count against the same time window rather than spreading across multiple refresh calls.

### First-paint loading state

The dashboard HTML paints before the SDK connects (iframe load + handshake), so the SDK's own spinner cannot cover the first moments. Bake this pure-CSS overlay into the HTML so every chart shows a spinner from the first frame; the SDK adopts it and removes it when that element's `graphit.resolve()` settles (success or error).

Add once to the page `<style>`:

```css
@keyframes gh-spin{to{transform:rotate(360deg)}}
.gh-loading{position:relative;min-height:120px}
.gh-loading-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:9998;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);background:color-mix(in srgb,var(--graphit-surface-raised,#fff) 50%,transparent);border-radius:inherit}
.gh-loading-spin{animation:gh-spin .7s linear infinite}
```

Add inside EVERY element you pass as `target:` to `graphit.resolve()` - and ONLY those elements (a static text or title section with no resolve call would spin forever):

```html
<div id="spend-chart" class="gh-loading">
  <div class="gh-loading-overlay"><svg class="gh-loading-spin" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--graphit-border,#e5e5e5)" stroke-width="2.5"/><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--graphit-accent,#4DB6AC)" stroke-width="2.5" stroke-linecap="round"/></svg></div>
</div>
```

The class names are a contract with the SDK (`gh-loading`, `gh-loading-overlay`, `gh-loading-spin`, `gh-spin`) - keep them exactly as shown or the SDK cannot adopt and remove the overlay. NEVER write text placeholders ("Loading...", "Fetching data...") - they never animate and make slow loads look stuck.

### Rendering

You have full creative freedom for how to present data. Build charts with inline SVG, CSS, HTML tables, creative layouts - whatever fits the dashboard best.

The iframe also provides optional convenience helpers if you want quick standard charts:

| Helper | Usage |
|---|---|
| `graphit.chart(el, {type, data, x, y, ...})` | Bar, line, area, donut, scatter, stacked-bar, heatmap, funnel, gauge, sparkline |
| `graphit.table(el, {data, columns?, maxRows?})` | Styled HTML table. `columns` is a `string[]` of data keys (NOT objects), defaults to `Object.keys(data[0])` |
| `graphit.kpi(el, {value, label?, format?})` | KPI card with optional delta |
| `graphit.presentation(el)` | Full-screen slide deck. Returns builder: `.slide({bg, layout, html})` then `.start()`. See `presentations.md` |
| `graphit.filter(id, {label, field?, default?})` | Headless filter registration (renders nothing). Returns handle: `{get, set, subscribe}`. See `filters.md` |
| `graphit.param(id, {label, default?, options?})` | Headless parameter registration (renders nothing). Same handle API as filter |
| `graphit.bind(el, {sql, dataSourceId, params, deps?, render})` | Reactive data binding - auto re-resolves when dep filter/param changes. See `filters.md` |

These are shortcuts, not requirements. Use them when a standard chart is all you need. Hand-roll when you want full control over the visualization.

`graphit.chart` types: `"bar"`, `"horizontal-bar"` (alias `"hbar"` - use when category labels are long), `"line"`, `"area"`, `"donut"` (alias `"pie"`), `"scatter"` (alias `"bubble"`), `"stacked-bar"` (alias `"stacked"`), `"heatmap"`, `"funnel"`, `"gauge"`, `"sparkline"`. Config: `x` (category field), `y` (value field), `series` (group-by field), `title`, `height` (140-900px), `valueFormat` (`"currency"` | `"percent"` | `"number"`), `colors` (array). Dual axis (bar/line/area): `y2` (secondary value field, right Y-axis with independent scale), `y2Format`, `y2Label`; `y2` and `series` are mutually exclusive; bar+y2 renders as combo chart (bars + dashed line overlay). Scatter adds: `size` (bubble radius field), `label` (tooltip field). Gauge adds: `min`, `max`, `format`. Sparkline adds: `width`, `showValue`.

`graphit.kpi` config: `value`, `label`, `format` (`"currency"` | `"percent"` | `"number"`), `compareValue`, `compareLabel`.

### Canonical pattern - entity with live data

```html
<div data-graphit-id="spend-by-source"
     data-graphit-label="Ad Spend by Source"
     data-graphit-sql="SELECT {{dim:MEDIA_SOURCE_DIMENSION}} AS source, {{metric:CPI}} AS cpi FROM MARKETING_UA_DS GROUP BY source ORDER BY cpi DESC"
     data-graphit-ds="ds_abc123">
  <div id="spend-chart" class="gh-loading">
    <div class="gh-loading-overlay"><svg class="gh-loading-spin" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--graphit-border,#e5e5e5)" stroke-width="2.5"/><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--graphit-accent,#4DB6AC)" stroke-width="2.5" stroke-linecap="round"/></svg></div>
  </div>
</div>
<script>
(async function() {
  var r = await graphit.resolve({
    sql: "SELECT MEDIA_SOURCE, SUM(APPSFLYER_COST) as spend FROM MARKETING_UA_DS GROUP BY MEDIA_SOURCE ORDER BY spend DESC",
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
| `kb-discovery.md` | Starting a build (domain-first). Domain -> DS -> assets discovery, metric vs dimension, naming, formula syntax, when to propose asset creation, reuse over reinvention, cross-table referencing. |
| `kb-structure.md` | KB graph model + structural Q&A. Node types, edge types, the vertical home (domain -> DS -> assets) vs horizontal topics, tree order, and how to answer "what is a domain" / "why is X under Y". |
| `kb-traversal.md` | Graph queries. Tool selection guide (search vs explore vs read), common query patterns, depth guidelines. |
| `kb-actions.md` | Full CRUD matrix. Asset create/edit/delete, topic management, domain assignment cascade, navigation and discovery. |
| `parameterized-metrics.md` | Metric templates. ${PARAM:NAME} tokens, child variant auto-generation, editing templates, using variants in queries. |
| `sql-reference.md` | Writing queries. DuckDB/Snowflake translation, formatting standards, gap-filling, JSON access, data source routing. |
| `domain-lenses.md` | Data matches a business domain. Marketing, finance, product/growth, ops, sales - signals, key metrics, must-have charts, anti-patterns. |
| `graphit-style.md` | Building the HTML. Design principles, typography scale, color system with usage rules, layout patterns (page structure, KPI cards, data tables). |
| `chart-patterns.md` | Custom chart implementations. Inline SVG/CSS code for: scatter/bubble, heatmap, funnel, gauge, sparkline, stacked bar, and the shared tooltip pattern. |
| `governance.md` | Query governance. Reference syntax, trust tiers, enforceable rules, override flow, governance commands. |
| `presentations.md` | Slide deck presentations. Builder API, layouts (center/split/full), backgrounds, navigation, live data inside slides. |
| `filters.md` | Headless filters and parameters. `graphit.filter()`/`graphit.param()` registration (zero DOM), `graphit.bind()` reactive binding, `:name` safe param syntax, saved views. |
| `data-sources.md` | Building performant, cache-friendly data sources. Why source shape decides dashboard speed; pre-aggregate to query grain, narrow columns, keep high-cardinality dimensions out of the base. |
