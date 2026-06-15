# Graphit Visual Style

Consult when building the HTML dashboard. Covers design principles, the Graphit aesthetic, typography, color system, layout patterns, and all inline chart implementations.

## Design Principles

Graphit dashboards are clean, minimal, and data-forward:
- **Card on themed surface** - content cards on `var(--graphit-surface)` background
- **Generous whitespace** - 24px page padding, 16px card gaps, 24px card padding
- **Subtle depth** - `box-shadow: 0 1px 3px rgba(0,0,0,0.08)`, not heavy borders
- **Uppercase micro-labels** - 12px, 600 weight, `var(--graphit-fg-subtle)`, letter-spacing 0.05em for section headers
- **Data is hero** - numbers are large and bold; chrome is minimal and muted
- **Responsive** - grids collapse at 900px breakpoint

## Color Tokens

NEVER use hardcoded hex colors. Use CSS custom properties that automatically adapt to light/dark theme:

| Token | Usage |
|---|---|
| `var(--graphit-surface)` | Page background |
| `var(--graphit-surface-raised)` | Cards, panels |
| `var(--graphit-surface-sunken)` | Inset areas, wells |
| `var(--graphit-fg)` | Primary text |
| `var(--graphit-fg-muted)` | Secondary text |
| `var(--graphit-fg-subtle)` | Tertiary text, placeholders, labels |
| `var(--graphit-border)` | Default borders |
| `var(--graphit-border-strong)` | Emphasized borders |
| `var(--graphit-accent)` | Brand teal, primary action color |
| `var(--graphit-error)` | Error/danger text |
| `var(--graphit-success)` | Success indicators |
| `var(--graphit-warning)` | Warning indicators |
| `var(--graphit-highlight)` | Highlighted/selected backgrounds |

### Semantic Colors
- **Positive / good:** `var(--graphit-accent)` (teal) or `var(--graphit-success)`
- **Warning:** `var(--graphit-warning)`
- **Danger / bad:** `var(--graphit-error)`

### Custom Colors

When the user explicitly requests specific colors or a custom color theme, ask for both light and dark mode variants. Write explicit CSS with `.dark` class overrides so the dashboard adapts to both modes:

```css
.revenue-card { background: #001f3f; color: #ffffff; }
.dark .revenue-card { background: #0a3d6b; color: #e0e0e0; }
```

NEVER hardcode a structural color (background, color, border-color) without a `.dark` counterpart. Data/chart series colors (bar fills, line strokes) are exempt - they work in both modes.

### Multi-Series
Use `var(--graphit-accent)` as the primary series. For additional series, choose muted complementary colors that work on both light and dark backgrounds.

### Usage Rules
- Accent teal for primary bars, lines, and positive indicators
- Assign series colors consistently across charts sharing a dimension
- Financial variance: green = favorable, red = unfavorable (regardless of sign direction)

## Typography Scale

Use the system font stack everywhere: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`

| Element | Size | Weight | Color | Use |
|---|---|---|---|---|
| KPI number | 32px | 700 | `var(--graphit-fg)` | Primary metric value |
| Card title / section header | 12px | 600 | `var(--graphit-fg-subtle)` | Uppercase, letter-spaced |
| Body text / table cells | 14px | 400 | `var(--graphit-fg)` | Default content |
| Labels / subtitles | 13px | 500 | `var(--graphit-fg-subtle)` | Supporting text |
| Badges / deltas | 12px | 700 | contextual | Change indicators |
| Chart axis labels | 11px | 400 | `var(--graphit-fg-subtle)` | Axis ticks |

## Layout Patterns

### Page Structure
```html
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
         background:var(--graphit-surface); color:var(--graphit-fg); padding:24px; }
  .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
  .charts-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
  .full-width { grid-column:1/-1; }
  .card { background:var(--graphit-surface-raised); border-radius:12px; padding:24px;
          box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .card h3 { font-size:12px; font-weight:600; color:var(--graphit-fg-subtle); text-transform:uppercase;
             letter-spacing:0.05em; margin-bottom:16px; }
  @keyframes gh-spin{to{transform:rotate(360deg)}}
  .gh-loading { position:relative; min-height:120px; }
  .gh-loading-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
                        z-index:9998; backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
                        background:color-mix(in srgb,var(--graphit-surface-raised,#fff) 50%,transparent); border-radius:inherit; }
  .gh-loading-spin { animation:gh-spin .7s linear infinite; }
  @media(max-width:900px) {
    .kpi-grid { grid-template-columns:repeat(2,1fr); }
    .charts-grid { grid-template-columns:1fr; }
  }
</style>
```

### Dashboard Composition (top to bottom)
1. **Title row** - dashboard name, optional subtitle with date range
2. **KPI row** - 3-4 cards in a grid. Each: big number, label, delta badge
3. **Primary charts** - 2-column grid of detail visualizations
4. **Detail table** - full-width card at bottom for raw data exploration

### KPI Card
```html
<div class="card">
  <div style="font-size:32px;font-weight:700;line-height:1.2">$144,661</div>
  <div style="font-size:13px;color:var(--graphit-fg-subtle);margin-top:4px">Total Ad Spend</div>
  <div style="font-size:12px;margin-top:8px;font-weight:600;color:var(--graphit-accent)">+12% vs prior</div>
</div>
```

### Data Table
```html
<style>
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:12px; font-weight:600; color:var(--graphit-fg-subtle); text-transform:uppercase;
       letter-spacing:0.05em; padding:10px 16px; border-bottom:2px solid var(--graphit-border); }
  th:not(:first-child) { text-align:right; }
  td { padding:12px 16px; font-size:14px; border-bottom:1px solid var(--graphit-border); }
  td:not(:first-child) { text-align:right; }
  tr:hover td { background:var(--graphit-surface-sunken); }
  .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:700; }
  .badge-good { background:var(--graphit-highlight); color:var(--graphit-success); }
  .badge-warn { background:var(--graphit-highlight); color:var(--graphit-warning); }
  .badge-bad { background:var(--graphit-highlight); color:var(--graphit-error); }
</style>
```

### Loading State

Bake this overlay inside every element passed as `target:` to `graphit.resolve()` - and only those (static text/title cards would spin forever). It shows from the first paint, before the SDK connects; the SDK removes it when the resolve settles. Class names are the SDK contract - keep them exactly:

```html
<div id="spend-chart" class="gh-loading">
  <div class="gh-loading-overlay"><svg class="gh-loading-spin" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--graphit-border,#e5e5e5)" stroke-width="2.5"/><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--graphit-accent,#4DB6AC)" stroke-width="2.5" stroke-linecap="round"/></svg></div>
</div>
```

Never write "Loading..." text placeholders - they don't animate and make slow loads look stuck.

For inline chart implementations (bar, line, donut, heatmap, funnel, sparkline, gauge, stacked bar, multi-series), see `chart-patterns.md`.
