# Metric Families

Load when the user asks for D7/D30, gross/net, payer/all, or another named metric axis.

A family is a UX grouping over concrete standard metrics. There is no parameterized template, generated child engine, `$` parameter token, or call-with-arguments query syntax.

Each member carries:

- its own lowercase metric name and complete definition
- `meta.graphit.family`
- axis key/value pairs in `meta.graphit.axes`

Create each concrete member with the family and repeatable axis options. Tree/search/family views collapse members; `list metric` remains flat.

Use family expansion to inspect members. Supply known axes to resolve. If several candidates remain, show open axes and ask—never guess a governed metric.

Reference the resolved concrete member normally with `{{ Metric('arppu_d7') }}`.

Before deleting a member or family population, inspect metric usage. Dependency guards do not prove every canvas reference is absent.
