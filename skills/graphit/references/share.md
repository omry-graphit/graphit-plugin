<!-- Generated from skills/graphit-share/SKILL.md; edit the workflow skill, then run npm run sync:workflows. -->

# Share: checks at the shared write

Own shared permissions, dependencies, drafts and publication. For dashboard creation or content edits, load build.md too; references alone do not replace it. Reuse loaded workflows and choices. Reads remain Explore; audience words alone grant no sharing. "Just build it" changes narration, not authority or checks.

For "publish", inspect the dashboard state and follow dashboard-create.md's publication mapping; the word alone does not choose a CLI verb.

## Choose the shape and door

| Shape | Work |
|---|---|
| a. Share a private dashboard | Resolve its private dependency closure, then share and file the same dashboard ID. |
| b. Share definitions | Reuse or move the selected models/metrics into the agreed group; a bound source follows its model. |
| c. Schedule or deliver from a private source | Plan the source and bound model's move to a shared group before scheduling per scheduled-reports.md. The dashboard may stay private. |
| d. Author directly in a group | "Shared from the start": apply checks before each shared source/definition write. Build authors the new private dashboard; share it when complete. Keep the agreed scope. |
| e. Repository-owned work | Apply the same decisions through repo-kb.md's repository/PR workflow on a capable surface. An in-app ownership refusal is a handoff, not permission for a direct-write replacement. |

Use the **draft door** for shared dashboards and the **share plan** for private work. Preserve the current door when adding Build. Partner shares and readiness: partner-share.md.

## Shared-scope checks

Read kb-scope.md for effective permissions and exact placement, kb-discovery.md for staged reuse discovery, and semantic-authoring.md plus kb-actions.md for supported definitions, equivalence and validation. Resolve the audience, lowercase group and uppercase policy key from current `status` and returned `domain_keys`; carry forward choices already made. Read access is the ceiling for writes, and a status result is advisory, never a grant.

**KB-readiness gate:** before work goes live for others, confirm the required models, nested components, metrics, groups and rules exist, are valid and are readable in the intended scope. If a business measure is missing, present its gap and proposed governed definition for approval, then save and read back the approved prerequisites. An ad-hoc business measure can be unavailable to governed-only viewers; do not silently publish it as a reusable governed answer. Compare actual binding, grain, time dimension, aggregation, filters, units and policy, not just names or SQL. A same-named conflicting asset is not equivalent: explain the difference and resolve the consequential choice. A truly equivalent accessible asset should be reused.

Choose dashboard audience and folder through dashboard-create.md when sharing. Owners share their own; org admins/owners also any they can see. Org needs admin/owner; Team needs membership. When needed, explain Private/ORG/named scopes via kb-scope.md; keep dashboard audience separate.

Before any share or publish, inspect the dashboard for `data-graphit-placeholder` markers. Refuse while any remain and offer "wire it" through build.md. Do not remove markers simply to make sharing pass; real resolves must replace the placeholders.

## Draft door: already shared

Acquire the edit session with `dashboard edit` before content changes. Build authors and verifies in that same draft; apply the KB-readiness gate at publish, not after every chart. Query governance and private-dependency restrictions still apply in the draft. Any new shared definitions or sources use shape d and its create checks. Pre-flight with `dashboard check`: fix blockers, report warnings, then `dashboard publish` when authorized. Read back publication state before reporting live. A request to save a draft does not authorize publication.

Report 409 (another editor), 423 (locked) and 403 (view-only) with the returned next step. Preserve the same ID and draft. Do not duplicate, steal a session or discard edits to get past a refusal.

## Share plan: private to shared

1. Once audience, placement and content are settled, attempt `dashboard share` on the same ID. A success needs audience and placement readback; a private-dependency refusal supplies `blockers` and `remediation_options`. Read sharing-recovery.md. Respect `blockers_truncated` and uncertainty; the visible list is not proof of a complete closure when eligibility could not be verified. For shapes b/c without a dashboard, inspect the selected assets and their visible dependencies directly; do not invent a share-preview endpoint.
2. For each returned private dependency, choose **reuse**, **move**, or **create**. Reuse an accessible shared equivalent only after inspecting its full definition. Move an approved model or metric with `kb update semantic-model` or `kb update metric` and the target `group`, several in one ordered `kb batch`; the bound source's home follows its model, no command moves a source alone. Create only a genuinely missing, supported definition through `kb create`, never a copy to evade ownership or a refusal. Include naming collisions and visibility impact.
3. Present the whole plan as **one structured ask**: exact assets, reuse comparisons, moves/new definitions, affected audience, group, rules and destination. Carry forward existing authorization; ask for effects or consequential choices not yet approved. An authorization to share a dashboard alone does not silently authorize broadening every source's audience.
4. Apply the approved dependency order. Read each item's terminal receipt and re-read the resulting definition/binding before the next step. When reusing a shared asset, rewrite each `data-graphit-*` attribute naming the replaced asset through `dashboard update-html`, preserving unrelated content. Run the readiness checks on the resulting references and pre-flight the canvas. `dashboard check` is not proof of sharing eligibility.
5. Retry the original `dashboard share` with the agreed space/team and `--folder-path`. Verify the same ID's audience through `dashboard list` and placement through the destination folder listing. For definitions/source-only work, read back the exact group, binding and requested configuration instead of claiming a dashboard was shared.
6. On intermediate failure, report what applied, what remains and the returned next step. Preserve successful work. Reconcile uncertain writes by reading state before retrying; do not repeat a non-retryable operation unchanged, silently fall back to another folder, or create a replacement dashboard/source.

If the member lacks target write grants, say which requested changes are unavailable and where the work remains. They may keep building privately or share a dashboard based entirely on already-shareable assets if authorized. Provide the unapplied plan for a steward; do not claim it was sent or granted. Report success only for effects confirmed by receipts and readback.
