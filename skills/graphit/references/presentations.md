# Presentations

Build full-screen slide deck presentations inside Graphit canvas dashboards using `graphit.presentation()`.

## API

```js
var deck = graphit.presentation('#my-deck');

deck.slide({ bg: 'dark', layout: 'center', html: '<h1>Title</h1><p>Subtitle</p>' });
deck.slide({ bg: 'white', layout: 'split', html: '<div>Left panel</div><div>Right panel</div>' });
deck.slide({ bg: 'paper', layout: 'full', html: '<div id="charts">...</div>' });

var ctrl = deck.start();
// ctrl.go(3)  - jump to slide 4
// ctrl.total  - number of slides
```

`graphit.presentation(el)` returns a **builder**. Call `.slide()` to add slides (chainable), then `.start()` to render and wire navigation. `start()` returns a controller with `go(n)` and `total`.

## Slide Config

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `layout` | `'center'` / `'split'` / `'full'` | `'center'` | How content is arranged inside the slide |
| `bg` | `'paper'` / `'white'` / `'dark'` / `'teal'` / hex | `'paper'` | Fixed background color (not theme-aware) |
| `html` | `string` | `''` | Raw HTML content for the slide |

## Layouts

### `center` (default)
Content is centered horizontally and vertically. Use for title slides, quotes, big stats, CTAs.

### `split`
The first two child elements in `html` become left and right panels (50/50 flex). Use for text + image, comparison, side-by-side content. On mobile (<700px), panels stack vertically.

```js
deck.slide({
  layout: 'split',
  bg: 'white',
  html: '<div><h2>Left Title</h2><p>Text content</p></div><div><img src="data:..."></div>'
});
```

### `full`
Content flows top-to-bottom with generous padding. Use for tables, grids, live data dashboards, complex layouts that need the full slide width.

## Background Themes

Backgrounds are **fixed colors** - they do not change with the app's light/dark mode. A dark slide stays dark. Content inside CAN use `var(--graphit-*)` tokens.

| Name | Background | Text Color |
|------|-----------|------------|
| `paper` | `#F7F6F2` (warm cream) | `#222224` (charcoal) |
| `white` | `#FFFFFF` | `#222224` |
| `dark` | `#222224` (charcoal) | `#F7F6F2` (cream) |
| `teal` | `#4DB6AC` (brand teal) | `#FFFFFF` |
| hex string | Custom (e.g. `#1a1a2e`) | Inherited from content HTML |

## Navigation

The slide deck includes built-in navigation:
- **Arrow keys**: Left/Right to navigate (guarded - skips when focus is on input/textarea)
- **Spacebar**: Next slide
- **Home/End**: First/last slide
- **Prev/Next buttons**: Bottom-right corner with slide counter

## Live Data Inside Slides

`graphit.resolve()` and `graphit.chart/table/kpi` work inside slides. All resolve calls fire on page load (cached queries are fast). Charts render into their target elements regardless of which slide is visible.

```js
// Slide with live entities
deck.slide({
  layout: 'full',
  bg: 'white',
  html: `
    <h2>Live Data</h2>
    <div data-graphit-id="spend-chart" data-graphit-label="Ad Spend"
         data-graphit-sql="SELECT {{dim:MEDIA_SOURCE_DIMENSION}} AS source, {{metric:TOTAL_AD_SPEND}} AS spend FROM MARKETING_UA_DS GROUP BY 1 ORDER BY spend DESC LIMIT 6"
         data-graphit-ds="MARKETING_UA_DS">
      <div id="chart1" class="gh-loading">
        <div class="gh-loading-overlay"><svg class="gh-loading-spin" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#e5e5e5" stroke-width="2.5"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#4DB6AC" stroke-width="2.5" stroke-linecap="round"/></svg></div>
      </div>
    </div>
  `
});

// After deck.start(), fire resolve calls
deck.start();

graphit.resolve({
  sql: "SELECT MEDIA_SOURCE, SUM(APPSFLYER_COST) AS spend FROM MARKETING_UA_DS GROUP BY 1 ORDER BY spend DESC LIMIT 6",
  dataSourceId: "MARKETING_UA_DS",
  target: "#chart1"
}).then(function(r) {
  graphit.chart("#chart1", { type: "bar", data: r.data, x: "MEDIA_SOURCE", y: "spend", valueFormat: "currency" });
});
```

## Entity Wrapping

Every data element inside slides should have full `data-graphit-*` entity wrapping, same as regular dashboards. The entity provenance panel, @ mentions, and click-to-inspect all work inside slides.

## Example: Complete Pitch Deck

```js
var deck = graphit.presentation('#deck');

deck.slide({
  bg: 'paper',
  layout: 'center',
  html: '<h1 style="font-size:6rem;font-weight:300">Company Update</h1><p style="font-size:1.5rem;color:#6B7280;margin-top:16px">Q2 2026</p>'
});

deck.slide({
  bg: 'dark',
  layout: 'split',
  html: '<div style="color:#F7F6F2"><h2 style="font-size:3rem">The Problem</h2><p style="font-size:1.25rem;opacity:0.7;margin-top:16px">Analysts spend 80% of their time assembling dashboards instead of finding insights.</p></div><div style="display:flex;align-items:center;justify-content:center"><img src="data:image/webp;base64,..." style="max-height:60vh;border-radius:16px"></div>'
});

deck.slide({
  bg: 'white',
  layout: 'full',
  html: '<h2 style="font-size:2.5rem;margin-bottom:24px">Key Metrics</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">...</div>'
});

deck.slide({
  bg: 'teal',
  layout: 'center',
  html: '<h2 style="font-size:4rem;color:#fff">Thank You</h2><p style="font-size:1.25rem;color:rgba(255,255,255,0.7);margin-top:16px">company.com</p>'
});

deck.start();
```

## Anti-Patterns

- **Don't put too much content on one slide.** If it scrolls, split into multiple slides.
- **Don't use external fonts via @import or link.** The iframe CSP blocks them. Embed as base64 @font-face or use system fonts.
- **Don't use external images.** Use data URIs (base64) or inline SVG.
- **Don't nest presentations.** One `graphit.presentation()` per dashboard.
