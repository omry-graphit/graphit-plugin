# SQL Reference

Consult when writing queries. Data source queries (`graphit query --ds`) run DuckDB. Warehouse queries (`graphit query --warehouse`) run Snowflake. You MUST use the correct dialect. To read a table's columns, use `graphit kb explore table <NAME>` - never `DESCRIBE`/DDL (`graphit query` runs SELECT only).

## DuckDB vs Snowflake Translation

| Snowflake | DuckDB equivalent |
|---|---|
| `DATEADD(day, N, date)` | `date + INTERVAL N DAY` |
| `DATEDIFF(day, a, b)` | `DATE_DIFF('day', a, b)` |
| `NVL(a, b)` | `COALESCE(a, b)` |
| `NVL2(a, b, c)` | `CASE WHEN a IS NOT NULL THEN b ELSE c END` |
| `IFF(cond, a, b)` | `CASE WHEN cond THEN a ELSE b END` |
| `TO_CHAR(date, fmt)` | `strftime(date, fmt)` |
| `ARRAY_AGG(x) WITHIN GROUP (ORDER BY y)` | `LIST(x ORDER BY y)` |
| `LISTAGG(col, sep)` | `STRING_AGG(col, sep ORDER BY ...)` |
| `COUNT_IF(cond)` | `COUNT(*) FILTER (WHERE cond)` |
| `GENERATOR(ROWCOUNT => N)` | `generate_series(0, N-1)` |
| `CONVERT_TIMEZONE('tz', ts)` | `timezone('tz', ts)` |

### JSON / VARIANT Access

| Engine | Syntax | Example |
|---|---|---|
| Snowflake | Colon notation | `col:field::STRING`, `col:parent:child::NUMBER` |
| DuckDB | Arrow operators | `col->>'field'` (text), `col->'field'` (JSON) |

NEVER use `->>`  in Snowflake or `:field::STRING` in DuckDB.

### Timezone

| Engine | Correct | Wrong |
|---|---|---|
| DuckDB | `timezone('Asia/Jerusalem', ts_col)` | `AT TIME ZONE` chains (reverses direction on TIMESTAMPTZ) |
| Snowflake | `CONVERT_TIMEZONE('Asia/Jerusalem', ts_col)` (2-arg for _TZ) | `AT TIME ZONE` |

## DuckDB Superpowers (not in Snowflake)

| Feature | Example |
|---|---|
| `GROUP BY ALL` | `SELECT region, SUM(sales) FROM t GROUP BY ALL` |
| `SELECT * EXCLUDE` | `SELECT * EXCLUDE (internal_id) FROM t` |
| `FILTER (WHERE)` | `COUNT(*) FILTER (WHERE status='active')` |
| `UNION BY NAME` | `SELECT ... UNION ALL BY NAME SELECT ...` |

## Snowflake Notes

- Use `DATE_TRUNC('month', date)` for grouping (not EXTRACT/MONTH/YEAR)
- Snowflake does NOT support `FILTER (WHERE)` - use `CASE WHEN` instead
- `COUNT_IF` MUST receive a boolean expression, not a raw INT column. Use `COUNT_IF(is_active = 1)`, not `COUNT_IF(is_active)`
- String matching: prefer `ILIKE` (case-insensitive) over `LIKE`

## SQL Formatting Standards (Both Engines)

- Keywords UPPERCASE: `SELECT`, `FROM`, `WHERE`, `JOIN`, `GROUP BY`, `ORDER BY`
- Table/column names UPPERCASE: `ORDERS`, `CUSTOMER_ID`, `TOTAL_REVENUE`
- Qualify every column with its table alias: `o.ORDER_DATE`, not bare `ORDER_DATE`
- Use descriptive aliases: `total_revenue`, not `sum1`
- String literals in single quotes: `'active'`, `'2024-01-01'`
- Non-ASCII identifiers MUST be double-quoted: `SELECT * FROM "hebrew_table"`

## CTE Pattern

Use CTEs for queries with 3+ JOINs or complex subqueries:

```sql
WITH MONTHLY_ORDERS AS (
  SELECT o.CUSTOMER_ID, DATE_TRUNC('month', o.ORDER_DATE) AS MONTH,
         SUM(o.AMOUNT) AS MONTHLY_REVENUE
  FROM ORDERS o WHERE o.STATUS = 'complete'
  GROUP BY o.CUSTOMER_ID, DATE_TRUNC('month', o.ORDER_DATE)
)
SELECT c.SEGMENT, AVG(mo.MONTHLY_REVENUE) AS AVG_MONTHLY_REVENUE
FROM MONTHLY_ORDERS mo JOIN CUSTOMERS c ON mo.CUSTOMER_ID = c.ID
GROUP BY c.SEGMENT ORDER BY AVG_MONTHLY_REVENUE DESC
```

## ORDER BY Rules (Always Include)

| Query type | ORDER BY |
|---|---|
| Time series | `ORDER BY date_column ASC` |
| Category breakdowns | `ORDER BY metric_column DESC` |
| Rankings / top N | `ORDER BY metric_column DESC LIMIT N` |

Do NOT add LIMIT unless the user requests it or the query is a ranking.

## Gap-Filling Pattern (DuckDB)

For heatmaps or continuous time-series needing every cell (even zeros):

```sql
WITH grid AS (
  SELECT UNNEST(generate_series(0, 23)) AS hour_of_day
)
SELECT g.hour_of_day, COALESCE(t.count, 0) AS count
FROM grid g
LEFT JOIN (SELECT hour, COUNT(*) AS count FROM data_source GROUP BY 1) t
  ON g.hour_of_day = t.hour
ORDER BY 1
```

Date series:
```sql
SELECT UNNEST(generate_series(
  CURRENT_DATE - INTERVAL 30 DAY, CURRENT_DATE, INTERVAL 1 DAY
))::DATE AS date
```

## Subquery Column Scope

The outer SELECT can ONLY reference columns the subquery exposes (its aliases). Base-table columns aggregated away in the subquery do NOT exist at the outer level.

## Cache-friendly resolve SQL

When the query feeds a canvas `graphit.resolve()` call, write it in the cache-friendly shape so filter changes stay instant. The shape rules and the shapes that skip the cache live in `runtime.md`.

## Data source routing

Always prefer a cached data source (`graphit query "SQL" --ds <NAME>`, roughly 100ms via DuckDB) over a live warehouse query (`graphit query "SQL" --warehouse --connection <id>`, roughly 10s via Snowflake). Pass the data source name to `--ds` - the same name you SELECT FROM (a full id or unique id-prefix also works). The full routing table, the `ds list` output template, and the source-shape guidance live in `data-sources.md`.

## Percent scaling

The canvas `percent` format only appends `%` (it does not multiply by 100), so multiply 0-1 ratios by 100 in SQL: `AVG(retained) * 100.0 AS retention_pct`.

## Presenting Query Results

After every `graphit query`, present results grounded in the KB. Always show which KB assets were used - this is what makes governed queries valuable.

**When using KB reference syntax** (`{{metric:X}}`, `{{dim:X}}`), show all five sections:

~~~
**KB Assets:** dimension **CAMPAIGN_CATEGORY**, metric **TOTAL_INSTALLS**, metric **CPI**, table **MARKETING_UA_DS**

**Query:**
```sql
SELECT
    {{dim:CAMPAIGN_CATEGORY}} AS category,
    {{metric:TOTAL_INSTALLS}} AS installs,
    {{metric:CPI}} AS cpi
FROM MARKETING_UA_DS
WHERE ACTIVITY_TIME >= '2026-01-01'
GROUP BY {{dim:CAMPAIGN_CATEGORY}}
ORDER BY installs DESC
```

**Resolved SQL:**
```sql
SELECT
    CASE WHEN IS_RETARGETING THEN 'Retargeting'
         WHEN IS_CTV THEN 'Connected TV'
         ELSE 'User Acquisition' END AS category,
    SUM(INSTALLS) AS installs,
    SUM(APPSFLYER_COST) / NULLIF(SUM(INSTALLS), 0) AS cpi
FROM MARKETING_UA_DS
WHERE ACTIVITY_TIME >= '2026-01-01'
GROUP BY 1
ORDER BY installs DESC
```

**Results** (3 rows via **ds_abc123**):

| Category | Installs | CPI |
|---|---:|---:|
| User Acquisition | 80,605 | $0.79 |
| Retargeting | 12,300 | $1.24 |
| Connected TV | 3,100 | $2.80 |

**Governance:** governed - 3 KB refs, 2 rules enforced (**EXCLUDE_ORGANIC**, **MIN_SPEND**). Max rows: 1,000.
~~~

**When using inline SQL** (no `{{metric:X}}`), show query + results + governance:

~~~
**Query:**
```sql
SELECT media_source, SUM(spend) AS spend FROM MARKETING_UA_DS GROUP BY 1
```

**Results** (6 rows via **ds_abc123**):

| Media Source | Spend |
|---|---:|
| Facebook | $42,100 |
| Google UAC | $38,500 |

**Governance:** ad-hoc - 0 KB refs. Consider using `{{metric:TOTAL_SPEND}}` for governed tier.
~~~

For ad-hoc queries, suggest the KB reference equivalent when one exists. This nudges users toward governed queries.

**Always use `--verbose`** to get the resolved SQL. If the user didn't pass it, re-run with `--verbose` so you can show both the reference query and the expanded SQL.

Zero rows: explain what you checked and hypothesize why (wrong date range, filter too strict, table empty).
