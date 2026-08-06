# Headless Filters, Parameters, and Saved Views

Load when the dashboard has ANY user-changeable control - a select, a button set, a slider, a date picker - plus saved views. A dashboard nobody changes skips this file. Dependent dropdowns and date presets live in `filters-advanced.md`.

## Contents

Declare State in Markup | Wiring a Control | `graphit.bind()` | Safe Parameter Binding (`:name`) | Saved Views | Complete Example

## Declare State in Markup

Every user-changeable control lives inside a wrapper naming its state key. The wrapper is static markup, so the platform sees the control without running your JavaScript - which is what lets saved views capture it.

```html
<div data-graphit-state="country"
     data-graphit-state-kind="filter"
     data-graphit-state-label="Country"
     data-graphit-field="COUNTRY"
     data-graphit-state-default='["US","IL"]'>
  <!-- your markup: any select, button set, or hand-rolled popover -->
</div>
```

| Attribute | Required | Value |
|-----------|----------|-------|
| `data-graphit-state` | yes | state key: lowercase letters, digits, `_`; starts with a letter or `_` |
| `data-graphit-state-kind` | no (default `filter`) | `filter` or `param` - exactly these, lowercase |
| `data-graphit-state-label` | no | display name, used by the saved-view UI |
| `data-graphit-field` | no | KB field name (metadata) |
| `data-graphit-state-default` | no (default `null`) | strict JSON, a scalar or an array of scalars - never an expression |

A declared key is a live filter before any of your script runs. `graphit.state.get('country')` reads it, `bind()` depends on it, and a saved view restores it - with no `graphit.filter()` call anywhere.

**Logic vs style.** Declarations and `bind` are headless logic - zero imposed styling, you own the markup. `chart`, `table`, `kpi`, `presentation`, `dropdown` render styled output you can use or hand-roll past.

**Reuse a control.** Save a finished control as a template (`save_template`, or "Save as Template" in the UI) to drop on other dashboards - markup, styling, and wiring travel together. Keep its `<script>` inside the control's own element.

**Registering from JavaScript instead.** `graphit.filter(id, options)` / `graphit.param(id, options)` still work and return a handle; calling either on a key you already declared adopts it. They are the escape hatch for keys you cannot write as markup, and a NEW undeclared one is refused at save. Both, plus the retrofit procedure, are in `state-contract.md`.

## Wiring a Control

The declaration renders nothing, so connect your markup in three steps: initialize from `graphit.state.get(key)`, write back on change with `graphit.state.set(key, value)`, and subscribe so the control restores its look on saved-view apply or page reload. The Complete Example shows this end to end.

`subscribe` fires the callback IMMEDIATELY, then on every change, so init must be order-independent: a callback reaching a `const`/`let` declared further down throws at boot, and one uncaught throw kills the whole dashboard script - every chart spins forever with no error surfaced. Declare what the callback touches before you subscribe.

## graphit.bind(el, options) - Reactive Data Binding

Connects a data entity to state keys so it re-resolves automatically on change. The entity owns the query: `el` sits inside the `[data-graphit-id]` wrapper whose `data-graphit-sql` carries the `:name` placeholders, and the call supplies only the values (`runtime.md`).

```js
graphit.bind(document.getElementById('revenue-chart'), {
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

Users save the current state as a named view and restore it later. The platform snapshots every declared and registered key automatically, and views survive page reloads (state is baked into the iframe on every render). A default view auto-applies on dashboard open with no flash.

The subscribe callback restores each control's visual state when a view is applied, so every control MUST have one. A control with neither a `data-graphit-state` wrapper nor a `graphit.filter`/`param` call - a bare hand-rolled `<select>` - is invisible to views: the user changes it, saves, and the view captures nothing.

## Complete Example

One declared control, wired to one reactive chart. The `<select>` is your own markup; `bind()` re-resolves the chart whenever the state changes.

```html
<div data-graphit-state="region" data-graphit-state-label="Region"
     data-graphit-field="REGION" data-graphit-state-default='"ALL"'>
  <label>Region</label>
  <select id="region-select">
    <option value="ALL">All Regions</option>
    <option value="NA">North America</option>
    <option value="EU">Europe</option>
  </select>
</div>
<div data-graphit-id="revenue-by-region" data-graphit-label="Revenue by Region"
     data-graphit-sql="SELECT month, SUM(revenue) AS revenue FROM sales WHERE (:region = 'ALL' OR region = :region) GROUP BY 1 ORDER BY 1"
     data-graphit-ds="SALES"></div>

<script>
  const sel = document.getElementById('region-select');
  sel.value = graphit.state.get('region');
  sel.onchange = () => graphit.state.set('region', sel.value);
  graphit.state.subscribe('region', v => { sel.value = v; });

  graphit.bind(document.getElementById('revenue-by-region'), {
    params: () => ({ region: graphit.state.get('region') }),
    deps: ['region'],
    render: (result, el) => {
      graphit.graph(el, { type: 'area', data: result.data, x: 'month', y: 'revenue', valueFormat: 'currency' });
    }
  });
</script>
```

For dependent dropdowns (an "only relevant values" list that narrows as an upstream filter changes) and date-preset pickers, see `filters-advanced.md`.
