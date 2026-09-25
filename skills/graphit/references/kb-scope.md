# KB Scope

Load when deciding who may see or change semantic work.

## Two names, two purposes

- **Group name:** lowercase semantic placement, such as `finance`.
- **Policy domain key:** uppercase access key returned by status or `domain_keys`, such as `FINANCE`. Data-source `--domain` uses this key.

Never invent the key when the server returned it.

For private work, `status` reports `special_scopes.private_workspace` and its read/write capability, not the raw group key. Read the caller's visible scanner-created semantic model and reuse its exact lowercase `group` in KB create/update JSON. The display label `Private` and the data-source `--domain Private` alias are not KB group names; do not create a group for the synthetic private workspace or derive a suffix yourself.

## Explain the choice when needed

Use plain language when the user asks, confuses the labels, or needs the distinction to choose. Do not repeat a scope lecture or an answered question.

- **Private workspace:** only your work; other members, including admins, cannot see its private assets.
- **ORG commons:** reusable assets readable across the organization; write permission is still checked separately. This does not put a dashboard in the Org audience automatically.
- **Named groups/domains:** a group such as `finance` organizes semantic assets; its returned policy keys govern who may read or write. A name alone says neither who has access nor which team receives a dashboard. Explain the actual visible options and effective permissions, never guess from names or reveal concealed groups.
- **Dashboard audience:** Private means only you; Team means the selected team; Org means the organization. A personal listing or folder does not prove privacy; use the returned visibility. Audience is separate from source/model scope. Sharing the dashboard does not automatically grant access to, or move, its dependencies.

If someone says "public", establish the intended audience; never assume internet publication. Carry an agreed choice forward and explain only the consequences relevant to this action.

## Visibility

- Org commons is a synthetic shared scope.
- A private workspace is visible only to its owner; admins are concealed too.
- Hidden and missing assets are the same absence.
- Models and metrics inherit visibility from group placement.
- Group `access` is dbt metadata and does not grant Graphit access.
- Rules use server-owned target-derived domain keys.

## Writes

Read access is the ceiling. A user also needs `kb_write` for the affected key; group lifecycle is admin-only. Moving an asset requires authority over current and destination scopes.

For Explore scratch work and Private first Build, use the caller's private workspace and the scanner model's exact group above; do not ask audience or shared-placement questions. Explore authors no definitions; Build keeps a private metric only on request. Shared authoring, including Build paired with Share, follows Share: confirm audience, group, policy key, scope and write capability, reusing established choices. Never name concealed groups, assets, targets, or counts.

On create, an omitted or null `group` places a model or metric in org commons; on update, omitting it preserves placement and explicit null moves it to org commons. For private work, if no readable model supplies the exact group, stop before writing rather than guessing or falling back to org commons. Re-read the asset and confirm its returned group matches the approved scope.
