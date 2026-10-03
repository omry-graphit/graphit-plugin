<!-- Generated from skills/graphit-build/SKILL.md; edit the workflow skill, then run npm run sync:workflows. -->

# Build: author and verify content

Load for every new dashboard or dashboard-content edit, private or shared, plus private sources, reports and saved metrics. Reading canvas references alone does not replace this workflow. An explicitly private report for a team remains private.

Build owns planning, reuse, content/query authoring, iteration and verification. share.md owns shared permissions, dependencies, draft sessions and publication. For shared authoring, load Share too unless already loaded; it establishes the approved scope or editable draft before any shared write. Adding a workflow never repeats startup or the opening choice, grants permission, changes placement, or creates another dashboard.

## Start with what exists

Carry forward the opening choice and current target. Before a new artifact, make one focused search for fitting accessible assets; read promising definitions in full and say what you can reuse in one line. Reuse shared assets read-only. If a real dashboard overlap leaves extend-versus-new unresolved, resolve that choice; an already supplied choice needs no repeat question. Existing dashboards and sources are edited in place, not recreated as `_v2`, `_copy` or `_shared`.

Preserve the current dashboard ID and edit context. Create a new dashboard privately in My Dashboards; edit an existing shared dashboard only in the draft Share opened. Keep the upfront Private first / Shared from the start choice; do not ask it again or silently reset it to private. Follow dashboard-create.md for creation mechanics and same-ID recovery; Share resolves any still-missing shared audience and destination. Read dashboard-planning.md for analytical and layout decisions, graphit-style.md for presentation, and runtime.md for live data, entities and rendering. Apply their semantic correctness requirements; ask only about an unresolved consequential choice, not routine private placement.

## Data first, unless a layout preview was requested

Use a fitting cached source first and state the chosen source. If none exists, Private first follows data-sources.md to create a source with `--domain Private`; Shared from the start follows Share's approved source/definition plan and checks before those writes. For scratch work, choose a `scratch_` name, aggregate to the chart grain, and cap the time window; state the window in the dashboard subtitle and disclose row/cost bounds. Follow data-sources.md: a clean scan plus publication activates the source automatically. Read the completed readiness and PII verdicts; do not add a verify step to a successful create.

The scan's bound semantic model supplies the semantic layer. Use its measures and dimensions, fitting existing metrics, and explicitly labeled ad-hoc SQL where needed; governance.md and sql-reference.md own query permissions and receipts. For private work, do not create a metric unless the user asks to keep it. Then read semantic-authoring.md and kb-scope.md: use the scanner model's exact private group and source binding, preserve siblings, and verify the result. A request to keep an already agreed definition authorizes that work; resolve only a new ambiguity in its meaning. No visible private group means stop before a private write, never omit the group and land in org commons. Shared definitions follow Share's agreed group and readiness checks; loading Build does not replace them.

Compute every displayed number that combines raw rows - a count, sum, distinct count, average, rate or min/max - in the entity's query (a fitting metric, a measure under its own `agg`, or labeled ad-hoc SQL) or, for controls, `graphit.cascade`/`dataBounds`/`rank`. Never count, sum, average or bucket raw rows in page script: the number then has no definition, governance or details-panel provenance. Script formats, lays out, scales, sorts and picks among returned values; it may add returned sums or counts and divide one by another per runtime.md, never re-aggregate a distinct count, average or ratio. A row-level log or list may resolve raw rows.

Change coverage, filters, columns or joins for the same source purpose with `ds edit-sql`; follow its drift response. A new name is not a repair for a failed edit. Update an uploaded file source in place with `graphit ds re-upload <id> --file <path>` (in the app, the person uses Re-upload file in the Sources Hub); never re-create it.

When no source exists and the user asks for a sketch, mockup, wireframe or layout first, build a **layout preview** instead. Ask about this fork only when genuinely ambiguous; data first is the default.

- Keep the preview private. Mark every sample card with `data-graphit-placeholder="true"` instead of a query or source binding. Use static illustrative markup, not fake executable SQL or fabricated source IDs.
- Use obviously synthetic values and one visible banner: "Layout preview: all numbers are placeholders." This is a layout deliverable, not an analytical result.
- Do not quote placeholder values as business facts or infer a trend from them. If asked for an analytical conclusion, explain that real data must be wired first.
- "Wire it" returns to the scratch-source path: replace each placeholder with a real resolve and the full entity attributes from runtime.md, verify the results, then remove its marker. Keep the same dashboard ID. Remove the banner only after every placeholder has been replaced and verified.
- Share refuses while any placeholder marker remains; an attractive preview is not ready to share.

## Finish the requested work

Build and show sections as they become useful; continue authorized work without an approval round per chart. Check the canvas, fix `entity_sql_warnings`, and verify rendering and real resolves before calling a data-backed dashboard complete. For a preview, verify layout and marker coverage and report it specifically as a preview.

Without Share's established shared scope/draft, Build writes only privately. Shared authoring stays within that authorization; Share retains checks before shared dependency writes and publication. Private sources refresh manually, in full. A schedule or Slack/email delivery request needs Share for the source and its bound model; explain that and offer it if not already requested, then schedule through scheduled-reports.md. The dashboard may remain private. A private report or export alone does not imply scheduled delivery or a visibility change.

For Private first, end with the private link, verification and limitations, plus one offer to share; an offer grants no permission. When sharing/publication is already requested, continue the same artifact through Share's remaining checks and report its actual outcome. Do not repeat an answered choice; obtain approval for additional effects when required. A draft-only request stays a draft.

After completing a dashboard, or when the user asks for something recurring ("every Monday", "a weekly update", "send this to the team"), offer once per session to schedule it as a report; create one only after an explicit yes.
