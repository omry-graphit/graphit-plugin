<!-- Generated from skills/graphit-explore/SKILL.md; edit the workflow skill, then run npm run sync:workflows. -->

# Explore: answer the question

Load for a question, explanation or diagnosis, including a read of a shared dashboard. Explore does not authorize sharing or semantic authoring. Read only the definitions and context needed for this question; follow the current request when an earlier turn used Build or Share.

## Find the answer

1. Establish the requested meaning, period, grain, filters and units from the request and accessible definitions. Use a fitting governed metric when one answers the question. Inspect candidates in full; a matching name alone is not equivalence. Ask only if unresolved meaning would change the answer.
2. Prefer an existing shared cached source, then the caller's own private cached source. Read the binding instead of guessing from names. State the selected source in one line so the user can redirect; no source-selection interview when the evidence is sufficient.
3. If neither holds the needed data, propose a private scratch source through data-sources.md: `--domain Private`, a `scratch_` name, only the columns and rows needed, aggregated to the question's grain with a capped time window. Estimate its build time as that reference describes, then ask once before creating: offer the source with its row bound, estimated time and the basis for it, and, where it fits, a bounded live warehouse query instead. Say a time or cost is unknown rather than guess. Live warehouse access always needs this confirmation. Do not ask again about a source the user already approved in this conversation. After approval, start the build without waiting on it and keep exploring with what is already available; label a partial result as partial, and check the source with `graphit ds status <id>` before querying it. Never start a second source for the same question while one is building. An empty cached result alone is not permission to switch to live queries.
4. Read governance.md and sql-reference.md for executable references, validation and receipts. Use labeled ad-hoc SQL only when the governed definitions do not fit. On a shared source give a truthful, specific reason; the current server's EXPLORE and reason requirements still apply on private sources too. A refusal is not permission to bypass a rule. Explain it using governance-explained.md when needed.
5. If a same-named shared metric means something different, show both definitions and observed numbers, with source, grain, filters and units. Do not silently substitute one. If a number cannot be obtained, state the limitation instead of inventing a comparison. Diagnose from evidence and distinguish correlation from a supported causal claim.

## Deliver and stop

Return the answer in chat, a compact table when useful, the receipt's trust tier and material limitations. A complete answer needs no dashboard. When a chart is requested, use the surface's query-chart affordance where available; a saved chart is a private scratch dashboard in My Dashboards, stated in one line, with the canvas contracts in runtime.md. Do not turn a question into an unrequested finished dashboard.

Explore creates no metrics, dimensions, rules or groups, changes no existing asset, and shares nothing. Its only scratch writes are the private source and requested scratch dashboard above. "Keep this as a metric" changes the next action to Build; an explicitly shared definition belongs to Share. Reusing an accessible shared definition is a read, not a grant to change it.

At the end offer once: "Keep this as a metric or a dashboard?" If scratch was created, include an offer to delete it. An offer does not authorize deletion; run `graphit ds delete <id> --yes` for that own-private scratch source only after the user chooses deletion, following data-sources.md. Carry the same scratch IDs forward instead of creating versions.
