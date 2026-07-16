# Query Governance

Load this when writing or validating a governed query, working trust tiers, declaring a conditionally-enforced rule, or working the ad-hoc frontier.

Governance is enforced server-side in the QueryGateway, the same across every channel. You CANNOT weaken it from the CLI: an ad-hoc business measure requires EXPLORE access across every queried scope, and rule overrides must also satisfy EXPLORE.

## Reference syntax

Write governed queries with KB references, not inline formulas. The server compiles each to its KB expression, injects rule constraints, stamps the trust tier, and caches the result. The syntax is identical in `graphit query` and `graphit.resolve()`.

| Syntax | Expands to | Example |
|--------|-----------|---------|
| `{{metric:NAME}}` | Metric calculation (aggregation) | `{{metric:CPI}}` |
| `{{metric:NAME(K=V)}}` | Parameterized metric | `{{metric:ARPU(DAY=7)}}` |
| `{{metric_raw:NAME}}` | Raw expression, no outer aggregate | `{{metric_raw:REVENUE}}` |
| `{{dim:NAME}}` | Dimension expression | `{{dim:INSTALL_MONTH}}` |

```bash
graphit query "SELECT {{dim:INSTALL_MONTH}}, {{metric:CPI}} AS cpi FROM MARKETING_UA_DS GROUP BY 1" --ds MARKETING_UA_DS --verbose
```

`--verbose` prints the expanded SQL and trust tier, so you can confirm the reference resolved before presenting the result.

## Parameterized metrics

Some metrics (for example ARPU, ROAS, RETENTION) carry required parameters and cannot resolve without a value. Run `graphit kb list metric` and read the `params` column for the names a metric requires, then supply them inline as `{{metric:ARPU(DAY=7)}}`. Pre-baked variants such as `ARPU_D7` or `ROAS_D30` have the value fixed and need none. Omitting a required parameter returns a clear error naming the exact syntax, so read `params` first.

## Trust tiers

Every result is stamped with a tier, shown to the user as a badge on graphs and canvas entities - your honest signal of how trustworthy the number is.

| Tier | Meaning | Badge |
|------|---------|-------|
| `governed` | Query used `{{metric:X}}` / `{{dim:X}}` references | Teal dot |
| `verified` | Raw SQL whose expressions match KB definitions | Amber dot |
| `ad_hoc` | Inline formulas with no KB match | Gray dot |

Prefer the governed tier. The server may upgrade matching raw SQL to verified, but reach for references first so the result is governed by intent.

## The ad-hoc gate

This is the hard frontier - the rules below are what the QueryGateway does.

A query lands at the `ad_hoc` tier when it uses no `{{metric:NAME}}` / `{{dim:NAME}}` reference and its raw expressions match no KB definition. On the CLI (`graphit query`, cached `--ds` or `--warehouse`), **every** ad-hoc query must be justified - business measures (an aggregate or `GROUP BY`) and plain exploration alike (`SELECT *`, `COUNT(*)`, `DISTINCT` peeks). Governed and verified results are exempt.

- **EXPLORE access is a hard prerequisite for ad-hoc business measures.** If the user lacks EXPLORE access to any queried table scope, the server blocks that measure. An ad-hoc reason cannot bypass that denial.
- **Justification floor.** The ad-hoc query is withheld and asks for a justification. Preferred path first: rewrite with `{{metric:NAME}}` / `{{dim:NAME}}` references - genuinely search the KB (`graphit kb explore`, `graphit kb list metric`, `graphit kb list dimension`), and if the metric or dimension you need does not exist, CREATE it first. A filter's value list belongs in a `{{dim:NAME}}`, not a raw `SELECT DISTINCT` peek. Only if nothing fits and the user needs the raw run, pass `--adhoc-reason "<text>"` stating what you searched, what you found, and why it does not fit - pass it on the first call when you already know the query is ad-hoc. A trivial or empty reason is rejected server-side and recorded in the audit log, so it must be honest.

When the gate fires, do not narrate around it or pretend the query ran. Report truthfully: it was blocked or needs approval, name the governed rewrite, and let the user decide.

## Enforceable rules and overrides

Rules with typed constraints are enforced automatically, rewriting the SQL before it runs:

| Type | What it does |
|------|-------------|
| `required_where` | Injects a WHERE predicate |
| `forbidden_column` | NULLifies a column in SELECT |
| `value_restriction` | Restricts a column to allowed values |
| `required_filter` | Validates a column appears in WHERE |
| `required_aggregation` | Validates GROUP BY includes a column |

User-context variables (`${user.team_id}`, `${user.email}`) resolve server-side for row-level security. Override a rule only when the user explicitly asks; the server honors it only if the user holds EXPLORE on every queried scope. A rule that masks a column (a `forbidden_column` constraint) can never be overridden. Every override is logged. Pass several names to override more than one.

```bash
graphit query "SELECT * FROM EVENTS" --ds EVENTS --override-rules EXCLUDE_RETARGETING
```

## Conditionally-enforced rules

A rule's mode is Advisory (guidance), Always (every query), or **Conditional** - fires only when its plain-language body (the condition) holds for the query you wrote. No server classifier decides that; you do. Read a table's rules first (`graphit kb explore table <name>`), judge your query against each conditional rule's body, and declare it up front:

- `--apply-conditional RULE` - enforce it for this query.
- `--skip-conditional RULE:"reason"` - skip it; a reason is required and audit-logged.

Declare up front so a clean query never stalls. An undeclared conditional returns a retryable prompt naming each unresolved rule and its condition - read it, decide, re-run. A saved tile stores your decision and replays it every refresh.

## Data-source row caps

An admin can set a `max_rows` cap per data source. A cap limits the result set; it does not change authorization, trust-tier classification, or the ad-hoc justification floor.

## Presenting governance results

The user CANNOT see raw CLI output. Render every result as markdown.

**After a governed query**, append a provenance footer so the trust signal travels with the number: tier, KB references used, row cap if applied. Because a governed query may be rewritten before it runs, read `provenance.injection_summary` and report which rules changed it and how (each rule, its outcome, and why), not just a count. An ungoverned query reports no rules applied. For an ad-hoc result, state the tier honestly and offer the governed `{{metric:NAME}}` / `{{dim:NAME}}` rewrite.

~~~
**Trust tier:** governed - 2 KB refs, 1 rule enforced (**EXCLUDE_INTERNAL**), max rows 10000
~~~

**After `graphit governance status`**, show the 7-day conformance counts (governed / verified / ad-hoc / total) as a small markdown table.

**When a gate or rule blocks a query**, explain it and the path forward, no raw dump:

~~~
**Blocked by governance.**

Rule **EXCLUDE_ORGANIC** is enforced; overriding it requires EXPLORE access on every queried scope. Rewrite the query to include the required filter, or ask an admin for EXPLORE access.
~~~
