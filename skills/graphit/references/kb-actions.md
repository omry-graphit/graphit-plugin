# KB Actions

Load when an approved gap must be authored or an existing semantic asset changed.

## Approval gate

For a cached data source, first read its visible scanner-created semantic model and confirm `meta.graphit.data_source.ds_id` matches the source. Add approved entities, dimensions, or measures by updating that model. If no bound model is visible, follow the scan/verify flow in `data-sources.md`; creating a second model does not bind it.

Before writing, present the missing concept, proposed root, exact definition and group/access scope. Do not write until the user approves.

## Authoring contract

- Create semantic models, metrics, groups, and retained rules from JSON.
- Use exactly one of `--file` or `--json`.
- Names are lowercase snake case; reserve `__` for qualified dimensions.
- Entities, dimensions, and measures mutate only through semantic-model update.
- A supplied nested list replaces the stored list whole. Read first and include every sibling that must remain.
- Explicit `meta` replaces author metadata whole. Preserve family, axes, topics, and other author fields.
- Valid authorized saves are effective in their permitted scope. Do not send retired verification metadata or call manual verify/unverify actions.

When create is refused because a model already binds that physical table, read the visible model named in the refusal and propose the needed update. Do not retry with another name or scope. If the response names no readable model, report the refusal without guessing or exposing a hidden target.

Read `semantic-authoring.md` for model/metric shapes and `metric-families.md` for concrete variants.

## Rules

Rules remain Graphit objects. Create them from JSON with `name`, `content` (the rule text; there is no `body` field), `description` (the reason query receipts show, so set it), `apply_on` and optional `constraints`. Unknown keys are refused, and an error names the field path, such as `apply_on[0].type`. A rule without targets is refused. Rule names are stored upper-case; lookups ignore case.

```json
{"name":"exclude_br","content":"Exclude Brazil from spend queries","description":"Brazil spend is reported separately","apply_on":[{"type":"model","name":"ua_daily"}],"constraints":[{"type":"value_restriction","column":"country","operator":"not_in","values":["BR"]}]}
```

Each `apply_on` target is a `{"type": ..., "name": ...}` object or a `type:name` string; types are model, entity, dimension, metric and group. `model:`, `entity:` and `group:` names are lowercase snake; `metric:` and `dimension:` names are UPPER (`metric:REVENUE_USD`). In a `.graphit/rules/*.rule.yml` file every target must name something the tree declares, including assets the same sync creates; a bare model name or the model's fully qualified `DATABASE.SCHEMA.TABLE` relation also resolves. `table:` targets are retired - target the semantic model. A rule's dbt-style `groups:` key is not imported; placement comes from `apply_on`.

Each constraint is an object with a `type`: `required_where` takes `predicate`; `forbidden_column`, `required_filter` and `required_aggregation` take `column`; `value_restriction` takes `column`, `operator` (`in` or `not_in`) and `values` as strings. `column` and `predicate` name physical columns of the source the targeted model reads, as in the example - not `entity__dimension` paths or `{{ }}` references. `apply_on` targets are the semantic identities.

A saved rule enforces at once; there is no draft or verify step. To stop enforcing it, delete it, or update it with `"constraints": []` to keep it as an advisory rule (the constraints are dropped). Do either only when the user explicitly asks to change the rule, never to get a refused query through, and confirm first.

## Update

1. Read the target through the current principal.
2. Preserve complete nested and metadata structures.
3. Apply the smallest patch.
4. Re-read immediately.
5. Read back the saved definition and confirm its intended scope.
6. Inspect receipts; a degraded write may have landed and must not be retried blindly.

When one task creates or changes several metrics or semantic models, send them as one `graphit kb batch` instead of one `kb create` or `kb update` each. Every item gets the same checks and its own result, and dashboards rebuild once for the whole batch instead of once per edit, so they keep serving while you author. A single edit stays `kb update`. Steps 1-2 still apply to every item; a batch changes the transport, not the patch discipline.

- Shape: `{"operations": [...]}` or a bare array of `{"op": "update", "noun", "name", "patch"}` and `{"op": "create", "noun", "definition"}` items. Nouns are `metric` and `semantic-model` only; groups, rules and deletes keep their own verbs. Up to 50 items per batch, 20 in-app.
- Order items so each validates against the ones before it: a semantic model before the metrics that use its measures, a metric before a derived metric over it. Use `--stop-on-error` when later items depend on earlier ones.
- Items are not all-or-nothing: earlier items stay applied when a later one fails. Read `results` per item, fix what each `error` names, and re-send only the `failed` and `not_attempted` items as a new batch. Never replay the whole batch. An `unknown` item may have landed; read it back with `kb get` before sending it again.
- Each successful item is saved with the same validation and authorization as a single update.

## Delete

Confirm with the user and inspect usage first. The server checks known definition dependencies, not every canvas reference. A green guard is not exhaustive impact proof.

## Permissions

Read access is the ceiling for writes. `kb_write` comes from the effective policy key. Group lifecycle is admin-only. Hidden and missing targets return the same absence.

Group `access` is stored dbt metadata; it does not grant Graphit visibility.

Column visibility is part of a model's physical facts, and hidden means masked as NULL in every query - dashboards, exports and the AI alike, not only the AI. Hiding a column is a write in the model's group; making a column visible that the PII detector hid takes the creator of the bound data source or an org admin and is recorded with who set it. Use `kb column-visibility` only to correct a false positive, such as a token-balance, app-version or ad-network id column caught by a name or value pattern, never to expose real personal data. The override survives re-scans; in a repository-owned group the command refuses, so declare the column's visibility in the repository instead.
