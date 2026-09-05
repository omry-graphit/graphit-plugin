# Chart Templates

**Load when:** reusing a chart across dashboards as a template, or expanding one on a host.

A template is a reusable HTML fragment saved to the org's Knowledge Base: markup plus its own `<script>` and `<style>`. A dashboard adopts it by naming it on a **host entity**; the canvas expands the fragment into the host when the page opens. Editing the template changes every adopting dashboard on its next open.

## The host owns the query

The host is an ordinary entity, authored empty, on a block container (`div`, `section`, `article`, `aside`, `main` or `figure`):

```html
<div data-graphit-id="rev-trend" data-graphit-label="Revenue trend"
     data-graphit-ds="UA_DS"
     data-graphit-sql="SELECT day, {{ Metric('revenue') }} AS revenue FROM UA_DS WHERE (:channel = 'ALL' OR channel = :channel) GROUP BY 1"
     data-graphit-vocab="metric:revenue"
     data-graphit-template="TREND_HEADLINE"
     data-graphit-params='{"label":"Revenue","format":"currency"}'></div>
```

Every query fact - id, label, SQL, data source, vocab, the `:params` the SQL binds - lives on the host, so pre-flight, the details panel, usage and governance see one ordinary entity. The fragment contributes presentation and behavior only. Anything already inside the host stays after the inserted content.

## What a fragment may carry

| Allowed | Refused at save and again at expansion |
|---|---|
| Markup, `<script>`, `<style>` | `data-graphit-id`, `-label`, `-sql`, `-ds`, `-vocab`, `-field`, `-kb`, any `data-graphit-state*` |
| `{{name}}` placeholders in markup text and attribute values | `html`, `head`, `body`, `template`, `noscript`, `iframe`, `plaintext`, `xmp`, `base`, `frameset`, `noembed`, `noframes` |
| A nested host (`data-graphit-template` on an inner element; chains stop at three) | `{{...}}` inside a nested host's `data-graphit-params` |

Placeholders are never substituted inside scripts or styles: a script reads its params instead. A template cannot declare state, so filter controls stay page markup (`filters.md`).

## Script rules

```html
<h3>{{label}}</h3><div class="v"></div>
<script>
  var host = document.currentScript.closest('[data-graphit-template]');
  var p = graphit._utils.templateParams(host);
  graphit.bind(host, { params: graphit._utils.hostParams(host), render: function (res) {
    host.querySelector('.v').textContent = graphit._utils.fmt(res.data[0].revenue, p.format);
  }});
</script>
```

- Find the host through `document.currentScript`; query with `host.querySelector`, never `getElementById`. Two instances of one template must not share ids or global names.
- A filtered card binds through the host: `hostParams(host)` reads the host SQL's `:names` and serves them from dashboard state, so the fragment works on any dashboard that declares those keys. A static card calls `graphit.resolve({target: host})`.
- Read params with `templateParams(host)`; a missing param falls back to its schema default. Format, escape and color with `graphit._utils.fmt`, `esc` and `color`; `graphit._utils.tip.show(text, x, y)` and `tip.hide()` are the shared tooltip.
- A page script that runs at parse time cannot see template content; only a `DOMContentLoaded` listener can. The kebab, trust dot and details panel belong to the host - markup a template inserts is never its own entity.

## Params

`params_schema` declares what a host may pass: `{"label": {"type": "string", "required": true, "default": "Revenue", "description": "Card title"}}`. Values are strings, numbers or booleans and names are identifiers; an unknown name substitutes to empty.

## Commands

| Command | Does |
|---|---|
| `graphit kb template list` | Names, descriptions and params - not the HTML |
| `graphit kb template get NAME` | The fragment exactly as it expands everywhere |
| `graphit kb template create --name NAME --file card.html --description "..." --params '{...}'` | Create; `--file` is CLI-only |
| `graphit kb template update NAME --file card.html` | Replace the fragment; adopters change on next open |
| `graphit kb template delete NAME --yes` | Delete; adopting hosts render a missing marker |

In-app agents pass the fragment through `--json '{"html": "...", "description": "...", "params_schema": {...}}'`. Read a template in full before pushing one you did not write this session: its script runs for everyone who opens an adopting dashboard.

## Live update and copies

An edit reaches every adopting dashboard when it is next opened; nothing is re-saved. "Copy entity HTML" of a host yields a frozen copy - the expanded markup, the script and a stamp that stops it expanding again - so a copy is a copy, not a live host.
