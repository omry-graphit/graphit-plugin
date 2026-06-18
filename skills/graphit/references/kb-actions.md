# KB Actions (Execute)

The execute side of KB work: run approved create / update / delete through the `graphit kb` commands. The plan side - what a domain or topic is, why an asset sits where it does - lives in `kb-structure.md`. On a from-scratch build the two pair up (plan there, execute here); a normal build that reuses existing assets needs only this file.

Create only after the user approves the gap plan below. Names are stored UPPER_SNAKE_CASE. Run `graphit kb create <type> --help` for the exact flag spelling - this file teaches the recipes and policy, the CLI owns the syntax.

## Gap Plan (present before creating anything)

When the KB-readiness gate finds the dashboard needs assets that do not exist, present a compact plan and get one approval before any write. Show, per missing asset: name, type, formula or expression, the table and topics it lands on, and any rule that applies. Then ask once.

~~~
**KB gap - 3 assets missing for this Marketing dashboard:**

| Asset | Type | Definition | Table | Topics |
|---|---|---|---|---|
| **ROAS_D7** | metric | `SUM(revenue_d7) / NULLIF(SUM(cost), 0)` | MARKETING_UA | ATTRIBUTION |
| **CPI** | metric | `SUM(cost) / NULLIF(SUM(installs), 0)` | MARKETING_UA | ACQUISITION |
| **MEDIA_SOURCE** | dimension | `media_source` | MARKETING_UA | ACQUISITION |

Rule to apply: **EXCLUDE_ORGANIC** already exists and will filter these.
Create these so the dashboard runs on governed references? (Approve / adjust.)
~~~

Present the plan, then stop. Do not create until the user approves.

## Create

| Asset | Command shape |
|---|---|
| Metric | `graphit kb create metric --name X --sql "<expr>" --table T` (optional `--topics "A,B"`, `--default-dimensions "D1,D2"`, `--parameters`/`--parameters-file` for templates, `--skip-validate`) |
| Dimension | `graphit kb create dimension --name X --expr "<expr>" --table T` (type auto-inferred; override with `--type` / `--output-type`; `--skip-validate`) |
| Rule | `graphit kb create rule --name X --sql "<text>" --table T` (optional `--constraint`, `--override-policy`, `--apply-on`, `--topics`, `--skip-validate`) |
| Synonym | `graphit kb create synonym --term X --canonical Y --type metric` |
| Domain | `graphit kb create domain --name X` (optional `--color "#4DB6AC"`) |
| Topic | `graphit kb create topic --name X` |
| Relationship | `graphit kb create relationship --name X --primary-table T --primary-column C --related-table T2 --related-column C2` |

## Enforceable Rule Flags

A plain rule is documentation. To make it enforced server-side at query time, pass typed constraints on `graphit kb create rule` / `graphit kb update rule`:

- `--constraint <spec...>` - one or more typed constraints, each written `type:value`. Types: `required_where:"<predicate>"`, `forbidden_column:<col>`, `required_filter:<col>`, `required_aggregation:<col>`, `value_restriction:<col>:<in|not_in>:<v1,v2>`. On update the supplied list REPLACES the rule's existing constraints.
- `--override-policy <policy>` - who may bypass the rule with `--override-rules`: `anyone`, `analyst_only`, `admin_only`, or `never`. Create defaults to `anyone`.

What each constraint type does at query time, plus the override flow, lives in `governance.md`. Example: a rule that always scopes verified purchases -

```bash
graphit kb create rule --name FILTER_VERIFIED_PURCHASES --sql "Only count verified purchases" --table ORDERS --constraint required_where:"is_verified = true" --override-policy analyst_only
```

## Pre-Creation Validation

Metric, dimension, and rule creates validate the formula against real data before writing; the response carries a `validation` object (status `pass` / `skipped` / `fail`). Surface it to the user - per-type result templates are in `kb-traversal.md`. A `fail` returns HTTP 422 and the asset is NOT created: show the error and failing SQL, fix the formula, retry. Validation is skipped (asset still created) for `${PARAM:X}` templates, constraint-based rules, and tables with no ready data source. Pass `--skip-validate` to bypass it on bulk creates.

## Update and Delete

- Update a field: `graphit kb update <type> NAME --<field> value` (e.g. `--sql`, `--expr`, `--description`, `--table`).
- Delete: `graphit kb delete <type> NAME --yes`. Deleting a parameterized parent cascades to all its children - confirm the blast radius first (see `parameterized-metrics.md`).

## Lists REPLACE - read before you write

`--topics`, `--secondary-tables`, `--default-dimensions`, and `--constraint` REPLACE the existing list, they do not append. To change one value, read the current list first (`graphit kb get metric NAME`), then write the full intended list: add a topic with `--topics "EXISTING1,EXISTING2,NEW"`; remove one by writing the list minus that value.

Reference an asset onto another table with `graphit kb update metric NAME --secondary-tables "OTHER_TABLE"` (also dimension, rule). This is a read-only pointer marked `*` in the tree; metrics and dimensions need every referenced column to exist on the target, rules need only the table. Topics are horizontal - one topic can tag assets across many domains (see `kb-structure.md`).

## Domain home (set on the table, cascades)

Domain is set on the TABLE, never per asset, and cascades to every asset on it (model in `kb-structure.md`). To re-home a whole table at once: `graphit kb update table NAME --domain MARKETING`. Change it once on the table, never asset by asset.

## Navigation

To find what exists and how it connects, use the read recipes in `kb-traversal.md`.

## UI-Only (no CLI command)

Platform-UI state, not KB data the CLI changes: view mode (Tree / By Topic / By Table / Flat), filter dropdowns, expand / collapse, drag-drop onto a topic, and a synonym's cross-cutting domains (extra relevance beyond its home domain has no CLI flag yet).
