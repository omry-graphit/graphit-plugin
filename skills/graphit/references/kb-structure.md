# KB Structure

Load when planning, explaining, or locating semantic assets.

## Root model

| Type | Meaning |
|---|---|
| group | Organizational placement; Graphit access still comes from profiles and policy keys |
| semantic model | One modeled relation and the aggregate root for entities, dimensions, and measures |
| metric | Reusable simple, ratio, or derived calculation |
| rule | Retained Graphit governance object targeting semantic identities |

Nested components are not independent CRUD roots:

- **Entity:** join/grain identity. Primary or unique entities prove the keyed side; foreign entities connect models.
- **Dimension:** model-owned grouping/filter field. Address cross-model dimensions as `entity__dimension`.
- **Measure:** model-owned aggregation input used by simple metrics.

A metric family is a set of concrete metrics carrying the same family name plus axis values. It is not a template asset.

## Relationships

- A group's models and metrics are placed by their `group` field.
- A semantic model owns all nested components.
- Metrics reach models through referenced measures and metrics.
- Models join through shared entities. There is no relationship asset.
- Rules may target a model, entity, dimension, metric, or group.
- Topics remain metadata in `meta.graphit`; they are not roots.
- Dashboard usage is a reverse lookup, not a stored placement.

## Names and visibility

Semantic names are lowercase snake case. Double underscore is reserved for qualified dimensions. A group name is displayed lowercase; data-access status exposes the uppercase policy key used by data-source `--domain`.

Concealment is absence. A hidden asset is exactly like a missing one. Private workspaces are visible only to their owner, including from admins.

## Tree and graph

Tree order is group → semantic model → nested components, with root metrics and rules alongside. Families collapse in tree/search/family views; `list metric` returns concrete metrics.

Graph edges show group placement, model ownership, entity joins, metric composition, governance, and dashboard usage. Use exploration for semantic reach and usage for reverse dashboard impact.
