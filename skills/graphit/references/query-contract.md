# Typed owner queries and named variants

Read when adding typed value slots or a finite set of metric, horizon, grain or grouping choices to a canvas entity. Existing untyped canonical queries and declared runtime-composed queries remain valid (`runtime.md`). When a graph shows only the rows another query picks (a trend for the top 10 sources a table lists), rank once and declare the pair rather than ranking again inside the graph's statement: `declared-queries.md`, which also covers helper queries, per-value repeats and state-selected statements.

## One owner

Keep the default SQL in `data-graphit-sql` and source in `data-graphit-ds`. Add static, HTML-escaped JSON in `data-graphit-query-spec` on that same entity:

```html
<div data-graphit-id="spend" data-graphit-label="Spend"
     data-graphit-ds="SPEND"
     data-graphit-sql="SELECT SUM(amount) AS amount FROM SPEND WHERE day &gt;= CAST(:start_date AS DATE)"
     data-graphit-query-spec='{"version":1,"params":{"start_date":{"type":"date"}},"variants":{"by_country":{"sql":"SELECT country, SUM(amount) AS amount FROM SPEND WHERE day >= CAST(:start_date AS DATE) GROUP BY country"}}}'>
  <div id="spend-chart"></div>
</div>
```

These are invented names; use actual accessible sources/columns and governed Metric/Dimension/Measure references where available. A variant contains only `sql` and inherits the owner's source. Cross-source alternatives need separate owners. The spec has no second default SQL, source override or variant named `default`. Unknown fields, versions, duplicate JSON keys, malformed types, undeclared placeholders and the names `__proto__`, `constructor` and `prototype` refuse the save; the refusal names the owner, and the parameter or variant when one is at fault. Save the declaration so the save rule validates it. The SDK reads the specification from the page, picks the default or named statement and sends it as that entity's query; the server authorizes and governs it like any other query.

```js
const result = await graphit.resolve({
  sourceEntityId: 'spend', target: '#spend-chart', variant: 'by_country',
  params: { start_date: '2026-01-01' }
});
```

Omit `variant` to select the default. Do not combine `variant` with explicit `sql`/`dataSourceId`. An unknown named choice refuses; it does not silently run the default. For legal unregistered runtime composition, use the existing declared second tier and its vocabulary closure, without a variant selector. Preserve source/target attribution.

## Values and structure

`params` maps stable lowercase names to `{type, nullable?}`. Types: `string`, `integer`, `number`, `boolean`, `date` (ISO `YYYY-MM-DD`), `enum` with 1-200 unique string `values`, and `list` whose `items` is `string`, `integer`, `number`, `boolean` or `date` (never `enum`). A `list` binds only as `IN :name`, never `IN (:name)`, and no other type follows `IN`. Null is allowed only with `nullable:true`; list items are non-null scalars. Booleans are not integers. Value limits are in `filters.md`. A specification is at most 128KiB, with 32 named variants per owner and 512 declared default/variant statements per dashboard.

**One name, one declaration.** A parameter name is one input: every owner that declares `country` declares it identically, so one control's value is valid everywhere it is sent. While authoring, keep one type table per dashboard and copy into each owner's static specification exactly the placeholders its default and variant statements use; an unused declaration refuses the save. Never build specifications in page JavaScript. When owners disagree, the shared check/save path returns a non-blocking `query_param_type_conflict` warning naming the parameter and its declarations; align them, or rename inputs that genuinely differ, and save again.

Dates/as-of, search text, returned top-category arrays and cohort labels are bound values. Keep their parameter names stable across state changes; do not turn a category label into a SQL identifier. Metric/group/grain/horizon changes select authored statements, not SQL fragments passed as values. Send every binding the selected statement uses; bindings removed by the existing integer sentinel simplifier may be omitted. Values the selected statement does not use are ignored, so one params object can serve all of that owner's variants.

Preserve the dashboard's authored All/None/include/exclude behavior. An authored empty selection that means All stays distinct from None; do not globally translate every empty list or null. Use explicit mode values such as an enum when appropriate. The existing integer `all_x` sentinel contract remains in `filters.md`.

## Bind and saved views

`graphit.bind()` accepts a `variant` string or a callback returning its name (null or undefined selects the default), and resolves the nearest `[data-graphit-id]` at or above the bound element (bind takes no `sourceEntityId`). Declare and persist the structural control as ordinary state; retain existing state keys/defaults and declare the dependency explicitly when the selector reads state:

```js
graphit.bind('#spend-chart', {
  variant: () => graphit.state.get('breakdown'),
  params: () => ({ start_date: graphit.state.get('start_date') }),
  deps: ['breakdown', 'start_date'],
  render: (result, el) => { /* render result.data with the selected columns */ }
});
```

Use `filters.md` for state declarations and control subscriptions. Render-only controls need no query. Query specifications belong to host entities, never inside a chart-template fragment. Hidden variant references can conceal the entire owner's query facts; a variant name grants no access. Check through the shared dashboard check/save path, then verify actual default/variant/filter renders and saved-state restoration.
