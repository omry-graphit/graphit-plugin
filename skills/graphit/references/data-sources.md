# Data Sources: Building for Speed

A data source's shape - set by its source SQL at creation - decides how fast every dashboard built on it will be, and whether filter changes feel instant. Get this right when you create the source; it can't be fixed later in the dashboard SQL.

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

## Creating data sources

`graphit ds create` auto-chains: create -> poll until ready -> scan schema -> print verification link. The user must visit the verification link on the platform to review AI-generated column descriptions and activate the DS for KB use.

```bash
# Create with auto-scan (recommended)
graphit ds create --name "MY_DS" --sql "SELECT ..." --connection <id>

# Create without auto-scan (for special cases)
graphit ds create --name "MY_DS" --sql "SELECT ..." --skip-scan
```

For existing unverified data sources, use `graphit ds verify <id>` to trigger the scan and get the verification link.

## Refreshing data sources

Data sources cache a snapshot of the Snowflake query result. Refresh when you need current data.

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
