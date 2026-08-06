# The Canvas State Contract

Load when a save was REFUSED for undeclared state, or when you are adding declarations to a dashboard that already exists. Writing a new control from scratch needs only `filters.md`.

## Contents

What a Save Refuses | `graphit.filter()` as the Escape Hatch | Retrofitting an Existing Dashboard

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

## graphit.filter(id, options) as the Escape Hatch

The API keeps working, it is just no longer the default. Use it for keys you cannot write as markup: a key computed at runtime, or state a template registers.

```js
const country = graphit.filter('country', { label: 'Country', field: 'COUNTRY', default: 'US' })
const topN = graphit.param('top_n', { label: 'Top N', default: 10 })
```

Calling it on a key you already declared ADOPTS that key - same handle, same value, no second registration. So the migration path for an existing dashboard is additive: wrap the control, keep the call, ship. If the declared kind and the called kind disagree (`filter` in markup, `param` in JS), the declared kind wins and the console warns.

Handle API: `handle.get()`, `handle.set(value)` (triggers subscribers and bound re-resolves), `handle.subscribe(cb)` (fires immediately with the current value, then on every change; returns an unsubscribe fn).

## Retrofitting an Existing Dashboard

Inventory EVERY control before declaring any:

1. `graphit dashboard get <id>` reports `declared_state: {declared, runtime}` - how many controls a saved view can capture, and how many keys the page registers from script. `declared: 0` with any `runtime` count is the whole diagnosis: nothing on the page is a declared control.
2. `graphit dashboard get-html <id>` and read the whole page - hidden tabs, collapsed panels, and lazily-shown views included.
3. List each element a user can change: every `select`, `input`, `button` set, slider, date picker, and hand-rolled popover.
4. For each one, find its state key. A `graphit.filter('k')` call names it; a control with no call and no wrapper has no key at all and needs one.
5. Wrap each control, then save once. A clean `update-html` run - no undeclared-key warnings - is what says the inventory was complete.

Declaring only the controls you happened to be looking at is what produces a dashboard whose saved views half work - the failure users report as "my view didn't save", never as a missing filter. A dashboard with 16 controls and 7 declarations looks identical to a working one until someone saves a view.
