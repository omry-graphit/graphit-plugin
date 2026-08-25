# KB Discovery

Load before querying, authoring, or building a dashboard.

## Group-first discovery

1. Read visible groups and effective status.
2. Choose a group and confirm the audience.
3. Explore semantic models and root metrics.
4. Read model-owned entities, dimensions, and measures.
5. Inspect retained rules and dashboard usage.
6. Reuse definitions before proposing a gap.

The lowercase group name is the semantic label. Use the server-provided uppercase `domain_keys`/status key for data-source `--domain`.

## Choosing the object

| Need | Object |
|---|---|
| Modeled relation, grain, joins, columns | semantic model |
| Join identity or grain | entity inside a model |
| Grouping/filter field | dimension inside a model |
| Aggregation input | measure inside a model |
| Reusable business calculation | metric |
| Organizational placement | group |
| Governance guidance/enforcement | rule |
| D7/D30 or gross/net variant | concrete family member |

Entities replace relationship assets. Topics are metadata, not roots. Synonyms are removed; search names/descriptions and ask when wording is ambiguous.

## Read roles

- `list` inventories a root noun.
- `tree` shows the collapsed hierarchy.
- `search` covers models, metrics, groups, and nested components; not retained rules.
- `get` reads one exact root.
- `entity` reads one entity across visible declaring models.
- `family` expands/resolves concrete members.
- `explore` accepts semantic-model, metric, or group.
- `usage` answers dashboard placement and rule impact.

A capped or empty search is not proof of absence.

## Governed references

Use `{{ Metric('revenue') }}`, `{{ Dimension('order__channel') }}`, and `{{ Measure('order_total') }}` only for Graphit's measure extension. Legacy token grammar is refused.

## Gap decision

Propose authoring only when no visible definition fits and business meaning is clear. State formula, grain, binding, group, rule impact, and verification. Ask when any is ambiguous.
