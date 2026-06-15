# Headless Filters, Parameters, and Saved Views

## Core Concept

`graphit.filter()` and `graphit.param()` are headless JS registrations. They create NO DOM elements. You build 100% of the filter control's markup (any HTML, SVG, or CSS). The registration manages state so values can be snapshotted into saved views and survive page reloads.

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

Same API as filter but semantically a parameter (not tied to a KB field). Use for user-controlled inputs like date range pickers, threshold sliders, or toggle switches.

```js
const topN = graphit.param('top_n', { label: 'Top N', default: 10, options: [5, 10, 20, 50] })
```

## Wiring a Control

The registration renders nothing. Wire any HTML element you build:

```html
<select id="country-picker">
  <option value="US">US</option>
  <option value="IL">Israel</option>
</select>
<script>
  const country = graphit.filter('country', { label: 'Country', default: 'US' });
  const picker = document.getElementById('country-picker');
  picker.value = country.get();
  picker.onchange = () => country.set(picker.value);
  country.subscribe(v => { picker.value = v; }); // restores on view apply or page reload
</script>
```

## graphit.bind(el, options) - Reactive Data Binding

Connects a data entity to filter dependencies so it re-resolves automatically on change.

```js
graphit.bind(document.getElementById('revenue-chart'), {
  sql: 'SELECT date, SUM(revenue) AS revenue FROM orders WHERE country = :country GROUP BY 1',
  dataSourceId: 'ds_abc123',
  params: () => ({ country: graphit.state.get('country') }),
  deps: ['country'],      // state keys that trigger re-resolve (inferred from params if omitted)
  render: (result, el) => {
    graphit.chart(el, { type: 'line', data: result.data, x: 'date', y: 'revenue' });
  }
});
```

- Runs once immediately, then re-runs on any dep change
- Multi-key changes (e.g. a saved view applying 3 filters) debounce into one re-resolve per element
- `render` is your code - call `graphit.chart`, `graphit.table`, or hand-roll SVG/CSS

## Safe Parameter Binding (`:name` syntax)

Use `:name` placeholders in SQL for safe server-side parameter binding. Never string-concatenate user values into SQL.

| Shape | SQL | Params |
|-------|-----|--------|
| Scalar | `WHERE country = :country` | `{country: 'US'}` |
| Multi-select | `WHERE country IN :countries` | `{countries: ['US', 'IL']}` (expands to safe `IN ($0, $1)`) |
| Date range | `WHERE date BETWEEN :from AND :to` | `{from: '2026-01-01', to: '2026-06-01'}` |

Array length capped at 200 elements, max 50 param keys per resolve call.

## Saved Views

Users can save the current filter/parameter state as a named view and restore it later. The platform snapshots all registered `graphit.filter` and `graphit.param` values automatically. Views survive page reloads (state is baked into the iframe on every render). A default view auto-applies on dashboard open with no flash.

The subscribe callback on each handle restores the control's visual state when a view is applied - this is why every control must include a `subscribe(v => ...)` that updates its appearance.

## Complete Example

```html
<div style="margin-bottom: 16px;">
  <label style="font-size: 12px; color: var(--graphit-fg-muted);">Region</label>
  <select id="region-select" style="padding: 6px 12px; border: 1px solid var(--graphit-border); border-radius: 6px; background: var(--graphit-surface-raised); color: var(--graphit-fg);">
    <option value="ALL">All Regions</option>
    <option value="NA">North America</option>
    <option value="EU">Europe</option>
    <option value="APAC">Asia Pacific</option>
  </select>
</div>

<div id="revenue-by-region" data-graphit-id="revenue-by-region"
     data-graphit-label="Revenue by Region"
     data-graphit-sql="SELECT month, SUM(revenue) AS revenue FROM sales WHERE region = :region GROUP BY 1 ORDER BY 1"
     data-graphit-ds="ds_sales">
</div>

<script>
  const region = graphit.filter('region', { label: 'Region', field: 'REGION', default: 'ALL' });

  const sel = document.getElementById('region-select');
  sel.value = region.get();
  sel.onchange = () => region.set(sel.value);
  region.subscribe(v => { sel.value = v; });

  graphit.bind(document.getElementById('revenue-by-region'), {
    sql: `SELECT month, SUM(revenue) AS revenue FROM sales
          ${region.get() !== 'ALL' ? 'WHERE region = :region' : ''}
          GROUP BY 1 ORDER BY 1`,
    dataSourceId: 'ds_sales',
    params: () => region.get() !== 'ALL' ? { region: region.get() } : {},
    deps: ['region'],
    render: (result, el) => {
      graphit.chart(el, { type: 'area', data: result.data, x: 'month', y: 'revenue', valueFormat: 'currency' });
    }
  });
</script>
```
