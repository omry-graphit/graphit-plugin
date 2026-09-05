# KB Scope

Load when deciding who may see or change semantic work.

## Two names, two purposes

- **Group name:** lowercase semantic placement, such as `finance`.
- **Policy domain key:** uppercase access key returned by status or `domain_keys`, such as `FINANCE`. Data-source `--domain` uses this key.

Never invent the key when the server returned it.

For private work, `status` reports `special_scopes.private_workspace` and its read/write capability, not the raw group key. Read the caller's visible scanner-created semantic model and reuse its exact lowercase `group` in KB create/update JSON. The display label `Private` and the data-source `--domain Private` alias are not KB group names; do not create a group for the synthetic private workspace or derive a suffix yourself.

## Visibility

- Org commons is a synthetic shared scope.
- A private workspace is visible only to its owner; admins are concealed too.
- Hidden and missing assets are the same absence.
- Models and metrics inherit visibility from group placement.
- Group `access` is dbt metadata and does not grant Graphit access.
- Rules use server-owned target-derived domain keys.

## Writes

Read access is the ceiling. A user also needs `kb_write` for the affected key; group lifecycle is admin-only. Moving an asset requires authority over current and destination scopes.

Before authoring confirm audience, group, policy key, shared/private scope, and write capability. Never name concealed groups, assets, targets, or counts.

On create, an omitted or null `group` places a model or metric in org commons; on update, omitting it preserves placement and explicit null moves it to org commons. For private work, if no readable model supplies the exact group, stop before writing rather than guessing or falling back to org commons. Re-read the asset and confirm its returned group matches the approved scope.
