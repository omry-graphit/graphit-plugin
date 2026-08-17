# KPI Cards (`graphit.kpi`)

Load when authoring or editing KPI cards - the hero-number tiles that lead a dashboard. Data tables live in `table.md`, chart types in `chart-patterns.md`. Format keys and the non-scaling percent rule live in chart-patterns.md's Value formatting section and apply here unchanged.

## graphit.kpi(el, config)

A KPI card: hero value, optional delta badge against a comparison value, optional area sparkline. Replaces the target element's innerHTML and escapes all values automatically.

```js
graphit.kpi('#kpi-credits', {
  value: 28679663,            // required - the hero number
  label: 'Total Credits',     // card header
  format: 'number',           // 'currency' | 'percent' | 'number'
  compareValue: 26100000,     // renders the delta badge: (value - compareValue) / compareValue as %
  compareLabel: 'vs last month', // badge caption (default 'vs previous')
  positiveDirection: 'up',    // 'up' (default) | 'down' - use 'down' when a drop is good (error rate, churn) so it colors green
  sparkline: [3.1, 2.8, 3.4], // optional number[] (2+ points) - area trend under the value
  color: 'var(--graphit-accent)' // optional hero override; default auto-colors green/red by delta direction, plain fg without compareValue
})
```

Fetch `compareValue` in the same resolve as the value (a prior-period column) or derive both from a trend query you already run - never a second request just for the delta.

## KPI Row: One Resolve, Several Cards

The standard dashboard header - several KPI cards fed by ONE query (per the rate-limit budget in `runtime.md`). One card OWNS the shared query: its `data-graphit-sql` is the combined statement the resolve runs, named by `sourceEntityId`. The other cards are `targetEntityIds` - each keeps its own complete, executable `data-graphit-sql` and gets the live query in its details panel. The resolve itself passes no `sql` and no `dataSourceId`; the entity contract in `runtime.md` holds here too, and passing both is the legacy shape that trips a `legacy_query_source` save warning (`migration.md`). Put the loading overlay on the shared container and pass it as the single `target`. `sourceEntityId` is what makes that legal: it names the owning entity document-wide, so `target` only carries the overlay and may wrap several entities. NEVER copy this container-as-`target` shape without it - a `target` that wraps its entity walks up to nothing, so the call rejects before any request is sent and the container spins forever (`runtime.md`).

```html
<div id="kpi-row" class="gh-loading" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
  <!-- gh-loading-overlay spinner from runtime.md First-paint section goes here -->
  <!-- owner: its sql IS the shared query the resolve runs -->
  <div data-graphit-id="kpi-credits" data-graphit-label="Total Credits"
       data-graphit-sql="SELECT SUM(CREDIT_USED) AS credits, COUNT(*) AS txns FROM CREDIT_USAGE_DS"
       data-graphit-ds="CREDIT_USAGE_DS">
    <div id="kpi-credits-card"></div>
  </div>
  <!-- kpi-txns and kpi-success cards: same shape, each with its own sql -->
</div>
<script>
(async function () {
  var r = await graphit.resolve({
    target: "#kpi-row",
    sourceEntityId: "kpi-credits",
    targetEntityIds: ["kpi-txns", "kpi-success"]
  });
  var row = r.data[0];
  graphit.kpi('#kpi-credits-card', { value: row.credits, label: 'Total Credits', format: 'number' });
  graphit.kpi('#kpi-txns-card', { value: row.txns, label: 'Transactions', format: 'number' });
})();
</script>
```

Do NOT add `gh-loading` to the individual cards - the overlay goes on the shared `target` container only (the SDK removes it when the resolve settles, then each kpi render fills its card). Cards fed by a shared resolve are never left to spin on their own.
