# Headless Filters, Parameters, and Saved Views

Load when the dashboard needs interactivity: a control the user changes that re-resolves a chart, plus saved views. A static dashboard skips this file. Dependent dropdowns and date presets live in `filters-advanced.md`.

## Contents

Core Concept | `graphit.filter()` / `graphit.param()` | Wiring a Control | `graphit.bind()` | Safe Parameter Binding (`:name`) | Saved Views | Complete Example

## Core Concept

`graphit.filter()` and `graphit.param()` are headless JS registrations. They create NO DOM elements. You build 100% of the filter control's markup (any HTML, SVG, or CSS). The registration manages state so values can be snapshotted into saved views and survive page reloads.

**Logic vs style.** `filter`, `param`, `bind` are headless logic - zero imposed styling, you own the markup. `chart`, `table`, `kpi`, `presentation`, `dropdown` render styled output you can use or hand-roll past.

These four pieces always work together: register a control, register the binding that reads it, wire your markup to the handle, and let saved views snapshot it. A filter with no `bind` does nothing - plan to include all four when you add interactivity.

**Reuse a control you built.** A finished filter control can be saved as a reusable template (`save_template`, or "Save as Template" in the UI) and dropped on other dashboards - its markup, styling, and wiring travel together. Keep the wiring `<script>` inside the control's own element so the capture carries the behavior, not just the markup.

## graphit.filter(id, options)

Register a named filter. Returns a handle for reading, writing, and subscribing to value changes.

```js
const country = graphit.filter('country', {
  label: 'Country',       // display label (used in saved view UI)
  field: 'COUNTRY',       // metadata for the platform (optional)
  default: 'US',          // initial value if no saved view overrides it
})
```

Handle API:
- `country.get()` - current value
- `country.set(value)` - update value (triggers subscribers + bound re-resolves)
- `country.subscribe(cb)` - called on change; returns unsubscribe fn

## graphit.param(id, options)

Same API as filter but semantically a parameter (not tied to a KB field). Use for user-controlled inputs like threshold sliders or toggle switches.

```js
const topN = graphit.param('top_n', { label: 'Top N', default: 10, options: [5, 10, 20, 50] })
```

## Wiring a Control

The registration renders nothing, so connect your own markup to the handle in three steps: set the element's initial value from `handle.get()`, call `handle.set(newValue)` in the change event, and pass `handle.subscribe(v => updateElement(v))` so the control restores its visual state on saved-view apply or page reload. The Complete Example below shows this end to end for a `<select>`.

## graphit.bind(el, options) - Reactive Data Binding

Connects a data entity to filter dependencies so it re-resolves automatically on change.

```js
graphit.bind(document.getElementById('revenue-chart'), {
  sql: 'SELECT date, SUM(revenue) AS revenue FROM orders WHERE country = :country GROUP BY 1',
  dataSourceId: 'ORDERS',
  params: () => ({ country: graphit.state.get('country') }),
  deps: ['country'],      // state keys that trigger re-resolve (inferred from params if omitted)
  render: (result, el) => {
    graphit.graph(el, { type: 'line', data: result.data, x: 'date', y: 'revenue' });
  }
});
```

- Runs once immediately, then re-runs on any dep change
- Multi-key changes (e.g. a saved view applying 3 filters) debounce into one re-resolve per element
- `render` is your code - call `graphit.graph`, `graphit.table`, or hand-roll SVG/CSS

## Safe Parameter Binding (`:name` syntax)

Use `:name` placeholders in SQL for safe server-side parameter binding. NEVER string-concatenate user values into SQL.

| Shape | SQL | Params |
|-------|-----|--------|
| Scalar | `WHERE country = :country` | `{country: 'US'}` |
| Multi-select | `WHERE country IN :countries` | `{countries: ['US', 'IL']}` (expands to safe `IN ($0, $1)`) |
| Date range | `WHERE date BETWEEN :start_date AND :end_date` | `{start_date: '2026-01-01', end_date: '2026-06-01'}` |

Do NOT name a param after a SQL keyword (`from`, `to`, `select`, `order`, `group`, and similar). The SQL template is parsed before values bind, so a reserved-word placeholder like `:from` fails with "SQL validation failed". Use names like `:start_date`, `:end_date`.

Array length capped at 200 elements, max 50 param keys per resolve call.

## Saved Views

Users can save the current filter/parameter state as a named view and restore it later. The platform snapshots all registered `graphit.filter` and `graphit.param` values automatically. Views survive page reloads (state is baked into the iframe on every render). A default view auto-applies on dashboard open with no flash.

The subscribe callback on each handle restores the control's visual state when a view is applied. This is why every control MUST include a `subscribe(v => ...)` that updates its appearance. A control registered without `graphit.filter`/`param` (a hand-rolled `<select>` on its own) will NOT persist to a view.

## Complete Example

One control, wired to one reactive chart. The `<select>` is your own markup; `bind()` re-resolves the chart whenever the filter changes.

```html
<label>Region</label>
<select id="region-select">
  <option value="ALL">All Regions</option>
  <option value="NA">North America</option>
  <option value="EU">Europe</option>
</select>
<div id="revenue-by-region"></div>

<script>
  const region = graphit.filter('region', { label: 'Region', field: 'REGION', default: 'ALL' });

  const sel = document.getElementById('region-select');
  sel.value = region.get();
  sel.onchange = () => region.set(sel.value);
  region.subscribe(v => { sel.value = v; });

  graphit.bind(document.getElementById('revenue-by-region'), {
    sql: 'SELECT month, SUM(revenue) AS revenue FROM sales WHERE (:region = \'ALL\' OR region = :region) GROUP BY 1 ORDER BY 1',
    dataSourceId: 'SALES',
    params: () => ({ region: region.get() }),
    deps: ['region'],
    render: (result, el) => {
      graphit.graph(el, { type: 'area', data: result.data, x: 'month', y: 'revenue', valueFormat: 'currency' });
    }
  });
</script>
```

For dependent dropdowns (an "only relevant values" list that narrows as an upstream filter changes) and date-preset pickers, see `filters-advanced.md`.
