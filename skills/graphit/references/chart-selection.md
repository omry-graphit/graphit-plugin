# Chart Selection

Consult when choosing chart types for dashboard elements. Matches data shapes to the right visualization.

## Dimension/Measure Defaults

| Dimensions | Measures | Default chart |
|---|---|---|
| 1 temporal | 1+ | line |
| 1 categorical | 1 | bar |
| 1 categorical | 2+ | bar (grouped or dual axis) |
| 2 categorical | 1 | bar with series on 2nd dim |
| 0 | 1 | KPI card |
| 1 categorical (50+ values) | 1 | table |

When ambiguous, propose 2-3 options and ask the user. Do not guess.

## Full Chart Type Table

`graphit.graph()` renders the **standard** types below and throws an `unknown type` error on anything that is not a standard type, a saved template, or `'custom'`. The iframe still lets you draw anything: pass `type:'custom'` with a `draw(ctx)` function (responsive + themed, see `chart-patterns.md`) or hand-roll inline SVG/CSS. The **hand-rolled** shapes below are drawn that way, never passed as a standard type name. "Standard" and "hand-rolled" describe only which draw path you use, not platform status: both become equally first-class - same 3-dot menu, data source, and provenance - once wrapped in `data-graphit-*`, so a graph you draw is never a lesser citizen.

| Data shape | Chart type | Render with | Columns |
|---|---|---|---|
| Time series | line / area | `graphit.graph` (standard) | 1 temporal + 1 numeric |
| Categories | bar | `graphit.graph` (standard) | 1 categorical + 1 numeric |
| Long category labels | horizontal-bar | `graphit.graph` (standard) | 1 categorical + 1 numeric |
| Part-whole (max 5 slices) | donut / pie | `graphit.graph` (standard) | 1 categorical + 1 numeric |
| Single metric | KPI card | `graphit.kpi` (standard) | 1 numeric |
| Stages | funnel | `graphit.graph` (standard) | 1 categorical + 1 numeric |
| Target / progress | gauge | `graphit.graph` (standard) | 1 numeric |
| Matrix (unpivoted) | heatmap | `graphit.graph` (standard) | 2 categorical + 1 numeric |
| Correlation | scatter | `graphit.graph` (standard) | 2 numeric |
| 3 variables | bubble | `graphit.graph` (standard) | 3 numeric |
| Inline trend | sparkline | `graphit.graph` (standard) | 1 numeric series |
| Detail / raw data | table | `graphit.table` (standard) | any columns |
| Hierarchy | treemap | hand-rolled SVG | 1 categorical + 1 numeric |
| Flows | sankey | hand-rolled SVG | 2 categorical + 1 numeric |
| Geographic | map | hand-rolled SVG | region or lat/lng + 1 numeric |
| Distribution | histogram / box | hand-rolled SVG | 1 numeric |

## Perception Ranking (Cleveland-McGill)

Position > length > angle > area > color.

| Goal | First choice | Never |
|---|---|---|
| Trend (8+ points) | line | bar, pie |
| Trend (2-7 points) | bar (column) | line with dots |
| Compare (12 or fewer categories) | sorted bar | pie, radar |
| Compare (13-30 categories) | horizontal bar + top-N | column |
| Part-to-whole | stacked bar, treemap | pie with 6+ |
| Distribution | histogram, box | pie, line |
| Correlation | scatter, bubble | dual-axis |
| Ranking | sorted bar + min-N | pie, treemap |
| Funnel | funnel + stage% | pie |
| KPI vs target | big-number + sparkline | gauge (unbounded) |
| 2D matrix / cohort | heatmap | bar with 100+ |

The standard `graphit.graph` first choices here are line, bar, stacked-bar, scatter, bubble, funnel, heatmap, gauge, and sparkline. Treemap, histogram, and box are hand-rolled SVG (see the table above) - draw them via `type:'custom'` or inline SVG, never pass them as a standard type name.

## Cardinality Guards

| Cardinality of categorical dim | Action |
|---|---|
| 1-5 | Show data labels, no rotation |
| 6-20 | Default styling |
| 21-50 | Rotate labels 45 deg, consider Top-N + Other |
| 50+ | Use table chart or require a filter |

COALESCE categorical dimensions in SQL (`COALESCE(region, 'Other')`) to prevent blank axis labels. For 21+ categories on a bar/line, use a "Top N + Other" window-function pattern:

```sql
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (ORDER BY metric DESC) AS rn
  FROM data
)
SELECT CASE WHEN rn <= 10 THEN category ELSE 'Other' END AS category,
       SUM(metric) AS metric
FROM ranked GROUP BY 1 ORDER BY 2 DESC
```

## Hard Caps

- Pie: max 5 slices (3 preferred)
- Line series: max 5-7 (else use small multiples)
- Stacked bar segments: max 4
- Categorical colors: max 7 distinct
- Sort by value DESC unless the axis is ordinal or temporal
