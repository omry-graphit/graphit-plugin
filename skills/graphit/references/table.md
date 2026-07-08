# Data Tables (`graphit.table`)

Load when authoring or editing data tables. KPI cards live in `kpi.md`, chart types in `chart-patterns.md`. Format keys and the non-scaling percent rule live in chart-patterns.md's Value formatting section and apply here unchanged.

## graphit.table(el, config)

A styled, theme-aware HTML table. Replaces the target element's innerHTML and escapes all cell values automatically.

```js
graphit.table('#detail-table', {
  data: r.data,
  columns: ['PRODUCT', 'Total Credits', 'Success %'], // optional string[] of row keys - selects and orders; header text IS the key
  columnFormats: { 'Total Credits': 'number', 'Success %': 'percent' },
  maxRows: 50,                // default 50
  title: 'By Product'
})
```

`columns` entries are row keys, not display configs - there is no rename mapping. For readable headers, alias in SQL with quoted identifiers (`SELECT SUM(CREDIT_USED) AS "Total Credits"`) so the key itself is the display name, and use the same key in `columnFormats`. Columns without a `columnFormats` entry render raw. Percent values follow the non-scaling rule: multiply 0-1 ratios by 100 in SQL first.
