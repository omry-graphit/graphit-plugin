# Explaining Governance

Load when the user asks what governed means, why a query changed, or why it was blocked.

## The idea

The semantic layer defines a business concept. Governance decides how that definition may be queried for this user and context.

## What happens

1. Graphit resolves `Metric`, qualified `Dimension`, and its `Measure` extension.
2. It finds rules through model, entity, dimension, metric, and group targets.
3. Saved rule constraints are injected before execution.
4. Resolved SQL is verified fail-closed.
5. The transparency receipt records what changed and why.

A user may not see concealed targets, but still receives a generic safe refusal when access cannot be proven.

## Rule states

A rule takes effect when saved; there is no draft or verify step.

- Constrained: enforced according to its mode.
- Advisory (no constraints): guidance; nothing is injected.
- Protected-column masks: never overridable.
- EXPLORE: bounded override where policy permits; the receipt lists the rule as overridden.

Deleting a rule or clearing its constraints (it stays as advisory guidance) stops enforcement; do it only when the user explicitly asks to change the rule, never to get a refused query through. Receipts show rule values as `?`; read the rule with `graphit kb get rule <name>` to see them.

## Relaying it

State the result first, then tier and receipt facts. Name only visible rules. Never invent hidden names or quote raw compiler errors. If blocked, give the server-provided next step. If ad hoc, say so and offer a governed rewrite or supported definition.
