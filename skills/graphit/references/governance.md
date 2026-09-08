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
