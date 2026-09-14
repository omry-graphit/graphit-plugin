# Connect a Repository as the Knowledge Base Owner

Load when: the user wants a repository to own the shared Knowledge Base, or
`graphit kb repo show` reports `ownership_mode: manual` with `repo: null`, or a
binding exists and `last_imported_sha` is null. Skip it once `last_imported_sha`
is set: routine work follows repo-kb.md. Git providers: `github`, `bitbucket`;
the procedure is the same, the differences are in the last table.

## How to guide

One step at a time. Name the state the user is in, say in one or two plain
sentences what the step does and why it exists, say who runs it, do your part,
show the result, then the next step. For an admin step hand over exactly one
command and wait; never run `mode`, `bind`, `link-identity` or `token mint`
yourself, never touch a key or a token value, never merge or apply.

The split, when the user asks why so much is manual: an org admin's own login
establishes trust once (who owns the KB, which accounts count, which tokens may
act). CI then repeats the mechanical part forever: verify every pull request
head, apply every merged commit. CI cannot bind because its tokens are minted
for the binding, and a token authorizes calls, it never replaces a reviewer.

## Find the state

Read `graphit kb repo show`, `graphit connector list`, `graphit kb repo
identities`, `graphit kb repo token list` and the branch, then match the first
row that fits.

| State | You see | Next step | Who |
|---|---|---|---|
| 0 managed | `show`: `ownership_mode: managed` | empty shared KB: `graphit kb repo export-datasources --out .graphit/datasources`, commit, then `graphit kb repo mode manual`; `shared_kb_not_empty` means the protected migration: ask the Graphit team, never route around it | admin |
| 1 no warehouse | `connector list` has no warehouse entry | add it in the Sources Hub or `graphit connector add`; the key never passes through you | admin |
| 2 no definitions | `.graphit/` missing or empty | author it (repo-preparation.md), then `graphit kb repo verify --path . --allow-dirty` until it passes | you |
| 3 not bound | `show`: `repo: null` | `graphit kb repo bind --repo <owner/name> --branch <base>` | admin |
| 4 no pull request | tree committed, no PR | commit on a branch, push, open the PR with the user's tooling; ask for its number | you, user |
| 5 author unlinked | `verify --sha <head> --pr <n>` refuses `identity_unlinked`; `identities` shows `seen` | `graphit kb repo link-identity <provider> <account_id> <member-email>` | admin |
| 6 no CI tokens | `token list` empty, or CI says the token is not recognized | mint and store both tokens (below) | admin |
| 7 verified | provider verify: `pass`, `applyable: true` | approve and merge | user |
| 8 merged | the merge job runs `apply` | wait for it; `show` reports the merged sha as `last_imported_sha` | CI |

## What to say at each step

- State 2: with no warehouse connection a local verify passes without compiling
  the metrics. Report it as "pass, not compiled" and expect compile findings
  once state 1 is done. A local plan is never applyable; that is by design.
- State 2: a provenance shard's `content_hash` must equal the cited document's
  bytes at that commit, or verify refuses `source_drift`: fix the shard, never
  the document. `derived_without_source` cannot fire before the first import;
  there is no earlier apply to differ from.
- State 3: the connection resolves from the repository. On
  `connection_ambiguous` add `--connection <id>` from the `id` column of
  `graphit connector list`, never the token fingerprint on the Sources Hub card.
- State 5: the first provider verify refuses here on purpose: an account
  becomes linkable only after a verify has seen it. Any member may plan, so run
  `graphit kb repo verify --sha <head> --pr <n>` with the user's login before CI
  has tokens; `identities` then shows the author as `seen`. Use `account_id`
  from it (logins may contain spaces). `unlinked` means an admin unlinked that
  account; relink it by id. The linked author with KB write on every touched
  group is the whole authority; reviewers are the provider's own process.
- State 6: mint to the clipboard, never to the screen. Wrapped or quoted
  terminal output is why CI reports "the machine token is not recognized".

  ```bash
  graphit kb repo token mint --scope kb:verify | python3 -c "import sys,json; print(json.load(sys.stdin)['token'], end='')" | pbcopy
  ```

  `pbcopy` is macOS: `xclip -selection clipboard` on Linux, `clip` on Windows.
  Paste it as `GRAPHIT_VERIFY_TOKEN`, repeat with `kb:apply` for
  `GRAPHIT_APPLY_TOKEN`. Tokens never expire: one that reached a chat, a log or
  a wrapped paste is revoked (`graphit kb repo token revoke <id>`) and minted
  again. After the next run `token list` shows `last_used_at`; that is the
  proof CI used it. "must be a machine token" with an empty value means the
  variable is not visible to that job (see the provider table).
- Token refusals: `token_invalid`, `token_revoked`, `token_scope`,
  `token_repo_mismatch`: mint a fresh one, with the right scope, for this
  repository.
- State 7: Graphit checks the PR author, never the approvals; approving and
  merging follow the provider's own rules.

## CI: two jobs, two tokens, one pinned CLI

Export `GRAPHIT_TOKEN` from the secret in the job environment, never as
`--token` or in a shell trace. Run every job command through the pinned CLI,
`npx -y @graphit/cli@<version> kb repo ...` (or `npm install -g` that version once
per job). The PR job runs `kb repo verify --sha <head> --pr <number>` with the
`kb:verify` token and is the required check; the merge job on the base branch
runs `kb repo apply --sha <merged sha>` with `kb:apply` and re-verifies the
merged commit itself. Exit codes: 0 pass, 1 failed, 2 refused or failing
verdict, 3 stopped waiting (poll the operation id, do not resubmit).

| | github | bitbucket |
|---|---|---|
| pipeline file | `.github/workflows/*.yml`, jobs on `pull_request` and `push` to the base branch | `bitbucket-pipelines.yml`, `pull-requests:` and `branches: <base>:` steps |
| head, PR id, merged sha | `github.event.pull_request.head.sha`, `github.event.pull_request.number`, `github.sha` | `$BITBUCKET_COMMIT`, `$BITBUCKET_PR_ID`, `$BITBUCKET_COMMIT` on the base branch |
| where both secrets live | Settings > Secrets and variables > Actions, repository secrets | Repository settings > Pipelines > Repository variables, Secured; a deployment-environment variable reaches only a step that declares `deployment:` |
| approval | a review with Approve on the head commit | Approve on the PR page; self-approval is allowed |

## Receipts

Drafted, verified (local-only or provider), PR opened, merged and applied are
five different states; say which one is true. Applied means `graphit kb repo
show` reports the merged sha as `last_imported_sha`; a green pipeline is not
that. From then on repo-kb.md is the reference.
