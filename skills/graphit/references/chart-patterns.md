# Chart Patterns

The chart types documented below are the standard `graphit.graph()` types (set via `config.type`). Anything not listed here (treemap, sankey, maps, box) you draw yourself - as a `type:'custom'` graph (responsive + themed, see below) or raw hand-rolled SVG; see `chart-selection.md` for the split. A graph you draw is equally first-class - same 3-dot menu, data source, and provenance - once wrapped in `data-graphit-*`. All data comes from `graphit.resolve()` - never embed static data.

**NEVER use `<canvas>`.** Canvas produces blurry charts inside the sandboxed iframe due to DPI scaling issues.

## Runtime chart types

### bar
SVG vertical bars. Multi-series: grouped side-by-side. Y-axis: 4 grid lines with formatted labels. X-axis: category labels (sampled if >12). Rounded top corners (rx=3). `<title>` tooltips per bar.
**Dual axis (combo chart):** `y2` field adds a dashed line overlay on a secondary right-side Y-axis. Bars use the left scale, the line uses the right scale. Config: `y2`, `y2Format`, `y2Label`.

### line / area
SVG line with circle dots at each point. Area adds filled path below (opacity 0.18). Multi-series: separate colored paths. Y-axis scaled to data range (min to max). `<title>` tooltips per dot.
**Dual axis:** `y2` field adds a secondary right-side Y-axis with independent scaling. Secondary line is dashed (`stroke-dasharray="6 3"`). `y2` and `series` are mutually exclusive.
Config: `y2` (secondary value field), `y2Format` (right axis format), `y2Label` (legend name for secondary).

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

## Value formatting
`valueFormat` (charts), `format` (`kpi`/`gauge`), and `columnFormats` (`graphit.table`, mapping column name -> format) all take `"currency"`, `"percent"`, or `"number"`. **`"percent"` only appends `%` - it does NOT multiply by 100.** A 0-1 ratio renders as `0.42%`, not `42%`; multiply ratios/rates by 100 in SQL (`* 100.0 ... AS x_pct`) so the value is already 0-100. Table columns without a `columnFormats` entry render raw.

## Bespoke responsive SVG (`type: 'custom'`)

For a custom look, draw your own SVG through the same entry: `graphit.graph(el, { type: 'custom', draw: (ctx) => marks })`. Return the INNER marks only (`<rect>`/`<path>`/`<text>`/`<g>`) as a string; the runtime wraps them in `<svg viewBox="0 0 W H">` sized to the container, so 1 unit = 1 CSS pixel and text stays one size at any width. Unlike raw hand-rolled `<svg>`, a custom graph is responsive and re-themes on dark for free.

`ctx` provides: `ctx.width`/`ctx.height` (px; height from `config.height`, default 280; width = measured container); token colors (dark-free via cascade, prefer these) `ctx.accent`, `ctx.fg`, `ctx.fgMuted`, `ctx.fgSubtle`, `ctx.border`, `ctx.surface`, `ctx.surfaceSunken`, `ctx.palette`, `ctx.color(i)` (cycles palette, honors `config.colors`); `ctx.resolved.*` (same names + `ctx.resolved.color(i)` as hex - use ONLY to compute/mix colors); helpers `ctx.fmt(v, kind)`, `ctx.esc(v)`, `ctx.num(v)`, `ctx.clamp(n, min, max)`, `ctx.safeColor(value, fallback)`.

Escaping is yours: data-derived text through `ctx.esc()`, author colors through `ctx.safeColor()` - the runtime does not auto-escape your marks. Opt out per concern with `responsive: false` (render once) or `themed: false` (no dark re-draw).

```js
const r = await graphit.resolve({ sql, dataSourceId: "ORDERS_DS", target: "#chart" });
graphit.graph("#chart", { type: "custom", draw: (ctx) => r.data.map(function (row, i) {
  var h = ctx.num(row.value) / 100 * ctx.height, x = (ctx.width / r.data.length) * i;
  return '<rect x="' + x + '" y="' + (ctx.height - h) + '" width="22" height="' + h +
    '" fill="' + ctx.color(i) + '"><title>' + ctx.esc(row.label) + '</title></rect>';
}).join("") });
```

## Saved templates

Templates are reusable chart components saved to the org's KB. At dashboard load, the SDK fetches the org's template bundle and registers them alongside built-in types.

**Usage:** `graphit.TEMPLATE_NAME(el, {data, value: 'revenue', label: 'Revenue'})` or via `graphit.graph(el, {type: 'TEMPLATE_NAME', ...})`.

Templates are org-specific - they exist only when users have saved them. The agent's context provider lists available templates each turn. Use `list_templates()` to discover them and `get_template(name)` to read the render code.

## Color tokens

Use theme CSS variables for all structural colors so charts adapt to light and dark mode. The full token table and usage rules live in `graphit-style.md` - that is the single source; do not re-list tokens here. Chart series colors come from the runtime palette automatically.

## Tooltips (hand-rolled and custom SVG)

Standard types and `type:'custom'` graphs get native browser tooltips from `<title>` children (escape the text with `ctx.esc()`). For a styled tooltip on hand-rolled SVG, add ONE shared tooltip div (`position:fixed; pointer-events:none; opacity:0`, themed with `var(--graphit-*)` tokens) and ALWAYS HTML-escape user data first:

```js
var tip = document.getElementById('tooltip');
function showTooltip(e, html) { tip.innerHTML = html; tip.style.opacity = '1';
  tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 260) + 'px';
  tip.style.top = (e.clientY - tip.offsetHeight - 8) + 'px'; }
function hideTooltip() { tip.style.opacity = '0'; }
```
