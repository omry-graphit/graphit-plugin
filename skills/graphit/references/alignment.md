# Contract Alignment: `dashboard check`

Load when checking a dashboard against the write contract without saving, pre-flighting an
edit, or running an alignment sweep across dashboards.

`graphit dashboard check <id>` runs the same judgment a save runs - the write-contract rules
plus the advisory validation - and persists nothing. Two modes:

- **Audit** (no flags): judges the stored page. Reports its standing warnings, and whether an
  edit that does not reduce existing debt would be refused.
- **Dry run** (`--file <path>` or `--stdin`): judges a proposed document against the stored
  one and reports the exact verdict a save would get, without burning a version.

Exit code 1 means a save would be refused. The response fields:

| Field | Meaning |
|---|---|
| `would_refuse` | A save in this state would be refused - fix `refusals` first |
| `refusals[]` | Each carries the rule, the refusal text, and a `next_step` naming the fix |
| `entity_sql_warnings[]` | The same advisories a save response carries - real problems that do not block |
| `switches` | Per-rule enforcement state. `false` = that rule does not refuse today - some such rules surface their findings as warnings, others report nothing at all while off. Fix whatever IS reported; it is cheapest before a rule starts refusing |
| `source` | Which document was judged: `published` or your active `draft` |

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

1. `graphit dashboard list`, then `check` each dashboard once. A 403 means view-only access -
   record it as skipped, not failed: check needs edit permission because its verdict describes
   a write.
2. Summarize per dashboard: refusals / warnings / clean - count what the tool reports, do not
   editorialize beyond it.
3. Fix in order: refusals, then warnings, one dashboard at a time - finish everything a
   dashboard needs in one pass so nobody has to touch it twice. Get approval per dashboard.
4. A page that is legal-but-legacy (inline queries with no declaration debt introduced) is a
   MIGRATION candidate, not a defect: offer `migration.md`'s path, and only walk it on an
   explicit yes.
