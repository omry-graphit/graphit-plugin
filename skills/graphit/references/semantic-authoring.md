# Semantic Authoring

Load when creating or changing semantic models or metrics.

## Syntax boundary

Graphit accepts the supported MetricFlow execution shape: semantic models contain
entities, dimensions, and measures; metrics are top-level objects with `type`
and `type_params`. Do not emit newer measureless/Fusion authoring syntax, dbt
project YAML, Jinja, `ref()` expressions, or source declarations on this
surface. Those belong to dbt project import/export, not Graphit authoring.

Public dbt/MetricFlow concepts:

- semantic model, entity, dimension, measure, metric, and group
- simple, ratio, and derived metric composition
- entity-qualified dimension paths

Graphit extensions and assets:

- `meta.graphit.family` and `axes` group concrete metric variants
- topics are curated Graphit metadata, deliberately not dbt `tags`
- rules are separate Graphit objects targeting semantic identities by name;
  never embed them in dbt metadata
- verification attribution, provenance, and data-source bindings are
  server-owned; use dedicated actions instead of hand-authoring them

Do not expose or depend on storage collection names, revision fields, feature
flags, cache keys, or compiler implementation details.

## Semantic model

A semantic model owns:

- lowercase semantic `name` and physical SQL table name in `model`
- group placement
- primary grain/entity
- entities for joins
- dimensions for grouping/filtering
- measures for aggregation input
- defaults such as aggregation time dimension

`model` names the physical SQL relation; matching a cached source's name does not bind it. The cached-source binding is the server-owned `meta.graphit.data_source.ds_id`, written by the source scan. For a cached source, extend its scanned model through update; a hand-authored create starts unbound. Do not put a binding into author metadata. Read `data-sources.md` for scan/verify and SQL routing.

Measure-bearing models need a valid aggregation time dimension. Primary/unique entity claims require grain evidence; never guess uniqueness. Time-aware shapes require the platform time-spine prerequisite.

Nested lists replace whole lists on update. Read the model and preserve every sibling.

## Metrics

Only these shapes are served by the shipping fragment path:

- **simple:** one measure object
- **ratio:** numerator and denominator metric objects
- **derived:** expression over declared metric inputs or aliases

Metric-level and per-input filters must resolve through declared semantic identities. Bare strings where an input object is required are refused.

Cumulative, conversion, shifted inputs, time-spine joins, and null-fill are not yet supported. Use a supported decomposition or clearly labeled free SQL; do not create an unusable governed definition.

## Aggregation safety

| Class | Across dimensions | Across time | Examples |
|---|---|---|---|
| Fully additive | Sum | Sum | revenue, clicks, units |
| Semi-additive | Sum | Last/period-end snapshot | cash, MRR, headcount |
| Non-additive | Recompute | Recompute | rates, ratios, distinct counts |

Never sum or average a rate/ratio - recompute from additive components at the requested grain, guard zero denominators, and examine mix shift before interpreting rollups.

Measure `agg` accepts: sum, count, count_distinct, average, min, max, median, percentile, sum_boolean. A simple metric references a declared measure, never a raw column; a ratio references numerator/denominator metrics, never measures directly; every identifier in a derived expression must match an input name or alias exactly.

Measure identity is group/model/measure, never a bare name. A metric's measure reference resolves inside the metric's own group first, then across shared models; a private workspace model's measures are reachable only by metrics placed in that private workspace. If the same measure name exists on two shared models with different definitions and the metric sits in neither group, the write is refused naming both models - place the metric in the group of the model it reads. Identical re-declarations across models are fine; a model may not re-declare a same-group measure with a different definition. Always give a metric a group.

## Plan ordering

Follow the staged research in `kb-discovery.md` first: agree the group, inspect existing assets and cross-group matches, then show the user the reuse-or-build recommendation. Before creating an approved missing measure or metric input, discover visible candidates in the agreed group and model scope. Use compact metric discovery as described in `kb-discovery.md`; a summary nominates a candidate, it does not establish equivalence. Follow continuation metadata before concluding there is a gap; ranked search or an incomplete page is not proof of absence.

Read each plausible metric's full definition and its reached semantic models. Compare the resolved model/source binding, grain and time dimension, measure expression and aggregation parameters, metric-level and per-input filters, units/scale, verification state, ownership, and applicable rules. Similar names or identical SQL alone are insufficient. Use the existing path resolution above; never inspect hidden definitions or copy a private definition into a shared scope to make it reusable.

| Finding | Action |
|---|---|
| Equivalent accessible metric input | Reference that metric's exact name; create no new measure or simple metric for that input |
| Equivalent model-owned measure, but no suitable metric | Reuse the measure and create only the missing simple metric |
| Different grain, filters, scale, binding or applicable policy | Keep the definitions separate; ask if the intended business meaning is unclear |
| Repository-owned definition needs a change | Follow the repository authoring workflow; do not create a direct-write replacement to bypass ownership |

A ratio still references numerator/denominator metric objects. For example, a verified total-matches metric can serve several ratios at the same grain; a country-filtered matches metric is not an interchangeable denominator for all countries. Being referenced or ending in `_num`/`_den` does not make an existing metric disposable.

After discovery, author only the approved missing prerequisites: group, data sources, semantic models with nested components, simple metrics, ratio/derived metrics, then rules after their targets exist. Execute one item at a time; do not start the next before the current receipt is terminal.

## Verification

Create defaults to verified on human-driven CLI paths; `--unverified` creates a draft. Promote or demote with dedicated verify/unverify actions. Never replace `meta` only to toggle verification.

## Final check

Re-read the root, verify nested completeness, inspect group/binding, and use the returned receipt. A degraded freshness result may mean the write landed; do not retry blindly.
