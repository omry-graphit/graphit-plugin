# Data-Source Refresh

Load when configuring refresh mode, incremental behavior, history, or reconciliation.

## Modes

- **full:** replace the cached result from the complete source query.
- **incremental:** append/merge new source rows using a watermark and stable merge key.

Choose incremental only when the source exposes a reliable monotonic watermark and the merge key is unique. Otherwise use full refresh.

## Incremental contract

- Filter the source early on the watermark column.
- Preserve lookback for late-arriving updates.
- Provide the correct watermark type.
- Verify merge-key uniqueness before serving the new version.
- Reconcile periodically with a full rebuild.
- Treat schema drift or grain change as a semantic review, not a blind refresh.

## Slow incremental refresh

When an incremental source aggregates over a wide window internally, the watermark filter wraps the query from the outside and cannot prune the inner scan - refresh re-aggregates the whole window every run. Terminology: watermark column (which output rows are new), merge window (how far back each run re-fetches and upserts; API field `lookback_periods`), per-table lookback windows (how far back each source table is read).

Offer early filtering only when the source is incremental, slow for this reason, and has (or will add) a merge key - a naive early filter silently corrupts older periods when the delta merges. Size each lookback to cover the merge window plus the largest rolling calculation. Two mutually exclusive modes:

- **Per-table lookback windows** (preferred when the user won't edit their SQL): declared in Refresh Config; the SQL stays as written. Day-based, so a date/timestamp watermark is required.
- **The `:graphit_watermark` bind** (for users who own their SQL): placed inside the query; Graphit substitutes the last watermark on deltas and full history on reconciliation. Output-filter to the current, fully-covered period.

For rolling-window metrics (WAU/MAU/stickiness), prefer a layered base daily source - no early filter can compute a rolling window from recent rows alone.

## Operations

A refresh request may be asynchronous. Poll the job/source status and report counts, duration, version, and failure truthfully. Fire-and-forget is appropriate only when the user did not ask to wait.

Inspect refresh history before retrying. A failed status may follow a partially applied external action; use the receipt/status rather than assuming nothing happened.

Refresh settings and connector lifecycle require data-source write authority in the server's policy key. Never expose credentials, source rows, or concealed schema in evidence.
