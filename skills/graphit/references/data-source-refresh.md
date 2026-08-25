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

## Operations

A refresh request may be asynchronous. Poll the job/source status and report counts, duration, version, and failure truthfully. Fire-and-forget is appropriate only when the user did not ask to wait.

Inspect refresh history before retrying. A failed status may follow a partially applied external action; use the receipt/status rather than assuming nothing happened.

Refresh settings and connector lifecycle require data-source write authority in the server's policy key. Never expose credentials, source rows, or concealed schema in evidence.
