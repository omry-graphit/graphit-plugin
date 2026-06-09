# KB Exploration

Consult when starting a dashboard build. The Knowledge Base contains reusable metrics, dimensions, rules, and table schemas that ensure consistent formulas across dashboards.

## KB-First Discovery

Before writing raw SQL with inline aggregations or column references:

1. List what exists: `graphit kb list metrics`, `graphit kb list dimensions`, `graphit kb list rules`
2. If a KB metric matches the user's request, use its formula: `graphit kb get metric REVENUE`
3. If no match exists, consider whether to build the dashboard from raw columns or suggest KB asset creation first
4. Explore relationships: `graphit kb explore metric REVENUE` shows which tables and dimensions connect to a metric

KB assets ensure consistent formulas across dashboards. If 3 charts all need `SUM(ORDERS.AMOUNT)`, one TOTAL_REVENUE metric is better than 3 inline aggregations.

## Metric vs Dimension

| Property | Metric | Dimension |
|---|---|---|
| Formula | Aggregation required (SUM, COUNT, AVG, MIN, MAX) | Row-level only (no aggregates) |
| Table scope | Can reference multiple tables | Exactly one table |
| Purpose | Measures - what you count/sum | Grouping axes - how you slice |
| Example | `SUM(ORDERS.AMOUNT)` | `DATE_TRUNC('month', EVENTS.EVENT_TS)` |
| Invalid | `ORDERS.AMOUNT` (no aggregate) | `SUM(EVENTS.DURATION)` (has aggregate) |

## Naming Conventions

All KB assets use UPPER_SNAKE_CASE. The names are auto-sanitized:

| Pattern | Example | Use when |
|---|---|---|
| `TOTAL_*` | `TOTAL_REVENUE`, `TOTAL_ORDERS` | Sum aggregations |
| `AVG_*` | `AVG_ORDER_VALUE` | Average metrics |
| `COUNT_*` | `COUNT_ACTIVE_USERS` | Count metrics |
| `*_RATE` | `CONVERSION_RATE`, `CHURN_RATE` | Ratios/percentages |

## Reuse Over Reinvention

When building multi-chart dashboards, identify shared concepts:
- If 3 charts use `SUM(ORDERS.AMOUNT)`, reference one TOTAL_REVENUE metric
- If 2 charts group by `DATE_TRUNC('month', TS)`, reference one MONTHLY dimension
- Discover existing assets: `graphit kb search "revenue"`

## When to Suggest KB Asset Creation

| Signal | Propose |
|---|---|
| User requests a business metric with no KB match | Metric - reusable formula |
| User groups by a derived expression | Dimension - consistent grouping |
| User describes a business rule ("active = logged in within 30d") | Rule - applied to future queries |
| User uses a business term not in KB | Synonym - maps colloquial to defined |

## Formula Syntax

Metrics require `TABLE.COLUMN` references with UPPERCASE naming:

```sql
-- Valid metric formulas
SUM(ORDERS.AMOUNT)
COUNT(DISTINCT EVENTS.USER_ID) WHERE EVENTS.EVENT_TS >= DATEADD(day, -30, CURRENT_DATE)
SUM(ORDERS.REVENUE) / NULLIF(SUM(ORDERS.COST), 0)

-- Valid dimension formulas (no aggregates)
EVENTS.PLATFORM
DATE_TRUNC('month', EVENTS.EVENT_TS)
CASE WHEN USERS.AGE >= 18 THEN 'adult' ELSE 'minor' END
```

Conditionals use CASE WHEN (not FILTER WHERE - Snowflake doesn't support it). Always guard division with NULLIF.
