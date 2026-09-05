# Repository-Owned Knowledge Base

Load when: `graphit kb repo show` reports `ownership_mode: manual` or `migrating`, a
`.graphit/` tree exists, a shared KB or Data Source change was refused as repository-owned,
or the user asks to set up, verify or sync the repository. A `managed` org never loads this.

## Contract

`.graphit/` is committed source: `kb/` (dbt models, semantic models, metrics, groups),
`rules/`, `documented/`, `datasources/{name}.ds.yml` + `{name}.sql`, `provenance/*.json`.
Authoring shapes, naming and evidence rules live in `repo-preparation.md`; the tree the
server reads is the KB_ACCESS "Repo Sync Lifecycle" contract. SQL, contract and existence
changes are PRs. Never write to the live KB around the repository, never merge, never apply.

## Which org, which path

Run `graphit kb repo show` first.

- `managed`: this reference does not apply. Use the ordinary KB and Data Source verbs.
- `manual` with a bound repository: the procedures below.
- `manual` with no binding: initialize. Scaffold `.graphit/` per `repo-preparation.md`,
  run `graphit kb repo verify --path . --allow-dirty` (a `local_only` plan, never
  applyable; an uncommitted `.graphit/` is refused without the flag), fix findings until
  the verdict passes, commit on a branch, open the PR with the user's own tooling. Then tell an org admin to bind (`graphit kb repo bind --connection <id>
  --repo <owner/name> --branch main`), link reviewers (`kb repo link-identity`) and mint
  the CI tokens (below). Those are admin actions you never run yourself.

## A Data Source through a PR

1. Write `.graphit/datasources/{name}.ds.yml` (name, connection, grain, refresh contract)
   and `{name}.sql` (complete executable SQL in the warehouse dialect). Name the semantic
   model after its source so the model binds to it when the apply lands.
2. `graphit kb repo verify --path . --allow-dirty` and read the plan.
3. Branch, commit, open the PR with the user's tooling and report the PR link. CI verifies
   the PR head and applies the merged commit; you never merge or apply.

A `.sql` change through a PR rebuilds the source with the same `ds_id`; a deleted file
tombstones it; removing a source something still references refuses at plan time
(`removal_referenced`).

## Both sides

A derived asset changes together with the source document it is derived from, or is
re-derived from it, and the provenance shard's `content_hash` is updated in the same PR.
`source_drift` (the doc changed, the asset did not) and `derived_without_source` (the asset
changed, the doc did not) refuse naming both; fix the pair. Update the hash alone only
after confirming the derived asset still holds.

## Reading a plan

Sections: identity and access (who approved, whether their write closure covers the plan),
provenance, validity, KB actions, Data Source rows (`create`, `update`, `tombstone`,
`noop`), dashboard impact. Verdict `pass` or `fail`. Exit 0 pass, 1 failed, 2 refused or
failing verdict, 3 stopped waiting (poll the operation id, do not resubmit).
`already_applied` is a warning: the commit precedes the last applied one.

## Reading a refusal

Typed `{code, message}`; read the code, never the prose.

| Code | Next step |
|---|---|
| `binding_incomplete`, `local_only`, `config_revision_moved` | bind first; apply reads the provider, not an upload; reload the binding and verify again |
| `plan_stale`, `tree_mismatch`, `action_digest_mismatch`, `plan_not_found`, `verdict_failed` | the plan no longer matches the org or the tree: verify again and apply the fresh plan |
| `apply_in_progress`, `migration_in_progress` | an apply or a migration holds the lease: wait, never cancel |
| `not_on_base_branch`, `not_descendant_of_last_import`, `pr_head_mismatch`, `pull_request_not_found`, `pull_request_list_unavailable` | wrong commit or PR: use the merged SHA on the bound branch |
| `approvals_unavailable`, `no_head_bound_approvals`, `identity_unlinked`, `identity_unverified`, `member_removed`, `approver_closure_uncovered`, `write_closure_uncovered` | a linked approver holding every written domain must approve the current head; an admin links identities |
| `certificate_not_applyable`, `migration_requires_plan`, `migration_requires_commit`, `migration_mode_invalid`, `approved_sha_missing`, `approved_sha_mismatch` | migration only: the pre-delete `--kind migration` verify is a certificate; after the delete a fresh `--kind migration` verify yields the plan for `apply --plan <id>`; the SHA must match `bind --approved-sha` |
| `token_invalid`, `token_revoked`, `token_scope`, `token_repo_mismatch` | CI token: mint a fresh one, use the right scope, mint for this repository |

## Refusals inside the app

In a manual org the in-app agent and UI refuse shared writes with "the Knowledge Base is
owned by repository {repo} on branch {branch}; shared Knowledge Base changes land through a
pull request, not a direct write". A Data Source refusal says "create it by adding", "change
its SQL in", "change its refresh contract in" or "remove it by deleting"
`datasources/{name}.sql` "and open a pull request". Private sandboxes and operational verbs
(refresh, rebuild, pause) stay direct. The fix is the file and a PR, never a workaround.

## Failures

Operation status `failed_retryable`: retry once, then report. `refused` or a `fail`
verdict: never retry; report the finding and its next step. Never route around a refusal.

## Truthful receipts

Report drafted, verified (local-only or provider), PR opened, merged and applied as
distinct states. Claim an apply only when you saw the operation reach terminal `succeeded`;
quote the operation id, the plan id and the verdict. Queued or timed out is not done.

## CI in one paragraph

Two jobs, two tokens, one pinned CLI version. The job exports the token as `GRAPHIT_TOKEN`
in its environment, never as a `--token` argument (argv is visible in process listings and
shell traces; `--token` is the interactive form). On the PR, with the `kb:verify` token:
`graphit kb repo verify --sha $HEAD --pr $PR` (verify and status only), a required check on
the bound branch. On merge, with the `kb:apply` token: `graphit kb repo apply --sha
$MERGED_SHA`, which re-verifies the merged commit (a squash changes the SHA) and applies.
Tokens: `graphit kb repo token mint --scope kb:verify|kb:apply` (admin, shown once, `gkb.`
prefix), `token list`, `token revoke <id>`. The token is CI's authority to call; the PR's
head-bound approvers still hold the write closure, and a token never stands in for them.
