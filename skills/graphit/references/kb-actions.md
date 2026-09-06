# KB Actions

Load when an approved gap must be authored or an existing semantic asset changed.

## Approval gate

For a cached data source, first read its visible scanner-created semantic model and confirm `meta.graphit.data_source.ds_id` matches the source. Add approved entities, dimensions, or measures by updating that model. If no bound model is visible, follow the scan/verify flow in `data-sources.md`; creating a second model does not bind it.

Before writing, present the missing concept, proposed root, exact definition, group/access scope, and verification state. Do not write until the user approves.

## Authoring contract

- Create semantic models, metrics, groups, and retained rules from JSON.
- Use exactly one of `--file` or `--json`.
- Names are lowercase snake case; reserve `__` for qualified dimensions.
- Entities, dimensions, and measures mutate only through semantic-model update.
- A supplied nested list replaces the stored list whole. Read first and include every sibling that must remain.
- Explicit `meta` replaces author metadata whole. Preserve family, axes, topics, and other author fields.
- Use dedicated verify/unverify actions. Never patch metadata merely to change verification.

When create is refused because a model already binds that physical table, read the visible model named in the refusal and propose the needed update. Do not retry with another name or scope. If the response names no readable model, report the refusal without guessing or exposing a hidden target.

Read `semantic-authoring.md` for model/metric shapes and `metric-families.md` for concrete variants.

## Rules

Rules remain Graphit objects. Create them from JSON with body/constraints plus `apply_on` targets. Final targets are model, entity, dimension, metric, or group identities. A rule without targets is refused.

Target grammar, live and in a repository tree alike: `model:`, `entity:` and `group:` names are lowercase snake; `metric:` and `dimension:` names are UPPER (`metric:REVENUE_USD`). In a `.graphit/rules/*.rule.yml` file every target must name something the tree declares, including assets the same sync creates; a bare model name or the model's fully qualified `DATABASE.SCHEMA.TABLE` relation also resolves. `table:` targets are retired - target the semantic model. A rule's dbt-style `groups:` key is not imported; placement comes from `apply_on`.

Constraints keep their five semantics: required predicate, forbidden column, required filter, required aggregation, and value restriction. Use declared semantic identities and typed values.

## Update

1. Read the target through the current principal.
2. Preserve complete nested and metadata structures.
3. Apply the smallest patch.
4. Re-read immediately.
5. Verify/unverify separately when intended.
6. Inspect receipts; a degraded write may have landed and must not be retried blindly.

## Delete

Confirm with the user and inspect usage first. The server checks known definition dependencies, not every canvas reference. A green guard is not exhaustive impact proof.

## Permissions

Read access is the ceiling for writes. `kb_write` comes from the effective policy key. Group lifecycle is admin-only. Hidden and missing targets return the same absence.

Group `access` is stored dbt metadata; it does not grant Graphit visibility.
