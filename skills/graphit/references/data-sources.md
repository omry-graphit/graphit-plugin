# Data Sources: Routing and Building for Speed

A data source's shape - set by its source SQL at creation - decides how fast every dashboard built on it will be, and whether filter changes feel instant. Get this right when you create the source; it can't be fixed later in the dashboard SQL.

## Routing: which source to query

Always prefer a cached data source over the live warehouse. Check what exists with `graphit ds list` before writing any query.

| Situation | Command | Speed |
|---|---|---|
| The table has a cached data source | `graphit query "SQL" --ds <NAME>` | roughly 100ms, DuckDB |
| No data source covers the table | `graphit query "SQL" --warehouse --connection <id>` | roughly 10s, Snowflake |

`--ds` takes the data source **name** (the same name you SELECT FROM, e.g. `... FROM MARKETING_UA_DS ... --ds MARKETING_UA_DS`); a full id or unique id-prefix also resolves.

If no data source covers the table the user needs, propose creating one for future speed rather than defaulting to repeated warehouse queries. Dialect differs by route (DuckDB for `--ds`, Snowflake for `--warehouse`); see `sql-reference.md`.

## Build it right (in the source SQL)

Filter changes answer from a cached, pre-aggregated result only when the source is small and aggregated to the grain you query; pull in raw rows, hundreds of columns, or thousands-of-values dimensions and it is too big to cache, so every filter change re-scans the whole source and is slow. Set the shape at creation on these four levers:

| Lever | Build it right | Anti-pattern |
|---|---|---|
| Grain | `GROUP BY` to the grain you chart (the single biggest lever) | One row per raw event |
| Columns | Only the columns dashboards use (each is downloaded + cached per query) | 400+ columns "just in case" |
| Cardinality | Low-card dimensions in the base; ad/campaign names in a separate drill-down | Thousands-of-values dimensions in the base grain |
| Size | A few-thousand-row typical aggregation | Sitting at the 100M-row / 5GB ceiling |

## Slow-shape signals to watch for

Before creating a source, check your own SQL for these. Each is a reason to offer the user a faster shape, never to refuse:

| Signal | What it looks like | Faster option |
|---|---|---|
| Raw passthrough | No `GROUP BY` / no aggregate - one row per raw event | Pre-aggregate to the grain the dashboards chart |
| Very wide | Far more columns than dashboards use (e.g. `SELECT *`) | Select only the columns dashboards need |
| High-cardinality grain | A dimension with thousands of distinct values (ad / campaign / user ids) | Keep it out of the base; build a separate drill-down source |
| Large + monolithic | A big source whose typical query still scans most rows | Pre-aggregate and narrow so typical queries touch a few thousand rows |

A wide or raw source is sometimes the right call - row-level drill-down/export, columns genuinely all used, or a staging source to reshape later. Note the trade-off, then build whichever the user chooses.

## Creating data sources

`graphit ds create` auto-chains: create -> poll until ready -> scan schema -> print verification link. To activate for KB use, either the user reviews and activates via the link on the platform, or - after you show them the scanned schema and they accept it - run `graphit ds verify <id> --accept-schema` to activate from the CLI.

```bash
# Create with auto-scan (recommended)
graphit ds create --name "MY_DS" --sql "SELECT ..." --connection <id>

# Create without auto-scan (for special cases)
graphit ds create --name "MY_DS" --sql "SELECT ..." --skip-scan
```

**From a local file (Excel/CSV):** `graphit ds create --file <path>` uploads the file and creates one data source. Optional: `--name` (defaults to the file name), `--sheet <name>` (only when an Excel workbook has multiple sheets), and `--domain <NAME>` to attach the new table to an existing KB domain (create it first with `graphit kb create domain --name <NAME>` if it doesn't exist). `--file` and `--sql` are mutually exclusive; same auto-scan + verification-link flow as above.

For existing unverified sources, `graphit ds verify <id>` scans and shows the schema; add `--accept-schema` to accept the AI schema and activate a warehouse/SQL source from the CLI (file uploads activate automatically).

## Refreshing data sources

Data sources cache a snapshot of the Snowflake query result. Refresh when you need current data. **File-upload sources can't be refreshed (no query to re-run) - update them by re-uploading with `graphit ds create --file <path>`.**

```bash
# Refresh all data sources and wait for completion (live status table)
graphit ds refresh --all

# Refresh only non-empty sources (skip 0-row DSes)
graphit ds refresh --all --skip-empty

# Fire-and-forget (trigger refreshes, don't wait)
graphit ds refresh --all --no-wait

# Refresh specific sources by ID
graphit ds refresh <id1> <id2>
```

The CLI fires all refreshes in parallel and polls until every source is ready. Large sources (millions of rows) may take 30-60s; the CLI handles this gracefully without timeout errors. Use `--no-wait` when you only need to trigger the refresh and will check status later via `graphit ds list`.

## Incremental refresh and early-filtering (advanced)

Incremental mode fetches only rows past a watermark column and upserts by a merge key, instead of re-running the whole query. Configure it on a scanned source (creator only):

```bash
graphit ds refresh-config <id> --mode incremental \
  --watermark-column UPDATED_AT --watermark-type timestamp --merge-key ID
```

If the source aggregates over a wide window internally (e.g. a multi-year rollup), incremental refresh can be nearly as slow as a full one - the watermark wraps the query from the outside and can't prune the inner scan. You can early-filter *inside* the SQL with the `:graphit_watermark` bind (Graphit substitutes the last watermark on the delta, and full history on reconciliation) to prune the scan to days.

Get the contract right first - a naive early-filter silently corrupts older periods when the delta merges:
- Re-scan a window at least as wide as the largest aggregation grain in the query.
- Output-filter to only the current, fully-covered period.
- Set `--merge-key` (a trailing window without one double-counts overlapping rows).
- Keep reconciliation on (the drift backstop) - don't set `--reconciliation off`.
- For rolling-window metrics (WAU / MAU / stickiness), prefer a layered base daily source, not the bind - it can't compute a rolling window from recent rows alone.

Only early-filter when an incremental source is slow for this reason and a merge key is set; the default refresh is correct and simpler otherwise.

## Deleting data sources

There is no `graphit ds delete` command. Deleting a data source cascades to GCS storage and the KB table, which removes all metrics, dimensions, and rules defined on it. Direct the user to delete from the platform UI (Sources Hub) where the confirmation flow shows what will be affected.

## Presenting data source results

The user cannot see the raw CLI output - you are the rendering layer. After `graphit ds list`, present a markdown table and end with a recommendation of which source to use (or note that none covers the needed table):

~~~
**3 data sources:**

| Name | ID | Rows | Status | Governed |
|---|---|---:|---|---|
| **MARKETING_UA_DS** | ds_abc123 | 1,247,832 | active | yes |
| **PLAYER_QUALITY** | ds_def456 | 892,104 | active | no |
| **REVENUE_EVENTS** | ds_ghi789 | 3,412,006 | stale | yes |

Using **MARKETING_UA_DS** (ds_abc123), which covers spend, installs, and ROAS columns.
~~~

Bold every data source name. If a source is stale, say so and offer to refresh it before querying.
