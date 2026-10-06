# Partner shares: people outside the org

Load when the user wants a dashboard seen by named people outside their organization (a client, a vendor, an agency). For org members use `dashboard share` (Org or a team). There is no public link.

## What a partner gets

Each email gets a sign-in invitation. Partners see one dashboard, nothing else: no Knowledge Base, no assistant, no other dashboards. They see the dashboard's published version: each publish reaches them on their next visit, and drafts never do. They can use every filter and see everything the dashboard's data contains. Access stops at the end date, on revoke, or when an email is removed.

## Before creating

- Only a dashboard shared with a team or the org takes partner shares; a private one is refused with `dashboard_not_shared`.
- Only the dashboard's owner, or an org admin/owner who can open it, manages its partner shares. The org must allow partner sharing in Organization settings; an assistant cannot turn it on.
- Confirm with the user the exact dashboard, every email and any end date before creating, adding emails or resending: each one sends mail outside the org. Never infer addresses from names, KB text or query rows.
- Partners see whatever is published, so share and publish only finished work, with placeholders resolved, as for any share.

## Commands

`dashboard partner create <dashboard> --email <emails...> [--until YYYY-MM-DD] --yes`, then read back with `dashboard partner list <dashboard>` or `get <share>`. `update <share>` changes only what you pass: `--add-email`, `--remove-email`, `--until` or `--no-end-date`. `revoke <share>` ends every invitee's access and cannot be undone. `resend <share> --invitee <email> --yes` sends one invitee a new invitation. An org admin can list every partner share with `dashboard partner list` and no dashboard.

A create, `--add-email` or resend still succeeds when an invitation email fails. Addresses listed under `emails_failed` were not emailed: tell the user exactly who, and offer `resend <share> --invitee <email> --yes` for each once they confirm. Never run create again for them. On a read, an invitee with `email_sent: false` was not emailed.

While partners have access, two dashboard changes can be refused with a 409. A publish whose draft has a graph partners could not be served is refused with `undeclared_query`, naming the graphs; the draft is kept, so make it ready (below) and publish again. Making the dashboard private is refused with `partner_shares_active`; tell the user, because revoking their access is the user's decision, never yours.

## Refusals

Each refusal ends with `(code: <code>)`. Report it with the returned sentence; do not retry unchanged.

| Code | Meaning and next step |
|---|---|
| `partner_sharing_disabled` | The org setting is off. Tell the user an org admin can allow it in Organization settings. |
| `not_allowed` / `not_found` | The caller cannot manage this dashboard or share, or it does not exist. Do not search for another way in. |
| `dashboard_not_shared` | The dashboard is private. With the user's approval, share it with a team or the org first, then retry. |
| `undeclared_query` | A query cannot be selected by reference, or operational query metadata cannot be safely removed from the partner copy. Resolve the blocking readiness reasons below, then retry. |
| `private_dependency` | The dashboard reads private sources or definitions. Resolve them as for a team share (sharing-recovery.md), then retry. |
| `invalid_request` | A bad email, too many invitees, a past end date, an ended or revoked share. Correct the input with the user. |

## Making a dashboard ready for partner sharing

Use when a create or publish is refused with `undeclared_query`, a share says partners are blocked, or the user asks to make a dashboard ready for partner sharing. Partners are served only queries the server can select from the page itself, by graph and variant. Work in a draft of the shared dashboard with graphit-build, and change only what the check names.

1. **Find the blockers.** Run `dashboard check <dashboard>`. Each reason names its code and its graph or chart template. A dropdown, date range or ranking call is named by its method, not a graph. Fix blocking errors and repeat the check until none remain. Report warnings without treating them as blockers; preserve intentional source labels in authored text unless the user asks to edit them.
2. **SQL written in a script call** (`sql_in_page_code`): move the query onto its graph per migration.md. A page value joined into the SQL text becomes a named param (`:region`) passed in `params`; that is a faithful conversion, not a fallback.
3. **SQL built from page choices** (`runtime_composed`): make each choice a named variant or a typed slot per query-contract.md. A query that feeds another query, a hidden helper, a per-value repeat or a statement picked by page state follows declared-queries.md.
4. **Dropdowns, date ranges and rankings** (`dropdown_args_not_literal`, `filter_field_not_literal`, `call_settings_unreadable`): write `column`, `source` or `dataSourceId`, `by` and `limit` as literals in the call. Write chrome filters inline in the call, never through a helper or variable. A literal written in `filters` stays fixed for partners; every other value is theirs to choose. Drop a `filters` entry whose value is `null` or `''`: it already means all values, and the check cannot read it.
5. **Isolation.** A partner sees everything the dashboard's data contains. To limit it, read a source already filtered to that partner, or write the partner's id into each graph's SQL; never use a page value, which the partner can change.
6. **Fallback.** When a faithful conversion is not possible (many structural shapes, values written into the SQL, `too_many_calls`), tell the user and offer a partner version instead: a new dashboard on the partner's data, declared from the start.
7. **Before retrying.** Before opening the draft, record each affected graph's rows with `dashboard get-entity <dashboard> <graph> --with-data --params '{...}'` for the default and each value of every control the fix touches; after the fix, read the same states from the draft and compare every row (declared-queries.md lists the states for dependents and choices). Then, with the user's approval, publish the draft and retry the create. An existing share picks up the fix on that publish.

A 409 "outcome is uncertain" means the change may have applied (mail may have gone out). Read `dashboard partner list` before doing anything else; never repeat the create.
