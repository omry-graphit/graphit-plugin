# Query Governance

Load when writing a governed query, explaining a refusal, or reporting provenance.

## References

| Reference | Meaning |
|---|---|
| `{{ Metric('revenue') }}` | Reusable metric |
| `{{ Dimension('order__channel') }}` | Qualified grouping/filter field |
| `{{ Measure('order_total') }}` / `{{ Measure('order__order_total') }}` | Graphit's model-owned measure extension; the bare form resolves only when the name is unique across shared models, the `entity__name` form pins the owning model like a Dimension path |

Legacy token grammar is refused. Keep references inside complete executable SQL and canvas `data-graphit-sql`.

The governed fragment path serves simple, ratio, and derived metrics. Cumulative, conversion, shifted, time-spine, and null-fill shapes are not yet supported. Use a supported decomposition or explicitly labeled free SQL.

## Trust tiers

- **governed:** verified semantic references compiled through the gateway.
- **verified:** known safe stored query without semantic references.
- **ad hoc:** raw SQL at the frontier.

Prefer governed. Never present ad-hoc SQL as the team's definition.

## Rules

Rules target model, entity, dimension, metric, or group identities. Verified constraints enforce; verified body-only rules guide; drafts do nothing. Modes and EXPLORE behavior remain server-owned.

The gateway runs before caches, injects constraints, verifies resolved SQL, and returns a transparency receipt. Do not claim a rule applied merely because it exists.

## Ad-hoc gate

Search the KB genuinely, explain why visible definitions do not fit, and prefer an approved reusable supported definition. Use a truthful ad-hoc reason only for a real one-off. Never use it to bypass a rule.

## Reporting

Report tier, semantic references, row cap, visible rules that changed the query, and any refusal or override. Read the receipt rather than inferring. A blocked or partial result is not success.

## Numeric rollup authorization

Org admins only, and never required. Every prepared data source carries the platform default numeric contract, so prepared rollups may answer governed queries with nothing installed. The server measures each exact query against the source before serving it, renews that evidence on its own after data refreshes and expiry, and sends anything outside the contract down the ordinary path. Acceleration is silent; never claim a result came from a rollup.

- `governance numeric show --source <id>` - the contract in force plus the query families, schema fingerprint and compiler/runtime versions an override must name. Acceleration is on only while `status` is `active`; a revoked record still says `platform_default: true`, so read `status` and `revision`, never that flag.
- `governance numeric revoke --source <id> --revision <n>` - switch acceleration off for one source; `n` is the revision `show` returned (0 for the platform default). Serving stops at the next request. There is no un-revoke: only a later `grant` quoting the revoked revision turns acceleration back on, so confirm with the admin before running it.
- `governance numeric grant --source <id> --file override.json` - replace the default for one source with tighter bounds. Body: `expected_revision`, `schema_fingerprint`, `compiler_version`, `runtime_version`, `query_families` (only families listed by `show`), `mode` (`exact` or `scoped_float`), `allowed_finalizers`, `absolute_error_limit` and `relative_error_limit` (required for `scoped_float`; both caps are enforced independently), `evidence_ttl_seconds`, `expires_at`, `reason`.

Never invent error limits for the admin: report what `show` returns and let them decide whether an override is wanted at all.
