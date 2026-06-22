# Data Sources: Routing and Building for Speed

A data source's shape - set by its source SQL at creation - decides how fast every dashboard built on it will be, and whether filter changes feel instant. Get this right when you create the source; it can't be fixed later in the dashboard SQL.

## Routing: which source to query

Always prefer a cached data source over the live warehouse. Check what exists with `graphit ds list` before writing any query.

| Situation | Command | Speed |
|---|---|---|
| The table has a cached data source | `graphit query "SQL" --ds <id>` | roughly 100ms, DuckDB |
| No data source covers the table | `graphit query "SQL" --warehouse --connection <id>` | roughly 10s, Snowflake |

If no data source covers the table the user needs, propose creating one for future speed rather than defaulting to repeated warehouse queries. Dialect differs by route (DuckDB for `--ds`, Snowflake for `--warehouse`); see `sql-reference.md`.

## Why source shape decides dashboard speed

When you change a dashboard filter (e.g. switch country), Graphit answers from a cached, pre-aggregated result instead of re-scanning the whole source - but only when the source is small and already aggregated to the grain you query. Build the source as one row per the grain you'll chart (e.g. month x country x channel) with only the columns you use, and filter changes return in milliseconds. Pull in raw ungrouped rows, hundreds of columns, or thousands-of-values dimensions and the result is too big to cache - every filter change re-scans the entire source and is slow.

## Build it right (in the source SQL)

1. **Pre-aggregate to your query grain.** Use `GROUP BY` so the source has one row per the grain you'll chart (month x country x channel), not one row per raw event. The single biggest speed lever.
2. **Select only the columns you'll use.** Every column is downloaded and cached on each query; hundreds of columns slow every dashboard, even ones that touch a few.
3. **Keep high-cardinality dimensions out of the base.** Individual ad / campaign / adset names (thousands of values) explode aggregation cost and block filter-caching. If you need them, build a separate filtered drill-down source.
4. **Aim small.** A source whose typical query aggregates a few thousand rows is fast and cacheable; a 50M-row, 400-column raw source is slow no matter how the dashboard is written. The size guardrails (>100M rows / >5GB) are the ceiling, not the target.

## Quick check

| Lever | Build it right | Anti-pattern |
|---|---|---|
| Grain | `GROUP BY` to the grain you chart | One row per raw event |
| Columns | Only the columns dashboards use | 400+ columns "just in case" |
| Cardinality | Low-card dimensions in the base; ad/campaign names in a separate drill-down | Thousands-of-values dimensions in the base grain |
| Size | A few-thousand-row typical aggregation | Sitting at the 100M-row / 5GB ceiling |

Build the source small and pre-aggregated, and dashboards on it stay fast and filterable.

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
