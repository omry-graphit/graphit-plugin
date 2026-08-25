# KB Scope

Load when deciding who may see or change semantic work.

## Two names, two purposes

- **Group name:** lowercase semantic placement, such as `finance`.
- **Policy domain key:** uppercase access key returned by status or `domain_keys`, such as `FINANCE`. Data-source `--domain` uses this key.

Never invent the key when the server returned it.

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
