# KB Traversal - Worked Examples

Contents: Which Command (the read-command picker) - Common Queries (worked examples) - Reading the Results - Presenting KB Results (the per-command output templates).

Which `graphit kb` read command answers each question, and how to present the result. Explore is the primary call: `graphit kb explore <type> NAME` walks the graph around one entity and returns its whole neighborhood at once. `graphit kb get <type> NAME` returns one asset's full details, and `graphit kb search "<query>"` is the fallback for semantic discovery when you cannot name the entity.

## Which Command

| Question | Command |
|---|---|
| What is inside a domain or topic (the build entry point) | `graphit kb explore domain NAME` / `graphit kb explore topic NAME` |
| What connects to X (dependencies, joins, topics, domain) | `graphit kb explore <type> NAME` |
| Get one asset's full details | `graphit kb get metric NAME` |
| Find things like X when you cannot name it (semantic) | `graphit kb search "X"` (add `--type metric` to narrow) |

`graphit kb explore` returns the whole neighborhood in one call and has no edge-type or depth flags - the response already carries dependents, joins, topics, and domain together, so read the part you need instead of chaining calls.

## Common Queries

### "Show me everything in the MARKETING domain"
`graphit kb explore domain MARKETING` - returns the domain's tables and the assets on them. This is the first call when scoping a build.

### "Find all revenue metrics"
`graphit kb explore topic REVENUE` returns the assets tagged with that concept across every domain. Fall back to `graphit kb search "revenue" --type metric` only when no topic captures the concept.

### "What depends on the ORDERS table?"
`graphit kb explore table ORDERS` - lists every metric and dimension whose SQL references ORDERS columns, plus the relationships it joins through.

### "What joins with MARKETING_UA_DS?"
`graphit kb explore table MARKETING_UA_DS`, then read the relationships in the response (the documented JOINs involving that table).

### "What topics does ARPU_D1 belong to?"
`graphit kb explore metric ARPU_D1` - the response includes its topics, along with its tables, dimensions, and home domain.

### "What's left uncategorized?"
`graphit kb explore domain Uncategorized` - returns the tables with no home domain and their assets.

### "What domains do we have?" (enumerate names)
`graphit kb list domains` - returns every domain with its description and asset count, plus an "Uncategorized" entry when tables have no domain. Report all of them, including empty ones. This enumerates domain NAMES; to see what is in one, explore it. Domain is not a searchable type, so `graphit kb search` will not surface domains.

## Presenting KB Results

A single `graphit kb explore` call returns one entity's full neighborhood, so it usually answers the question on its own - scan the response and run a second command only if the first does not contain what you need. The user cannot see raw CLI output; render every result with these per-command templates.

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
