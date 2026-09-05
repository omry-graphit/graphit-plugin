# Data Sources

Load when selecting or creating the cached source a semantic model uses.

## Routing

1. Read the semantic model's declared data-source binding and physical `model` table name.
2. Prefer that cached source for speed, governance, and repeatability.
3. Use metadata discovery when physical columns are unknown.
4. Query live warehouse only when no cached source covers the question and the user approves.
5. Never infer a source from a similarly named model.

`--ds` selects the cached source by its returned name, full id, or unique id prefix. It does not make an arbitrary semantic-model name a SQL table. In SQL, use the physical table name read from the bound model's `model`; do not guess it from the source's display name or a second model's `name`.

A group is semantic placement. Data-source creation accepts `--domain`; pass the uppercase policy key returned by status or the group's `domain_keys`. The alias `--domain Private` selects the caller's own workspace; read `kb-scope.md` for its distinct KB group input.

Separately cached sources cannot be joined at query time. A cross-source question needs a combined source created from the ORIGINAL warehouse relations (never from cached source names), or an explicitly approved live query.

## Source SQL

- Select only needed columns and rows.
- Filter early using base-table columns.
- Avoid wrapping filter columns when a direct predicate works.
- Keep complete executable SQL; no ellipses, fake tables, or embedded data.
- Preserve warehouse dialect.
- Make grain and refresh mode explicit.
- Use merge key and watermark only when the source supports them.

## Shape Decides Speed

A source's shape - set at creation - decides whether every dashboard on it feels instant. Filter changes answer from a cached, pre-aggregated result only when the source is small and already aggregated to the queried grain; a raw or very wide source re-scans on every filter change and cannot be fixed later in dashboard SQL.

| Lever | Build it right | Anti-pattern |
|---|---|---|
| Grain | `GROUP BY` to the grain dashboards chart | One row per raw event |
| Columns | Only what dashboards use | Hundreds of columns "just in case" |
| Cardinality | Low-card dimensions in the base; ad/campaign names in a separate drill-down | Thousands-of-values dimensions in the base grain |
| Size | A few-thousand-row typical aggregation | A raw, monolithic, very wide source |

This is advisory: when you see a slow shape (raw passthrough, `SELECT *` wide, high-cardinality grain), state the trade-off and OFFER the pre-aggregated alternative - then build whichever the user chooses. A wide/raw source is legitimate for row-level drill-down, genuinely-all-used columns, or staging. Never refuse or lecture.

## Creation

Confirm connector, relation/query, policy key, grain, refresh mode, and cost. Read columns through metadata rather than probing with ad-hoc SQL.

Before creating, run one small approved warehouse validation against the same connection: relations reachable, joins compile with a small limit, the join does not multiply the declared grain. That read is part of the approved data-source operation - it does not authorize unrelated live exploration.

Create with automatic scan unless there is a specific reason not to. The scan creates or updates the source's bound semantic model in its selected scope; `ds verify` runs that scan when needed. Read the resulting model and extend it instead of hand-creating another one over the source. Creation may be asynchronous; report `creating` honestly and poll status rather than claiming readiness.

Review the scanned schema before accepting a warehouse/SQL source with `ds verify --accept-schema`. File uploads also require `ds verify`, without that flag. Confirm the returned source is ready and verified before reporting activation; scan completion alone is not activation.

Edit in place when changing columns, filters, joins, or date coverage for the same purpose - editing preserves the source id, graph bindings, semantic-model binding, schedules, and history. Create a separate source only for a different purpose or connection.

## Zero Rows and Nulls

On an empty or suspiciously-null result: check the selected source and dialect, verify column names/joins/filters, then remove one constraint at a time to find the emptying condition. Confirm the data exists with a small targeted query before concluding absence - and never silently switch to the live warehouse after an empty cached result. An all-null metric is not validated; stop before building on it.

## Access and safety

- Changing a source requires data-source write capability in its policy key.
- Reading does not imply authority over connector, SQL, or refresh settings.
- Visibility and masking cover agent, canvas, render, export, and report paths.
- Private names and columns remain concealed.
- Delete/move stay in the Sources Hub where cascades are visible.

For refresh modes, history, incremental tuning, and reconciliation, load `data-source-refresh.md`.
