# The Canvas State Contract

Load when a save was REFUSED for undeclared state, or when you are adding declarations to a dashboard that already exists. Writing a new control from scratch needs only `filters.md`.

## Contents

What a Save Refuses | Declare Kind and Default Together | `graphit.filter()` as the Escape Hatch | Commit Point and Restore Order | Retrofitting an Existing Dashboard

## What a Save Refuses

Two shapes, both about state the platform cannot see without running your JavaScript:

| Refused | Shape |
|---------|-------|
| A new undeclared key | a literal `graphit.filter('k')` / `graphit.param('k')` / `graphit.dateRange('k')` in the HTML you save, with no `data-graphit-state="k"` wrapper anywhere |
| Interactivity with no state at all | the page wires change/click handlers AND calls `graphit.resolve()` / `graphit.bind()`, while declaring and registering nothing |

The refusal names the offending keys (or the control ids it could see) and ends with the fix, verbatim:

> Declare each control with data-graphit-state="&lt;key&gt;" on a wrapper element - see references/state-contract.md

Fix it by wrapping the control (`filters.md` has the attribute table) and saving again. Do NOT delete the `graphit.filter()` call to get past the gate - a declared key adopts the call, so wrapping the control makes both work together. `update-html` lists undeclared keys on stderr BEFORE it uploads, so the next save tells you locally whether the fix is complete.

**What is NOT refused**, so you can stop looking for these:

- Dashboards that already register at runtime. The rule stops the set of undeclared keys from GROWING; an existing violation keeps saving unrelated edits, and a partial fix always passes.
- Dynamic keys - `graphit.filter(someVariable)` or a template literal. A key the platform cannot read lexically is never gated.
- State a saved template registers. Template code is not in your stored HTML.
- Reading state: `graphit.state.get('k')` on a key someone else declared.

## Declare Kind and Default Together

A declaration ALWAYS wins over the `graphit.filter()`/`param()` call beside it. Two silent consequences follow, and together they ship a control that renders and never holds a value:

| You wrote | What runs | Result |
|-----------|-----------|--------|
| bare wrapper + `graphit.param('k', {default: 'roas'})` | kind `filter` (the wrapper's default), value `null` | the param is coerced to a filter AND your default is discarded |
| `kind="param"` wrapper, no `-state-default` + `{default: 'roas'}` | kind `param`, value `null` | your default is still discarded |

`null` then reaches your first read - `LOOKUP[param.get()]` throws, and one uncaught throw kills the whole script, so every chart spins forever.

So declare BOTH in markup whenever the call passes options:

```html
<div data-graphit-state="trend_kpi" data-graphit-state-kind="param"
     data-graphit-state-default='"roas"'></div>
```

Either repair is legal: put the kind and default in the markup, or drop the declaration's claim and let the call own the key. An explicit `kind="param"` alone does NOT fix a missing default.

## graphit.filter(id, options) as the Escape Hatch

The API keeps working, it is just no longer the default. Use it for keys you cannot write as markup: a key computed at runtime, or state a template registers.

```js
const country = graphit.filter('country', { label: 'Country', field: 'COUNTRY', default: 'US' })
const topN = graphit.param('top_n', { label: 'Top N', default: 10 })
```

Calling it on a key you already declared ADOPTS that key - same handle, same value, no second registration. So the migration path for an existing dashboard is additive: wrap the control, keep the call, ship. If the declared kind and the called kind disagree (`filter` in markup, `param` in JS), the declared kind wins and the console warns.

Handle API: `handle.get()`, `handle.set(value)` (triggers subscribers and bound re-resolves), `handle.subscribe(cb)` (fires immediately with the current value, then on every change; returns an unsubscribe fn).

## Commit Point and Restore Order

**Commit point.** Capture reads your registered handles, never the DOM. On a staged page (edit several controls, then press Apply), write to the handle only when the user commits - a control that writes on every keystroke saves a half-typed view. Mark the committed key with `data-graphit-state-commit="applied"` so a reader knows which key is the applied one; it is metadata, nothing branches on it.

**Restore order.** Applying a saved view sets ALL keys before anything refetches, so a dependent list never runs against a half-restored page. Cascades must MERGE with restored sibling values, not force-overwrite them.

## Retrofitting an Existing Dashboard

Inventory EVERY control before declaring any:

1. `graphit dashboard get <id>` reports `declared_state: {declared, runtime, dynamic}` - controls a saved view can capture, keys registered from literal script text, and registrations whose key is computed so the platform cannot name it. `declared: 0` with any `runtime` count is the whole diagnosis: nothing on the page is a declared control. `{0, 0, 4}` is the OPPOSITE diagnosis from `{0, 0, 0}` - four controls exist and none can be captured until they are declared.
2. `graphit dashboard get-html <id>` and read the whole page - hidden tabs, collapsed panels, and lazily-shown views included.
3. List each element a user can change: every `select`, `input`, `button` set, slider, date picker, and hand-rolled popover.
4. For each one, find its state key. A `graphit.filter('k')` call names it; a control with no call and no wrapper has no key at all and needs one.
5. Wrap each control, then save once. A clean `update-html` run - no undeclared-key warnings - is what says the inventory was complete.

Declaring only the controls you happened to be looking at is what produces a dashboard whose saved views half work - the failure users report as "my view didn't save", never as a missing filter. A dashboard with 16 controls and 7 declarations looks identical to a working one until someone saves a view.
