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

## Downloads: declare the columns a hand-rolled table shows

The entity kebab menu offers Download CSV / Excel. It re-runs the entity's recorded query and serializes **every column that query returned**, which is correct for rows (the runtime caps rows after the query, so the file is deliberately fuller than the screen) and wrong for columns whenever the table shows fewer than it fetches.

That gap is easy to create on purpose. A table with a column picker usually fetches a wide catalogue once so adding a column is instant with no re-query, and a table with rich tooltips may fetch helper columns (a ratio's numerator and denominator, a rank used only for ordering) that are never a visible column at all. One production dashboard fetched 235 columns to render 12; 136 of them existed only to feed a hover tooltip. Every one of them landed in the user's file.

**`graphit.table` is not exempt.** Its `columns` list selects a subset, and rows are often reshaped or renamed in JS before being handed over, so the file can carry both extra columns and the raw SQL aliases (`active_players`) where the table shows the display names (`Active Players`). Declare whenever the table's `columns` differ from what the query returned, for either reason. A table that renders every column its query returned, under those names, needs nothing.

```js
// call it wherever you build the header row, with the SAME list, in the same order
if (graphit.exportColumns) {
  graphit.exportColumns('summary-table', [
    { key: 'rowkey', label: 'Install Day' },      // row-label columns first
    ...visibleCols.map(c => ({ key: c.key, label: c.label })),
  ])
}
```

- **Call it from the render path, not from setup.** The single function every consumer already goes through (headers, cells, totals) is the right place, because then the file cannot drift from the table. Calling it once at load leaves the declaration stale the moment the user hides a column.
- **`label` becomes the file's header text**, so pass what the user is looking at, not the SQL alias. If a column renders as a percentage while the exported value is the raw count, name it for the value in the file, not the one on screen.
- **Add the row-label columns yourself.** A visible-column list usually holds measure columns only, while the row label is rendered separately, so it has to be prepended or the file loses its key column.
- **Guard with `if (graphit.exportColumns)`.** On an older platform build the call throws, and a throw inside a render function takes the whole table down with it.
- **Declaring nothing is fine and is the default.** No declaration means the download is unchanged, which is right for any table whose query already matches what it shows. A declared key the query did not return is dropped, never invented, and a declaration matching nothing falls back to the full result rather than producing an empty file.
