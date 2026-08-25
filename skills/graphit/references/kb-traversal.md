# KB Traversal

Load when investigating semantic reach or presenting KB results.

## Read roles

| Need | Read |
|---|---|
| Inventory roots | list semantic-model, metric, group, or rule |
| Full root definition | get |
| Collapsed hierarchy | tree |
| Ranked discovery | search |
| Entity declarations | entity |
| Family expansion/axis resolution | family |
| Semantic neighborhood | explore semantic-model, metric, or group |
| Dashboard/rule impact | usage |

`list metric` is flat. Families collapse in tree/search/family views.

## Investigations

- **Everything in finance:** explore group `finance`; present models, metrics/families, nested counts, and rules.
- **How revenue is defined:** get metric `revenue`, then explore it for reached models and composition.
- **What a model owns:** get the model and present entities, dimensions, measures, group, binding, and rules.
- **What joins models:** inspect shared entities. Never look for a relationship asset.
- **Where a metric is shown:** use usage.
- **Physical columns:** use metadata discovery or model physical detail; do not explore a table noun.

## Families

A family card is a view over concrete metrics. If axes match several members, show the open axes and ask. Never guess.

## Presentation

For metrics show type, definition, group, reached models, rules, and usage. For models show nested components. For rules show body, constraints, targets, mode, and usage. Omit concealed neighbors without hinting they exist.
