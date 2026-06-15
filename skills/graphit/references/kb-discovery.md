# KB Discovery

Consult when starting a dashboard build, or when the user references a business concept that might already exist as a KB asset. The Knowledge Base holds reusable metrics, dimensions, rules, and table schemas - using them keeps formulas consistent across dashboards and makes each new graph faster to build.

## Domain-First Discovery

Work narrow, not broad: **domain -> data source -> assets.** Listing or searching everything is the fallback, not the default.

1. **Scope to the domain.** Ask the user which business area this is about, or infer it and confirm. `graphit kb list domains` shows the groupings (MARKETING, PRODUCT, FINANCE, etc.) if you need to pick one.
2. **Explore that domain.** `graphit kb explore domain <NAME>` returns the domain's data sources plus the metrics, dimensions, and rules defined on them, in one traversal. This is your working set.
3. **Reuse the assets.** If a metric fits, read its formula with `graphit kb get metric REVENUE` and reference it by name in SQL as `{{metric:REVENUE}}`.
4. **Handle gaps.** If the domain's data source is missing something, check `graphit kb list relationships` for a connection to another data source you can join; if the data genuinely does not exist, propose creating the asset or a new data source (see below).
5. **Broaden only if needed.** Use `graphit kb search "<concept>"` when the domain is unclear or a concept spans domains.

If a domain has tables but no metrics or dimensions, that is the strongest signal to propose foundational assets before building any graph. If the user declines ("just build it", "skip KB"), respect it and work from the table schema.

## Metric vs Dimension

| Property | Metric | Dimension |
|---|---|---|
| Formula | Aggregation required (SUM, COUNT, AVG, MIN, MAX) | Row-level only (no aggregates) |
| Table scope | Can reference multiple tables | Exactly one table |
| Purpose | Measures - what you count or sum | Grouping axes - how you slice |
| Example | `SUM(ORDERS.AMOUNT)` | `DATE_TRUNC('month', EVENTS.EVENT_TS)` |
| Invalid | `ORDERS.AMOUNT` (no aggregate) | `SUM(EVENTS.DURATION)` (has aggregate) |

## When to Propose KB Asset Creation

| Signal | Propose | Why |
|---|---|---|
| User requests a business metric (revenue, DAU, conversion rate) with no KB match | Metric | Reusable formula across dashboards |
| User groups by a derived expression (date bucket, category mapping, JSON extraction) | Dimension | Consistent grouping logic |
| User describes a business rule ("active = logged in within 30 days") | Rule | Applied automatically to future queries |
| User uses a business term not in KB ("GMV", "churn", "ARPU") | Synonym | Maps colloquial terms to a defined metric |

Propose creation as the default path, in plain language: "Your KB doesn't have a revenue metric yet. I'd recommend creating one first - then it's reusable across every dashboard with a consistent formula, and I'll build the graph using it. Sound good?"

## Naming Conventions

All KB assets are UPPER_SNAKE_CASE (auto-sanitized on write):

| Pattern | Example | Use when |
|---|---|---|
| `TOTAL_*` | `TOTAL_REVENUE`, `TOTAL_ORDERS` | Sum aggregations |
| `AVG_*` | `AVG_ORDER_VALUE` | Average metrics |
| `COUNT_*` | `COUNT_ACTIVE_USERS` | Count metrics |
| `*_RATE` | `CONVERSION_RATE`, `CHURN_RATE` | Ratios / percentages |

## Formula Syntax

Metrics reference `TABLE.COLUMN` with UPPERCASE naming:

```sql
-- Metric formulas (aggregation required)
SUM(ORDERS.AMOUNT)
COUNT(DISTINCT EVENTS.USER_ID) WHERE EVENTS.EVENT_TS >= DATEADD(day, -30, CURRENT_DATE)
SUM(ORDERS.REVENUE) / NULLIF(SUM(ORDERS.COST), 0)

-- Dimension formulas (no aggregates)
EVENTS.PLATFORM
DATE_TRUNC('month', EVENTS.EVENT_TS)
CASE WHEN USERS.AGE >= 18 THEN 'adult' ELSE 'minor' END
```

Use CASE WHEN for conditionals (Snowflake has no FILTER WHERE). Always guard division with NULLIF.

When creating assets, pass `--topics` to tag the business concept (e.g. `--topics "ACQUISITION"`; check existing topic names first), and `--default-dimensions` on a metric to declare its natural grouping axes. Dimension `output_type` / `semantic_type` are auto-inferred from the column schema - override with `--type` / `--output-type` only when the inference is wrong (e.g. a CASE expression that outputs a category from a numeric column). Full command reference: `kb-actions.md`.

## Reuse Over Reinvention

When a dashboard has several graphs sharing a concept, propose ONE KB asset instead of repeating the formula:

- 3 graphs all using `SUM(ORDERS.AMOUNT)` -> one `TOTAL_REVENUE` metric.
- 2 graphs grouping by `DATE_TRUNC('month', TS)` -> one `MONTHLY` dimension.

For the same concept on a sibling table with identical columns, **reference** it rather than duplicating: `graphit kb update metric TOTAL_REVENUE --secondary-tables "ORDERS_12M"`. This is a pointer, not a copy - edits propagate to all placements, and referenced placements show a `*` in the KB tree. Metrics and dimensions require every referenced column to exist on the target table (checked on save); rules only require the table to exist. Suggest it when the user has sibling sources (e.g. 6M and 12M windows) or asks to "make X available on Y".

For the KB graph model and structural questions (the vertical domain -> DS -> assets home vs horizontal topics, why assets appear where they do), see `kb-structure.md`; for graph-traversal queries, see `kb-traversal.md`. For the full create / update / delete command matrix, see `kb-actions.md`.
