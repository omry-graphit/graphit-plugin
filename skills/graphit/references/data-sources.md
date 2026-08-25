# Data Sources

Load when selecting or creating the cached source a semantic model uses.

## Routing

1. Read the semantic model's declared data-source binding.
2. Prefer that cached source for speed, governance, and repeatability.
3. Use metadata discovery when physical columns are unknown.
4. Query live warehouse only when no cached source covers the question and the user approves.
5. Never infer a source from a similarly named model.

A group is semantic placement. Data-source creation still accepts `--domain`; pass the uppercase policy key returned by status or the group's `domain_keys`.

## Source SQL

- Select only needed columns and rows.
- Filter early using base-table columns.
- Avoid wrapping filter columns when a direct predicate works.
- Keep complete executable SQL; no ellipses, fake tables, or embedded data.
- Preserve warehouse dialect.
- Make grain and refresh mode explicit.
- Use merge key and watermark only when the source supports them.

## Creation

Confirm connector, relation/query, policy key, grain, refresh mode, and cost. Read columns through metadata rather than probing with ad-hoc SQL.

Create with automatic scan unless there is a specific reason not to. Creation may be asynchronous; report `creating` honestly and poll status rather than claiming readiness.

## Access and safety

- Changing a source requires data-source write capability in its policy key.
- Reading does not imply authority over connector, SQL, or refresh settings.
- Visibility and masking cover agent, canvas, render, export, and report paths.
- Private names and columns remain concealed.
- Delete/move stay in the Sources Hub where cascades are visible.

For refresh modes, history, incremental tuning, and reconciliation, load `data-source-refresh.md`.
