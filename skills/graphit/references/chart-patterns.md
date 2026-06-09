# Chart Patterns

All chart types are available via `graphit.chart()`. All data comes from `graphit.resolve()` - never embed static data.

**NEVER use `<canvas>`.** Canvas produces blurry charts inside the sandboxed iframe due to DPI scaling issues.

## Runtime chart types

### bar
SVG vertical bars. Multi-series: grouped side-by-side. Y-axis: 4 grid lines with formatted labels. X-axis: category labels (sampled if >12). Rounded top corners (rx=3). `<title>` tooltips per bar.

### line / area
SVG line with circle dots at each point. Area adds filled path below (opacity 0.18). Multi-series: separate colored paths. Y-axis scaled to data range (min to max). `<title>` tooltips per dot.

### donut / pie
SVG pie slices with center hole (58% of radius). Center shows formatted total. Legend below with color swatches. Each slice is a wedge path from center.

### scatter / bubble
SVG circles positioned by x/y. Size field scales radius (sqrt, 3-40px). Fill opacity 0.6 with solid stroke. 4 horizontal grid lines. Capped at 200 points.
Config: `x`, `y`, `size` (optional radius), `label` (tooltip), `xFormat`.

### stacked-bar / stacked
SVG vertical stacked bars. Segments stacked bottom-to-top per category. Y-axis scaled to max total. Legend shows series names.
Config: requires `series` field for stacking groups.

### heatmap
CSS grid. X = columns, Y = rows. Background intensity scales linearly (rgba teal, 0.08-0.98). Text flips white at >55% intensity. Headers auto-generated. Capped at 40x40.
Config: `x` (column), `y` (row), `value` (intensity, falls back to `y`).

### horizontal-bar / hbar
CSS horizontal bars for long category labels that overlap on vertical bar x-axis. Labels on the left, proportional bars in the middle, formatted values on the right. Each bar colored from the palette. Use instead of `bar` when categories have names longer than ~10 characters.

### funnel
CSS horizontal bars narrowing top-to-bottom. First bar = 100% width, rest proportional. Shows step-over-step conversion rate. Colors cycle through palette.

### gauge
CSS half-circle via `conic-gradient` + `clip-path`. Auto-colors: green (>=70%), yellow (>=40%), red (<40%). Override with `color` config (must be a valid CSS color token).
Config: `value`, `min` (default 0), `max` (default 100), `format`, `label`, `color`.

### sparkline
Inline SVG polyline for KPI cards or table cells. No axes, no grid - just trend shape. Single data point renders as a dot.
Config: `y`, `width` (default 120), `height` (default 32), `label`, `showValue` (default true), `valueFormat`.

## Color tokens

| Token | Usage |
|---|---|
| `var(--graphit-accent)` | Primary brand teal |
| `var(--graphit-success)` | Positive/good |
| `var(--graphit-warning)` | Caution |
| `var(--graphit-error)` | Negative/bad |
| `var(--graphit-fg)` | Primary text |
| `var(--graphit-fg-muted)` | Secondary text |
| `var(--graphit-fg-subtle)` | Labels, placeholders |
| `var(--graphit-border)` | Borders, grid lines |
| `var(--graphit-surface-raised)` | Card backgrounds |
| `var(--graphit-surface-sunken)` | Inset areas |

## Tooltip pattern (for hand-rolled charts)

Runtime charts use `<title>` elements for native browser tooltips. For hand-rolled charts, add ONE shared tooltip div and always escape user data with a manual HTML escape function before passing to `showTooltip()`:

```html
<div id="tooltip" style="position:fixed;pointer-events:none;z-index:100;
  background:var(--graphit-surface-raised);color:var(--graphit-fg);
  border:1px solid var(--graphit-border);border-radius:8px;
  padding:10px 14px;font-size:13px;line-height:1.5;
  box-shadow:0 4px 12px rgba(0,0,0,0.15);opacity:0;transition:opacity 0.15s;
  max-width:240px"></div>
```

```js
var tooltip = document.getElementById('tooltip');
function showTooltip(e, html) {
  tooltip.innerHTML = html;
  tooltip.style.opacity = '1';
  var tx = Math.min(e.clientX + 12, window.innerWidth - 260);
  var ty = e.clientY - tooltip.offsetHeight - 8;
  tooltip.style.left = tx + 'px';
  tooltip.style.top = (ty < 4 ? e.clientY + 16 : ty) + 'px';
}
function hideTooltip() { tooltip.style.opacity = '0'; }
```
