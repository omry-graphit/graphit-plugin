# Semantic Authoring

Load when creating or changing semantic models or metrics.

## Syntax boundary

Graphit accepts the MetricFlow 0.211 execution shape: semantic models contain
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

- lowercase name and physical model/binding
- group placement
- primary grain/entity
- entities for joins
- dimensions for grouping/filtering
- measures for aggregation input
- defaults such as aggregation time dimension

Measure-bearing models need a valid aggregation time dimension. Primary/unique entity claims require grain evidence; never guess uniqueness. Time-aware shapes require the platform time-spine prerequisite.

Nested lists replace whole lists on update. Read the model and preserve every sibling.

## Metrics

Only these shapes are served by the shipping fragment path:

- **simple:** one measure object
- **ratio:** numerator and denominator metric objects
- **derived:** expression over declared metric inputs or aliases

Metric-level and per-input filters must resolve through declared semantic identities. Bare strings where an input object is required are refused.

Cumulative, conversion, shifted inputs, time-spine joins, and null-fill are unavailable until Project #289. Use a supported decomposition or clearly labeled free SQL; do not create an unusable governed definition.

## Verification

Create defaults to verified on human-driven CLI paths; `--unverified` creates a draft. Promote or demote with dedicated verify/unverify actions. Never replace `meta` only to toggle verification.

## Final check

Re-read the root, verify nested completeness, inspect group/binding, and use the returned receipt. A degraded freshness result may mean the write landed; do not retry blindly.
