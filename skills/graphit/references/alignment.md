# Contract Alignment: `dashboard check`

Load when checking a dashboard against the write contract without saving, pre-flighting an
edit, or running an alignment sweep across dashboards.

`graphit dashboard check <id>` runs the same judgment a save runs - the write-contract rules
plus the advisory validation - and persists nothing. Two modes:

- **Audit** (no flags): judges the stored page. Reports its standing warnings, and whether an
  edit that does not reduce existing debt would be refused.
- **Dry run** (`--file <path>` or `--stdin`): judges a proposed document against the stored
  one and reports the exact verdict a save would get, without burning a version.

Read the verdict from `would_refuse`, never from the exit code. Exit 1 covers three different
outcomes - a refusal, a dashboard you cannot edit, and an outright error - and they need
different answers. The response fields:

| Field | Meaning |
|---|---|
| `would_refuse` | A save in this state would be refused - fix `refusals` first |
| `refusals[]` | One problem document per rule: `rule`, `title`, the refusal text in `detail`, a `code`, and a `next_step` naming the fix |
| `entity_sql_warnings[]` | The same advisories a save response carries - real problems that do not block. Not all of them are about entity SQL: page-level findings such as undeclared state arrive here too, with `entity_id` and `label` empty. Count them; never filter them out on an empty `entity_id` |
| `switches` | Per-rule enforcement state. `false` = that rule does not refuse today - some such rules surface their findings as warnings, others report nothing at all while off. Fix whatever IS reported; it is cheapest before a rule starts refusing |
| `source` | Which document was judged: `published` or your active `draft` |

**A rule can be ON and still refuse nothing, and that is correct.** Every rule here is a
ratchet: it refuses what an edit INTRODUCES, and leaves what is already there alone. So
`switches` showing a rule enforcing, next to `would_refuse: false` on a page that visibly
violates it, is the grandfather clause working, not a bug. Say that plainly rather than
reporting it as a contradiction. The existing debt still keeps saving; what it cannot do is grow.

When a warning names a reference, load that reference before describing the fix. The warnings
carry their own pointers, and the fix detail lives there rather than here.

## The two scopes - which one you are in decides what you do

**After your own edit (validation).** The save response already carries these signals; run
`check` only when you need the full picture again. Scope: the DELTA. Fix what your edit
introduced before reporting done. Do NOT unfold the page's pre-existing debt into the
conversation - grandfathered shapes are legal, the ratchet only refuses growth, and unasked
migration advice on every edit is noise the user never requested.

**An explicit alignment request (audit).** The user asking IS the consent that migration
guidance otherwise requires. Report the full population: refusals first, then warnings grouped
by kind, then what each fix involves. OFFER the fixes - never apply one without approval, and
never rewrite a query's home (inline vs entity-owned) as a side effect of an unrelated fix.

## Pre-flight a big edit

Before `update-html` with a large or restructured page, run `check --file page.html` first. A
refusal caught here costs nothing; the same refusal at save time costs a round trip, and a
save that passes with warnings has already burned a version you may not have wanted.

## The sweep (align all dashboards)

Asked to align ONE dashboard, skip the list step and give that dashboard the same treatment:
its full report, then the offered fixes in the same order.

1. `graphit dashboard list`, then `check` each dashboard once, capturing stdout and stderr
   SEPARATELY. A judged dashboard puts one JSON document on stdout. A dashboard that could not
   be judged puts NOTHING on stdout and its reason on stderr, so reading stdout alone leaves
   you with an empty result and no idea why.
2. An empty stdout has two causes and they need different answers.
   `Custom dashboard not found` on an id the list just returned points at view-only access,
   not a missing dashboard: check needs edit permission because its verdict describes a write.
   Confirm it with `graphit dashboard get <id>`. If that succeeds and reports
   `canvas_authority: view_only`, record the dashboard as skipped. If `dashboard get` fails
   too, treat it as a genuine error, report it as one, and do not file it as view-only. The
   list's own `permission` column reads `owner` for the view-only ones as well, so it does not
   tell you which dashboards check can judge.
3. Summarize per dashboard: refusals / warnings / clean / skipped / errored - count what the
   tool reports, do not editorialize beyond it. A `validation_skipped` warning means the audit
   itself was cut short and that dashboard's warning count is a FLOOR: report it as partial
   rather than letting a truncated audit read as a complete one.
4. Fix in order: refusals, then warnings, one dashboard at a time - finish everything a
   dashboard needs in one pass so nobody has to touch it twice. Get approval per dashboard.
5. The sweep does NOT detect whether a page still writes its queries in the older inline
   format. No warning reports it, so a clean result says nothing either way: never raise it,
   and never offer to convert a query's home during a sweep.
