# Query Governance

Load this when writing or validating a governed query, working trust tiers, or working the ad-hoc frontier (deciding whether a raw measure run is allowed on a governed source).

Governance is enforced server-side in the QueryGateway, the same across every channel. You CANNOT weaken it from the CLI; you can only write queries that pass it or, where the mode allows, run a raw measure with explicit approval.

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

Every result is stamped with a tier the platform shows the user as a badge on dashboard graphs and canvas entities - your honest signal of how trustworthy the number is.

| Tier | Meaning | Badge |
|------|---------|-------|
| `governed` | Query used `{{metric:X}}` / `{{dim:X}}` references | Teal dot |
| `verified` | Raw SQL whose expressions match KB definitions | Amber dot |
| `ad_hoc` | Inline formulas with no KB match | Gray dot |

Prefer the governed tier. The server may upgrade matching raw SQL to verified, but reach for references first so the result is governed by intent.

## The ad-hoc measure gate

This is the hard frontier, enforced server-side. The rules below are what the QueryGateway does, not a suggestion you can soften.

An **ad-hoc measure** computes a business measure (an aggregate or `GROUP BY` that produces a metric) on a governed data source WITHOUT `{{metric:NAME}}` references, so it lands at the `ad_hoc` tier. Plain exploration is not a measure: `SELECT *`, raw column selects, `COUNT(*)` row-count peeks, `DISTINCT` value lists.

- **warn.** The ad-hoc measure is rejected and asks for a justification. First rewrite it with `{{metric:NAME}}` / `{{dim:NAME}}` references - genuinely search the KB for a match first (`graphit kb explore`, `graphit kb list metric`, `graphit kb list dimension`). Only if nothing fits and the user needs the raw run, re-run with `--adhoc-reason "<text>"` that concisely states what you searched in governance, what you found (if anything), and why it does not fit. A trivial or empty reason is rejected server-side, and every justification is recorded in the audit log - so it must be honest, not a rationalization. Plain exploration is **exempt**: it runs free, with only a non-blocking warning.
- **strict.** CRITICAL: every `ad_hoc`-tier query is a HARD BLOCK, including plain exploration that does not match the KB. Rewrite with references or stop. `--adhoc-reason` NEVER bypasses strict and does not weaken it; do not offer it in strict mode.
- **observe.** All queries run; tiers are tracked, nothing is gated.

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

User-context variables (`${user.team_id}`, `${user.email}`) resolve server-side for row-level security. Override a rule only when the user explicitly asks and the rule's `override_policy` (anyone / analyst_only / admin_only / never) and the user's role allow it; a `never` policy can never be overridden, and every override is logged. Pass several names to override more than one.

```bash
graphit query "SELECT * FROM EVENTS" --ds EVENTS --override-rules EXCLUDE_RETARGETING
```

## Per-DS settings and governance mode

Governed mode and the row cap are set per data source; enabling governed mode activates the ad-hoc gate for that DS. The governance mode is org-wide and admin-only, set with a `--mode` flag, not a positional argument (values `observe`, `warn`, `strict`). Run `graphit ds update --help` and `graphit governance set --help` for exact flag spelling.

```bash
graphit governance set --mode warn
```

## Presenting governance results

The user CANNOT see raw CLI output. Render every result as markdown.

**After a governed query**, append a provenance footer so the trust signal travels with the number: tier, governed DS, KB references used, rules enforced by name, row cap if applied. For an ad-hoc result, state the tier honestly and offer the governed `{{metric:NAME}}` / `{{dim:NAME}}` rewrite.

~~~
**Trust tier:** governed - governed DS, 2 KB refs, 1 rule enforced (**EXCLUDE_INTERNAL**), max rows 10000
~~~

**After `graphit governance status`**, show the mode plus the 7-day conformance counts (governed / verified / ad-hoc / total) as a small markdown table headed by `**Governance mode:** <mode>`.

**When a gate or rule blocks a query**, explain it and the path forward, no raw dump:

~~~
**Blocked by governance.**

Rule **EXCLUDE_ORGANIC** has override policy `never` and cannot be overridden. Ask your admin to change the policy, or rewrite the query to include the required filter.
~~~
