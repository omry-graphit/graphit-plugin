# KB Traversal - Worked Examples

Common questions about the KB graph and the CLI command for each. Three commands do most of the work: `graphit kb search "<query>"` (semantic discovery across all types, optional `--type`), `graphit kb get <type> NAME` (full details of one asset), and `graphit kb explore <type> NAME` (walk the graph around one entity).

## Which Command

| Question | Command |
|---|---|
| Find things like X (semantic) | `graphit kb search "X"` (add `--type metric` to narrow) |
| Get one asset's full details | `graphit kb get metric NAME` |
| What connects to X (dependencies, joins, topics, domain) | `graphit kb explore <type> NAME` |
| What is inside a domain or topic | `graphit kb explore domain NAME` / `graphit kb explore topic NAME` |

`graphit kb explore` returns the whole neighborhood in one call and has no edge-type or depth flags - the response already includes dependents, joins, topics, and domain together, so read the part you need instead of chaining calls.

## Common Queries

### "Find all revenue metrics"
`graphit kb search "revenue" --type metric` for semantic matches. To get the assets tagged with a specific topic, `graphit kb explore topic REVENUE`.

### "What depends on the ORDERS table?"
`graphit kb explore table ORDERS` - the response lists every metric and dimension whose SQL references ORDERS columns, plus the relationships it joins through.

### "What joins with MARKETING_UA_DS?"
`graphit kb explore table MARKETING_UA_DS`, then read the relationships in the response (the documented JOINs involving that table).

### "What domains do we have?"
`graphit kb list domains` - returns every domain with its description and asset count, plus an "Uncategorized" entry when tables have no domain. Report all of them, including empty ones. Domain is not a searchable type, so `graphit kb search` will not surface domains.

### "Show me everything in the MARKETING domain"
`graphit kb explore domain MARKETING` - returns the domain's tables and the assets on them.

### "What topics does ARPU_D1 belong to?"
`graphit kb explore metric ARPU_D1` - the response includes its topics, along with its tables, dimensions, and home domain.

### "What's left uncategorized?"
`graphit kb explore domain Uncategorized` - returns the tables with no home domain and their assets.

## Reading the Results

A single `graphit kb explore` call returns one entity's full neighborhood, so it usually answers the question on its own - scan the response rather than chaining many calls. Start there, and only run a second command if the first response does not contain what you need.

## Presenting KB Results

**After `graphit kb list <type>`** - count summary + table with bold names:

~~~
**12 metrics** across 3 tables:

| Metric | Table | Calculation | Params |
|---|---|---|---|
| **CPI** | **MARKETING_UA** | `SUM(spend)/SUM(installs)` | - |
| **ARPU** | **MARKETING_UA** | `SUM(revenue)/COUNT(...)` | DAY |
| **RETENTION** | **PLAYER_QUALITY** | `COUNT(CASE WHEN ...)` | DAY |

4 parameterized (need `(DAY=N)` syntax), 8 pre-baked.
~~~

Adapt columns per type: dimensions include semantic type, rules include constraint count, domains include asset count.

**After `graphit kb get <type> <name>`** - entity heading + key-value table:

~~~
### **CPI** (metric, verified)

*Cost per install*

| | |
|---:|---|
| **Table** | **MARKETING_UA** |
| **Calculation** | `SUM(spend) / SUM(installs)` |
| **Parameters** | none |
| **Topics** | ACQUISITION, SPEND |
| **Default dims** | MEDIA_SOURCE, CAMPAIGN_NAME |
~~~

Adapt fields per type. Rules: content, constraints, apply-on, override policy. Dimensions: expression, semantic type, output type.

**After `graphit kb search`** - result count + table with type column:

~~~
**5 results** for "revenue":

| Type | Name | Description |
|---|---|---|
| metric | **TOTAL_REVENUE** | Total revenue across all channels |
| dimension | **REVENUE_BUCKET** | Revenue range segmentation |
| synonym | GMV | Maps to **TOTAL_REVENUE** (metric) |
~~~

**After `graphit kb explore`** - tree with bold names, indented by level:

~~~
**CPI** (metric) on **MARKETING_UA**:
- **Calculation:** `SUM(spend) / SUM(installs)`
- **Tables:** **MARKETING_UA**, **MARKETING_UA_6MO** (secondary)
- **Related dimensions (8):**
  - **MEDIA_SOURCE** - `media_source` (categorical)
  - **CAMPAIGN_NAME** - `campaign_name` (categorical)
- **Rules:** **EXCLUDE_ORGANIC** (filters organic installs)
- **Domain:** MARKETING
~~~

For domain exploration, show Domain > Table > Asset hierarchy as a tree.
