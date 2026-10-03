# Queries that feed other queries: a ranked list and the graph limited to it, helper queries, per-value repeats

Read when one query's rows feed another query (a ranking that picks a series' networks, an event list feeding an impact query), a query that draws nothing feeds another, one query runs once per selected value, or page state picks which statement runs. `query-contract.md` owns params, variants and the one-owner rule; this is version 2 of that spec. `page-load.md` owns request order and readiness.

## Declare every query in markup

A query that draws nothing is a hidden helper entity with `data-graphit-role="query"`. It needs no label and still owns its default SQL and source in `data-graphit-sql` / `data-graphit-ds`: a spec never carries a default statement. `query` is the only `data-graphit-role` value; the spec's `role` field below describes what the query computes. Helpers are static markup like every owner; never create one in JavaScript.

```html
<div hidden data-graphit-id="ua-rank" data-graphit-role="query" data-graphit-ds="UA_DS"
     data-graphit-sql="SELECT media_source AS network, SUM(cost) AS total FROM UA_DS WHERE day &gt;= CAST(:start AS DATE) GROUP BY 1 ORDER BY 2 DESC LIMIT 10"
     data-graphit-query-spec='{"version":2,"role":"rank","params":{"start":{"type":"date"}},"state":{"start_date":"start"},"outputs":{"network":"string","total":"number"}}'></div>
<div data-graphit-id="ua-series" data-graphit-label="Top networks over time" data-graphit-ds="UA_DS"
     data-graphit-sql="SELECT day, media_source AS network, SUM(cost) AS value FROM UA_DS WHERE media_source IN :top AND day &gt;= CAST(:start AS DATE) GROUP BY 1, 2"
     data-graphit-query-spec='{"version":2,"params":{"start":{"type":"date"},"top":{"type":"list","items":"string"}},"state":{"start_date":"start"},"depends_on":[{"query":"ua-rank","bind":{"top":{"column":"network","as":"list"}}}]}'>
  <div id="ua-series-chart"></div>
</div>
```

These are invented names, as in `query-contract.md`. The rank stays a separate query because the page also lists its networks; a rank only one series uses folds into that statement.

## Version 2 fields

`version`, `params` and `variants` mean what they mean in version 1. Every other field is optional:

| Field | Meaning |
|---|---|
| `role` | What the query computes: `data` (default), `options`, `bounds`, `rank` or `total` |
| `outputs` | `{column: type}`, scalar types only. Required on a query another binds from; every statement selects each listed column under that name, so alias it |
| `depends_on` | `[{"query": parent, "bind": {param: {"column": c, "as": "list" or "scalar"}}}]`, one entry per parent. `list` fills a `list` param whose `items` match the column; `scalar` needs exactly one row |
| `state` | `{state_key: param}`: the SDK sends that state value as the param. Only for a state value that already has the param's type; date-range objects, presets, `all_` sentinels and mode-plus-list filters stay computed in page JavaScript and passed in `params` |
| `variant_from` | `{"state": key, "choices": {value: "default" or variant}}`: that state value picks the statement; list every value the control can take |
| `instances` | `{"param": p, "from_state": key}`: one call per value of a list state key; `p` is a non-list param |
| `activation` | `eager` (default), or `lazy` for a hidden tab or staged option list; the page still resolves a lazy query itself when it is first shown |

A param has one source: page state, one dependency, the instance value, or `params` in the call. An eager query never depends on a lazy one, an instanced query takes no part in dependencies, and cycles refuse. Identity is never a param: `user`, `org`, `team`, `email`, `user_id`, `org_id`, `team_id` and any `user_` name refuse the save, because governance supplies who the viewer is. Limits: dependency depth 4, 64 version 2 queries per dashboard, 8 parents and 64 outputs per query, 5,000 values per list binding.

## Resolve by query id

```js
const rank = await graphit.resolve({ query: 'ua-rank' }).catch(e => ({ error: e.message }));
const series = await graphit.resolve({ query: 'ua-series', target: '#ua-series-chart', deps: { 'ua-rank': rank } });
```

- `query` names any declared query, helpers included, and finds it document-wide like `sourceEntityId`; never add `sql` or `dataSourceId`. When one result renders into several graphs, add `targetEntityIds` (`kpi.md`).
- Pass each parent's result from the same load unchanged in `deps`, keyed by parent id; after a filter change, resolve the parent again first. When a parent's call rejects, still resolve the dependent with that failure in `deps`, so the SDK shows the dependent as unavailable. Leave bound params out of `params`: passing one the declaration already binds refuses.
- A parent that failed, was truncated, lacks the column, or holds a NULL or wrongly typed value makes the dependent unavailable, never "all selected". An empty parent binds `[]` (match nothing) to a list; a scalar parent must return one row.
- An instanced query takes one call per value, and page code loops over the values: `graphit.resolve({ query: 'league-kpis', instance: league, target: ... })`.
- `graphit.bind` passes no `deps` or `instance`, so a query with `depends_on` or `instances` needs `graphit.resolve`, where `deps` maps parent ids to results (in `bind` and `cascade` it lists state keys). A `state` mapping re-runs nothing: keep the subscription, or list the key in bind's `deps`.
- With `variant_from`, pass no `variant`: an explicit one overrides it. A value that does not match its declared type rejects before any request.
- A helper paints nothing, so it is never a readiness target; give the token to the graphs it feeds.

## When to declare

Controls keep their primitives: `graphit.cascade` for option lists, `graphit.dataBounds` for a picker's range, `graphit.rank` for a top-N control (`runtime.md`). When one query's rows choose another query's values, declare both and bind through `depends_on` rather than copying the values through page code, so a failed parent never widens the dependent. Fold instead when only one query uses the rows and the page never shows them (`page-load.md`). Declare version 2 when building or re-authoring a dashboard with such a pair, a helper that replaces a hand-written query the primitives cannot express, per-value repeats or a state-driven statement choice. Leave existing owners as they are while editing something else; version 1 and undeclared queries keep working. Check through the shared dashboard check/save path, then verify the default, a dependent after a filter change, and each choice.
