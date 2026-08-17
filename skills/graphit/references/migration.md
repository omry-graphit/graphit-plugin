# Migrating a dashboard to entity-owned queries

Load when the user asks to move an existing dashboard's queries onto its entities, or what a
`legacy_query_source` save warning means. Not for authoring new dashboards: new work is canonical
from the start (references/runtime.md).

## What the old shape is

Older dashboards author the same query twice. The call carries it:

```js
graphit.resolve({ sql: "SELECT ... WHERE d >= :start", dataSourceId: "MARKETING_UA_DS",
  params: { start: pStart.get() }, sourceEntityId: "spend-trend" })
```

and the entity carries a copy in `data-graphit-sql` / `data-graphit-ds`. Both still work, and they
drift: only the call executes, only the attribute is inspected.

Canonical is the same query written once, on the entity, the call naming which entity to run:

```js
graphit.resolve({ sourceEntityId: "spend-trend", params: { start: pStart.get() } })
```

## Hard rules

**NEVER migrate a dashboard the user did not ask about.** This is opt-in. An unrelated edit never
rewires where a query lives, and "while I was in there" is not a reason.

**NEVER save a partial or unverified migration.** Half-moved is worse than not moved. If you cannot
finish and verify a query, put it back the way you found it.

**MUST leave the dashboard untouched when you cannot prove equivalence.** Stop, change nothing, and
name the exact branch you could not compare. That is a successful outcome, not a failure.

## Procedure

1. **Read everything first.** Get the full HTML and all its wiring before changing one call.
   Migrating call by call misses shared queries and conditional branches.
2. **Find the owner of each query.** One source entity owns it; any other entity rendered from the
   same result is a target. A query feeding three graphs still has exactly one owner.
3. **Lift the complete template onto the owner.** The whole statement in `data-graphit-sql`, the data
   source in `data-graphit-ds`. Complete means executable and parameterized:
   - Keep every `:named` placeholder. Do not bake current filter values in.
   - Keep `{{metric:NAME}}` / `{{dim:NAME}}` references as they are.
   - No ellipsis, no abbreviation, real table names, full WITH clause.
4. **Preserve the rest exactly.** `params`, `deps`, the `render` callback, any branch that picks
   different SQL, and `sourceEntityId` / `targetEntityIds` attribution all stay as they were.
   Migration moves where the query lives; it does not rewrite the query, wiring, or layout.
5. **Build the filter-state matrix.** The default state, plus every materially distinct non-default
   or conditional branch found in step 1. A branch that selects different SQL is its own state.
6. **Prove equivalence per state, on four signals.** For each state, compare before and after:

   | Signal | Where it comes from |
   |---|---|
   | Effective SQL | the details panel's Current query (the server's execution receipt) |
   | Bound parameter values | the same receipt |
   | Row count | the resolve result |
   | Hash of the complete result | hash all returned rows, not a sample |

   All four must match. Sample rows are a sanity check, never the proof. If a result is too large to
   hash completely, say so and treat that state as unverified.
7. **Remove the explicit values only after that state passes.** Delete `sql` and `dataSourceId` only
   once the entity owns the equivalent query and the comparison passed.
8. **Save a named version,** so the migration is one recoverable step in version history.

## Verifying

Read the entity back rather than trusting what you wrote:

```bash
graphit dashboard get-entity <dashboard-id> <entity-id>
```

Act on `entity_sql_warnings` before reporting success. A parameterized template keeps its `:name`
placeholders; save-time validation binds them before checking, so a warning is a real SQL problem,
not the placeholders.

## Promoting a composed query to entity-owned

The same move in the other direction, for a query that started runtime-composed (`runtimeComposed: true`
on the call, its vocabulary declared in `data-graphit-vocab` on the entity) and has since stabilized into
one statement. Everything above still applies - the hard rules, the four signals, the reasons to stop.

1. **Confirm it really is one statement now.** Read every branch that builds the SQL. If any input still
   changes the SELECT list, the FROM or the GROUP BY, it is not promotable, and the declaration is the
   correct permanent end state. Stop and say so.
2. **Lift the stabilized statement onto the entity** as `data-graphit-sql` / `data-graphit-ds`, keeping
   `:name` placeholders for everything the filters supply - never the values one run happened to use -
   and keeping every `{{metric:}}` / `{{dim:}}` token exactly as written. Those tokens are what carry
   lineage once the query lives on the entity; lift a raw-expression statement and step 4 strips the
   closure off an entity that references nothing.
3. **Prove equivalence on the four signals above,** per filter state, exactly as for a legacy migration.
4. **Only then strip the declaration,** in this order: delete `sql` and `dataSourceId` from the call,
   delete `runtimeComposed: true`, and last remove `data-graphit-vocab` from the entity. Keep
   `sourceEntityId`. The order is not cosmetic: a call that still carries `sql` + `dataSourceId` but
   has lost its marker reads as UNDECLARED inline SQL, which is the one shape a save refuses. Drop
   the pair first and the marker becomes inert; drop the marker first and you have introduced the
   defect. Remove the closure last, once the entity's own tokens are what lineage reads.
5. **Save a named version.**

Stop at any step and the closure stays. A declared composed query is a first-class end state, not debt.

## When to stop

Stop, save nothing, and report the branch when:

- SQL is composed by logic you cannot fully enumerate, so you cannot list every branch.
- A code path exists that you cannot reach or trigger, so you cannot compare it.
- A result is too large to hash completely.
- Any state's four signals do not all match.

Report which query, which branch, and which signal. The user can migrate the rest and leave that one
query on the old shape, which is a legitimate end state.
