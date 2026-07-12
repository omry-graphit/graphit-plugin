# Explaining governance to the user

Load this when the user is confused about governance itself - asks what "governed" means, why a query was blocked or wanted a reason, what a trust tier or badge is, or how the whole system works. This is for EXPLAINING the system to a person in plain language; writing governed queries is governance.md. Relay it in your own words, tied to what the user actually hit - never paste it verbatim.

## The one idea

Governance means every number is computed the team's agreed way and carries an honest label of how trustworthy it is. It rests entirely on the knowledge base: metrics, dimensions, and rules are shared KB assets - one definition of each calculation and each guardrail, owned by the team. "Governed" is not a lock for its own sake; it is what lets one person's number be reused by everyone else without re-deriving it or second-guessing it.

## The two halves

**1. Enforcement, at query time.** When any query runs, the server checks it against the KB before executing. Rules attach constraints to a table (inject a required WHERE, mask a column, restrict values, require a filter or a GROUP BY) and apply automatically - the user never has to remember them. Every result is stamped with a trust tier, shown as a badge:

| Tier | Means | Badge |
|------|-------|-------|
| governed | Used `{{metric:X}}` / `{{dim:X}}` KB references | Teal |
| verified | Raw SQL whose math matches a KB definition | Amber |
| ad_hoc | Inline formula with no KB match | Gray |

Enforcement is server-side and identical on every channel (agent, CLI, dashboard, warehouse); it cannot be weakened from the CLI. The org's governance mode sets how hard rules bite: observe (log only), warn (warn but run), strict (block, override only if the rule and the user's role allow). If a query was blocked or asked for a justification, that is the ad-hoc gate: it used no KB reference and matched no definition, so Graphit wants you to either rewrite it with a metric or dimension (creating one if it is missing) or state honestly why a raw run is warranted. The reason is recorded in the audit log.

**2. Auditing, after the fact (Proactive Insights).** Separately, Graphit continuously scans everything the team built - KB definitions, dashboard graphs, the queries that actually ran - and turns each governance gap into a ranked Fix card routed to an owner. Three principles: a card shows only when Graphit is confident it is real (right or silent), one root cause is one card even if it spans many surfaces, and each is routed to an owner (the resource's owner, else its domain owner, else org admins). The ten card types:

| Card | What it flags |
|------|---------------|
| Govern next | The same ungoverned calculation runs in 2+ places |
| Unsealed dashboard | A dashboard uses definitions the KB does not govern |
| Verified, not wired | A verified definition is re-implemented as raw SQL |
| Unverified in use | Live graphs depend on a definition nobody verified |
| Stale reference | A graph is frozen on an old version of its definition (the only "Breaking" card) |
| Deprecated in use | A deprecated definition is still used by live graphs |
| Conflicting definitions | Two near-identical definitions disagree |
| Rule conflict | Two governance rules contradict each other |
| Unenforced rule | A rule that structurally cannot act on anything |
| Missing owner | Assets with nobody responsible for them |

Fix is a guided one-click resolution: it drafts and previews the exact change, you apply it (analyst seat, same validation as a manual edit), then Graphit re-checks and clears the card. This queue lives only in the **web app's Governance page** - the CLI cannot list or fix Insights cards (`governance status` and `governance audit` report mode and conformance only). When a user asks about a finding, explain what it means and point them to the Governance page to Fix it.

## Relaying it

Answer the person's real question first, in plain language ("your query was blocked because it invented a revenue formula instead of using the governed one"), then give the concrete next step: the governed rewrite, creating the missing asset, or the web Governance page for an Insights card. No jargon dumps, no internal names.
