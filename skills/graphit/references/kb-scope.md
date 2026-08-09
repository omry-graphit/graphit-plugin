# KB Scope: Who Will See It

Consult BEFORE creating or moving any KB asset, and whenever the user asks who can see something. A domain is not only a filing shelf, it is the access boundary, so choosing one is choosing an audience - and the choice is not freely reversible.

| Scope | Who reads it | Use it for |
|---|---|---|
| The org commons | Everyone in the organization. It always exists, cannot be deleted, and is where an org-wide asset belongs | Definitions the whole company shares, and anything with no narrower home |
| A shared business domain | Whoever has been granted it. `graphit status` shows the caller's own access, advisory only - the server decides | The normal case: work a team owns and reuses |
| A private space | Its owner alone. Invisible to everyone else, admins included, and shown simply as "Private" | Scratch work, or data someone is not ready to share |

**Settle the scope with the user before creating anything.** Ask which of these the work belongs in rather than inferring it, and say plainly what the choice means: work put in a private space will not appear for their team at all. Default to a shared domain (or the commons) for anything the team should be able to use.

If a create or update response carries a `visibility` notice, the asset landed where only its author can read it. Relay the notice, and if the user meant the work for their team, treat that as the moment to fix the scope - not a detail to skip past.

**It is not freely reversible**, which is why the question comes first:

- An asset whose DEFINITION reads a private table (a metric's dependencies, a synonym's canonical target, a relationship's tables, or a table's own home) is readable by its author alone. That is by design, and it stays that way.
- Redefining an ALREADY-SHARED asset onto a private table is refused, because it would remove a working asset from the team without telling them. Copy it into the private space instead and change the copy.
- ATTACHING a private table to a shared asset as a placement (a secondary table, a rule target, an extra domain) is fully supported: the asset stays shared and usable, and nobody else sees the private reference. This is the safe way to enrich a team asset with something personal.

**When a delete is refused over someone's private dependency.** Deleting a shared asset can be blocked because another member's PRIVATE asset depends on it. The refusal names the owners to go ask - never their assets - and that attribution is the point: relay who is named and suggest asking them first. `--force` on `kb delete` proceeds anyway (it is offered only when every hidden blocker has a named owner), and every named owner is notified of what was deleted, by whom, and what of theirs broke. Treat `--force` as the user's deliberate escalation: never add it on your own to get past a refusal.

Never read a private space's stored name aloud or invent one. Refer to it as the user's private space. To target it in a command, pass `--domain Private` - the alias always resolves to the caller's OWN space, so no spelling of it can reach anyone else's.
