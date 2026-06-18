# KB Structure (Plan)

This is the plan side of KB work: how the Knowledge Base is organized, so you can explain it and design what to build. The execute side - the actual `graphit kb` create / update / delete commands - lives in `kb-actions.md`. On a from-scratch KB build the two pair up: design the graph here, then run the commands there. On a normal build that reuses existing assets, you mostly read this to answer a structural question.

The KB is a labeled property graph: assets carry tags that place them in a tree, but the underlying structure is a graph with typed edges. Answer structural questions in business-friendly language, grounded in actual KB state (verify with `graphit kb get` / `graphit kb explore` when the question names a specific asset).

## Node Types

| Type | Description |
|------|-------------|
| metric | Aggregation formula (SUM, COUNT, AVG) that computes a business KPI |
| dimension | Row-level SQL expression on one table, used for grouping or filtering |
| rule | Free-text business constraint, optionally scoped to one or more tables |
| synonym | Maps a business term to a canonical metric, dimension, or column |
| table | Physical data location in the warehouse, with typed columns |
| topic | Business-concept tag applied to assets (e.g., REVENUE, ACQUISITION) |
| domain | High-level business area (e.g., MARKETING, SALES, PRODUCT) |
| relationship | Documented JOIN pattern between two tables |
| memory | Org-level context notes, always global scope |

## Edge Types

| Edge | From | To | Meaning |
|------|------|----|---------|
| depends_on | metric, dimension | table | Asset's SQL references columns in this table |
| tagged_with | metric, dimension, rule, synonym | topic | Asset carries this business-concept tag |
| in_domain | table, metric, dimension, rule, synonym | domain | A table has one home domain; assets inherit it from their primary table, plus any cross-cutting extras |
| joins | relationship | table, table | Two tables have a documented JOIN on specific columns |
| references | rule, synonym | table, column | Rule or synonym references a specific table or column name |

## How Membership Works

Two different axes organize the KB - keep them separate:

- **Vertical: the home (domain -> data source -> assets).** Containment that cascades. An asset has ONE home domain, inherited from its primary table (the data source its SQL reads). Set the domain on the **table** (`graphit kb update table NAME --domain MARKETING`) and every asset on it inherits it; the asset carries no domain tag of its own. To move an asset's home, change its table's domain. Domain-first discovery walks this axis downward.
- **Horizontal: the concept (topics).** Topics cut ACROSS domains. The same topic (e.g. RETENTION) can tag assets in different domains, grouping them by business meaning regardless of where they sit. An asset can carry several topics at once (`graphit kb update metric NAME --topics "REVENUE,RETENTION"`), and a topic never moves an asset's home. When a concept spans domains, the by-topic view is how you find everything about it.

Other placements layered on top:
- **Multiple tables**: a metric or dimension can depend on several tables (a JOIN across ORDERS and CUSTOMERS) and appears under each. Table dependency is structural, derived from the SQL, never tagged manually.
- **Referencing (`secondary_tables`)**: an asset can be referenced onto extra tables; it shows under the target with a `*` suffix, links back to the original, and stays editable only from its home table. Table-backed assets derive domain membership from all their tables (primary plus `secondary_tables`).
- **Cross-cutting domains**: synonyms can carry extra domains in `extra_domain_ids` for relevance beyond their home, without moving the asset in the tree.

Domains are coarse and few (broad business areas); topics are finer and more numerous. A single domain like MARKETING typically spans topics such as ACQUISITION, ATTRIBUTION, and CAMPAIGN_PERFORMANCE.

## Tree Rendering Order

The default tree renders Domain > Table > Topic > Asset, with each table under its one home domain. This is a visualization choice; the model also supports Topic > Table or a flat list. When the user asks "where is X?", an asset lives under its primary table's home domain - report that, plus any domains from its `secondary_tables` placements and its topics.

## Answering Structural Questions (Tier 1)

Structural questions have direct answers - give them in business terms:

| Question | Answer pattern |
|---|---|
| What is a topic / domain / table / relationship? | Use the Node Types descriptions above, in plain language |
| Why is [metric] under [table]? | Its SQL depends on that table's columns (or it is referenced there via `secondary_tables`, shown as `*`) |
| Why is [asset] in [topic]? | Someone tagged it - topics are manual, not derived. Check its topics list |
| Why is [asset] in [domain]? | Its primary table's domain cascades to it; it was not tagged directly |
| What is a relationship? | A documented JOIN between two tables (which columns, which join type) used to build correct cross-table SQL |
| What is memory? | Org-level context notes (goals, terminology, conventions), global scope, shown at the tree root |

Verify against actual KB state when the question names a specific asset (`graphit kb get`, `graphit kb explore`).

## Semantic Questions (Tier 2 - Different Handling)

Questions about what a concept MEANS at this org ("what does revenue mean for us?", "how do we define an active user?") are semantic, not structural. Search the KB for the relevant metric or rule, read its description and calculation, and present what the KB says - do not interpret or extend it from general knowledge. The KB is the source of truth for this org's definitions.
