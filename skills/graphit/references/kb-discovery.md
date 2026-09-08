# KB Discovery

Load before querying, authoring, or building a dashboard.

## Group-first discovery

1. Read visible groups and effective status. Present the groups related to the question and agree on the starting group and audience with the user; carry forward a choice they already made.
2. Investigate that group in stages. First inventory its relevant models, metrics, dimensions, measures, entities, families and rules; then read the definitions needed to understand what already exists. Use bounded discovery and continuation rather than loading every full definition at once.
3. Alongside that focused investigation, run semantic search for the question and related concepts across other accessible groups. A related definition may live elsewhere. Inspect promising matches in full and explain their group and relevance; finding a match does not silently change the agreed data or authoring scope.
4. Look for existing dashboards using dashboard listing and metric usage. Inspect the relevant accessible dashboards before proposing a duplicate. KB search does not search dashboards or retained rules; use their own reads.
5. After each meaningful research stage, show what you found and recommend the next step. Let the user choose at real forks; do not silently research everything, build the result and leave them behind.
6. Before authoring, bring back the existing definitions and dashboards that answer the question, any reusable pieces, and the specific remaining gap. Recommend reuse, extension or new work and agree on that choice with the user before creating anything. Do not repeat a decision or approval they already supplied.

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

- `list` inventories a root noun. For metric candidates, enable `summary`; set `limit` for the page size and pass `next_cursor` as `cursor` to continue. The CLI flags are `--summary`, `--limit`, and `--cursor`.
- `tree` shows the collapsed hierarchy.
- `search` covers models, metrics, groups, and nested components; not retained rules.
- `get` reads one exact root in full. Inspect candidate metrics and their owning models before deciding that inputs are equivalent; summaries cannot establish reuse.
- `entity` reads one entity across visible declaring models.
- `family` expands/resolves concrete members.
- `explore` accepts semantic-model, metric, or group.
- `usage` answers dashboard placement and rule impact.

A capped or empty search is not proof of absence. A summary page is also incomplete while `truncated` is true: follow `next_cursor` before declaring a gap. Report returned items against `total`; totals describe visible scope. If `migration_incomplete` is true, report an incomplete catalog instead of proposing missing assets. Summary descriptions are excerpts; full definitions remain available through `get`.

## Governed references

Use `{{ Metric('revenue') }}`, `{{ Dimension('order__channel') }}`, and `{{ Measure('order_total') }}` only for Graphit's measure extension. A bare `Measure('name')` must be unique across shared models; write `Measure('entity__name')` to pin the owner. Legacy token grammar is refused.

## Gap decision

Research first, then recommend. Show which existing definitions or dashboards already cover the request, what can be reused or extended, and what is still missing. Propose authoring only for that agreed gap, with formula, grain, binding, group, rule impact and verification. Ask when a choice is unresolved; do not treat a request to investigate as permission to build.
