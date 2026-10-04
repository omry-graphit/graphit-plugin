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

Establish connector, relation/query, policy key, grain, refresh mode and cost from the request and evidence; ask only about unresolved consequential choices. Explore/Build use `--domain Private`; shared placement is agreed in Share. Read columns through metadata rather than probing with ad-hoc SQL.

Before creating, run one small approved warehouse validation against the same connection: relations reachable, joins compile with a small limit, the join does not multiply the declared grain. That read is part of the approved data-source operation - it does not authorize unrelated live exploration.

Create with automatic scan unless there is a specific reason not to. The scan creates or updates the source's bound semantic model in its selected scope; `ds verify` runs that scan when needed. Read the resulting model and extend it instead of hand-creating another one over the source. Creation may be asynchronous; report `creating` honestly and poll status rather than claiming readiness.

A clean scan activates the source after its snapshot is published, for warehouse sources and file uploads in every scope. Confirm the completed response is `ready` and `verified`; do not add a human acceptance step to a successful create. If publication succeeds but scanning fails, the source can be ready without a model: report that limitation and use `ds verify <id>` to recover. Use `ds verify --force` only for an explicit re-scan.

Creation and verification output report `pii_hidden` with reasons: these columns are masked as NULL in every query, including dashboards and exports. Surface those verdicts and the returned remedy. Use the server's `can_expose_verdict`, never a guessed role, to explain who can reverse a false positive. `ds verify <id> --expose COL1,COL2` explicitly unhides named columns; it also works on an already-verified source and reports `exposed` and `expose_failed`. Do not unhide a column without the user's choice.

Edit in place with `ds edit-sql <id> --sql "..."` when changing columns, filters, joins, or date coverage for the same purpose - editing preserves the source id, graph bindings, semantic-model binding, schedules, and history. The new SQL is compiled against the warehouse before anything is saved. A breaking candidate with dependents pauses in `pending_verification` with the old data still serving; only explicit `ds verify --accept-schema` accepts it. A clean change without dependents can adopt automatically, as can an additive change. Report the returned state; a queued acceptance is not adoption. A full rebuild (`ds refresh --full`) does not accept drift either. `--expected-version` is optional and a stale value is refused without changing anything. File-upload sources cannot be edited by SQL. Replace an uploaded file's contents in place with `graphit ds re-upload <id> --file <path>`; in the app, the person uses Re-upload file on the source in the Sources Hub. Either keeps the id and every binding, while re-creating the source is refused on its name or orphans the old one. A changed column set is refused until the user accepts `--force`, which breaks graphs reading removed or renamed columns; a source still pending verification must be verified first. Never version the same work as `_v2`, `_copy` or `_shared`, including after a refused edit. Create a separate source only for a different purpose or connection.

## Zero Rows and Nulls

On an empty or suspiciously-null result: check the selected source and dialect, verify column names/joins/filters, then remove one constraint at a time to find the emptying condition. Confirm the data exists with a small targeted query before concluding absence - and never silently switch to the live warehouse after an empty cached result. An all-null metric is not validated; stop before building on it.

## Access and safety

- Changing a source requires data-source write capability in its policy key.
- Reading does not imply authority over connector, SQL, or refresh settings.
- Visibility and masking cover agent, canvas, render, export, and report paths.
- Private names and columns remain concealed.
- Delete your own private sources with `graphit ds delete <id> --yes` only after the user confirms. Shared sources stay in the Sources Hub. `dashboard delete <id> --yes --delete-sources <ids>` also removes the named own private sources only that dashboard used (ids from `dashboard delete-preview`). A 409 names visible dependents to remove or rebind first. A 409 marked `retryable` means a concurrent workspace edit interrupted it and nothing was deleted: tell the user and repeat the same delete only after they confirm again. A 202 means deletion applied but storage cleanup is pending: report it and do not repeat the delete.
- There is no source move on any surface. A source lives in the `group` of the semantic model bound to it, so `kb update semantic-model <name>` with a new `group` moves the source; a source with no bound model yet keeps the domain it was created with.

For refresh modes, schedules, full rebuilds, history, incremental tuning, and reconciliation, load `data-source-refresh.md`.
