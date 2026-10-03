# Page Load: Request Graph and Readiness

Load when a dashboard sends more than six requests on open (charts, option lists, bounds) or has a query feeding another (a rank feeding a series, bounds feeding a date window); when its open or Apply time is slow or measured; or when declaring readiness. `runtime.md` still owns the resolve API, the entity contract and the rate budget.

Every `graphit.resolve()` and chrome call (`cascade`, `dataBounds`, `rank`) pays a fixed server cost of up to about a second, and the SDK sends at most six at once, in call order. Load time is roughly that cost times the rounds a page waits through, so shape the request graph before tuning SQL.

## The request graph

- **Parallel unless the rows are needed.** Start independent queries together in one `Promise.all`. Await one query before another only when the later query's SQL or params use the earlier result. A chain of awaits whose later steps ignore earlier results turns one round into many.
- **Fold a dependency when you can.** A rank that only picks the top N for a series is usually one statement: rank in a CTE and join the series to it. Keep two steps when the first result is also shown or feeds several queries; when building or re-authoring, declare the pair (`declared-queries.md`).
- **Visible first.** Start above-the-fold charts and KPIs before option lists, bounds for secondary controls and anything below the fold; later calls wait behind earlier ones.
- **Hidden tabs wait** until first shown (`runtime.md`, "Declare statically, execute lazily").
- **One first load.** `graphit.state.subscribe` calls back immediately: guard the callback with a boot flag and call `refresh()` once when init ends (`state-contract.md`, "Restore order"). An unguarded callback plus a boot refresh runs every query twice.
- **Redraw, don't re-resolve.** Resize, highlight, legend, axis and zero-axis toggles change drawing only: keep the last result and redraw from it. Resolve again only when a filter, param or variant changes the query.

## Declaring readiness

Declare what "loaded" means so the page reports its open and Apply time. Readiness never delays drawing, and a missed acknowledgement only records a timeout after two minutes. Misuse does throw, so build `targets` from the same ids you pass tokens for.

1. At the start of the open and of each Apply, call `graphit.readiness.begin(kind, targets)`: `kind` is `'initial'` or `'apply'`, `targets` the `data-graphit-id`s this load paints (1-128, unique). A hidden tab's entities are not targets until it opens. Each Apply supersedes the open and the previous Apply. `begin` throws on another kind or a bad list, and `ready.target(id)` on an id missing from `targets`.
2. Pass `readiness: ready.target(id)` to each `graphit.resolve`, `dataBounds` or `rank` call for that target and to its `graphit.graph`, `table` or `kpi` render, which acknowledges the paint itself. After drawing custom DOM or options, call `ready.target(id).rendered()`. A `bind` keeps the token it was registered with, so it reports only that first load; give Apply targets through `resolve`.
3. Call `ready.stateReady()` once the filters and params this load uses are applied, and `ready.fail()` if the load fails.

```js
function load(kind) {
  const ready = graphit.readiness.begin(kind, ['spend-trend', 'spend-kpi']);
  ready.stateReady(); // this page applies its state before load()
  return Promise.all([
    graphit.resolve({ target: '#spend-trend', readiness: ready.target('spend-trend') })
      .then(r => graphit.graph('#spend-trend-chart', { type: 'line', data: r.data, x: 'day', y: 'spend',
        readiness: ready.target('spend-trend') })),
    graphit.resolve({ target: '#spend-kpi', readiness: ready.target('spend-kpi') })
      .then(r => graphit.kpi('#spend-kpi-card', { value: r.data[0]?.spend ?? 0, readiness: ready.target('spend-kpi') })),
  ]).catch(() => ready.fail());
}
```

Redraw-only toggles begin nothing. Never run a query just to measure readiness.
